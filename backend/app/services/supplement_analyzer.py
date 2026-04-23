from __future__ import annotations

import base64
import hashlib
import json
import logging
import random
import re
import time
import uuid
from collections import deque
from concurrent.futures import ThreadPoolExecutor
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
    structured_analysis: dict[str, object] | None = None
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
        "You are a careful pharmacist and evidence communicator deciding whether this patient should use the supplement shown in the image. "
        "Be clinically grounded, practical, and readable for everyday users. "
        "The FIRST LINE of your response must be exactly: 'Supplement Name: <name>'. "
        "Do not add any text before that first line. "
        "Return markdown with exactly these H2 headings, in this exact order:\n"
        "## Hero Summary\n"
        "## Quick Match to User Goals\n"
        "## Plain Language Summary\n"
        "## Ingredient Breakdown\n"
        "## Benefits\n"
        "## Risks and Warnings\n"
        "## Personalization\n"
        "## Usage Guide\n"
        "## Evidence and Transparency\n"
        "## Claim Analyzer (Quick)\n\n"
        "Formatting rules:\n"
        "- Keep every section concise and scannable.\n"
        "- Use bullets only, no tables.\n"
        "- For Hero Summary use these bullets exactly:\n"
        "  - Product Name: ...\n"
        "  - Brand: ...\n"
        "  - Category: ...\n"
        "  - Form: ...\n"
        "  - Verdict: Good fit / Limited fit / Avoid / Needs caution\n"
        "  - Confidence: High / Medium / Low\n"
        "  - Key warning: ... (or 'None noted')\n"
        "  - Summary: one clear sentence\n"
        "- For Quick Match to User Goals use one bullet per goal in this format:\n"
        "  - Goal | Fit: Strong / Medium / Limited / Poor / Not relevant | Reason: ...\n"
        "- For Plain Language Summary use 3 to 5 bullets covering what it is, what it may do, and what it does not do.\n"
        "- For Ingredient Breakdown use one bullet per key ingredient in this format:\n"
        "  - Ingredient | Amount: ... or Unknown | Dose: Low / Normal / High / Unknown | Evidence: Strong / Moderate / Weak / Unclear | Risks: ... | Why it matters: ...\n"
        "- For Benefits use one bullet per likely benefit in this format:\n"
        "  - Benefit | Evidence: Strong / Moderate / Weak | Best for: ... | Limit: ...\n"
        "- For Risks and Warnings use one bullet per warning in this format:\n"
        "  - Severity: High / Medium / Low | Issue: ... | Trigger: ... | Advice: ...\n"
        "- For Personalization use bullets in this format:\n"
        "  - Good: ...\n"
        "  - Caution: ...\n"
        "  - Avoid: ...\n"
        "- For Usage Guide use bullets for Take, Timing, Avoid stacking, and Duration.\n"
        "- For Evidence and Transparency use bullets for Evidence level, Confidence, Product-specific certainty, and Main uncertainty.\n"
        "- For Claim Analyzer (Quick) use bullets exactly for Real claims, Marketing fluff, Evidence-backed, Weak, and False or overstated.\n"
        "- If the image does not show enough detail, say so clearly and mark uncertain fields as Unknown.\n"
        "- Do not invent brand or dosage details when the image does not support them.\n\n"
        f"Patient goals: {normalized_goals}\n"
        f"Patient medical history: {normalized_conditions}\n"
    )


