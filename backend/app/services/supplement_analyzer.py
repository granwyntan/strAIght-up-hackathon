from __future__ import annotations

import base64
import hashlib
import logging
import random
import re
import time
import uuid
from collections import deque
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from threading import Lock

from openai import APIConnectionError, APIError, APITimeoutError, OpenAI, RateLimitError

from ..settings import settings
from .image_preprocess import optimize_image_for_openai


ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
DEFAULT_CONDITIONS = "NIL"
DEFAULT_GOALS = "Reduce belly fat, Improve cognitive power"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
SUPPLEMENT_ANALYSIS_MODEL = "gpt-5.4-mini"
SUPPLEMENT_INFOGRAPHIC_MODEL = "gpt-image-1"
SUPPLEMENT_DRUG_INFO_MODEL = "gpt-5.4-mini"
SUPPLEMENT_INFOGRAPHIC_TIMEOUT_SECONDS = 60.0
OPENAI_RETRY_ATTEMPTS = 3
OPENAI_RETRY_BASE_SECONDS = 0.8
DRUGS_FILE_PATH = Path(__file__).resolve().parents[3] / "drugs_clean.txt"

_analysis_cache: dict[str, "SupplementAnalysisResult"] = {}
_infographic_cache: dict[str, str] = {}
logger = logging.getLogger(__name__)
_RECENT_ENTRY_LIMIT = 4096
_recent_retry_wrapper_entries: deque[str] = deque()
_recent_retry_wrapper_entry_set: set[str] = set()
_recent_service_entries: deque[str] = deque()
_recent_service_entry_set: set[str] = set()
_entry_lock = Lock()


def _track_recent_entry(entry_key: str, *, entry_type: str) -> bool:
    with _entry_lock:
        if entry_type == "retry_wrapper":
            entries = _recent_retry_wrapper_entries
            entry_set = _recent_retry_wrapper_entry_set
        else:
            entries = _recent_service_entries
            entry_set = _recent_service_entry_set

        duplicate = entry_key in entry_set
        if not duplicate:
            entries.append(entry_key)
            entry_set.add(entry_key)
            if len(entries) > _RECENT_ENTRY_LIMIT:
                oldest = entries.popleft()
                entry_set.discard(oldest)
        return duplicate


def _extract_openai_error_code(exc: Exception) -> str:
    direct_code = getattr(exc, "code", None)
    if isinstance(direct_code, str) and direct_code.strip():
        return direct_code.strip().lower()

    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        nested = body.get("error")
        if isinstance(nested, dict):
            nested_code = nested.get("code")
            if isinstance(nested_code, str) and nested_code.strip():
                return nested_code.strip().lower()
        body_code = body.get("code")
        if isinstance(body_code, str) and body_code.strip():
            return body_code.strip().lower()

    message = str(exc).lower()
    if "insufficient_quota" in message:
        return "insufficient_quota"
    return ""


def _is_insufficient_quota_error(exc: Exception) -> bool:
    return _extract_openai_error_code(exc) == "insufficient_quota"


def _is_retryable_api_status_error(exc: APIError) -> bool:
    status_code = getattr(exc, "status_code", None)
    return isinstance(status_code, int) and status_code >= 500


