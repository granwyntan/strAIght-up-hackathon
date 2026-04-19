import asyncio
import re

import httpx
from pydantic import BaseModel, Field

from ..async_utils import gather_limited, retry_async
from ..cache import cache_key, get_json, set_json
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


async def _fetch_source_text(source: SourceAssessment, mode: str) -> tuple[bool, bool, str, str, str]:
    if mode == "offline":
        text = source.snippet or source.title
        return True, True, text, "Offline mode used the seeded source excerpt as accessible evidence text.", "fallback"

    key = cache_key("extract", source.url)
    cached_payload = get_json("extract", key)
    if cached_payload is not None:
        return (
            bool(cached_payload.get("linkAlive", False)),
            bool(cached_payload.get("contentAccessible", False)),
            str(cached_payload.get("extractedText", "")),
            str(cached_payload.get("note", "Loaded cached extraction.")),
            "cached",
        )

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=settings.search_timeout_seconds,
            headers={"User-Agent": "GramWIN/2.0"},
        ) as client:
            response = await retry_async(lambda: client.get(source.url))
            response.raise_for_status()
            content_type = (response.headers.get("content-type") or "").lower()
            if "text" not in content_type and "json" not in content_type and "html" not in content_type:
                payload = {
                    "linkAlive": True,
                    "contentAccessible": False,
                    "extractedText": "",
                    "note": "The link responded, but the content could not be extracted as readable text.",
                }
                set_json("extract", key, payload, settings.extraction_cache_ttl_seconds)
                return True, False, "", payload["note"], "live"
            extracted = _clean_text(response.text)[:9000]
            if not extracted:
                payload = {
                    "linkAlive": True,
                    "contentAccessible": False,
                    "extractedText": "",
                    "note": "The link responded, but no readable text could be extracted.",
                }
                set_json("extract", key, payload, settings.extraction_cache_ttl_seconds)
                return True, False, "", payload["note"], "live"

            payload = {
                "linkAlive": True,
                "contentAccessible": True,
                "extractedText": extracted,
                "note": "The link responded and readable source text was extracted.",
            }
            set_json("extract", key, payload, settings.extraction_cache_ttl_seconds)
            return True, True, extracted, payload["note"], "live"
    except Exception as exc:
        return False, False, "", f"The source could not be reached reliably: {exc}.", "fallback"


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
            "extracted_excerpt": extracted_text[:2200],
            "instructions": [
                "Prefer keeping the source when the excerpt clearly aligns with the claim or its contradiction.",
                "Discard sources that are obviously inaccessible, unrelated, or too empty to validate.",
                "Keep extractedText concise and copied only from the provided excerpt.",
            ],
        },
        SourceValidationOutput,
        preferred_providers=["deepseek", "gemini", "openai"],
    )


async def _validate_one(payload: tuple[int, SourceAssessment], claim: str, mode: str) -> SourceAssessment | None:
    index, source = payload
    link_alive, content_accessible, extracted_text, note, cache_status = await _fetch_source_text(source, mode)
    keep = link_alive and content_accessible

    llm_review = None
    if keep and index < 16:
        llm_review = await asyncio.to_thread(_llm_source_validation, claim, source, extracted_text or source.snippet)
    if llm_review is not None:
        keep = keep and llm_review.keep and llm_review.linkAlive and llm_review.contentAccessible
        link_alive = llm_review.linkAlive
        content_accessible = llm_review.contentAccessible
        extracted_text = llm_review.extractedText or extracted_text
        note = llm_review.note

    if not keep:
        return None

    notes = list(source.notes)
    notes.append(note)
    return source.model_copy(
        update={
            "linkAlive": link_alive,
            "contentAccessible": content_accessible,
            "extractedText": extracted_text or source.snippet,
            "cacheStatus": cache_status if cache_status in {"live", "cached", "fallback"} else source.cacheStatus,
            "notes": notes,
        }
    )


async def validate_sources(claim: str, sources: list[SourceAssessment], mode: str) -> list[SourceAssessment]:
    validated = await gather_limited(
        list(enumerate(sources)),
        lambda item: _validate_one(item, claim, mode),
        concurrency=settings.pipeline_max_concurrency,
    )
    return [source for source in validated if source is not None]
