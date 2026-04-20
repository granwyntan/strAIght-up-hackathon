from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..models import ClaimAnalysis, ClaimVerdict, SourceAssessment
from .consensus_reviewer import ConsensusReviewOutput
from .verdict_reviewer import VerdictReviewOutput


class ReasoningPanelOutput(BaseModel):
    verdict: ClaimVerdict
    scoreAdjustment: int = Field(ge=-8, le=8)
    rationale: str = Field(min_length=20, max_length=500)
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)


def _source_snapshot(sources: list[SourceAssessment]) -> list[dict[str, str | int | float]]:
    ranked = sorted(
        sources,
        key=lambda source: (
            source.sourceWeight,
            source.confidenceFactor,
            source.citationIntegrity,
            source.sourceScore,
            source.evidenceScore,
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
            "confidenceFactor": source.confidenceFactor,
            "sourceWeight": source.sourceWeight,
        }
        for source in ranked[:10]
    ]


def reconcile_reasoning_panel(
    claim: str,
    claim_analysis: ClaimAnalysis,
    sources: list[SourceAssessment],
    score: int,
    verdict: ClaimVerdict,
    review_result: VerdictReviewOutput | None,
    consensus_result: ConsensusReviewOutput | None,
) -> ReasoningPanelOutput | None:
    if review_result is None and consensus_result is None:
        return None

    return generate_structured_output(
        "consensus",
        (
            "You are the Reasoning Panel Chair for a health-claim investigation. "
            "Professional role: auditor overseeing the final reconciliation between reviewers. "
            "Goal: reconcile two independent reviews into one cautious final adjustment without inflating certainty. "
            "Standpoint: strong contradiction evidence should outweigh weak supportive web content, and evidence gaps should stay visible. "
            "Two separate reviewers have already examined the evidence. "
            "Return JSON only with verdict, scoreAdjustment, rationale, strengths, and concerns. "
            "Reconcile their views into one cautious, evidence-grounded adjustment."
        ),
        {
            "claim": claim,
            "claim_analysis": claim_analysis.model_dump(),
            "current_score": score,
            "current_verdict": verdict,
            "sources": _source_snapshot(sources),
            "reviewer_draft": review_result.model_dump() if review_result is not None else None,
            "challenger_draft": consensus_result.model_dump() if consensus_result is not None else None,
            "instructions": [
                "Only make a small score adjustment and stay conservative when evidence is mixed.",
                "Let contradiction evidence outweigh weak supportive blog-style content.",
                "Prefer overstated or uncertain outcomes when the claim wording outruns the evidence.",
                "Treat unsupported strong claims as falsehood-risk or hoax-risk rather than as quiet support.",
                "Treat limited, mixed, or inconclusive evidence as uncertain rather than supportive.",
                "Do not invent facts or studies that are not in the supplied evidence snapshot.",
            ],
        },
        ReasoningPanelOutput,
        preferred_providers=["openai", "gemini", "claude"],
    )
