import re

import httpx
from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..models import SourceAssessment
from ..settings import settings


class SourceValidationOutput(BaseModel):
    keep: bool = True
    linkAlive: bool = True
    contentAccessible: bool = True
    extractedText: str = ""
    note: str = Field(min_length=10, max_length=400)


VISIBLE_TEXT_TAGS = re.compile(r"<(script|style).*?>.*?</\1>", re.IGNORECASE | re.DOTALL)
HTML_TAGS = re.compile(r"<[^>]+>")
WHITESPACE = re.compile(r"\s+")


def _clean_text(raw_text: str) -> str:
    no_scripts = VISIBLE_TEXT_TAGS.sub(" ", raw_text)
    no_tags = HTML_TAGS.sub(" ", no_scripts)
    return WHITESPACE.sub(" ", no_tags).strip()


def _fetch_source_text(source: SourceAssessment, mode: str) -> tuple[bool, bool, str, str]:
    if mode == "offline":
        text = source.snippet or source.title
        return True, True, text, "Offline mode used the seeded source excerpt as accessible evidence text."

    try:
        response = httpx.get(
            source.url,
            follow_redirects=True,
            timeout=settings.search_timeout_seconds,
            headers={"User-Agent": "GramWIN/1.0"},
        )
        response.raise_for_status()
        content_type = (response.headers.get("content-type") or "").lower()
        if "text" not in content_type and "json" not in content_type and "html" not in content_type:
            return True, False, "", "The link responded, but the content could not be extracted as readable text."
        extracted = _clean_text(response.text)[:6000]
        if not extracted:
            return True, False, "", "The link responded, but no readable text could be extracted."
        return True, True, extracted, "The link responded and readable source text was extracted."
    except Exception as exc:
        return False, False, "", f"The source could not be reached reliably: {exc}."


def _llm_source_validation(claim: str, source: SourceAssessment, extracted_text: str) -> SourceValidationOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You validate whether a retrieved health-claim source is reachable and relevant. "
            "Return JSON only with keep, linkAlive, contentAccessible, extractedText, and note. "
            "Reject sources that are broken, inaccessible, or obviously mismatched to the claim."
        ),
        {
            "claim": claim,
            "source": {
                "title": source.title,
                "url": source.url,
                "domain": source.domain,
                "snippet": source.snippet,
                "evidenceTier": source.evidenceTier,
                "sourceBucket": source.sourceBucket,
            },
            "extracted_excerpt": extracted_text[:2000],
            "instructions": [
                "Prefer keeping the source when the excerpt clearly aligns with the claim or its contradiction.",
                "Discard sources that are obviously inaccessible, unrelated, or too empty to validate.",
                "Keep extractedText concise and copied only from the provided excerpt.",
            ],
        },
        SourceValidationOutput,
        preferred_providers=["deepseek", "gemini"],
    )


def validate_sources(claim: str, sources: list[SourceAssessment], mode: str) -> list[SourceAssessment]:
    validated: list[SourceAssessment] = []
    for index, source in enumerate(sources):
        link_alive, content_accessible, extracted_text, note = _fetch_source_text(source, mode)
        keep = link_alive and content_accessible

        llm_review = None
        if keep and index < 12:
            llm_review = _llm_source_validation(claim, source, extracted_text or source.snippet)
        if llm_review is not None:
            keep = keep and llm_review.keep and llm_review.linkAlive and llm_review.contentAccessible
            link_alive = llm_review.linkAlive
            content_accessible = llm_review.contentAccessible
            extracted_text = llm_review.extractedText or extracted_text
            note = llm_review.note

        if not keep:
            continue

        notes = list(source.notes)
        notes.append(note)
        validated.append(
            source.model_copy(
                update={
                    "linkAlive": link_alive,
                    "contentAccessible": content_accessible,
                    "extractedText": extracted_text or source.snippet,
                    "notes": notes,
                }
            )
        )

    return validated
