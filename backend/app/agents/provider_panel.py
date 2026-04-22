from collections import Counter

from pydantic import BaseModel, Field, field_validator

from ..ai import ProviderName, clear_provider_failures, generate_structured_output, stage_targets
from ..models import ClaimAnalysis, ClaimVerdict, HoaxSignal, ProviderReviewSummary, SourceAssessment


PROVIDER_ROLES: dict[ProviderName, str] = {
    "openai": "Internal Medicine Reviewer",
    "claude": "Clinical Communications Auditor",
    "gemini": "Evidence Synthesis Specialist",
    "xai": "Contradiction Hunter",
    "deepseek": "Structured Reasoning Checker",
}

CAUTION_ORDER: dict[ClaimVerdict, int] = {
    "trustworthy": 4,
    "mixed": 3,
    "overstated": 2,
    "untrustworthy": 1,
}


def _clean_text(value, fallback: str, limit: int) -> str:
    text = str(value).strip() if value is not None else ""
    text = " ".join(text.split())
    if not text:
        text = fallback
    return text[:limit]


def _coerce_string_list(value, *, item_limit: int = 6, text_limit: int = 220) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        items = value
    else:
        items = [value]

    cleaned: list[str] = []
    for item in items:
        if isinstance(item, dict):
            label = _clean_text(item.get("type"), "", 48)
            detail = _clean_text(item.get("detail"), "", text_limit)
            text = f"{label}: {detail}".strip(": ").strip()
        else:
            text = _clean_text(item, "", text_limit)
        if text and text not in cleaned:
            cleaned.append(text)
        if len(cleaned) >= item_limit:
            break
    return cleaned


class ProviderVoteOutput(BaseModel):
    verdict: ClaimVerdict
    confidence: int = Field(default=50)
    scoreAdjustment: int = Field(default=0)
    rationale: str = Field(min_length=20, max_length=500)
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    hallucinationFlags: list[str] = Field(default_factory=list)

    @field_validator("confidence", mode="before")
    @classmethod
    def _normalize_confidence(cls, value):
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return 50
        if 0.0 <= numeric <= 1.0:
            numeric *= 100
        return max(0, min(100, round(numeric)))

    @field_validator("scoreAdjustment", mode="before")
    @classmethod
    def _normalize_score_adjustment(cls, value):
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return 0
        return max(-20, min(20, round(numeric)))

    @field_validator("rationale", mode="before")
    @classmethod
    def _normalize_rationale(cls, value):
        return _clean_text(value, "The provider review did not include a usable rationale.", 500)

    @field_validator("strengths", "concerns", "hallucinationFlags", mode="before")
    @classmethod
    def _normalize_lists(cls, value):
        return _coerce_string_list(value)


class ProviderPanelAuditOutput(BaseModel):
    verdict: ClaimVerdict
    scoreAdjustment: int = Field(default=0)
    agreementScore: int = Field(default=50)
    summary: str = Field(min_length=20, max_length=500)
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    hallucinationFlags: list[str] = Field(default_factory=list)

    @field_validator("scoreAdjustment", mode="before")
    @classmethod
    def _normalize_panel_score_adjustment(cls, value):
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return 0
        return max(-15, min(15, round(numeric)))

    @field_validator("agreementScore", mode="before")
    @classmethod
    def _normalize_agreement_score(cls, value):
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return 50
        if 0.0 <= numeric <= 1.0:
            numeric *= 100
        return max(0, min(100, round(numeric)))

    @field_validator("summary", mode="before")
    @classmethod
    def _normalize_summary(cls, value):
        return _clean_text(value, "The audited panel summary was unavailable.", 500)

    @field_validator("strengths", "concerns", "hallucinationFlags", mode="before")
    @classmethod
    def _normalize_panel_lists(cls, value):
        return _coerce_string_list(value)


class ProviderPanelResult(BaseModel):
    verdict: ClaimVerdict
    scoreAdjustment: int = Field(default=0, ge=-15, le=15)
    agreementScore: int = Field(default=50, ge=0, le=100)
    summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    hallucinationFlags: list[str] = Field(default_factory=list)
    reviews: list[ProviderReviewSummary] = Field(default_factory=list)


def _source_snapshot(sources: list[SourceAssessment]) -> list[dict[str, str | int | float]]:
    ranked = sorted(
        sources,
        key=lambda source: (
            source.sourceWeight,
            source.confidenceFactor,
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
            "sourceQualityLabel": source.sourceQualityLabel,
            "evidenceTier": source.evidenceTier,
            "sentiment": source.sentiment,
            "quoteStance": source.quoteStance,
            "citationIntegrity": source.citationIntegrity,
            "sourceWeight": source.sourceWeight,
            "confidenceFactor": source.confidenceFactor,
            "relevanceSummary": source.relevanceSummary,
            "sentimentSummary": source.sentimentSummary,
        }
        for source in ranked[:16]
    ]


def _provider_vote_prompt(role: str) -> str:
    return (
        "You are an independent reviewer on a medical fact-check panel. "
        f"Professional role: {role}. "
        "Return JSON only with verdict, confidence, scoreAdjustment, rationale, strengths, concerns, and hallucinationFlags. "
        "Judge whether the claim looks trustworthy, mixed, overstated, or untrustworthy."
    )


