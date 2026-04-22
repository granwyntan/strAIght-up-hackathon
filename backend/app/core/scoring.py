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


def _effective_source_weight(source: SourceAssessment) -> float:
    base_weight = source.sourceWeight or settings.source_weight_for_bucket(source.sourceBucket)
    confidence_factor = source.confidenceFactor or 0.5
    quality_factor = 0.6 + ((source.sourceScore / 3) * 0.2) + ((source.evidenceScore / 5) * 0.15)
    integrity_factor = 0.8 + (source.citationIntegrity / 100) * 0.25
    accessibility_factor = 1.05 if source.directEvidenceEligible else 0.92
    quote_factor = 1.05 if source.quoteVerified else 0.96
    spam_penalty = max(0.6, 1.0 - (source.spamRiskScore / 220))
    return max(0.05, base_weight * confidence_factor * quality_factor * integrity_factor * accessibility_factor * quote_factor * spam_penalty)


def source_quality_score(sources: list[SourceAssessment]) -> int:
    if not sources:
        return 20
    label_bonus = {
        "verified": 100,
        "established": 74,
        "general": 46,
    }
    values = [
        max(
            20,
            round((((source.sourceScore / 3) * 100) * 0.55) + (label_bonus.get(source.sourceQualityLabel, 46) * 0.45) - (source.spamRiskScore * 0.18)),
        )
        for source in sources
    ]
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
        contribution_weight = _effective_source_weight(source)
        sentiment_score = SENTIMENT_TO_SCORE.get(source.sentiment, 0)

        total_weight += contribution_weight
        weighted_score += contribution_weight * sentiment_score
        disagreement += max(0.0, contribution_weight * (1.0 - (source.agreementFactor or 1.0)))
        if sentiment_score > 0:
            supporting += contribution_weight
        elif sentiment_score < 0:
            contradicting += contribution_weight
        else:
            neutral += contribution_weight

    normalized = 0.0 if total_weight <= 0 else max(-1.0, min(1.0, weighted_score / total_weight))
    quality_mix = (
        (source_quality_score(sources) * 0.28)
        + (evidence_depth_score(sources) * 0.22)
        + (citation_integrity_score(sources) * 0.18)
        + (round((sum(source.semanticSimilarity for source in sources) / len(sources))) * 0.12)
        + (round((sum(source.relevanceScore for source in sources) / len(sources))) * 0.20)
    )
    if normalized >= 0:
        credibility_score = round(44 + (normalized * 40) + (quality_mix * 0.18))
    else:
        credibility_score = round(44 + (normalized * 52) + (quality_mix * 0.08))
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
    consensus = weighted_consensus_breakdown(sources)
    contradiction_drag = round(consensus.contradictionShare * 26)
    neutral_drag = round(consensus.neutralWeight / max(1.0, consensus.totalWeight) * 8) if consensus.totalWeight else 0
    return max(0, min(100, agreement - contradiction_drag - neutral_drag))


def language_safety_score(claim_analysis: ClaimAnalysis) -> int:
    return max(0, 100 - claim_analysis.languageRiskScore)


def _high_quality_support(sources: list[SourceAssessment]) -> float:
    return sum(
        _effective_source_weight(source)
        for source in sources
        if source.sentiment == "positive" and source.sourceScore >= 2 and source.evidenceScore >= 4 and source.citationIntegrity >= 55
    )


def _high_quality_contradiction(sources: list[SourceAssessment]) -> float:
    return sum(
        _effective_source_weight(source)
        for source in sources
        if source.sentiment == "negative" and source.sourceScore >= 2 and source.evidenceScore >= 3 and source.citationIntegrity >= 50
    )


