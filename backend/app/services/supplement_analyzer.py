from __future__ import annotations

import base64
import hashlib
import re
from dataclasses import dataclass

from openai import OpenAI

from ..settings import settings


ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
DEFAULT_CONDITIONS = "NIL"
DEFAULT_GOALS = "Reduce belly fat, Improve cognitive power"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
SUPPLEMENT_ANALYSIS_MODEL = "gpt-4.1-mini"
SUPPLEMENT_INFOGRAPHIC_MODEL = "gpt-image-1"

_analysis_cache: dict[str, "SupplementAnalysisResult"] = {}
_infographic_cache: dict[str, str] = {}


@dataclass(slots=True)
class SupplementSection:
    heading: str
    content: str


@dataclass(slots=True)
class SupplementAnalysisResult:
    analysis_text: str
    sections: list[SupplementSection]
    infographic_image_data_url: str


def _build_analysis_prompt(conditions: str, goals: str) -> str:
    normalized_conditions = conditions.strip() or "No prior illness or long term conditions."
    normalized_goals = goals.strip() or "General health support"

    return (
        "You are a pharmacist deciding if this patient should consume this supplement. "
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
    result = client.images.generate(
        model=SUPPLEMENT_INFOGRAPHIC_MODEL,
        prompt=_build_infographic_prompt(analysis_text, conditions, goals),
        size="1024x1024",
    )
    image_base64 = result.data[0].b64_json
    return f"data:image/png;base64,{image_base64}"


def analyze_supplement(image_bytes: bytes, content_type: str, conditions: str, goals: str) -> SupplementAnalysisResult:
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
        return cached

    client = OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_api_base_url)
    image_data = base64.b64encode(image_bytes).decode("utf-8")

    response = client.responses.create(
        model=SUPPLEMENT_ANALYSIS_MODEL,
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": _build_analysis_prompt(normalized_conditions, normalized_goals)},
                    {"type": "input_image", "image_url": f"data:{content_type};base64,{image_data}"},
                ],
            }
        ],
    )

    analysis_text = response.output_text.strip()
    if not analysis_text:
        raise RuntimeError("The model returned an empty analysis response.")
    infographic_key = _infographic_cache_key(analysis_text, normalized_conditions, normalized_goals)
    infographic_image_data_url = _infographic_cache.get(infographic_key)
    if infographic_image_data_url is None:
        infographic_image_data_url = _generate_infographic_data_url(
            client=client,
            analysis_text=analysis_text,
            conditions=normalized_conditions,
            goals=normalized_goals,
        )
        _infographic_cache[infographic_key] = infographic_image_data_url

    result = SupplementAnalysisResult(
        analysis_text=analysis_text,
        sections=_parse_sections(analysis_text),
        infographic_image_data_url=infographic_image_data_url,
    )
    _analysis_cache[cache_key] = result
    return result
