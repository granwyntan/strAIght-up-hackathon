from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..core.scoring import weighted_consensus_breakdown
from ..models import ClaimAnalysis, HoaxSignal, MisinformationRisk, SourceAssessment


class HoaxDetectionOutput(BaseModel):
    riskScore: int = Field(ge=0, le=100)
    classification: MisinformationRisk
    summary: str = Field(min_length=20, max_length=500)
    signals: list[HoaxSignal] = Field(default_factory=list)


def _baseline_signals(claim_analysis: ClaimAnalysis, sources: list[SourceAssessment]) -> HoaxDetectionOutput:
    signals: list[HoaxSignal] = []
    consensus = weighted_consensus_breakdown(sources)
    weak_supportive = [
        source
        for source in sources
        if source.sentiment == "positive" and source.sourceQualityLabel == "general" and source.evidenceScore <= 2
    ]
    strong_contradictions = [
        source
        for source in sources
        if source.sentiment == "negative" and source.sourceScore >= 2 and source.evidenceScore >= 3
    ]
    verified_support = [
        source
        for source in sources
        if source.sentiment == "positive" and source.sourceScore == 3 and source.evidenceScore >= 4
    ]
    if claim_analysis.languageRiskScore >= 45:
        signals.append(
            HoaxSignal(
                label="Aggressive wording",
                severity="high" if claim_analysis.languageRiskScore >= 70 else "moderate",
                rationale="The claim uses strong wording that normally needs unusually strong evidence to be trustworthy.",
            )
        )
    if weak_supportive:
        signals.append(
            HoaxSignal(
                label="Weak supportive web content",
                severity="moderate",
                rationale="A noticeable share of the supportive evidence comes from lower-credibility or blog-like sources.",
            )
        )
    if strong_contradictions:
        signals.append(
            HoaxSignal(
                label="Credible contradiction pressure",
                severity="high",
                rationale="Stronger sources materially push back on the claim or narrow it substantially.",
            )
        )
    if not verified_support:
        signals.append(
            HoaxSignal(
                label="No strong verified support",
                severity="moderate",
                rationale="No high-grade verified-authority source cleanly supports the claim as written.",
            )
        )
    if any(source.citationIntegrity < 45 for source in sources):
        signals.append(
            HoaxSignal(
                label="Weak citation chain",
                severity="moderate",
                rationale="At least part of the evidence pool has weak, generic, or broken citation support.",
            )
        )

    risk_score = min(
        100,
        round(
            claim_analysis.languageRiskScore * 0.35
            + (len(weak_supportive) * 6)
            + (len(strong_contradictions) * 8)
            + (max(0.0, consensus.contradictionShare) * 32)
            + (12 if not verified_support else 0)
        ),
    )
    if risk_score >= 70:
        classification: MisinformationRisk = "high"
    elif risk_score >= 40:
        classification = "moderate"
    else:
        classification = "low"
    summary = (
        "The claim behaves more like a hoax-risk or overstatement pattern than a clean fact pattern."
        if classification == "high"
        else "The claim shows some misinformation-risk markers and should be treated cautiously."
        if classification == "moderate"
        else "The claim shows limited hoax-pattern signals, although normal evidence uncertainty may still remain."
    )
    return HoaxDetectionOutput(
        riskScore=risk_score,
        classification=classification,
        summary=summary,
        signals=signals[:6],
    )


def detect_hoax_risk(claim: str, claim_analysis: ClaimAnalysis, sources: list[SourceAssessment]) -> HoaxDetectionOutput:
    baseline = _baseline_signals(claim_analysis, sources)
    llm_result = generate_structured_output(
        "consensus",
        (
            "You are the hoax-risk detector for a health-claim fact-checking workflow. "
            "Professional role: misinformation analyst specializing in overclaiming, pseudo-science framing, and evidence mismatch. "
            "Return JSON only with riskScore, classification, summary, and signals."
        ),
        {
            "claim": claim,
            "claim_analysis": claim_analysis.model_dump(),
            "baseline": baseline.model_dump(),
            "sources": [
                {
                    "title": source.title,
                    "domain": source.domain,
                    "sourceQualityLabel": source.sourceQualityLabel,
                    "evidenceTier": source.evidenceTier,
                    "sentiment": source.sentiment,
                    "citationIntegrity": source.citationIntegrity,
                    "note": source.notes[-1] if source.notes else "",
                }
                for source in sources[:18]
            ],
            "instructions": [
                "Flag hoax-style or falsehood-style patterns when strong wording outruns the evidence.",
                "Do not confuse normal scientific uncertainty with deliberate hoax behavior.",
                "Prefer high hoax risk when support is weak, citations are poor, and credible contradiction evidence is substantial.",
            ],
        },
        HoaxDetectionOutput,
        preferred_providers=["xai", "claude", "openai"],
    )
    if llm_result is None:
        return baseline

    merged_signals = list(dict.fromkeys([signal.model_dump_json() for signal in [*baseline.signals, *llm_result.signals]]))
    signals = [HoaxSignal.model_validate_json(item) for item in merged_signals][:8]
    risk_score = round((baseline.riskScore + llm_result.riskScore) / 2)
    if risk_score >= 70:
        classification: MisinformationRisk = "high"
    elif risk_score >= 40:
        classification = "moderate"
    else:
        classification = "low"
    return HoaxDetectionOutput(
        riskScore=risk_score,
        classification=classification,
        summary=llm_result.summary or baseline.summary,
        signals=signals,
    )
