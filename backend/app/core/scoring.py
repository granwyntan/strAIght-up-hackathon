from collections import Counter

from ..models import ClaimAnalysis, ConsensusBreakdown, DecisionMatrixFactor, SourceAssessment
from ..settings import settings


SOURCE_BUCKET_TO_SCORE = {
    "tier_1_blog": 1,
    "tier_2_scholarly": 2,
    "tier_3_authority": 3,
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
    weighted_score = 0.0
    total_weight = 0.0

    for source in sources:
        source_weight = source.sourceWeight or settings.source_weight_for_bucket(source.sourceBucket)
        confidence_factor = source.confidenceFactor or 0.5
        contribution_weight = source_weight * confidence_factor
        sentiment_score = SENTIMENT_TO_SCORE.get(source.sentiment, 0)

        total_weight += contribution_weight
        weighted_score += contribution_weight * sentiment_score
        disagreement += max(0.0, source_weight * (1.0 - (source.agreementFactor or 1.0)))
        if sentiment_score > 0:
            supporting += contribution_weight
        elif sentiment_score < 0:
            contradicting += contribution_weight
        else:
            neutral += contribution_weight

    normalized = 0.0 if total_weight <= 0 else max(-1.0, min(1.0, weighted_score / total_weight))
    credibility_score = round(50 + (normalized * 50))
    support_share = 0.0 if total_weight <= 0 else supporting / total_weight
    contradiction_share = 0.0 if total_weight <= 0 else contradicting / total_weight
    summary = (
        f"Weighted evidence mapped to {credibility_score}/100 before claim-strength penalties: "
        f"{supporting:.2f} supporting weight, {neutral:.2f} neutral weight, and {contradicting:.2f} contradicting weight."
    )

    return ConsensusBreakdown(
        supportingWeight=round(supporting, 2),
        neutralWeight=round(neutral, 2),
        contradictingWeight=round(contradicting, 2),
        disagreementWeight=round(disagreement, 2),
        rawScore=round(weighted_score, 3),
        totalWeight=round(total_weight, 3),
        supportShare=round(support_share, 3),
        contradictionShare=round(contradiction_share, 3),
        credibilityScore=max(0, min(100, credibility_score)),
        normalizedScore=max(0, min(100, credibility_score)),
        summary=summary,
    )


def agreement_score(sources: list[SourceAssessment]) -> int:
    if not sources:
        return 25
    agreement = round((sum(source.agreementFactor for source in sources) / len(sources)) * 100)
    contradiction_drag = round(weighted_consensus_breakdown(sources).contradictionShare * 25)
    return max(0, min(100, agreement - contradiction_drag))


def language_safety_score(claim_analysis: ClaimAnalysis) -> int:
    return max(0, 100 - claim_analysis.languageRiskScore)


def _high_quality_support(sources: list[SourceAssessment]) -> float:
    return sum(
        (source.sourceWeight or settings.source_weight_for_bucket(source.sourceBucket)) * (source.confidenceFactor or 0.5)
        for source in sources
        if source.sentiment == "positive" and source.sourceScore >= 2 and source.evidenceScore >= 4
    )


def claim_evidence_fit_score(claim_analysis: ClaimAnalysis, sources: list[SourceAssessment]) -> int:
    if not sources:
        return max(10, language_safety_score(claim_analysis) - 35)

    consensus = weighted_consensus_breakdown(sources)
    strongest_subclaim = max((item.strength for item in claim_analysis.atomicClaims), default=1)
    support_strength = _high_quality_support(sources)

    fit_score = consensus.credibilityScore
    if strongest_subclaim >= 4 and support_strength < 1.5:
        fit_score -= 25
    if strongest_subclaim == 5 and claim_analysis.languageRiskScore >= 45:
        fit_score -= 15
    if consensus.contradictionShare > 0.4:
        fit_score -= 10
    return max(0, min(100, fit_score))


def build_matrix(claim_analysis: ClaimAnalysis, sources: list[SourceAssessment]) -> list[DecisionMatrixFactor]:
    consensus = weighted_consensus_breakdown(sources)
    return [
        DecisionMatrixFactor(
            name="Weighted evidence",
            score=consensus.credibilityScore,
            weight=0.28,
            rationale="Uses source tier weight multiplied by stance and confidence factor before calibration to 0-100.",
        ),
        DecisionMatrixFactor(
            name="Source quality",
            score=source_quality_score(sources),
            weight=0.16,
            rationale="Higher when more evidence comes from verified authorities or established scientific sources.",
        ),
        DecisionMatrixFactor(
            name="Study quality",
            score=evidence_depth_score(sources),
            weight=0.16,
            rationale="Rewards reviews and randomized trials more than observational work, case reports, or blog content.",
        ),
        DecisionMatrixFactor(
            name="Citation integrity",
            score=citation_integrity_score(sources),
            weight=0.14,
            rationale="Checks whether the visible evidence is actually anchored to reachable citation chains.",
        ),
        DecisionMatrixFactor(
            name="Model agreement",
            score=agreement_score(sources),
            weight=0.12,
            rationale="Dual-model agreement raises confidence while disagreement reduces the effective signal.",
        ),
        DecisionMatrixFactor(
            name="Claim-evidence fit",
            score=claim_evidence_fit_score(claim_analysis, sources),
            weight=0.14,
            rationale="Penalizes strong or absolute claims when support is limited, mixed, or contradicted.",
        ),
    ]


def weighted_score(matrix: list[DecisionMatrixFactor]) -> int:
    if not matrix:
        return 0
    total = sum(item.score * item.weight for item in matrix)
    return round(total)


def calibrated_credibility_score(claim_analysis: ClaimAnalysis, sources: list[SourceAssessment]) -> tuple[int, list[str], ConsensusBreakdown]:
    consensus = weighted_consensus_breakdown(sources)
    score = consensus.credibilityScore
    strongest_claim = max((item.strength for item in claim_analysis.atomicClaims), default=1)
    high_quality_support = _high_quality_support(sources)
    penalties: list[str] = []

    if strongest_claim >= 4 and high_quality_support < 1.5:
        score -= 20
        penalties.append("Strong claim without strong supporting evidence triggered a 20-point penalty.")
    if strongest_claim >= 4 and claim_analysis.languageRiskScore >= 45:
        score -= 15
        penalties.append("Overstated wording triggered a 15-point penalty.")
    if consensus.contradictionShare > 0.4:
        score -= 10
        penalties.append("Contradicting evidence exceeded 40% of weighted evidence, triggering a 10-point penalty.")

    return max(0, min(100, score)), penalties, consensus


def contradiction_summary(sources: list[SourceAssessment]) -> Counter[str]:
    return Counter(source.sentiment for source in sources)