def _build_text_analysis_prompt(supplement_name: str, conditions: str, goals: str) -> str:
    normalized_name = supplement_name.strip()
    normalized_conditions = conditions.strip() or "No prior illness or long term conditions."
    normalized_goals = goals.strip() or "General health support"
    return (
        "You are a careful pharmacist and evidence communicator deciding whether this patient should use this supplement. "
        f"The supplement to evaluate is: {normalized_name}. "
        "The FIRST LINE of your response must be exactly: 'Supplement Name: <name>'. "
        "Use the supplement name you are evaluating. Do not add any text before that first line. "
        "Do not claim to have read a label image. "
        "Use generally known ingredient profiles when possible, and clearly label uncertainty when product-specific details are unknown. "
        "Return markdown with exactly these H2 headings, in this exact order:\n"
        "## Hero Summary\n"
        "## Quick Match to User Goals\n"
        "## Plain Language Summary\n"
        "## Ingredient Breakdown\n"
        "## Benefits\n"
        "## Risks and Warnings\n"
        "## Personalization\n"
        "## Usage Guide\n"
        "## Evidence and Transparency\n"
        "## Claim Analyzer (Quick)\n\n"
        "Formatting rules:\n"
        "- Keep every section concise and scannable.\n"
        "- Use bullets only, no tables.\n"
        "- For Hero Summary use these bullets exactly:\n"
        "  - Product Name: ...\n"
        "  - Brand: ...\n"
        "  - Category: ...\n"
        "  - Form: ...\n"
        "  - Verdict: Good fit / Limited fit / Avoid / Needs caution\n"
        "  - Confidence: High / Medium / Low\n"
        "  - Key warning: ... (or 'None noted')\n"
        "  - Summary: one clear sentence\n"
        "- For Quick Match to User Goals use one bullet per goal in this format:\n"
        "  - Goal | Fit: Strong / Medium / Limited / Poor / Not relevant | Reason: ...\n"
        "- For Plain Language Summary use 3 to 5 bullets covering what it is, what it may do, and what it does not do.\n"
        "- For Ingredient Breakdown use one bullet per key ingredient in this format:\n"
        "  - Ingredient | Amount: ... or Unknown | Dose: Low / Normal / High / Unknown | Evidence: Strong / Moderate / Weak / Unclear | Risks: ... | Why it matters: ...\n"
        "- For Benefits use one bullet per likely benefit in this format:\n"
        "  - Benefit | Evidence: Strong / Moderate / Weak | Best for: ... | Limit: ...\n"
        "- For Risks and Warnings use one bullet per warning in this format:\n"
        "  - Severity: High / Medium / Low | Issue: ... | Trigger: ... | Advice: ...\n"
        "- For Personalization use bullets in this format:\n"
        "  - Good: ...\n"
        "  - Caution: ...\n"
        "  - Avoid: ...\n"
        "- For Usage Guide use bullets for Take, Timing, Avoid stacking, and Duration.\n"
        "- For Evidence and Transparency use bullets for Evidence level, Confidence, Product-specific certainty, and Main uncertainty.\n"
        "- For Claim Analyzer (Quick) use bullets exactly for Real claims, Marketing fluff, Evidence-backed, Weak, and False or overstated.\n"
        "- Make it clear when a point is based on common formulations rather than verified label-specific data.\n\n"
        f"Patient goals: {normalized_goals}\n"
        f"Patient medical history: {normalized_conditions}\n"
    )


