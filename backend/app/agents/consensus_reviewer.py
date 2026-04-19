from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..models import ClaimAnalysis, ClaimVerdict, SourceAssessment


class ConsensusReviewOutput(BaseModel):
    verdict: ClaimVerdict
    scoreAdjustment: int = Field(ge=-12, le=12)
    rationale: str = Field(min_length=20, max_length=500)
    contradictions: list[str] = Field(default_factory=list)
    cautions: list[str] = Field(default_factory=list)


def _source_snapshot(sources: list[SourceAssessment]) -> list[dict[str, str | int]]:
    ranked = sorted(
        sources,
        key=lambda source: (
            source.sentiment == "negative",
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
            "sentiment": source.sentiment,
            "sourceScore": source.sourceScore,
            "evidenceScore": source.evidenceScore,
            "citationIntegrity": source.citationIntegrity,
            "relevanceSummary": source.relevanceSummary,
        }
        for source in ranked[:10]
    ]


def review_consensus(
    claim: str,
    claim_analysis: ClaimAnalysis,
    sources: list[SourceAssessment],
    score: int,
    verdict: ClaimVerdict,
) -> ConsensusReviewOutput | None:
    return generate_structured_output(
        "consensus",
        (
            "You are the cross-model consensus challenger in a health-claim investigation. "
            "Return JSON only with verdict, scoreAdjustment, rationale, contradictions, and cautions. "
            "Your job is to pressure-test the current conclusion and highlight contradictions or overclaiming."
        ),
        {
            "claim": claim,
            "claim_analysis": claim_analysis.model_dump(),
            "score": score,
            "verdict": verdict,
            "sources": _source_snapshot(sources),
            "instructions": [
                "Prefer more cautious conclusions when contradictory or mixed evidence is substantial.",
                "Do not invent studies, model behavior, or extra source details.",
                "Use contradictions for direct pushback and cautions for narrower methodological concerns.",
            ],
        },
        ConsensusReviewOutput,
    )