def _response_with_rate_limit_retry(
    client: OpenAI,
    *,
    model: str,
    input_payload: list[dict],
    request_id: str,
    trigger_source: str,
) -> object:
    wrapper_entry_key = f"{request_id}|{trigger_source}"
    duplicate_wrapper_entry = _track_recent_entry(wrapper_entry_key, entry_type="retry_wrapper")
    print(
        f"OPENAI RETRY WRAPPER ENTERED request_id={request_id} trigger={trigger_source} duplicate_entry={duplicate_wrapper_entry} ts={time.time()}"
    )
    logger.info(
        "OPENAI RETRY WRAPPER ENTERED request_id=%s trigger=%s duplicate_entry=%s ts=%s",
        request_id,
        trigger_source,
        duplicate_wrapper_entry,
        time.time(),
    )
    if duplicate_wrapper_entry:
        logger.error(
            "Duplicate retry wrapper entry detected for request_id=%s trigger=%s; upstream re-invocation suspected.",
            request_id,
            trigger_source,
        )
        raise RuntimeError(
            f"Duplicate retry wrapper entry blocked for request_id={request_id} trigger={trigger_source}."
        )

    for attempt in range(OPENAI_RETRY_ATTEMPTS):
        try:
            print("OPENAI CALL ID:", request_id)
            print("CALL START", time.time())
            print(
                f"[OpenAI API] responses.create model={model} trigger={trigger_source} request_id={request_id} attempt={attempt + 1}"
            )
            logger.info(
                "OpenAI API call: responses.create model=%s trigger=%s request_id=%s attempt=%s",
                model,
                trigger_source,
                request_id,
                attempt + 1,
            )
            response = client.responses.create(model=model, input=input_payload)
            print(f"SUCCESS RECEIVED request_id={request_id} attempt={attempt + 1}")
            logger.info("OpenAI API call success: request_id=%s trigger=%s attempt=%s", request_id, trigger_source, attempt + 1)
            return response
        except RateLimitError as exc:
            error_code = _extract_openai_error_code(exc)
            logger.warning(
                "OpenAI API call failed: request_id=%s trigger=%s attempt=%s error_type=%s error=%s",
                request_id,
                trigger_source,
                attempt + 1,
                type(exc).__name__,
                str(exc),
            )
            if _is_insufficient_quota_error(exc):
                logger.error(
                    "Non-retryable OpenAI quota error: request_id=%s trigger=%s attempt=%s error_code=%s",
                    request_id,
                    trigger_source,
                    attempt + 1,
                    error_code or "-",
                )
                raise
            if attempt == OPENAI_RETRY_ATTEMPTS - 1:
                raise
            delay = OPENAI_RETRY_BASE_SECONDS * (2**attempt) + random.uniform(0.0, 0.35)
            time.sleep(delay)
        except (APIConnectionError, APITimeoutError) as exc:
            logger.warning(
                "OpenAI API transient connection failure: request_id=%s trigger=%s attempt=%s error_type=%s error=%s",
                request_id,
                trigger_source,
                attempt + 1,
                type(exc).__name__,
                str(exc),
            )
            if attempt == OPENAI_RETRY_ATTEMPTS - 1:
                raise
            delay = OPENAI_RETRY_BASE_SECONDS * (2**attempt) + random.uniform(0.0, 0.35)
            time.sleep(delay)
        except APIError as exc:
            logger.warning(
                "OpenAI API status failure: request_id=%s trigger=%s attempt=%s status_code=%s error=%s",
                request_id,
                trigger_source,
                attempt + 1,
                getattr(exc, "status_code", None),
                str(exc),
            )
            if not _is_retryable_api_status_error(exc):
                raise
            if attempt == OPENAI_RETRY_ATTEMPTS - 1:
                raise
            delay = OPENAI_RETRY_BASE_SECONDS * (2**attempt) + random.uniform(0.0, 0.35)
            time.sleep(delay)


@dataclass(slots=True)
class SupplementSection:
    heading: str
    content: str


@dataclass(slots=True)
class SupplementAnalysisResult:
    analysis_text: str
    sections: list[SupplementSection]
    infographic_image_data_url: str
    detected_drugs: list[str]
    text_generation_started_at: float | None = None
    text_generation_completed_at: float | None = None
    image_generation_started_at: float | None = None
    image_generation_completed_at: float | None = None


@dataclass(slots=True)
class DrugInfoResult:
    drug: str
    usage: str
    side_effects: str


def _normalize_drug_name(value: str) -> str:
    return re.sub(r"[^a-z0-9\-]+", "", (value or "").strip().lower())


@lru_cache(maxsize=1)
def _load_known_drug_names() -> set[str]:
    if not DRUGS_FILE_PATH.exists():
        logger.warning("Drug list file not found at %s", DRUGS_FILE_PATH)
        return set()

    try:
        raw = DRUGS_FILE_PATH.read_text(encoding="utf-8", errors="ignore")
    except OSError as exc:
        logger.warning("Unable to read drug list file %s: %s", DRUGS_FILE_PATH, exc)
        return set()

    names: set[str] = set()
    for token in re.split(r"[\s,]+", raw):
        normalized = _normalize_drug_name(token)
        if normalized:
            names.add(normalized)
    return names


