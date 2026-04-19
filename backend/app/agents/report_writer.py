from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..models import ClaimAnalysis, ClaimVerdict, SourceAssessment


class ReportWriterOutput(BaseModel):
    narrative: str = Field(min_length=40, max_length=900)
    userSummary: str = Field(min_length=30, max_length=420)
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)


def _top_sources(sources: list[SourceAssessment]) -> list[dict[str, str | int]]:
    ranked = sorted(
        sources,
        key=lambda source: (
            source.sourceScore + source.evidenceScore + round(source.citationIntegrity / 25),
            source.stance == "supportive",
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
        for source in ranked[:6]
    ]


def draft_report(
    claim: str,
    claim_analysis: ClaimAnalysis,
    sources: list[SourceAssessment],
    verdict: ClaimVerdict,
    score: int,
    baseline_narrative: str,
    baseline_strengths: list[str],
    baseline_concerns: list[str],
) -> ReportWriterOutput | None:
    draft = generate_structured_output(
        "writer",
        (
            "You are the final synthesis agent for a health-claim investigation using Gemini. "
            "Write a tight evidence-focused expert synthesis in JSON only. "
            "Match the provided verdict and score. Avoid medical advice and avoid certainty beyond the evidence."
        ),
        {
            "claim": claim,
            "verdict": verdict,
            "score": score,
            "claim_analysis": claim_analysis.model_dump(),
            "top_sources": _top_sources(sources),
            "baseline_narrative": baseline_narrative,
            "baseline_strengths": baseline_strengths,
            "baseline_concerns": baseline_concerns,
            "instructions": [
                "Keep the narrative to 2 or 3 sentences with expert interpretation and real-world implications.",
                "Add a userSummary in 1 or 2 plain-language sentences for the app UI.",
                "List 2 to 4 strengths and 2 to 4 concerns.",
                "Ground the answer in source quality, evidence depth, citation quality, and claim language discipline.",
            ],
        },
        ReportWriterOutput,
        preferred_providers=["gemini", "openai", "claude"],
    )
    if draft is None:
        return None

    checked = generate_structured_output(
        "audit",
        (
            "You are the checker for a final health-claim summary. "
            "Review the draft and return JSON only with narrative, userSummary, strengths, and concerns. "
            "Keep the meaning aligned with the verdict and remove overclaiming or hallucinated certainty."
        ),
        {
            "claim": claim,
            "verdict": verdict,
            "score": score,
            "claim_analysis": claim_analysis.model_dump(),
            "top_sources": _top_sources(sources),
            "draft": draft.model_dump(),
            "instructions": [
                "Preserve caution where evidence is mixed or limited.",
                "Keep the userSummary concise and plain-language.",
                "Do not introduce claims that are not grounded in the supplied draft and source set.",
            ],
        },
        ReportWriterOutput,
        preferred_providers=["openai", "claude", "gemini"],
    )
    return checked or draft
