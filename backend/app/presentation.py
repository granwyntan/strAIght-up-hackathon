import re
from collections import Counter

from .core.scoring import weighted_consensus_breakdown
from .models import (
    ClaimAnalysis,
    ConfidenceLevel,
    EffectDirection,
    EvidenceExtraction,
    EvidenceGroup,
    PipelineStepSummary,
    SentimentDistribution,
    SourceAssessment,
    SourceSentiment,
)


NEGATION_WORDS = {
    "no",
    "not",
    "none",
    "never",
    "without",
    "lacks",
    "lack",
    "fails",
    "failed",
    "unable",
    "did",
    "does",
    "cannot",
    "contrary",
    "absence",
    "insufficient",
    "little",
}

NEGATIVE_PHRASES = [
    "no evidence of",
    "no association",
    "not associated",
    "not linked",
    "no correlation",
    "no causal relationship",
    "not statistically significant",
    "fails to demonstrate",
    "does not support",
    "no benefit observed",
    "no improvement",
    "ineffective",
    "null findings",
    "lack of evidence",
]

NEUTRAL_SIGNALS = [
    "limited evidence",
    "mixed results",
    "inconclusive",
    "suggests",
    "possible link",
    "preliminary",
    "more research needed",
    "under investigation",
    "needs validation",
]

POSITIVE_SIGNALS = [
    "effective",
    "significant improvement",
    "beneficial",
    "associated with improvement",
    "reduces symptoms",
    "evidence supports",
    "clinically proven",
    "improves outcomes",
    "positive correlation",
    "therapeutic effect",
    "statistically significant",
    "favorable results",
    "enhances",
    "successful treatment",
    "improves condition",
    "linked to better",
    "demonstrates efficacy",
    "supports hypothesis",
    "protective effect",
    "improvement observed",
]

TOKEN_PATTERN = re.compile(r"[a-z0-9']+")


def _source_name(domain: str) -> str:
    cleaned = domain.lower().replace("www.", "")
    return cleaned or "source"