def detect_drugs_in_text(analysis_text: str) -> list[str]:
    known_drugs = _load_known_drug_names()
    if not analysis_text.strip() or not known_drugs:
        return []

    seen: set[str] = set()
    matches: list[str] = []
    for token in re.findall(r"[A-Za-z][A-Za-z0-9\-]{1,}", analysis_text):
        normalized = _normalize_drug_name(token)
        if normalized and normalized in known_drugs and normalized not in seen:
            seen.add(normalized)
            matches.append(normalized)
    return matches


def fetch_drug_info(drug_name: str, request_id: str | None = None) -> DrugInfoResult:
    request_id = request_id or str(uuid.uuid4())
    normalized = _normalize_drug_name(drug_name)
    if not normalized:
        raise ValueError("Please provide a drug name.")

    known_drugs = _load_known_drug_names()
    if known_drugs and normalized not in known_drugs:
        raise ValueError(f"Drug '{drug_name}' is not recognized in the configured drug list.")
    if not settings.openai_api_key:
        raise RuntimeError("Drug lookup is unavailable because OPENAI_API_KEY is not configured.")

    client = OpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_api_base_url,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
    )
    prompt = (
        "You are a concise medical assistant. Provide a brief educational summary for the given drug. "
        "Keep each field short (1 sentence each). "
        "Return exactly this format and nothing else:\n"
        "Drug: <name>\n"
        "Usage: <brief usage>\n"
        "Side Effects: <brief side effects and risk note>"
    )
    try:
        response = _response_with_rate_limit_retry(
            client,
            model=SUPPLEMENT_DRUG_INFO_MODEL,
            request_id=request_id,
            trigger_source="supplement_drug_info",
            input_payload=[
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": f"{prompt}\n\nDrug: {normalized}"}],
                }
            ],
        )
    except RateLimitError:
        raise
    except Exception as exc:
        raise RuntimeError(f"Drug lookup provider call failed: {exc}") from exc

    output = (response.output_text or "").strip()
    if not output:
        raise RuntimeError("Drug lookup returned an empty response.")

    def _extract(prefix: str, fallback: str) -> str:
        match = re.search(rf"^{prefix}:\s*(.+)$", output, flags=re.IGNORECASE | re.MULTILINE)
        if match:
            return match.group(1).strip()
        return fallback

    drug = _extract("Drug", normalized)
    usage = _extract("Usage", "General therapeutic use unavailable.")
    side_effects = _extract("Side Effects", "Side effect summary unavailable.")
    return DrugInfoResult(drug=drug, usage=usage, side_effects=side_effects)


def _build_analysis_prompt(conditions: str, goals: str) -> str:
    normalized_conditions = conditions.strip() or "No prior illness or long term conditions."
    normalized_goals = goals.strip() or "General health support"

    return (
        "You are a pharmacist deciding if this patient should consume this supplement. "
        "The FIRST LINE of your response must be exactly: 'Supplement Name: <name>'. "
        "Do not add any text before that first line. "
        "Return clear markdown with exactly 4 top-level sections using H2 headings. "
        "Section 1: Supplement Identity and Ingredients. "
        "Section 2: Potential Benefits and Mechanisms. "
        "Section 3: Risks, Side Effects, and Contraindications. "
        "Section 4: Suitability for This Patient and Recommendation. "
        "For section 4, directly evaluate fit against the patient's conditions and goals. "
        "Use concise medical language and practical guidance.\n\n"
        f"Patient goals: {normalized_goals}\n"
        f"Patient medical history: {normalized_conditions}\n"
    )


def _build_text_analysis_prompt(supplement_name: str, conditions: str, goals: str) -> str:
    normalized_name = supplement_name.strip()
    normalized_conditions = conditions.strip() or "No prior illness or long term conditions."
    normalized_goals = goals.strip() or "General health support"
    return (
        "You are a pharmacist deciding if this patient should consume this supplement. "
        f"The supplement to evaluate is: {normalized_name}. "
        "The FIRST LINE of your response must be exactly: 'Supplement Name: <name>'. "
        "Use the supplement name you are evaluating. Do not add any text before that first line. "
        "Do not claim to have read a label image. "
        "Use generally known ingredient profiles when possible, and clearly label uncertainty when product-specific details are unknown. "
        "Return clear markdown with exactly 4 top-level sections using H2 headings. "
        "Section 1: Supplement Identity and Likely Ingredients. "
        "Section 2: Potential Benefits and Mechanisms. "
        "Section 3: Risks, Side Effects, and Contraindications. "
        "Section 4: Suitability for This Patient and Recommendation. "
        "For section 4, directly evaluate fit against the patient's conditions and goals. "
        "Use concise medical language and practical guidance.\n\n"
        f"Patient goals: {normalized_goals}\n"
        f"Patient medical history: {normalized_conditions}\n"
    )