def claim_evidence_fit_score(claim_analysis: ClaimAnalysis, sources: list[SourceAssessment]) -> int:
    if not sources:
        return max(10, language_safety_score(claim_analysis) - 35)

    consensus = weighted_consensus_breakdown(sources)
    strongest_subclaim = max((item.strength for item in claim_analysis.atomicClaims), default=1)
    support_strength = _high_quality_support(sources)
    contradiction_strength = _high_quality_contradiction(sources)

    fit_score = consensus.credibilityScore
    if support_strength >= 2.6 and consensus.supportShare >= 0.58 and contradiction_strength < 1.1:
        fit_score += 14
    elif support_strength >= 1.9 and consensus.supportShare >= 0.5 and contradiction_strength < 1.4:
        fit_score += 10
    elif support_strength >= 1.4 and consensus.supportShare >= 0.45 and contradiction_strength < 0.95:
        fit_score += 6
    if strongest_subclaim >= 4 and support_strength < 1.6:
        fit_score -= 16
    if strongest_subclaim == 5 and claim_analysis.languageRiskScore >= 45:
        fit_score -= 12
    if contradiction_strength >= 2.2 or consensus.contradictionShare > 0.5:
        fit_score -= 16
    elif contradiction_strength >= 1.5 or consensus.contradictionShare > 0.35:
        fit_score -= 10
    elif consensus.contradictionShare < 0.15 and support_strength >= 1.8:
        fit_score += 8
    if consensus.neutralWeight / max(1.0, consensus.totalWeight) > 0.45 and support_strength < 1.7:
        fit_score -= 6
    return max(0, min(100, fit_score))


def build_matrix(claim_analysis: ClaimAnalysis, sources: list[SourceAssessment]) -> list[DecisionMatrixFactor]:
    consensus = weighted_consensus_breakdown(sources)
    return [
        DecisionMatrixFactor(
            name="Weighted evidence",
            score=consensus.credibilityScore,
            weight=0.34,
            rationale="Uses source tier weight multiplied by stance and confidence factor before calibration to 0-100.",
        ),
        DecisionMatrixFactor(
            name="Source quality",
            score=source_quality_score(sources),
            weight=0.18,
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
            weight=0.08,
            rationale="Multi-model agreement raises confidence while disagreement reduces the effective signal.",
        ),
        DecisionMatrixFactor(
            name="Claim-evidence fit",
            score=claim_evidence_fit_score(claim_analysis, sources),
            weight=0.10,
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
    high_quality_contradiction = _high_quality_contradiction(sources)
    penalties: list[str] = []
    boosts: list[str] = []

    if high_quality_support >= 2.6 and consensus.supportShare >= 0.58 and high_quality_contradiction < 1.1:
        score += 16
        boosts.append("Strong verified support with little real pushback added a 16-point boost.")
    elif high_quality_support >= 1.9 and consensus.supportShare >= 0.5 and high_quality_contradiction < 1.4:
        score += 10
        boosts.append("Consistent high-quality support added a 10-point boost.")
    elif high_quality_support >= 1.4 and consensus.supportShare >= 0.45 and consensus.contradictionShare < 0.16:
        score += 6
        boosts.append("Measured factual support added a 6-point boost.")
    if strongest_claim >= 4 and high_quality_support < 1.6:
        score -= 14
        penalties.append("Strong claim without strong supporting evidence triggered a 14-point penalty.")
    if strongest_claim >= 4 and claim_analysis.languageRiskScore >= 45:
        score -= 12
        penalties.append("Overstated wording triggered a 12-point penalty.")
    if high_quality_contradiction >= 2.2 or consensus.contradictionShare > 0.5:
        score -= 18
        penalties.append("Strong contradicting evidence materially undercut the claim and triggered an 18-point penalty.")
    elif high_quality_contradiction >= 1.5 or consensus.contradictionShare > 0.35:
        score -= 10
        penalties.append("Meaningful contradiction pressure triggered a 10-point penalty.")
    elif consensus.contradictionShare < 0.15 and high_quality_support >= 1.8:
        score += 8
        boosts.append("Low contradiction pressure added an 8-point boost.")
    if consensus.neutralWeight / max(1.0, consensus.totalWeight) > 0.45 and high_quality_support < 1.7:
        score -= 6
        penalties.append("A large unsettled evidence share kept the score from moving higher.")

    return max(0, min(100, score)), [*boosts, *penalties], consensus


def contradiction_summary(sources: list[SourceAssessment]) -> Counter[str]:
    return Counter(source.sentiment for source in sources)