def _vote_for_provider(
    provider: ProviderName,
    claim: str,
    claim_analysis: ClaimAnalysis,
    sources: list[SourceAssessment],
    score: int,
    verdict: ClaimVerdict,
    hoax_signals: list[HoaxSignal],
) -> ProviderReviewSummary | None:
    role = PROVIDER_ROLES[provider]
    targets = stage_targets("consensus", preferred_providers=[provider], allow_rotation=False)
    if not targets:
        return None
    result = generate_structured_output(
        "consensus",
        _provider_vote_prompt(role),
        {
            "claim": claim,
            "claim_analysis": claim_analysis.model_dump(),
            "current_score": score,
            "current_verdict": verdict,
            "hoax_signals": [signal.model_dump() for signal in hoax_signals],
            "sources": _source_snapshot(sources),
            "instructions": [
                "Stay conservative when evidence is mixed, contradictory, or citation-light.",
                "Use hallucinationFlags to note unsupported leaps or evidence claims that should not be trusted.",
                "Prefer overstated or untrustworthy when the wording is stronger than the evidence base.",
            ],
        },
        ProviderVoteOutput,
        preferred_providers=[provider],
    )
    if result is None:
        return None
    return ProviderReviewSummary(
        provider=provider,
        model=targets[0].model,
        role=role,
        verdict=result.verdict,
        confidence=result.confidence,
        scoreAdjustment=result.scoreAdjustment,
        rationale=result.rationale,
        strengths=result.strengths[:4],
        concerns=result.concerns[:4],
        hallucinationFlags=result.hallucinationFlags[:4],
    )


def _baseline_panel_summary(reviews: list[ProviderReviewSummary], current_verdict: ClaimVerdict) -> ProviderPanelAuditOutput:
    if not reviews:
        return ProviderPanelAuditOutput(
            verdict=current_verdict,
            scoreAdjustment=0,
            agreementScore=0,
            summary="No cross-model panel reviews were available, so the current verdict was kept.",
            strengths=[],
            concerns=["Cross-model panel review was unavailable."],
            hallucinationFlags=[],
        )
    verdict_counts = Counter(review.verdict for review in reviews)
    sorted_verdicts = sorted(
        verdict_counts.items(),
        key=lambda item: (item[1], -CAUTION_ORDER[item[0]]),
        reverse=True,
    )
    winning_verdict = sorted_verdicts[0][0]
    agreement_score = round((sorted_verdicts[0][1] / len(reviews)) * 100)
    score_adjustment = round(sum(review.scoreAdjustment for review in reviews) / len(reviews))
    hallucination_flags = list(
        dict.fromkeys(flag for review in reviews for flag in review.hallucinationFlags if flag.strip())
    )[:6]
    strengths = list(dict.fromkeys(item for review in reviews for item in review.strengths if item.strip()))[:6]
    concerns = list(dict.fromkeys(item for review in reviews for item in review.concerns if item.strip()))[:6]
    return ProviderPanelAuditOutput(
        verdict=winning_verdict,
        scoreAdjustment=max(-15, min(15, score_adjustment)),
        agreementScore=max(0, min(100, agreement_score)),
        summary=f"{len(reviews)} providers completed the panel review, with {agreement_score}% agreement on the leading verdict.",
        strengths=strengths,
        concerns=concerns,
        hallucinationFlags=hallucination_flags,
    )


def run_provider_panel(
    claim: str,
    claim_analysis: ClaimAnalysis,
    sources: list[SourceAssessment],
    score: int,
    verdict: ClaimVerdict,
    hoax_signals: list[HoaxSignal],
) -> ProviderPanelResult:
    providers: list[ProviderName] = ["openai", "claude", "gemini", "xai", "deepseek"]
    reviews = [
        review
        for review in (
            _vote_for_provider(provider, claim, claim_analysis, sources, score, verdict, hoax_signals)
            for provider in providers
        )
        if review is not None
    ]
    if not reviews:
        clear_provider_failures(["openai"])
        fallback_review = _vote_for_provider("openai", claim, claim_analysis, sources, score, verdict, hoax_signals)
        if fallback_review is not None:
            reviews = [fallback_review]

    baseline = _baseline_panel_summary(reviews, verdict)
    audited = generate_structured_output(
        "audit",
        (
            "You are the auditor of a multi-model health fact-check panel. "
            "Professional role: senior adjudicator checking for unsupported leaps, hallucinated certainty, and improper verdict inflation. "
            "Return JSON only with verdict, scoreAdjustment, agreementScore, summary, strengths, concerns, and hallucinationFlags."
        ),
        {
            "claim": claim,
            "claim_analysis": claim_analysis.model_dump(),
            "sources": _source_snapshot(sources),
            "baseline": baseline.model_dump(),
            "provider_reviews": [review.model_dump() for review in reviews],
            "hoax_signals": [signal.model_dump() for signal in hoax_signals],
            "instructions": [
                "Do not inflate support just because one provider sounded confident.",
                "Use the panel only as a reviewer of the evidence snapshot, not as a substitute for evidence.",
                "Flag hallucination risks when provider claims outrun the supplied source set.",
                "Use OpenAI as a reliable fallback if other panel outputs are sparse or inconsistent.",
            ],
        },
        ProviderPanelAuditOutput,
        preferred_providers=["openai", "claude", "gemini"],
    )
    effective = audited or baseline
    return ProviderPanelResult(
        verdict=effective.verdict,
        scoreAdjustment=effective.scoreAdjustment,
        agreementScore=effective.agreementScore,
        summary=effective.summary,
        strengths=effective.strengths[:6],
        concerns=effective.concerns[:6],
        hallucinationFlags=effective.hallucinationFlags[:6],
        reviews=reviews,
    )
