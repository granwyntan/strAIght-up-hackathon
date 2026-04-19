from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..models import ClaimAnalysis


class QueryPlannerOutput(BaseModel):
    summary: str = Field(min_length=20, max_length=600)
    focusTerms: list[str] = Field(default_factory=list)
    redFlags: list[str] = Field(default_factory=list)
    generatedQueries: list[str] = Field(default_factory=list)


def _dedupe(items: list[str], limit: int) -> list[str]:
    cleaned: list[str] = []
    for item in items:
        normalized = item.strip()
        if normalized and normalized not in cleaned:
            cleaned.append(normalized)
    return cleaned[:limit]


def _target_query_count(desired_depth: str, baseline: ClaimAnalysis) -> int:
    base = 18 if desired_depth == "standard" else 24
    semantics = baseline.semantics
    if semantics is not None:
        if semantics.relationshipType == "causal":
            base += 3
        if semantics.strength >= 4:
            base += 3
    if len(baseline.focusTerms) >= 5:
        base += 2
    if baseline.redFlags:
        base += 2

    floor = 16 if desired_depth == "standard" else 22
    ceiling = 28 if desired_depth == "standard" else 36
    return max(floor, min(ceiling, base))


def _checked_plan(
    claim: str,
    context: str,
    desired_depth: str,
    baseline: ClaimAnalysis,
    draft: QueryPlannerOutput,
    target_query_count: int,
) -> QueryPlannerOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You are the checker for a health-claim query plan. "
            "Review the draft and return JSON only with summary, focusTerms, redFlags, and generatedQueries. "
            "Remove weak, repetitive, or irrelevant searches and preserve contradiction-finding searches."
        ),
        {
            "claim": claim,
            "context": context,
            "desired_depth": desired_depth,
            "baseline": baseline.model_dump(),
            "draft": draft.model_dump(),
            "instructions": [
                "Keep the plan semantically faithful to the whole claim.",
                "Preserve searches for contradictions, null findings, and limited evidence.",
                f"Keep the final query list around {target_query_count} items unless a smaller list is clearly cleaner.",
            ],
        },
        QueryPlannerOutput,
        preferred_providers=["claude", "openai", "gemini"],
    )


def refine_claim_analysis(claim: str, context: str, desired_depth: str, baseline: ClaimAnalysis) -> ClaimAnalysis:
    target_query_count = _target_query_count(desired_depth, baseline)
    query_limit = max(target_query_count, min(36, len(baseline.generatedQueries) or target_query_count))
    result = generate_structured_output(
        "research",
        (
            "You are a health-claim query planner. Improve search planning for an evidence review without making up studies. "
            "Return JSON only with concise summary, focusTerms, redFlags, and generatedQueries. "
            "Keep the tone cautious and investigative, not promotional."
        ),
        {
            "claim": claim,
            "context": context,
            "desired_depth": desired_depth,
            "baseline": baseline.model_dump(),
            "instructions": [
                "Preserve the full semantic meaning of the claim instead of fragmenting it into keywords.",
                "Prefer review, guideline, randomized trial, meta-analysis, mechanism, contradictory-evidence, and safety-oriented searches.",
                "Use synonyms, medical terminology, inverse contradiction queries, and alternative phrasing where helpful.",
                "Do not change the baseline languageRiskScore or languageLabel.",
                f"Return around {target_query_count} high-signal search queries, expanding only when the claim needs more breadth.",
            ],
        },
        QueryPlannerOutput,
        preferred_providers=["gemini", "openai", "claude"],
    )

    if result is None:
        return baseline
    result = _checked_plan(claim, context, desired_depth, baseline, result, target_query_count) or result

    return baseline.model_copy(
        update={
            "summary": result.summary.strip() or baseline.summary,
            "focusTerms": _dedupe(result.focusTerms or baseline.focusTerms, 8) or baseline.focusTerms,
            "redFlags": _dedupe([*baseline.redFlags, *result.redFlags], 8),
            "generatedQueries": _dedupe(result.generatedQueries or baseline.generatedQueries, query_limit) or baseline.generatedQueries,
        }
    )
