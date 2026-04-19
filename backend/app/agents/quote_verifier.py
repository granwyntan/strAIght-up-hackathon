import asyncio
import re

from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..async_utils import gather_limited
from ..models import SourceAssessment
from ..settings import settings


class QuoteVerificationOutput(BaseModel):
    verified: bool = False
    quote: str = ""
    note: str = Field(min_length=10, max_length=400)


WHITESPACE = re.compile(r"\s+")


def _normalize(text: str) -> str:
    return WHITESPACE.sub(" ", text).strip().lower()


def _candidate_quote(source: SourceAssessment) -> str:
    candidate = (source.extractedText or source.snippet or source.title).strip()
    if not candidate:
        return ""
    sentence = candidate.split(".")[0].strip()
    return sentence[:220]


def _llm_quote_review(source: SourceAssessment, quote: str) -> QuoteVerificationOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You verify quotes for a health-claim investigation. "
            "Return JSON only with verified, quote, and note. "
            "Only mark verified true if the quote is explicitly present in the provided source text excerpt."
        ),
        {
            "source": {
                "title": source.title,
                "url": source.url,
                "snippet": source.snippet,
            },
            "quote": quote,
            "source_text_excerpt": (source.extractedText or source.snippet)[:2800],
            "instructions": [
                "Reject paraphrases. The quote must match the excerpt directly after whitespace normalization.",
                "If verified is false, return an empty quote.",
            ],
        },
        QuoteVerificationOutput,
        preferred_providers=["claude", "openai"],
    )


async def _verify_one(payload: tuple[int, SourceAssessment]) -> SourceAssessment:
    index, source = payload
    candidate_quote = _candidate_quote(source)
    source_text = _normalize(source.extractedText or source.snippet)
    normalized_quote = _normalize(candidate_quote)
    verified = bool(candidate_quote and normalized_quote and normalized_quote in source_text)
    note = "The displayed quote was verified directly against the accessible source excerpt." if verified else "No exact quote match could be confirmed, so the quote was removed."
    quote = candidate_quote if verified else ""

    llm_review = None
    if candidate_quote and index < 12:
        llm_review = await asyncio.to_thread(_llm_quote_review, source, candidate_quote)
    if llm_review is not None:
        verified = verified and llm_review.verified
        quote = llm_review.quote if verified else ""
        note = llm_review.note

    notes = list(source.notes)
    notes.append(note)
    evidence = source.evidence.model_copy(update={"quotedEvidence": quote, "quoteVerified": verified}) if source.evidence else None
    return source.model_copy(
        update={
            "quoteVerified": verified,
            "evidence": evidence,
            "notes": notes,
        }
    )


async def verify_quotes(sources: list[SourceAssessment]) -> list[SourceAssessment]:
    return await gather_limited(
        list(enumerate(sources)),
        _verify_one,
        concurrency=max(2, min(settings.pipeline_max_concurrency, 6)),
    )