def _cache_key(image_bytes: bytes, conditions: str, goals: str) -> str:
    digest = hashlib.sha256(image_bytes).hexdigest()
    return f"{digest}|{conditions.strip()}|{goals.strip()}"


def _infographic_cache_key(analysis_text: str, conditions: str, goals: str) -> str:
    payload = f"{analysis_text}|{conditions.strip()}|{goals.strip()}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _parse_sections(analysis_text: str) -> list[SupplementSection]:
    sections: list[SupplementSection] = []
    heading_pattern = re.compile(r"^\s*##\s+(.+?)\s*$")

    current_heading: str | None = None
    current_lines: list[str] = []

    def flush_current() -> None:
        nonlocal current_heading, current_lines
        if current_heading and current_lines:
            sections.append(SupplementSection(heading=current_heading, content="\n".join(current_lines).strip()))
        elif current_heading:
            sections.append(SupplementSection(heading=current_heading, content=""))
        current_heading = None
        current_lines = []

    for line in analysis_text.splitlines():
        match = heading_pattern.match(line)
        if match:
            flush_current()
            current_heading = match.group(1).strip()
            continue

        if current_heading is None:
            # Keep content before the first heading under a generic section.
            if line.strip():
                current_heading = "Summary"
                current_lines.append(line.strip())
            continue

        current_lines.append(line.rstrip())

    flush_current()

    if sections:
        return sections
    return [SupplementSection(heading="Summary", content=analysis_text.strip())]


def _build_infographic_prompt(analysis_text: str, conditions: str, goals: str) -> str:
    normalized_conditions = conditions.strip() or "No prior illness or long term conditions."
    normalized_goals = goals.strip() or "General health support"
    return (
        "Create a polished pastel medical infographic in landscape orientation. "
        "Use a soft cream background with gentle peach, mint, and light blue accents so it matches a friendly health app theme. "
        "Summarize the supplement analysis into clear visual sections: supplement identity, key benefits, key side effects, "
        "and recommendation for this patient. Use short phrases, icons, soft panels, and clear hierarchy. "
        "Do not crowd the layout and avoid tiny unreadable text. "
        f"The patient's medical history is: {normalized_conditions}. "
        f"The patient's goals are: {normalized_goals}. "
        f"Use this analysis as the content source: {analysis_text}"
    )


def _generate_infographic_data_url(client: OpenAI, analysis_text: str, conditions: str, goals: str) -> str:
    try:
        request_id = str(uuid.uuid4())
        print("OPENAI CALL ID:", request_id)
        print("CALL START", time.time())
        print(
            f"[OpenAI API] images.generate model={SUPPLEMENT_INFOGRAPHIC_MODEL} trigger=supplement_infographic request_id={request_id} attempt=1"
        )
        logger.info(
            "OpenAI API call: images.generate model=%s trigger=%s request_id=%s attempt=1",
            SUPPLEMENT_INFOGRAPHIC_MODEL,
            "supplement_infographic",
            request_id,
        )
        image_client = client.with_options(timeout=SUPPLEMENT_INFOGRAPHIC_TIMEOUT_SECONDS)
        result = image_client.images.generate(
            model=SUPPLEMENT_INFOGRAPHIC_MODEL,
            prompt=_build_infographic_prompt(analysis_text, conditions, goals),
            size="1024x1024",
        )
        data_items = getattr(result, "data", None) or []
        if not data_items:
            logger.warning("Infographic generation returned no data payload.")
            return ""

        first = data_items[0]
        image_base64 = getattr(first, "b64_json", None)
        image_url = getattr(first, "url", None)

        if isinstance(image_base64, str) and image_base64.strip():
            return f"data:image/png;base64,{image_base64}"
        if isinstance(image_url, str) and image_url.strip():
            return image_url

        logger.warning("Infographic generation payload missing both b64_json and url fields.")
        return ""
    except Exception as exc:
        logger.warning("Infographic generation failed: %s", exc)
        # Keep supplement analysis successful even if image generation fails.
        return ""


