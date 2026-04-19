from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..models import ClaimAnalysis, ClaimVerdict, DecisionMatrixFactor, SourceAssessment


class VerdictReviewOutput(BaseModel):
    verdict: ClaimVerdict
    scoreAdjustment: int = Field(ge=-10, le=10)
    rationale: str = Field(min_length=20, max_length=500)
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)


def _source_snapshot(sources: list[SourceAssessment]) -> list[dict[str, str | int]]:
    ranked = sorted(
        sources,
        key=lambda source: (
            source.sourceScore,
            source.evidenceScore,
            source.citationIntegrity,
        ),
        reverse=True,
    )
    return [
        {
            "title": source.title,
            "domain": source.domain,
            "stance": source.stance,
            "sourceScore": source.sourceScore,
            "evidenceScore": source.evidenceScore,
            "citationIntegrity": source.citationIntegrity,
            "note": source.notes[-1] if source.notes else "",
        }
        for source in ranked[:8]
    ]


def review_verdict(
    claim: str,
    claim_analysis: ClaimAnalysis,
    sources: list[SourceAssessment],
    matrix: list[DecisionMatrixFactor],
    score: int,
    verdict: ClaimVerdict,
) -> VerdictReviewOutput | None:
    return generate_structured_output(
        "reasoning",
        (
            "You are the reasoning reviewer in a health-claim investigation. "
            "Return JSON only with verdict, scoreAdjustment, rationale, strengths, and concerns. "
            "You may only make small score adjustments and should stay conservative when evidence is mixed."
        ),
        {
            "claim": claim,
            "claim_analysis": claim_analysis.model_dump(),
            "matrix": [factor.model_dump() for factor in matrix],
            "score": score,
            "verdict": verdict,
            "sources": _source_snapshot(sources),
            "instructions": [
                "Prefer contradictory or mixed conclusions when evidence quality is modest or citations are weak.",
                "Do not invent studies or source details.",
                "Keep strengths and concerns concise and evidence-focused.",
            ],
        },
        VerdictReviewOutput,
    )
