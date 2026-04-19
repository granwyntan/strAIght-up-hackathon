from collections import Counter

from ..core.scoring import build_matrix, weighted_consensus_breakdown, weighted_score
from ..models import ClaimAnalysis, ClaimVerdict, ConsensusBreakdown, DecisionMatrixFactor, MisinformationRisk, SourceAssessment


def _verdict(score: int, claim_analysis: ClaimAnalysis, sources: list[SourceAssessment]) -> ClaimVerdict:
    credible = [source for source in sources if source.sourceScore >= 2 and source.evidenceScore >= 3]
    sentiments = Counter(source.sentiment for source in credible)
    positive = sentiments.get("positive", 0)
    neutral = sentiments.get("neutral", 0)
    negative = sentiments.get("negative", 0)
    strongest_claim = max((item.strength for item in claim_analysis.atomicClaims), default=1)

    if score >= 78 and positive > negative and negative <= max(1, positive // 2):
        return "trustworthy"
    if score < 42 or negative >= max(3, positive + neutral):
        return "untrustworthy"
    if strongest_claim >= 4 and (score < 82 or neutral >= positive or negative > 0):
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
    consensus = weighted_consensus_breakdown(sources)
    score = weighted_score(matrix)

    supportive = [source for source in sources if source.sentiment == "positive" and source.sourceScore >= 2]
    contradictory = [source for source in sources if source.sentiment == "negative" and source.sourceScore >= 2]
    strong_sources = [source for source in sources if source.sourceScore == 3]
    weak_sources = [source for source in sources if source.sourceScore == 1]
    sentiments = Counter(source.sentiment for source in sources)
    total_sources = max(1, len(sources))
    contradiction_penalty = min(22, round((sentiments.get("negative", 0) / total_sources) * 34))
    mixed_penalty = 10 if sentiments.get("neutral", 0) / total_sources >= 0.45 else 0
    mismatch_penalty = 14 if max((item.strength for item in claim_analysis.atomicClaims), default=1) >= 4 and len(strong_sources) < 4 else 0
    support_bonus = 6 if sentiments.get("positive", 0) / total_sources >= 0.5 and len(strong_sources) >= 3 else 0
    score = max(0, min(100, score - contradiction_penalty - mixed_penalty - mismatch_penalty + support_bonus))
    verdict = _verdict(score, claim_analysis, sources)
    misinformation_risk = _misinformation_risk(verdict, claim_analysis, sentiments, total_sources)

    strengths = [
        f"{len(strong_sources)} higher-authority sources were found." if strong_sources else "No top-tier authority sources were found.",
        consensus.summary,
    ]
    if supportive:
        strengths.append(f"{len(supportive)} credible sources partially or directly support the claim.")
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

    if verdict == "trustworthy":
        narrative = (
            f'The investigation leans trustworthy for "{claim}" because better-quality sources generally point in the same direction, '
            "although the claim should still be phrased with clinical caution."
        )
    elif verdict == "overstated":
        narrative = (
            f'The investigation suggests the claim "{claim}" is overstated. There may be some supportive signal underneath, '
            "but the wording overshoots what the current evidence base can safely support."
        )
    elif verdict == "mixed":
        narrative = (
            f'The investigation returned a mixed result for "{claim}". Some evidence is directionally supportive, '
            "but source quality, study depth, or consistency across sources is not strong enough for a clean yes."
        )
    else:
        narrative = (
            f'The investigation does not find "{claim}" trustworthy. The stronger sources either contradict it, '
            "narrow it heavily, or fail to support the certainty of the wording."
        )

    return matrix, consensus, score, verdict, narrative, strengths, concerns, misinformation_risk
