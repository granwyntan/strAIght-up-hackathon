from collections import Counter

from ..models import ClaimAnalysis, ConsensusBreakdown, DecisionMatrixFactor, SourceAssessment


SOURCE_BUCKET_TO_SCORE = {
    "tier_1_blog": 1,
    "tier_2_scholarly": 2,
    "tier_3_authority": 3,
}

SOURCE_BUCKET_TO_WEIGHT = {
    "tier_1_blog": 0.1,
    "tier_2_scholarly": 0.6,
    "tier_3_authority": 1.0,
}

EVIDENCE_TIER_TO_SCORE = {
    "blog": 1,
    "case_report": 2,
    "observational": 3,
    "rct": 4,
    "review": 5,
}

SENTIMENT_TO_SCORE = {
    "positive": 1,
    "neutral": 0,
    "negative": -1,
}


def source_quality_score(sources: list[SourceAssessment]) -> int:
    if not sources:
        return 20
    values = [((source.sourceScore / 3) * 100) for source in sources]
    return round(sum(values) / len(values))


def evidence_depth_score(sources: list[SourceAssessment]) -> int:
    if not sources:
        return 20
    values = [((source.evidenceScore / 5) * 100) for source in sources]
    return round(sum(values) / len(values))


def citation_integrity_score(sources: list[SourceAssessment]) -> int:
    if not sources:
        return 10
    values = [source.citationIntegrity for source in sources]
    return round(sum(values) / len(values))


def weighted_consensus_breakdown(sources: list[SourceAssessment]) -> ConsensusBreakdown:
    if not sources:
        return ConsensusBreakdown(summary="No sources were available for consensus scoring.")

    supporting = 0.0
    neutral = 0.0
    contradicting = 0.0
    disagreement = 0.0

    for source in sources:
        weight = SOURCE_BUCKET_TO_WEIGHT.get(source.sourceBucket, 0.3)
        agreement_factor = source.agreementFactor or 1.0
        weighted_component = weight * agreement_factor
        if agreement_factor < 1.0:
            disagreement += weight * (1.0 - agreement_factor)
        if source.sentiment == "positive":
            supporting += weighted_component
        elif source.sentiment == "negative":
            contradicting += weighted_component
        else:
            neutral += weighted_component

    raw_score = supporting - contradicting
    total_weight = max(1.0, supporting + neutral + contradicting + disagreement)
    normalized = round(((raw_score + total_weight) / (2 * total_weight)) * 100)
    summary = (
        f"Weighted consensus leaned {normalized}/100 after giving more influence to higher-authority sources: "
        f"{supporting:.1f} supporting weight, {neutral:.1f} neutral weight, {contradicting:.1f} contradicting weight, "
        f"and {disagreement:.1f} disagreement drag."
    )

    return ConsensusBreakdown(
        supportingWeight=round(supporting, 2),
        neutralWeight=round(neutral, 2),
        contradictingWeight=round(contradicting, 2),
        disagreementWeight=round(disagreement, 2),
        rawScore=round(raw_score, 2),
        normalizedScore=max(0, min(100, normalized)),
        summary=summary,
    )


def agreement_score(sources: list[SourceAssessment]) -> int:
    breakdown = weighted_consensus_breakdown(sources)
    credible = [source for source in sources if source.sourceScore >= 2 and source.evidenceScore >= 3]
    if not credible:
        return max(25, breakdown.normalizedScore - 10)

    counts = Counter(source.sentiment for source in credible)
    positive = counts.get("positive", 0)
    neutral = counts.get("neutral", 0)
    negative = counts.get("negative", 0)
    total = max(1, len(credible))
    contradiction_drag = round((negative / total) * 20)
    neutral_drag = round((neutral / total) * 10)
    return max(0, min(100, breakdown.normalizedScore - contradiction_drag - neutral_drag))


def language_safety_score(claim_analysis: ClaimAnalysis) -> int:
    return max(0, 100 - claim_analysis.languageRiskScore)


def claim_evidence_fit_score(claim_analysis: ClaimAnalysis, sources: list[SourceAssessment]) -> int:
    if not sources:
        return max(20, language_safety_score(claim_analysis) - 20)

    evidence_strength = round((source_quality_score(sources) + evidence_depth_score(sources) + agreement_score(sources)) / 3)
    strongest_subclaim = max((item.strength for item in claim_analysis.atomicClaims), default=1)
    overclaim_penalty = max(0, (strongest_subclaim - 2) * 8)
    mismatch = max(0, claim_analysis.languageRiskScore - max(0, evidence_strength - 10))
    return max(8, min(100, 100 - mismatch - overclaim_penalty))


def build_matrix(claim_analysis: ClaimAnalysis, sources: list[SourceAssessment]) -> list[DecisionMatrixFactor]:
    consensus = weighted_consensus_breakdown(sources)
    return [
        DecisionMatrixFactor(
            name="Source quality",
            score=source_quality_score(sources),
            weight=0.22,
            rationale="Higher when more sources come from verified authorities, major journals, or established institutions.",
        ),
        DecisionMatrixFactor(
            name="Evidence depth",
            score=evidence_depth_score(sources),
            weight=0.2,
            rationale="Rewards reviews and randomized trials more than observational work, case reports, or blog-style material.",
        ),
        DecisionMatrixFactor(
            name="Citation integrity",
            score=citation_integrity_score(sources),
            weight=0.16,
            rationale="Checks whether the visible evidence is actually supported by citation chains rather than loose summary claims.",
        ),
        DecisionMatrixFactor(
            name="Weighted consensus",
            score=consensus.normalizedScore,
            weight=0.22,
            rationale="Weights stronger sources more heavily instead of counting all sources equally.",
        ),
        DecisionMatrixFactor(
            name="Claim-evidence fit",
            score=claim_evidence_fit_score(claim_analysis, sources),
            weight=0.2,
            rationale="Penalizes overclaiming, causation leaps, and strong certainty language when the evidence base is mixed or limited.",
        ),
    ]


def weighted_score(matrix: list[DecisionMatrixFactor]) -> int:
    if not matrix:
        return 0
    total = sum(item.score * item.weight for item in matrix)
    return round(total)