def analyze_supplement(
    image_bytes: bytes,
    content_type: str,
    conditions: str,
    goals: str,
    generate_infographic: bool = True,
    request_id: str | None = None,
) -> SupplementAnalysisResult:
    request_id = request_id or str(uuid.uuid4())
    service_entry_key = f"{request_id}|analyze_supplement"
    duplicate_service_entry = _track_recent_entry(service_entry_key, entry_type="service")
    print(f"OPENAI FUNCTION ENTERED fn=analyze_supplement request_id={request_id} ts={time.time()}")
    logger.info(
        "OPENAI FUNCTION ENTERED fn=%s request_id=%s duplicate_entry=%s ts=%s",
        "analyze_supplement",
        request_id,
        duplicate_service_entry,
        time.time(),
    )
    if duplicate_service_entry:
        logger.error("Duplicate service entry detected fn=%s request_id=%s", "analyze_supplement", request_id)
        raise RuntimeError(f"Duplicate service entry blocked for request_id={request_id} fn=analyze_supplement.")
    if not settings.openai_api_key:
        raise RuntimeError("Supplement analysis is unavailable because OPENAI_API_KEY is not configured.")
    if not image_bytes:
        raise ValueError("The uploaded image was empty.")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError("Image is too large. Please upload an image smaller than 10MB.")
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("Unsupported image type. Please upload PNG, JPG, JPEG, or WEBP.")

    normalized_conditions = conditions.strip() or DEFAULT_CONDITIONS
    normalized_goals = goals.strip() or DEFAULT_GOALS
    cache_key = _cache_key(image_bytes, normalized_conditions, normalized_goals)
    cached = _analysis_cache.get(cache_key)
    if cached is not None:
        now = time.time()
        return SupplementAnalysisResult(
            analysis_text=cached.analysis_text,
            sections=cached.sections,
            infographic_image_data_url=cached.infographic_image_data_url,
            detected_drugs=cached.detected_drugs,
            text_generation_started_at=now,
            text_generation_completed_at=now,
            image_generation_started_at=now if cached.infographic_image_data_url else None,
            image_generation_completed_at=now if cached.infographic_image_data_url else None,
        )

    optimized_bytes, optimized_content_type = optimize_image_for_openai(
        image_bytes,
        max_dimension=settings.openai_vision_max_dimension,
        jpeg_quality=settings.openai_vision_jpeg_quality,
    )

    client = OpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_api_base_url,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
    )
    image_data = base64.b64encode(optimized_bytes).decode("utf-8")
    text_started_at = time.time()
    try:
        response = _response_with_rate_limit_retry(
            client,
            model=SUPPLEMENT_ANALYSIS_MODEL,
            request_id=request_id,
            trigger_source="supplement_image_analyze",
            input_payload=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": _build_analysis_prompt(normalized_conditions, normalized_goals)},
                        {
                            "type": "input_image",
                            "image_url": f"data:{optimized_content_type};base64,{image_data}",
                            "detail": settings.openai_vision_detail_normalized,
                        },
                    ],
                }
            ],
        )
    except RateLimitError:
        raise
    except Exception as exc:
        raise RuntimeError(f"Supplement analysis provider call failed: {exc}") from exc

    analysis_text = response.output_text.strip()
    if not analysis_text:
        raise RuntimeError("The model returned an empty analysis response.")
    text_completed_at = time.time()

    infographic_key = _infographic_cache_key(analysis_text, normalized_conditions, normalized_goals)
    infographic_image_data_url = _infographic_cache.get(infographic_key) if generate_infographic else ""
    image_started_at: float | None = None
    image_completed_at: float | None = None
    if generate_infographic and infographic_image_data_url is None:
        image_started_at = time.time()
        infographic_image_data_url = _generate_infographic_data_url(
            client=client,
            analysis_text=analysis_text,
            conditions=normalized_conditions,
            goals=normalized_goals,
        )
        image_completed_at = time.time()
        _infographic_cache[infographic_key] = infographic_image_data_url
    elif generate_infographic and infographic_image_data_url:
        now = time.time()
        image_started_at = now
        image_completed_at = now

    result = SupplementAnalysisResult(
        analysis_text=analysis_text,
        sections=_parse_sections(analysis_text),
        infographic_image_data_url=infographic_image_data_url,
        detected_drugs=detect_drugs_in_text(analysis_text),
        text_generation_started_at=text_started_at,
        text_generation_completed_at=text_completed_at,
        image_generation_started_at=image_started_at,
        image_generation_completed_at=image_completed_at,
    )
    _analysis_cache[cache_key] = result
    return result


