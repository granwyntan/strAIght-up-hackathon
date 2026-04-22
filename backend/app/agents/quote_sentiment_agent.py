import asyncio
from collections import Counter

from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..async_utils import gather_limited
from ..models import QuoteStance, SourceAssessment
from ..settings import settings


QUOTE_STANCE_BY_SENTIMENT = {
    "positive": "supportive",
    "neutral": "uncertain",
    "negative": "unsupportive",
}

NEGATIVE_SIGNALS = [
    "no evidence",
    "not associated",
    "does not support",
    "fails to demonstrate",
    "no significant effect",
    "ineffective",
]

UNCERTAIN_SIGNALS = [
    "mixed",
    "inconclusive",
    "limited evidence",
    "more research needed",
    "preliminary",
    "insufficient evidence",
]


class QuoteSentimentOutput(BaseModel):
    quoteStance: QuoteStance = "uncertain"
    rationale: str = Field(min_length=10, max_length=320)


def _quote_text(source: SourceAssessment) -> str:
    if source.evidence and source.evidence.quotedEvidence.strip():
        return source.evidence.quotedEvidence.strip()
    return (source.extractedText or source.snippet or source.title).strip()[:320]


def _heuristic_quote_stance(source: SourceAssessment) -> tuple[QuoteStance, str]:
    text = _quote_text(source).lower()
    if any(signal in text for signal in NEGATIVE_SIGNALS):
        return "unsupportive", "The highlighted evidence explicitly fails to support the claim or pushes back on it."
    if any(signal in text for signal in UNCERTAIN_SIGNALS):
        return "uncertain", "The highlighted evidence describes mixed, limited, or inconclusive support."
    if source.sentiment == "positive":
        return "supportive", "The highlighted evidence leans in the same direction as the claim."
    if source.sentiment == "negative":
        return "unsupportive", "The highlighted evidence materially narrows or contradicts the claim."
    return "uncertain", "The highlighted evidence adds context, but it does not cleanly settle the claim."


def _llm_quote_stance(claim: str, source: SourceAssessment) -> QuoteSentimentOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You classify the direction of a displayed evidence quote for a health-claim investigation. "
            "Professional role: evidence interpreter reading quotes conservatively. "
            "Return JSON only with quoteStance and rationale. "
            "Use quoteStance values supportive, uncertain, or unsupportive."
        ),
        {
            "claim": claim,
            "source": {
                "title": source.title,
                "domain": source.domain,
                "sentiment": source.sentiment,
                "stance": source.stance,
            },
            "quote": _quote_text(source),
            "instructions": [
                "Use supportive only when the quote genuinely backs the claim direction.",
                "Use unsupportive when the quote contradicts the claim or clearly fails to support a strong version of it.",
                "Use uncertain for mixed, limited, hedged, or inconclusive evidence.",
            ],
        },
        QuoteSentimentOutput,
        preferred_providers=["claude", "xai", "openai"],
    )


def _llm_quote_stance_check(claim: str, source: SourceAssessment, draft: QuoteSentimentOutput) -> QuoteSentimentOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You are the checker for a quote-direction stage in a health-claim investigation. "
            "Professional role: evidence QA reviewer. "
            "Goal: confirm whether the displayed quote really supports, weakens, or remains uncertain for the claim as written. "
            "Return JSON only with quoteStance and rationale. "
            "Use quoteStance values supportive, uncertain, or unsupportive."
        ),
        {
            "claim": claim,
            "source": {
                "title": source.title,
                "domain": source.domain,
                "sentiment": source.sentiment,
                "stance": source.stance,
            },
            "quote": _quote_text(source),
            "draft": draft.model_dump(),
            "instructions": [
                "Downgrade to uncertain when the quote is hedged, limited, or inconclusive.",
                "Use unsupportive when the quote contradicts the claim or clearly fails to support a strong version of it.",
                "Do not mark supportive unless the quote directly backs the claim direction.",
            ],
        },
        QuoteSentimentOutput,
        preferred_providers=["openai", "gemini", "claude"],
    )


def _llm_quote_stance_arbiter(claim: str, source: SourceAssessment, primary: QuoteSentimentOutput, checker: QuoteSentimentOutput) -> QuoteSentimentOutput | None:
    return generate_structured_output(
        "consensus",
        (
            "You are the arbiter for a quote-direction disagreement in a health-claim investigation. "
            "Professional role: evidence judge resolving conflicts between two reviewers. "
            "Goal: choose the most evidence-faithful and conservative quote stance without inventing certainty. "
            "Return JSON only with quoteStance and rationale. "
            "Use quoteStance values supportive, uncertain, or unsupportive."
        ),
        {
            "claim": claim,
            "source": {
                "title": source.title,
                "domain": source.domain,
                "sentiment": source.sentiment,
                "stance": source.stance,
            },
            "quote": _quote_text(source),
            "primary_review": primary.model_dump(),
            "checker_review": checker.model_dump(),
            "instructions": [
                "Prefer uncertain when support is weaker than the claim wording.",
                "Prefer unsupportive when the quote materially contradicts the claim or clearly fails to support it.",
                "Only return supportive when the quote directly backs the claim direction.",
            ],
        },
        QuoteSentimentOutput,
        preferred_providers=["claude", "openai", "gemini"],
    )


async def _classify_one(payload: tuple[int, SourceAssessment], claim: str) -> SourceAssessment:
    index, source = payload
    stance, rationale = _heuristic_quote_stance(source)
    if index < 18 and (_quote_text(source) or source.sentiment != "neutral"):
        primary_review = await asyncio.to_thread(_llm_quote_stance, claim, source)
        if primary_review is not None:
            checker_review = await asyncio.to_thread(_llm_quote_stance_check, claim, source, primary_review)
            effective_review = checker_review or primary_review
            if checker_review is not None and checker_review.quoteStance != primary_review.quoteStance:
                arbiter_review = await asyncio.to_thread(_llm_quote_stance_arbiter, claim, source, primary_review, checker_review)
                if arbiter_review is not None:
                    effective_review = arbiter_review
            stance = effective_review.quoteStance
            rationale = effective_review.rationale

    notes = list(source.notes)
    notes.append(rationale)
    evidence = source.evidence.model_copy(update={"quoteStance": stance}) if source.evidence else None
    return source.model_copy(
        update={
            "quoteStance": stance,
            "evidence": evidence,
            "notes": notes,
        }
    )


async def analyze_quote_sentiments(claim: str, sources: list[SourceAssessment]) -> tuple[list[SourceAssessment], dict[QuoteStance, int]]:
    updated = await gather_limited(
        list(enumerate(sources)),
        lambda payload: _classify_one(payload, claim),
        concurrency=max(2, min(settings.pipeline_max_concurrency, 6)),
    )
    counts = Counter(source.quoteStance for source in updated)
    return updated, {
        "supportive": int(counts.get("supportive", 0)),
        "uncertain": int(counts.get("uncertain", 0)),
        "unsupportive": int(counts.get("unsupportive", 0)),
    }
