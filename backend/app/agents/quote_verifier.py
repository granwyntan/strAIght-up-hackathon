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
TOKEN_PATTERN = re.compile(r"[a-z0-9]+", re.IGNORECASE)
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
QUOTE_SIGNAL_TERMS = (
    "no evidence",
    "not associated",
    "no significant effect",
    "fails to",
    "supports",
    "improves",
    "reduced",
    "inconclusive",
    "limited evidence",
    "more research",
    "risk",
)


def _normalize(text: str) -> str:
    return WHITESPACE.sub(" ", text).strip().lower()


def _tokenize(text: str) -> set[str]:
    return {token.lower() for token in TOKEN_PATTERN.findall(text) if len(token) > 2}


def _trim_quote(text: str, limit: int = 220) -> str:
    cleaned = WHITESPACE.sub(" ", text).strip().strip("\"")
    if len(cleaned) <= limit:
        return cleaned
    truncated = cleaned[:limit].rsplit(" ", 1)[0].strip()
    return truncated or cleaned[:limit].strip()


def _candidate_quote(source: SourceAssessment) -> str:
    source_text = WHITESPACE.sub(" ", (source.extractedText or "").strip())
    if not source_text:
        return ""
    sentences = [sentence.strip() for sentence in SENTENCE_SPLIT.split(source_text) if sentence.strip()]
    if not sentences:
        return _trim_quote(source_text)

    query_terms = _tokenize(" ".join([source.query, source.title, source.snippet]))
    best_sentence = ""
    best_score = (-1, -1, -1)

    for sentence in sentences[:24]:
        if len(sentence) < 32:
            continue
        candidate = _trim_quote(sentence)
        candidate_terms = _tokenize(candidate)
        overlap = len(candidate_terms & query_terms)
        signal_bonus = 1 if any(term in candidate.lower() for term in QUOTE_SIGNAL_TERMS) else 0
        score = (overlap, signal_bonus, min(len(candidate), 220))
        if score > best_score:
            best_sentence = candidate
            best_score = score

    if best_sentence:
        return best_sentence

    return _trim_quote(sentences[0])


def _safe_verified_quote(source_text: str, quote: str) -> str:
    normalized_quote = _normalize(quote)
    if normalized_quote and normalized_quote in source_text:
        return quote.strip()[:220]
    return ""


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


def _llm_quote_check(source: SourceAssessment, quote: str, draft: QuoteVerificationOutput) -> QuoteVerificationOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You are the checker for a quote-verification stage in a health-claim investigation. "
            "Return JSON only with verified, quote, and note. "
            "Confirm whether the draft decision is supported by the provided excerpt."
        ),
        {
            "source": {
                "title": source.title,
                "url": source.url,
                "snippet": source.snippet,
            },
            "candidate_quote": quote,
            "draft_review": draft.model_dump(),
            "source_text_excerpt": (source.extractedText or source.snippet)[:2800],
            "instructions": [
                "Only keep verified true if the quote appears directly in the excerpt after whitespace normalization.",
                "Reject paraphrases and invented wording.",
                "If the quote is not valid, return verified false with an empty quote.",
            ],
        },
        QuoteVerificationOutput,
        preferred_providers=["openai", "gemini", "xai"],
    )


def _llm_quote_arbiter(
    source: SourceAssessment,
    quote: str,
    primary: QuoteVerificationOutput,
    checker: QuoteVerificationOutput,
) -> QuoteVerificationOutput | None:
    return generate_structured_output(
        "consensus",
        (
            "You arbitrate a disagreement in a quote-verification stage for a health-claim investigation. "
            "Return JSON only with verified, quote, and note. "
            "Only keep verified true when the quote appears directly in the provided excerpt after whitespace normalization."
        ),
        {
            "source": {
                "title": source.title,
                "url": source.evidenceUrl or source.resolvedUrl or source.url,
                "snippet": source.snippet,
            },
            "candidate_quote": quote,
            "primary_review": primary.model_dump(),
            "checker_review": checker.model_dump(),
            "source_text_excerpt": (source.extractedText or source.snippet)[:2800],
        },
        QuoteVerificationOutput,
        preferred_providers=["openai", "gemini", "claude"],
    )


async def _verify_one(payload: tuple[int, SourceAssessment]) -> SourceAssessment:
    index, source = payload
    if not source.directEvidenceEligible:
        notes = list(source.notes)
        notes.append("The source did not pass the direct-evidence gate, so no highlighted quote was retained.")
        evidence = source.evidence.model_copy(update={"quotedEvidence": "", "quoteVerified": False}) if source.evidence else None
        return source.model_copy(update={"quoteVerified": False, "evidence": evidence, "notes": notes})
    candidate_quote = _candidate_quote(source)
    source_text = _normalize(source.extractedText or source.snippet)
    quote = _safe_verified_quote(source_text, candidate_quote)
    verified = bool(quote)
    note = "The displayed quote was verified directly against the accessible source excerpt." if verified else "No exact quote match could be confirmed, so the quote was removed."

    llm_review = None
    if candidate_quote and index < 12:
        llm_review = await asyncio.to_thread(_llm_quote_review, source, candidate_quote)
    if llm_review is not None:
        checker_review = await asyncio.to_thread(_llm_quote_check, source, candidate_quote, llm_review)
        effective_review = checker_review or llm_review
        if checker_review is not None and checker_review.verified != llm_review.verified:
            arbiter_review = await asyncio.to_thread(_llm_quote_arbiter, source, candidate_quote, llm_review, checker_review)
            if arbiter_review is not None:
                effective_review = arbiter_review
        reviewed_quote = _safe_verified_quote(source_text, effective_review.quote)
        verified = verified and llm_review.verified and effective_review.verified and bool(reviewed_quote)
        quote = reviewed_quote if verified else ""
        note = effective_review.note

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
