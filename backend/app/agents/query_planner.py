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


def refine_claim_analysis(claim: str, context: str, desired_depth: str, baseline: ClaimAnalysis) -> ClaimAnalysis:
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
                "Prefer review, guideline, randomized trial, meta-analysis, mechanism, and contradictory-evidence searches.",
                "Do not change the baseline languageRiskScore or languageLabel.",
                "Return 8 to 12 high-signal search queries.",
            ],
        },
        QueryPlannerOutput,
    )

    if result is None:
        return baseline

    return baseline.model_copy(
        update={
            "summary": result.summary.strip() or baseline.summary,
            "focusTerms": _dedupe(result.focusTerms or baseline.focusTerms, 8) or baseline.focusTerms,
            "redFlags": _dedupe([*baseline.redFlags, *result.redFlags], 8),
            "generatedQueries": _dedupe(result.generatedQueries or baseline.generatedQueries, 12) or baseline.generatedQueries,
        }
    )