def _safe_slug(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return cleaned or fallback


def _section_content_map(sections: list[SupplementSection]) -> dict[str, str]:
    return {section.heading.strip().lower(): section.content.strip() for section in sections}


def _bullet_lines(content: str) -> list[str]:
    lines: list[str] = []
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        line = re.sub(r"^[-*]\s*", "", line).strip()
        if line:
            lines.append(line)
    return lines


def _split_pipe_fields(line: str) -> list[str]:
    return [field.strip() for field in line.split("|") if field.strip()]


def _field_value(fields: list[str], label: str) -> str:
    needle = f"{label.strip().lower()}:"
    for field in fields:
        lowered = field.lower()
        if lowered.startswith(needle):
            return field.split(":", 1)[1].strip()
    return ""


def _parse_score(value: str, default: int) -> int:
    match = re.search(r"\d{1,3}", value or "")
    if match:
        return max(0, min(100, int(match.group(0))))
    return default


def _score_from_level(value: str, *, positive_bias: int = 65) -> int:
    lowered = (value or "").strip().lower()
    if any(token in lowered for token in ["strong", "high"]):
        return 82
    if any(token in lowered for token in ["moderate", "medium", "normal"]):
        return positive_bias
    if any(token in lowered for token in ["weak", "poor", "low", "limited"]):
        return 44
    if "avoid" in lowered:
        return 26
    return positive_bias


def _build_user_profile_snapshot(conditions: str) -> dict[str, object]:
    age_match = re.search(r"\bage\s*[:\-]?\s*(\d{1,3})\b", conditions, flags=re.IGNORECASE)
    gender_match = re.search(r"\bgender\s*[:\-]?\s*([A-Za-z ]+)", conditions, flags=re.IGNORECASE)
    medications_match = re.search(
        r"current medications or supplements\s*:\s*(.+)",
        conditions,
        flags=re.IGNORECASE,
    )
    medical_conditions_match = re.search(r"medical conditions\s*:\s*(.+)", conditions, flags=re.IGNORECASE)
    medical_history_match = re.search(r"medical history\s*:\s*(.+)", conditions, flags=re.IGNORECASE)

    condition_pool: list[str] = []
    if medical_conditions_match:
        condition_pool.extend(re.split(r",|;|\band\b", medical_conditions_match.group(1)))
    if medical_history_match:
        condition_pool.extend(re.split(r",|;|\band\b", medical_history_match.group(1)))

    medications: list[str] = []
    if medications_match:
        medications = [item.strip() for item in re.split(r",|;|\band\b", medications_match.group(1)) if item.strip()]

    conditions_list = [item.strip() for item in condition_pool if item.strip()]
    return {
        "age": age_match.group(1) if age_match else "",
        "gender": gender_match.group(1).strip() if gender_match else "",
        "conditions": conditions_list,
        "medications": medications,
    }


def _structured_analysis_fallback(sections: list[SupplementSection], conditions: str, goals: str) -> dict[str, object]:
    section_map = _section_content_map(sections)
    ingredient_lines = _bullet_lines(section_map.get("ingredient breakdown", ""))
    risk_lines = _bullet_lines(section_map.get("risks and warnings", ""))
    personalization_lines = _bullet_lines(section_map.get("personalization", ""))
    evidence_lines = _bullet_lines(section_map.get("evidence and transparency", ""))

    risk_lookup = " ".join(risk_lines)
    personalization_lookup = " ".join(personalization_lines)
    evidence_lookup = " ".join(evidence_lines)

    ingredients: list[dict[str, object]] = []
    for index, line in enumerate(ingredient_lines):
        parts = _split_pipe_fields(line)
        name = parts[0] if parts else f"Ingredient {index + 1}"
        amount = _field_value(parts[1:], "Amount") or "Unknown"
        dose_assessment = _field_value(parts[1:], "Dose") or "Unknown"
        evidence_level = _field_value(parts[1:], "Evidence") or "Unclear"
        risks = _field_value(parts[1:], "Risks") or ""
        why_it_matters = _field_value(parts[1:], "Why it matters") or ""
        ingredient_id = _safe_slug(name, f"ingredient-{index + 1}")
        category = "active ingredient"
        lowered = name.lower()
        if any(token in lowered for token in ["vitamin", "b12", "b6", "folate"]):
            category = "vitamin"
        elif any(token in lowered for token in ["magnesium", "calcium", "iron", "zinc"]):
            category = "mineral"
        elif any(token in lowered for token in ["extract", "herb", "ashwagandha", "turmeric", "ginseng"]):
            category = "botanical"

        interaction_items: list[dict[str, object]] = []
        if risks:
            interaction_items.append(
                {
                    "ingredient_id": ingredient_id,
                    "interacts_with": "sensitive users or concurrent treatments",
                    "severity": "medium" if any(flag in risks.lower() for flag in ["avoid", "interaction", "contraind"]) else "low",
                    "description": risks,
                }
            )

        evidence_items = [
            {
                "id": f"{ingredient_id}-evidence-1",
                "ingredient_id": ingredient_id,
                "study_type": "review summary",
                "strength": evidence_level,
                "summary": why_it_matters or evidence_lookup or "Evidence summary was inferred from the analysis narrative.",
                "source_link": "",
            }
        ]

        ingredients.append(
            {
                "id": ingredient_id,
                "name": name,
                "category": category,
                "description": why_it_matters or f"{name} appears in the product and was reviewed against the user's goals and risks.",
                "amount": amount,
                "dose_assessment": dose_assessment,
                "evidence": evidence_items,
                "interactions": interaction_items,
                "personal_relevance": why_it_matters or personalization_lookup,
                "analysis_result": {
                    "effectiveness_score": _score_from_level(evidence_level, positive_bias=63),
                    "safety_score": max(25, 92 - _score_from_level(risks or dose_assessment, positive_bias=28)),
                    "compatibility_score": _score_from_level(why_it_matters or goals, positive_bias=68),
                },
            }
        )

    if not ingredients:
        ingredients.append(
            {
                "id": "primary-formula",
                "name": "Primary formula",
                "category": "supplement blend",
                "description": "A general ingredient-level breakdown could not be isolated cleanly, so this summary reflects the overall formulation.",
                "amount": "Unknown",
                "dose_assessment": "Unknown",
                "evidence": [
                    {
                        "id": "primary-formula-evidence-1",
                        "ingredient_id": "primary-formula",
                        "study_type": "formula overview",
                        "strength": "Unclear",
                        "summary": evidence_lookup or "Product-level evidence was limited or not label-specific.",
                        "source_link": "",
                    }
                ],
                "interactions": [],
                "personal_relevance": personalization_lookup,
                "analysis_result": {
                    "effectiveness_score": 58,
                    "safety_score": 68,
                    "compatibility_score": 60,
                },
            }
        )

    mean_effectiveness = round(sum(item["analysis_result"]["effectiveness_score"] for item in ingredients) / len(ingredients))
    mean_safety = round(sum(item["analysis_result"]["safety_score"] for item in ingredients) / len(ingredients))
    mean_compatibility = round(sum(item["analysis_result"]["compatibility_score"] for item in ingredients) / len(ingredients))

    return {
        "ingredients": ingredients,
        "user_profile": _build_user_profile_snapshot(conditions),
        "analysis_result": {
            "effectiveness_score": mean_effectiveness,
            "safety_score": mean_safety,
            "compatibility_score": mean_compatibility,
        },
    }


def _extract_first_json_object(raw_text: str) -> dict[str, object] | None:
    stripped = raw_text.strip()
    if not stripped:
        return None
    fenced_match = re.search(r"```json\s*(\{.*\})\s*```", stripped, flags=re.DOTALL | re.IGNORECASE)
    candidate = fenced_match.group(1) if fenced_match else stripped
    if not candidate.startswith("{"):
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start >= 0 and end > start:
            candidate = candidate[start : end + 1]
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _build_structured_analysis_prompt(
    analysis_text: str,
    sections: list[SupplementSection],
    conditions: str,
    goals: str,
) -> str:
    section_text = "\n\n".join(f"## {section.heading}\n{section.content}" for section in sections)
    return (
        "You are a pharmacist QA agent turning a supplement review into strict JSON for a mobile app. "
        "Use only the information present in the source analysis. Do not invent source links or dosage values. "
        "If something is unknown, use an empty string or empty list. "
        "Return JSON only with this shape:\n"
        "{\n"
        '  "ingredients": [\n'
        "    {\n"
        '      "id": "string",\n'
        '      "name": "string",\n'
        '      "category": "string",\n'
        '      "description": "string",\n'
        '      "amount": "string",\n'
        '      "dose_assessment": "string",\n'
        '      "personal_relevance": "string",\n'
        '      "evidence": [\n'
        "        {\n"
        '          "id": "string",\n'
        '          "ingredient_id": "string",\n'
        '          "study_type": "string",\n'
        '          "strength": "string",\n'
        '          "summary": "string",\n'
        '          "source_link": "string"\n'
        "        }\n"
        "      ],\n"
        '      "interactions": [\n'
        "        {\n"
        '          "ingredient_id": "string",\n'
        '          "interacts_with": "string",\n'
        '          "severity": "low|medium|high",\n'
        '          "description": "string"\n'
        "        }\n"
        "      ],\n"
        '      "analysis_result": {\n'
        '        "effectiveness_score": 0,\n'
        '        "safety_score": 0,\n'
        '        "compatibility_score": 0\n'
        "      }\n"
        "    }\n"
        "  ],\n"
        '  "user_profile": {\n'
        '    "age": "string",\n'
        '    "gender": "string",\n'
        '    "conditions": ["string"],\n'
        '    "medications": ["string"]\n'
        "  },\n"
        '  "analysis_result": {\n'
        '    "effectiveness_score": 0,\n'
        '    "safety_score": 0,\n'
        '    "compatibility_score": 0\n'
        "  }\n"
        "}\n\n"
        f"User goals: {goals}\n"
        f"User profile context: {conditions}\n\n"
        "Source supplement analysis:\n"
        f"{analysis_text}\n\n"
        "Source sections:\n"
        f"{section_text}"
    )


def _normalize_structured_analysis(payload: dict[str, object], fallback: dict[str, object]) -> dict[str, object]:
    ingredients_payload = payload.get("ingredients")
    normalized_ingredients: list[dict[str, object]] = []
    if isinstance(ingredients_payload, list):
        for index, item in enumerate(ingredients_payload):
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            ingredient_id = str(item.get("id") or _safe_slug(name, f"ingredient-{index + 1}")).strip() or f"ingredient-{index + 1}"

            evidence_payload = item.get("evidence")
            normalized_evidence: list[dict[str, object]] = []
            if isinstance(evidence_payload, list):
                for evidence_index, evidence in enumerate(evidence_payload):
                    if not isinstance(evidence, dict):
                        continue
                    normalized_evidence.append(
                        {
                            "id": str(evidence.get("id") or f"{ingredient_id}-evidence-{evidence_index + 1}").strip(),
                            "ingredient_id": ingredient_id,
                            "study_type": str(evidence.get("study_type") or "").strip(),
                            "strength": str(evidence.get("strength") or "").strip(),
                            "summary": str(evidence.get("summary") or "").strip(),
                            "source_link": str(evidence.get("source_link") or "").strip(),
                        }
                    )

            interaction_payload = item.get("interactions")
            normalized_interactions: list[dict[str, object]] = []
            if isinstance(interaction_payload, list):
                for interaction in interaction_payload:
                    if not isinstance(interaction, dict):
                        continue
                    normalized_interactions.append(
                        {
                            "ingredient_id": ingredient_id,
                            "interacts_with": str(interaction.get("interacts_with") or "").strip(),
                            "severity": str(interaction.get("severity") or "low").strip().lower(),
                            "description": str(interaction.get("description") or "").strip(),
                        }
                    )

            analysis_result = item.get("analysis_result")
            analysis_payload = analysis_result if isinstance(analysis_result, dict) else {}
            normalized_ingredients.append(
                {
                    "id": ingredient_id,
                    "name": name or f"Ingredient {index + 1}",
                    "category": str(item.get("category") or "").strip(),
                    "description": str(item.get("description") or "").strip(),
                    "amount": str(item.get("amount") or "").strip(),
                    "dose_assessment": str(item.get("dose_assessment") or "").strip(),
                    "personal_relevance": str(item.get("personal_relevance") or "").strip(),
                    "evidence": normalized_evidence,
                    "interactions": normalized_interactions,
                    "analysis_result": {
                        "effectiveness_score": _parse_score(str(analysis_payload.get("effectiveness_score") or ""), 58),
                        "safety_score": _parse_score(str(analysis_payload.get("safety_score") or ""), 68),
                        "compatibility_score": _parse_score(str(analysis_payload.get("compatibility_score") or ""), 62),
                    },
                }
            )

    if not normalized_ingredients:
        return fallback

    user_profile_payload = payload.get("user_profile")
    user_profile = user_profile_payload if isinstance(user_profile_payload, dict) else {}
    overall_payload = payload.get("analysis_result")
    overall = overall_payload if isinstance(overall_payload, dict) else {}
    return {
        "ingredients": normalized_ingredients,
        "user_profile": {
            "age": str(user_profile.get("age") or fallback["user_profile"].get("age") or "").strip(),
            "gender": str(user_profile.get("gender") or fallback["user_profile"].get("gender") or "").strip(),
            "conditions": user_profile.get("conditions") if isinstance(user_profile.get("conditions"), list) else fallback["user_profile"].get("conditions", []),
            "medications": user_profile.get("medications") if isinstance(user_profile.get("medications"), list) else fallback["user_profile"].get("medications", []),
        },
        "analysis_result": {
            "effectiveness_score": _parse_score(str(overall.get("effectiveness_score") or ""), int(fallback["analysis_result"]["effectiveness_score"])),
            "safety_score": _parse_score(str(overall.get("safety_score") or ""), int(fallback["analysis_result"]["safety_score"])),
            "compatibility_score": _parse_score(str(overall.get("compatibility_score") or ""), int(fallback["analysis_result"]["compatibility_score"])),
        },
    }


def _generate_structured_analysis(
    client: OpenAI,
    analysis_text: str,
    sections: list[SupplementSection],
    conditions: str,
    goals: str,
    request_id: str,
) -> dict[str, object]:
    fallback = _structured_analysis_fallback(sections, conditions, goals)
    try:
        response = _response_with_rate_limit_retry(
            client,
            model=SUPPLEMENT_ANALYSIS_MODEL,
            request_id=request_id,
            trigger_source="supplement_structured_analysis",
            input_payload=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": _build_structured_analysis_prompt(analysis_text, sections, conditions, goals),
                        }
                    ],
                }
            ],
        )
        parsed = _extract_first_json_object((response.output_text or "").strip())
        if parsed is None:
            logger.warning("Structured supplement analysis returned non-JSON output.")
            return fallback
        return _normalize_structured_analysis(parsed, fallback)
    except Exception as exc:
        logger.warning("Structured supplement analysis failed: %s", exc)
        return fallback


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
            structured_analysis=cached.structured_analysis,
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
    sections = _parse_sections(analysis_text)

    infographic_key = _infographic_cache_key(analysis_text, normalized_conditions, normalized_goals)
    infographic_image_data_url = _infographic_cache.get(infographic_key) if generate_infographic else ""
    image_started_at: float | None = None
    image_completed_at: float | None = None
    structured_analysis = _structured_analysis_fallback(sections, normalized_conditions, normalized_goals)
    if generate_infographic and infographic_image_data_url:
        now = time.time()
        image_started_at = now
        image_completed_at = now
    elif generate_infographic:
        image_started_at = time.time()

    with ThreadPoolExecutor(max_workers=2) as executor:
        structured_future = executor.submit(
            _generate_structured_analysis,
            client,
            analysis_text,
            sections,
            normalized_conditions,
            normalized_goals,
            request_id,
        )
        infographic_future = None
        if generate_infographic and not infographic_image_data_url:
            infographic_future = executor.submit(
                _generate_infographic_data_url,
                client,
                analysis_text,
                normalized_conditions,
                normalized_goals,
            )

        structured_analysis = structured_future.result()
        if infographic_future is not None:
            infographic_image_data_url = infographic_future.result()
            image_completed_at = time.time()
            _infographic_cache[infographic_key] = infographic_image_data_url

    result = SupplementAnalysisResult(
        analysis_text=analysis_text,
        sections=sections,
        infographic_image_data_url=infographic_image_data_url,
        detected_drugs=detect_drugs_in_text(analysis_text),
        structured_analysis=structured_analysis,
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
            structured_analysis=cached.structured_analysis,
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
    sections = _parse_sections(analysis_text)

    infographic_key = _infographic_cache_key(analysis_text, normalized_conditions, normalized_goals)
    infographic_image_data_url = _infographic_cache.get(infographic_key) if generate_infographic else ""
    image_started_at: float | None = None
    image_completed_at: float | None = None
    structured_analysis = _structured_analysis_fallback(sections, normalized_conditions, normalized_goals)
    if generate_infographic and infographic_image_data_url:
        now = time.time()
        image_started_at = now
        image_completed_at = now
    elif generate_infographic:
        image_started_at = time.time()

    with ThreadPoolExecutor(max_workers=2) as executor:
        structured_future = executor.submit(
            _generate_structured_analysis,
            client,
            analysis_text,
            sections,
            normalized_conditions,
            normalized_goals,
            request_id,
        )
        infographic_future = None
        if generate_infographic and not infographic_image_data_url:
            infographic_future = executor.submit(
                _generate_infographic_data_url,
                client,
                analysis_text,
                normalized_conditions,
                normalized_goals,
            )

        structured_analysis = structured_future.result()
        if infographic_future is not None:
            infographic_image_data_url = infographic_future.result()
            image_completed_at = time.time()
            _infographic_cache[infographic_key] = infographic_image_data_url

    result = SupplementAnalysisResult(
        analysis_text=analysis_text,
        sections=sections,
        infographic_image_data_url=infographic_image_data_url,
        detected_drugs=detect_drugs_in_text(analysis_text),
        structured_analysis=structured_analysis,
        text_generation_started_at=text_started_at,
        text_generation_completed_at=text_completed_at,
        image_generation_started_at=image_started_at,
        image_generation_completed_at=image_completed_at,
    )
    _analysis_cache[cache_key] = result
    return result
