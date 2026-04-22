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
    seen_normalized: set[str] = set()
    for item in items:
        collapsed_tokens: list[str] = []
        for token in item.strip().split():
            if not collapsed_tokens or token.lower() != collapsed_tokens[-1].lower():
                collapsed_tokens.append(token)
        normalized = " ".join(collapsed_tokens).strip()
        normalized_key = normalized.lower()
        if normalized and normalized_key not in seen_normalized:
            cleaned.append(normalized)
            seen_normalized.add(normalized_key)
    return cleaned[:limit]


def _target_query_count(desired_depth: str, baseline: ClaimAnalysis) -> int:
    if desired_depth == "quick":
        base = 10
    elif desired_depth == "deep":
        base = 24
    else:
        base = 18
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

    if desired_depth == "quick":
        floor, ceiling = 8, 16
    elif desired_depth == "deep":
        floor, ceiling = 22, 36
    else:
        floor, ceiling = 16, 28
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
            "You are the Research QA reviewer for a health-claim query plan. "
            "Professional role: scientist checking whether the search plan is broad enough, skeptical enough, and still on-topic. "
            "Goal: remove weak, repetitive, or irrelevant queries while preserving contradiction-finding and null-result searches. "
            "Standpoint: high recall for meaningful evidence, low tolerance for keyword spam. "
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


def _arbiter_plan(
    claim: str,
    context: str,
    desired_depth: str,
    baseline: ClaimAnalysis,
    primary: QueryPlannerOutput,
    checker: QueryPlannerOutput,
    target_query_count: int,
) -> QueryPlannerOutput | None:
    return generate_structured_output(
        "consensus",
        (
            "You arbitrate a disagreement in a health-claim query plan. "
            "Return JSON only with summary, focusTerms, redFlags, and generatedQueries."
        ),
        {
            "claim": claim,
            "context": context,
            "desired_depth": desired_depth,
            "baseline": baseline.model_dump(),
            "primary": primary.model_dump(),
            "checker": checker.model_dump(),
            "instructions": [
                "Prefer the cleaner and more medically relevant query set.",
                "Preserve contradiction-finding and null-result searches.",
                f"Keep the final query list around {target_query_count} items.",
            ],
        },
        QueryPlannerOutput,
        preferred_providers=["openai", "gemini", "claude"],
    )


def refine_claim_analysis(claim: str, context: str, desired_depth: str, baseline: ClaimAnalysis) -> ClaimAnalysis:
    target_query_count = _target_query_count(desired_depth, baseline)
    query_limit = max(target_query_count, min(36, len(baseline.generatedQueries) or target_query_count))
    result = generate_structured_output(
        "research",
        (
            "You are the Research Agent for a health-claim investigation. "
            "Professional role: evidence scientist designing a high-signal literature and web search plan. "
            "Goal: generate dynamic search paths that capture direct support, contradictions, null findings, safety signals, and medical phrasing. "
            "Standpoint: semantic fidelity first, skepticism toward overclaiming, and no invented studies. "
            "Improve search planning for an evidence review without making up studies. "
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
    checked = _checked_plan(claim, context, desired_depth, baseline, result, target_query_count)
    if checked is not None and set(checked.generatedQueries) != set(result.generatedQueries):
        result = _arbiter_plan(claim, context, desired_depth, baseline, result, checked, target_query_count) or checked
    else:
        result = checked or result

    return baseline.model_copy(
        update={
            "summary": result.summary.strip() or baseline.summary,
            "focusTerms": _dedupe(result.focusTerms or baseline.focusTerms, 8) or baseline.focusTerms,
            "redFlags": _dedupe([*baseline.redFlags, *result.redFlags], 8),
            "generatedQueries": _dedupe(result.generatedQueries or baseline.generatedQueries, query_limit) or baseline.generatedQueries,
        }
    )