def _tokens(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(text.lower())


def _has_negation_window(tokens: list[str], phrase: str) -> bool:
    phrase_tokens = TOKEN_PATTERN.findall(phrase.lower())
    if not phrase_tokens:
        return False
    phrase_len = len(phrase_tokens)

    for index in range(0, len(tokens) - phrase_len + 1):
        if tokens[index : index + phrase_len] != phrase_tokens:
            continue
        start = max(0, index - 5)
        window = tokens[start:index]
        if any(token in NEGATION_WORDS for token in window):
            return True
    return False


def _quoted_evidence(text: str, fallback: str) -> str:
    cleaned = " ".join(text.split())
    if cleaned:
        return cleaned[:220]
    return fallback[:220]


def classify_source_sentiment(source: SourceAssessment) -> tuple[SourceSentiment, str]:
    text = " ".join([source.title, source.snippet, *source.notes]).lower()
    tokens = _tokens(text)

    for phrase in NEGATIVE_PHRASES:
        if phrase in text:
            return "negative", f"Negative override phrase detected: {phrase}."

    positive_hits: list[str] = []
    neutral_hits: list[str] = []
    negative_hits: list[str] = []

    for signal in POSITIVE_SIGNALS:
        if signal in text:
            if _has_negation_window(tokens, signal):
                negative_hits.append(f"negated {signal}")
            else:
                positive_hits.append(signal)

    for signal in NEUTRAL_SIGNALS:
        if signal in text:
            neutral_hits.append(signal)

    if source.stance == "contradictory" and not negative_hits:
        negative_hits.append("contradictory stance")
    if source.stance == "supportive" and not positive_hits:
        positive_hits.append("supportive stance")
    if source.stance in {"mixed", "unclear"} and not neutral_hits and not positive_hits and not negative_hits:
        neutral_hits.append("mixed or unclear stance")

    if len(negative_hits) > len(positive_hits) and negative_hits:
        return "negative", f"Contradicting signals detected: {negative_hits[0]}."
    if len(positive_hits) > len(negative_hits) and positive_hits:
        return "positive", f"Supporting signals detected: {positive_hits[0]}."
    if neutral_hits:
        return "neutral", f"Uncertain or mixed language detected: {neutral_hits[0]}."
    if source.sourceScore == 1 or source.evidenceScore <= 2:
        return "neutral", "Low-strength source, so the direction stays uncertain."
    return "neutral", "The source direction is not strong enough to classify beyond neutral."


def _build_methodology_insights(source: SourceAssessment, claim_analysis: ClaimAnalysis) -> list[str]:
    text = f"{source.title} {source.snippet}".lower()
    insights: list[str] = []

    if source.evidenceTier in {"observational", "case_report"} or any(token in text for token in ["association", "associated", "correlation"]):
        insights.append("This looks more correlation-based than causal, so it should not be treated as proof.")
    if source.evidenceTier == "case_report":
        insights.append("Case-report evidence is too narrow to generalize confidently to a wider population.")
    if source.evidenceTier == "blog":
        insights.append("This source is better treated as context than as proof-quality evidence.")
    if any(token in text for token in ["pilot", "small", "feasibility", "n=", "few participants"]):
        insights.append("The available summary hints at a limited sample size.")
    if any(token in text for token in ["animal", "mice", "mouse", "cell", "in vitro"]):
        insights.append("Population limits matter because lab or animal findings do not map cleanly to people.")
    if any(token in text for token in ["6-week", "8-week", "12-week", "short-term", "weeks", "days"]):
        insights.append("The study duration appears short, which limits long-term conclusions.")
    if claim_analysis.languageRiskScore >= 45 and source.evidenceScore <= 3:
        insights.append("The claim wording is stronger than this level of evidence can safely support.")
    if source.stance == "contradictory":
        insights.append("This source materially narrows or pushes back on the original claim.")

    deduped: list[str] = []
    for insight in insights:
        if insight not in deduped:
            deduped.append(insight)
    return deduped[:3]


def _build_bias_notes(source: SourceAssessment) -> list[str]:
    notes: list[str] = []
    if source.sourceBucket == "tier_1_blog":
        notes.append("Lower-authority domain, so interpretation may overreach compared with the underlying evidence.")
    if source.citationIntegrity < 50:
        notes.append("Citation support is weak or incomplete.")
    if source.stance == "supportive" and source.evidenceScore <= 2:
        notes.append("Supportive wording appears stronger than the underlying study quality.")
    return notes[:2]


def _build_relevance_summary(source: SourceAssessment, claim_analysis: ClaimAnalysis) -> str:
    focus_hits = [term for term in claim_analysis.focusTerms if term in f"{source.title} {source.snippet}".lower()]
    focus_text = ", ".join(focus_hits[:2]) if focus_hits else "the core claim"
    stance_text = {
        "supportive": "leans supportive",
        "mixed": "shows mixed or limited evidence",
        "contradictory": "pushes back on the claim",
        "unclear": "adds context without settling the claim",
    }[source.stance]
    tier_text = source.evidenceTier.replace("_", " ")
    return f"{source.sourceName} {stance_text} and is relevant because it addresses {focus_text} through {tier_text} evidence."


def _sample_size_text(source: SourceAssessment) -> str:
    text = f"{source.title} {source.snippet}".lower()
    match = re.search(r"\bn\s*=\s*(\d+)\b", text)
    if match:
        return f"n={match.group(1)}"
    if any(token in text for token in ["small", "pilot", "few participants"]):
        return "Small or pilot sample"
    if source.evidenceTier == "review":
        return "Review-level synthesis"
    return "Not stated in the visible summary"


def _study_type_text(source: SourceAssessment) -> str:
    return {
        "review": "Systematic review or guideline-level evidence",
        "rct": "Randomized or controlled trial",
        "observational": "Observational study",
        "case_report": "Case report",
        "blog": "General article or commentary",
    }[source.evidenceTier]


def _effect_direction(sentiment: SourceSentiment) -> EffectDirection:
    if sentiment == "positive":
        return "support"
    if sentiment == "negative":
        return "contradict"
    return "neutral"


def _build_evidence(source: SourceAssessment, sentiment: SourceSentiment, methodology: list[str]) -> EvidenceExtraction:
    conclusion = source.sentimentSummary or source.relevanceSummary or source.snippet
    limitations = list(dict.fromkeys([*methodology, *source.biasNotes]))[:3]
    expert_analysis = (
        methodology[0]
        if methodology
        else "This source adds directional context, but the visible summary alone should not be treated as definitive proof."
    )
    return EvidenceExtraction(
        conclusion=conclusion[:220],
        studyType=_study_type_text(source),
        sampleSize=_sample_size_text(source),
        limitations=limitations,
        effectDirection=_effect_direction(sentiment),
        quotedEvidence=_quoted_evidence(source.extractedText or source.snippet, source.title),
        quoteVerified=source.quoteVerified,
        expertAnalysis=expert_analysis[:240],
    )


def enrich_sources(sources: list[SourceAssessment], claim_analysis: ClaimAnalysis) -> list[SourceAssessment]:
    enriched: list[SourceAssessment] = []
    for source in sources:
        sentiment, sentiment_summary = classify_source_sentiment(source)
        methodology = _build_methodology_insights(source, claim_analysis)
        bias_notes = _build_bias_notes(source)
        evidence = _build_evidence(source, sentiment, methodology)
        enriched.append(
            source.model_copy(
                update={
                    "sourceName": _source_name(source.domain),
                    "sentiment": sentiment,
                    "sentimentSummary": sentiment_summary,
                    "relevanceSummary": _build_relevance_summary(source, claim_analysis),
                    "methodologyInsights": methodology,
                    "biasNotes": bias_notes,
                    "evidence": evidence,
                }
            )
        )
    return enriched


def _display_rank(source: SourceAssessment) -> float:
    stance_bonus = {"positive": 6, "neutral": 2, "negative": 5}[source.sentiment]
    contradiction_bonus = 5 if source.sentiment == "negative" else 0
    return (
        source.sourceScore * 22
        + source.evidenceScore * 12
        + source.citationIntegrity * 0.35
        + stance_bonus
        + contradiction_bonus
    )


def build_sentiment_distribution(sources: list[SourceAssessment]) -> SentimentDistribution:
    counts = Counter(source.sentiment for source in sources)
    total = max(1, len(sources))
    positive = counts.get("positive", 0)
    neutral = counts.get("neutral", 0)
    negative = counts.get("negative", 0)
    summary = (
        f"{round((positive / total) * 100)}% supportive, "
        f"{round((neutral / total) * 100)}% inconclusive or mixed, "
        f"and {round((negative / total) * 100)}% contradicting."
    )
    return SentimentDistribution(
        positive=positive,
        neutral=neutral,
        negative=negative,
        positivePct=round((positive / total) * 100),
        neutralPct=round((neutral / total) * 100),
        negativePct=round((negative / total) * 100),
        summary=summary,
    )


def build_source_groups(sources: list[SourceAssessment]) -> tuple[list[EvidenceGroup], list[SourceAssessment]]:
    ranked = sorted(sources, key=_display_rank, reverse=True)
    target_count = min(max(20, len(ranked)), 30) if ranked else 0
    selected: list[SourceAssessment] = []
    selected_ids: set[str] = set()

    contradicting = [source for source in ranked if source.sentiment == "negative"][: max(3, min(6, len(ranked)))]
    for source in contradicting:
        if source.id not in selected_ids:
            selected.append(source)
            selected_ids.add(source.id)

    high_quality = [
        source
        for source in ranked
        if source.id not in selected_ids and source.sourceScore >= 2 and source.evidenceScore >= 4 and source.citationIntegrity >= 45
    ][:8]
    for source in high_quality:
        selected.append(source)
        selected_ids.add(source.id)

    for source in ranked:
        if len(selected) >= target_count:
            break
        if source.id in selected_ids:
            continue
        selected.append(source)
        selected_ids.add(source.id)

    high_quality_ids = {source.id for source in high_quality}
    contradicting_ids = {source.id for source in contradicting}
    groups = [
        EvidenceGroup(
            key="high_quality_evidence",
            title="High-quality evidence",
            summary=f"{sum(1 for source in selected if source.id in high_quality_ids)} stronger review, trial, or authority-led sources retained.",
            sources=[source for source in selected if source.id in high_quality_ids],
        ),
        EvidenceGroup(
            key="supporting_context",
            title="Supporting context",
            summary=f"{sum(1 for source in selected if source.id not in high_quality_ids and source.id not in contradicting_ids)} additional sources add nuance, mechanisms, or broader context.",
            sources=[source for source in selected if source.id not in high_quality_ids and source.id not in contradicting_ids],
        ),
        EvidenceGroup(
            key="contradicting_evidence",
            title="Contradicting evidence",
            summary=f"{sum(1 for source in selected if source.id in contradicting_ids)} sources materially challenge or narrow the claim.",
            sources=[source for source in selected if source.id in contradicting_ids],
        ),
    ]
    return groups, selected


def infer_confidence_level(score: int, sentiment: SentimentDistribution, contradictions: list[str], llm_agreement_score: int | None = None) -> ConfidenceLevel:
    verifier_penalty = 0 if llm_agreement_score is None else max(0, 75 - llm_agreement_score)
    adjusted_score = score - round(verifier_penalty * 0.4)
    if adjusted_score >= 78 and sentiment.negativePct <= 20 and sentiment.neutralPct <= 30 and len(contradictions) <= 2:
        return "high"
    if adjusted_score >= 55 and sentiment.negativePct <= 40:
        return "moderate"
    return "low"


def build_sections(
    claim: str,
    claim_analysis: ClaimAnalysis,
    selected_sources: list[SourceAssessment],
    groups: list[EvidenceGroup],
    matrix_lines: list[str],
    strengths: list[str],
    concerns: list[str],
) -> tuple[list[str], list[str], list[str], list[str]]:
    consensus = weighted_consensus_breakdown(selected_sources)
    evidence_breakdown = list(
        dict.fromkeys(
            [
                *matrix_lines,
                f"{len(selected_sources)} filtered sources were retained for the visible evidence set.",
                groups[0].summary,
                groups[2].summary,
                consensus.summary,
            ]
        )
    )

    key_findings = list(
        dict.fromkeys(
            [
                *strengths,
                *(source.evidence.expertAnalysis for source in groups[0].sources[:4] if source.evidence),
                *(source.relevanceSummary for source in groups[0].sources[:3]),
            ]
        )
    )[:6]

    contradictions = list(
        dict.fromkeys(
            [
                *concerns,
                *(source.evidence.expertAnalysis for source in groups[2].sources[:4] if source.evidence),
                *(source.relevanceSummary for source in groups[2].sources[:4]),
            ]
        )
    )[:6]

    methodology = list(
        dict.fromkeys(
            [
                *(insight for source in selected_sources[:10] for insight in source.methodologyInsights),
                "Correlation should not be treated as proof of causation unless stronger trial evidence supports it.",
                "Aggressive claim wording should be downgraded when the evidence base is narrow, short, or inconsistent.",
            ]
        )
    )[:8]

    if not contradictions:
        contradictions = [f"No major direct contradiction surfaced for '{claim}', but uncertainty still remains where the evidence is thin."]
    if not methodology:
        methodology = [f"The review prioritized stronger evidence tiers first and downgraded overconfident wording for '{claim}'."]
    if not key_findings:
        key_findings = [claim_analysis.summary]

    return evidence_breakdown, key_findings, contradictions, methodology


def build_step_summaries(
    claim_analysis: ClaimAnalysis,
    groups: list[EvidenceGroup],
    sentiment: SentimentDistribution,
    verdict_summary: str,
    confidence_level: ConfidenceLevel,
    matrix_lines: list[str],
) -> list[PipelineStepSummary]:
    total_sources = sum(len(group.sources) for group in groups)
    semantics = claim_analysis.semantics
    semantic_lines = [
        claim_analysis.summary,
        f"Subject: {semantics.subject}" if semantics and semantics.subject else "",
        f"Action: {semantics.action}" if semantics and semantics.action else "",
        f"Outcome: {semantics.outcome}" if semantics and semantics.outcome else "",
    ]
    semantic_lines = [line for line in semantic_lines if line]
    return [
        PipelineStepSummary(
            key="claim_breakdown",
            title="Claim Breakdown",
            status="completed",
            summary=f"{max((item.strength for item in claim_analysis.atomicClaims), default=1)}/5 claim strength identified from the full semantic claim.",
            details=semantic_lines,
        ),
        PipelineStepSummary(
            key="query_generation",
            title="Query Generation",
            status="completed",
            summary=f"{len(claim_analysis.generatedQueries)} research queries prepared across academic, clinical, and mechanism angles.",
            details=claim_analysis.generatedQueries[:6],
        ),
        PipelineStepSummary(
            key="source_validation",
            title="Source Validation",
            status="completed",
            summary=f"{total_sources} accessible sources survived filtering and integrity checks.",
            details=[
                "Broken or inaccessible links were discarded before analysis.",
                groups[0].summary,
                groups[2].summary,
            ],
        ),
        PipelineStepSummary(
            key="quote_verification",
            title="Quote Verification",
            status="completed",
            summary="Displayed quotes were checked against accessible source text before rendering.",
            details=[
                "Quotes that could not be matched directly to source text were removed.",
                "Links shown in the UI map to the same source used for the quote block.",
            ],
        ),
        PipelineStepSummary(
            key="consensus_check",
            title="Sentiment Consensus",
            status="completed",
            summary=sentiment.summary,
            details=[
                f"Positive: {sentiment.positivePct}%",
                f"Neutral: {sentiment.neutralPct}%",
                f"Negative: {sentiment.negativePct}%",
            ],
        ),
        PipelineStepSummary(
            key="final_verdict",
            title="Final Verdict",
            status="completed",
            summary=f"{confidence_level.title()} confidence. {verdict_summary}",
            details=matrix_lines[:4],
        ),
    ]
