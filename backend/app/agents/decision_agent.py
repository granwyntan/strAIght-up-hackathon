from collections import Counter

from ..core.scoring import build_matrix, calibrated_credibility_score, weighted_consensus_breakdown
from ..models import ClaimAnalysis, ClaimVerdict, ConsensusBreakdown, DecisionMatrixFactor, MisinformationRisk, SourceAssessment


def user_facing_verdict_label(verdict: ClaimVerdict) -> str:
    if verdict == "trustworthy":
        return "Agree"
    if verdict == "untrustworthy":
        return "Disagree"
    return "Uncertain"


def _weighted_signal(sources: list[SourceAssessment], sentiment: str) -> float:
    return sum(
        (source.sourceWeight or 0.4) * (source.confidenceFactor or 0.5)
        for source in sources
        if source.sentiment == sentiment and source.sourceScore >= 2 and source.evidenceScore >= 3
    )


def _verdict(score: int, claim_analysis: ClaimAnalysis, sources: list[SourceAssessment]) -> ClaimVerdict:
    consensus = weighted_consensus_breakdown(sources)
    support_weight = _weighted_signal(sources, "positive")
    contradiction_weight = _weighted_signal(sources, "negative")
    strongest_claim = max((item.strength for item in claim_analysis.atomicClaims), default=1)

    if score >= 70:
        return "trustworthy"
    if score < 30:
        return "untrustworthy"
    if strongest_claim >= 4 and (contradiction_weight >= support_weight or claim_analysis.languageRiskScore >= 45 or consensus.contradictionShare >= 0.28):
        return "overstated"
    return "mixed"


def _misinformation_risk(
    verdict: ClaimVerdict,
    claim_analysis: ClaimAnalysis,
    sentiments: Counter[str],
    total_sources: int,
) -> MisinformationRisk:
    strongest_claim = max((item.strength for item in claim_analysis.atomicClaims), default=1)
    contradiction_share = sentiments.get("negative", 0) / max(1, total_sources)
    neutral_share = sentiments.get("neutral", 0) / max(1, total_sources)

    if verdict in {"untrustworthy", "overstated"} and (strongest_claim >= 4 or contradiction_share >= 0.25):
        return "high"
    if neutral_share >= 0.4 or strongest_claim >= 3:
        return "moderate"
    return "low"


def summarize_decision(
    claim: str,
    claim_analysis: ClaimAnalysis,
    sources: list[SourceAssessment],
) -> tuple[
    list[DecisionMatrixFactor],
    ConsensusBreakdown,
    int,
    ClaimVerdict,
    str,
    list[str],
    list[str],
    MisinformationRisk,
]:
    matrix = build_matrix(claim_analysis, sources)
    score, penalties, consensus = calibrated_credibility_score(claim_analysis, sources)

    supportive = [source for source in sources if source.sentiment == "positive" and source.sourceScore >= 2]
    contradictory = [source for source in sources if source.sentiment == "negative" and source.sourceScore >= 2]
    strong_sources = [source for source in sources if source.sourceScore == 3]
    weak_sources = [source for source in sources if source.sourceScore == 1]
    sentiments = Counter(source.sentiment for source in sources)
    total_sources = max(1, len(sources))
    verdict = _verdict(score, claim_analysis, sources)
    misinformation_risk = _misinformation_risk(verdict, claim_analysis, sentiments, total_sources)

    strengths = [
        f"{len(strong_sources)} verified-authority sources were found." if strong_sources else "No verified-authority sources were found.",
        consensus.summary,
    ]
    if supportive:
        strengths.append(f"{len(supportive)} credible sources materially support the claim.")
    if contradictory:
        strengths.append(f"{len(contradictory)} credible sources push back against the claim or narrow it substantially.")
    if sentiments.get("negative", 0):
        strengths.append("Contradicting evidence was explicitly checked instead of only summarizing supportive material.")

    concerns = []
    if claim_analysis.redFlags:
        concerns.append("The claim language is stronger than the underlying evidence should allow.")
    if weak_sources:
        concerns.append(f"{len(weak_sources)} weak general-web sources were present in the evidence pool.")
    if any(source.citationIntegrity < 50 for source in sources):
        concerns.append("At least one source had weak or broken citation support.")
    if sentiments.get("neutral", 0) / total_sources >= 0.4:
        concerns.append("A large share of the evidence remains mixed or inconclusive.")
    if sentiments.get("negative", 0) / total_sources >= 0.25:
        concerns.append("Contradicting evidence is too substantial to ignore.")
    concerns.extend(penalties)

    if verdict == "trustworthy":
        narrative = (
            f'The investigation lands in the agree range for "{claim}" because the stronger evidence generally points in the same direction, '
            "although the claim should still be phrased with clinical caution."
        )
    elif verdict == "overstated":
        narrative = (
            f'The investigation stays in the uncertain range for "{claim}". There may be some supportive signal underneath, '
            "but the wording overshoots what the current evidence base can safely support."
        )
    elif verdict == "mixed":
        narrative = (
            f'The investigation stays in the uncertain range for "{claim}". Some evidence is directionally supportive, '
            "but source quality, study depth, or consistency across sources is not strong enough for a clean yes."
        )
    else:
        narrative = (
            f'The investigation lands in the disagree range for "{claim}". The stronger sources either contradict it, '
            "narrow it heavily, or fail to support the certainty of the wording."
        )

    return matrix, consensus, score, verdict, narrative, strengths, concerns, misinformation_risk
