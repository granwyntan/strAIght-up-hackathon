import asyncio
import re

from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..async_utils import gather_limited
from ..models import ClaimAnalysis, SourceAssessment
from ..settings import settings


TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
STOP_WORDS = {
    "the",
    "and",
    "that",
    "with",
    "from",
    "into",
    "have",
    "there",
    "about",
    "does",
    "their",
    "this",
    "what",
    "when",
    "where",
    "which",
    "while",
    "could",
    "would",
    "should",
}


class RelevanceReviewOutput(BaseModel):
    keep: bool = True
    relevanceScore: int = Field(default=50, ge=0, le=100)
    rationale: str = Field(min_length=12, max_length=400)


def _tokenize(text: str) -> list[str]:
    seen: list[str] = []
    for token in TOKEN_PATTERN.findall(text.lower()):
        if len(token) < 3 or token in STOP_WORDS:
            continue
        if token not in seen:
            seen.append(token)
    return seen


def _heuristic_relevance_score(claim: str, claim_analysis: ClaimAnalysis, source: SourceAssessment) -> int:
    focus_terms = set(_tokenize(" ".join(claim_analysis.focusTerms)))
    claim_terms = set(_tokenize(claim))
    source_terms = set(_tokenize(" ".join([source.title, source.snippet, source.extractedText[:1800]])))

    overlap = len(source_terms & (focus_terms | claim_terms))
    score = min(100, overlap * 12)
    if source.stance in {"supportive", "mixed", "contradictory"}:
        score += 10
    if source.evidenceScore >= 3:
        score += 8
    if source.linkAlive and source.contentAccessible:
        score += 8
    if source.query:
        score += 6
    return max(10, min(100, score))


def _primary_relevance_review(claim: str, claim_analysis: ClaimAnalysis, source: SourceAssessment) -> RelevanceReviewOutput | None:
    return generate_structured_output(
        "research",
        (
            "You are the Relevance Agent for a health-claim investigation. "
            "Professional role: scientist-information specialist screening sources for fit. "
            "Goal: keep sources that truly answer the claim, its wording, or its contradiction path, and discard generic adjacent content. "
            "Standpoint: contradiction evidence is valuable when it answers the same question. "
            "Return JSON only with keep, relevanceScore, and rationale. "
            "Keep sources that directly support, contradict, contextualize, or narrow the claim. "
            "Discard sources that are generic, off-topic, or only loosely adjacent."
        ),
        {
            "claim": claim,
            "claim_analysis": claim_analysis.model_dump(),
            "source": {
                "title": source.title,
                "url": source.url,
                "query": source.query,
                "snippet": source.snippet,
                "extractedText": source.extractedText[:2400],
                "sourceBucket": source.sourceBucket,
                "evidenceTier": source.evidenceTier,
            },
            "instructions": [
                "Contradictory evidence is relevant if it clearly addresses the same intervention, outcome, or wording.",
                "Do not discard a source only because it is negative.",
                "Do not keep a source that is mostly generic wellness advice unless it clearly addresses the claim.",
            ],
        },
        RelevanceReviewOutput,
        preferred_providers=["gemini", "openai"],
    )


def _checker_relevance_review(claim: str, claim_analysis: ClaimAnalysis, source: SourceAssessment, draft: RelevanceReviewOutput) -> RelevanceReviewOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You are the Validation Agent auditing a health-claim relevance screen. "
            "Professional role: data engineer and evidence QA reviewer. "
            "Goal: catch hallucinated relevance, keep hard contradictions when they truly apply, and reject generic filler pages. "
            "Standpoint: prefer precision without hiding legitimate pushback evidence. "
            "Review the draft assessment and return JSON only with keep, relevanceScore, and rationale. "
            "Be stricter about hallucinated relevance and keep contradiction evidence when it truly addresses the claim."
        ),
        {
            "claim": claim,
            "claim_analysis": claim_analysis.model_dump(),
            "draft": draft.model_dump(),
            "source": {
                "title": source.title,
                "url": source.url,
                "query": source.query,
                "snippet": source.snippet,
                "extractedText": source.extractedText[:2400],
                "sourceBucket": source.sourceBucket,
                "evidenceTier": source.evidenceTier,
            },
            "instructions": [
                "Reject relevance if the source is generic and does not materially address the claim.",
                "Keep contradictory sources if they answer the same question in a different direction.",
                "Use the draft only as a starting point, not as the final answer.",
            ],
        },
        RelevanceReviewOutput,
        preferred_providers=["claude", "xai", "openai"],
    )


async def _review_one(source: SourceAssessment, claim: str, claim_analysis: ClaimAnalysis) -> SourceAssessment | None:
    heuristic_score = _heuristic_relevance_score(claim, claim_analysis, source)
    primary = await asyncio.to_thread(_primary_relevance_review, claim, claim_analysis, source)
    checker = None
    if primary is not None:
        checker = await asyncio.to_thread(_checker_relevance_review, claim, claim_analysis, source, primary)

    final_score = heuristic_score
    keep = heuristic_score >= 28
    rationale = "The source was retained because it overlaps materially with the claim or its contradiction path."

    if primary is not None:
        final_score = round((final_score + primary.relevanceScore) / 2)
        keep = keep or primary.keep
        rationale = primary.rationale
    if checker is not None:
        final_score = round((final_score + checker.relevanceScore) / 2)
        keep = keep and checker.keep if primary is not None else checker.keep
        rationale = checker.rationale

    if source.sourceScore >= 2 and source.evidenceScore >= 3 and source.stance in {"supportive", "mixed", "contradictory"}:
        final_score = max(final_score, 48)
        keep = True

    if final_score < 35 and not keep:
        return None

    notes = list(source.notes)
    notes.append(rationale)
    return source.model_copy(
        update={
            "relevanceScore": max(0, min(100, final_score)),
            "relevanceCheckSummary": rationale,
            "notes": notes,
        }
    )


async def filter_relevant_sources(claim: str, claim_analysis: ClaimAnalysis, sources: list[SourceAssessment]) -> list[SourceAssessment]:
    reviewed = await gather_limited(
        sources,
        lambda source: _review_one(source, claim, claim_analysis),
        concurrency=settings.pipeline_max_concurrency,
    )
    filtered = [source for source in reviewed if source is not None]
    return filtered or sources[: min(len(sources), 12)]