def analyze_supplement_by_name(
    supplement_name: str,
    conditions: str,
    goals: str,
    generate_infographic: bool = True,
    request_id: str | None = None,
) -> SupplementAnalysisResult:
    request_id = request_id or str(uuid.uuid4())
    service_entry_key = f"{request_id}|analyze_supplement_by_name"
    duplicate_service_entry = _track_recent_entry(service_entry_key, entry_type="service")
    print(f"OPENAI FUNCTION ENTERED fn=analyze_supplement_by_name request_id={request_id} ts={time.time()}")
    logger.info(
        "OPENAI FUNCTION ENTERED fn=%s request_id=%s duplicate_entry=%s ts=%s",
        "analyze_supplement_by_name",
        request_id,
        duplicate_service_entry,
        time.time(),
    )
    if duplicate_service_entry:
        logger.error("Duplicate service entry detected fn=%s request_id=%s", "analyze_supplement_by_name", request_id)
        raise RuntimeError(f"Duplicate service entry blocked for request_id={request_id} fn=analyze_supplement_by_name.")
    normalized_name = supplement_name.strip()
    if not normalized_name:
        raise ValueError("Please enter a supplement name.")
    if not settings.openai_api_key:
        raise RuntimeError("Supplement analysis is unavailable because OPENAI_API_KEY is not configured.")

    normalized_conditions = conditions.strip() or DEFAULT_CONDITIONS
    normalized_goals = goals.strip() or DEFAULT_GOALS
    cache_payload = f"name:{normalized_name.lower()}|{normalized_conditions}|{normalized_goals}"
    cache_key = hashlib.sha256(cache_payload.encode("utf-8")).hexdigest()
    cached = _analysis_cache.get(cache_key)
    if cached is not None:
        now = time.time()
        return SupplementAnalysisResult(
            analysis_text=cached.analysis_text,
            sections=cached.sections,
            infographic_image_data_url=cached.infographic_image_data_url,
            detected_drugs=cached.detected_drugs,
            text_generation_started_at=now,
            text_generation_completed_at=now,
            image_generation_started_at=now if cached.infographic_image_data_url else None,
            image_generation_completed_at=now if cached.infographic_image_data_url else None,
        )

    client = OpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_api_base_url,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
    )
    text_started_at = time.time()
    try:
        response = _response_with_rate_limit_retry(
            client,
            model=SUPPLEMENT_ANALYSIS_MODEL,
            request_id=request_id,
            trigger_source="supplement_text_search",
            input_payload=[
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": _build_text_analysis_prompt(normalized_name, normalized_conditions, normalized_goals)}],
                }
            ],
        )
    except RateLimitError:
        raise
    except Exception as exc:
        raise RuntimeError(f"Supplement analysis provider call failed: {exc}") from exc

    analysis_text = response.output_text.strip()
    if not analysis_text:
        raise RuntimeError("The model returned an empty analysis response.")
    text_completed_at = time.time()

    infographic_key = _infographic_cache_key(analysis_text, normalized_conditions, normalized_goals)
    infographic_image_data_url = _infographic_cache.get(infographic_key) if generate_infographic else ""
    image_started_at: float | None = None
    image_completed_at: float | None = None
    if generate_infographic and infographic_image_data_url is None:
        image_started_at = time.time()
        infographic_image_data_url = _generate_infographic_data_url(
            client=client,
            analysis_text=analysis_text,
            conditions=normalized_conditions,
            goals=normalized_goals,
        )
        image_completed_at = time.time()
        _infographic_cache[infographic_key] = infographic_image_data_url
    elif generate_infographic and infographic_image_data_url:
        now = time.time()
        image_started_at = now
        image_completed_at = now

    result = SupplementAnalysisResult(
        analysis_text=analysis_text,
        sections=_parse_sections(analysis_text),
        infographic_image_data_url=infographic_image_data_url,
        detected_drugs=detect_drugs_in_text(analysis_text),
        text_generation_started_at=text_started_at,
        text_generation_completed_at=text_completed_at,
        image_generation_started_at=image_started_at,
        image_generation_completed_at=image_completed_at,
    )
    _analysis_cache[cache_key] = result
    return result
