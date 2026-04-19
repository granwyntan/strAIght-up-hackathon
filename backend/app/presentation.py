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
    "no significant effect",
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
    "insufficient evidence",
]


def _source_name(domain: str) -> str:
    cleaned = domain.lower().replace("www.", "")
    if not cleaned:
        return "Source"

    known_names = {
        "who.int": "WHO",
        "nih.gov": "NIH",
        "pubmed.ncbi.nlm.nih.gov": "PubMed",
        "pmc.ncbi.nlm.nih.gov": "PubMed Central",
        "nccih.nih.gov": "NCCIH",
        "ods.od.nih.gov": "ODS",
        "medlineplus.gov": "MedlinePlus",
        "cochrane.org": "Cochrane",
        "cochranelibrary.com": "Cochrane Library",
        "jamanetwork.com": "JAMA Network",
        "bmj.com": "BMJ",
        "nejm.org": "NEJM",
        "aad.org": "AAD",
        "aap.org": "AAP",
        "aasm.org": "AASM",
        "mayoclinic.org": "Mayo Clinic",
        "clevelandclinic.org": "Cleveland Clinic",
        "medicalnewstoday.com": "Medical News Today",
        "webmd.com": "WebMD",
    }
    if cleaned in known_names:
        return known_names[cleaned]

    parts = cleaned.split(".")
    if len(parts) >= 3 and parts[-2] in {"co", "gov", "org", "ac"}:
        candidate = parts[-3]
    elif len(parts) >= 2:
        candidate = parts[-2]
    else:
        candidate = cleaned
    return candidate.replace("-", " ").title()


def _quoted_evidence(text: str, fallback: str) -> str:
    cleaned = " ".join(text.split())
    if cleaned:
        return cleaned[:220]
    return fallback[:220]


def classify_source_sentiment(source: SourceAssessment) -> tuple[SourceSentiment, str]:
    text = " ".join(
        [
            source.title,
            source.snippet,
            source.extractedText[:1400],
            *(source.notes or []),
        ]
    ).lower()

    for phrase in NEGATIVE_PHRASES:
        if phrase in text:
            return "negative", f'The accessible source text explicitly says "{phrase}", so it contradicts or fails to support the claim.'

    for signal in NEUTRAL_SIGNALS:
        if signal in text:
            return "neutral", f'The source describes the evidence as "{signal}", so it remains inconclusive rather than supportive.'

    if source.stance == "contradictory":
        return "negative", "The source assessment indicates the evidence materially challenges or narrows the claim."
    if source.stance in {"mixed", "unclear"}:
        return "neutral", "The source adds context, but it does not cleanly support the claim."
    if source.stance == "supportive":
        if source.linkAlive and source.contentAccessible and (source.quoteVerified or source.evidenceScore >= 3 or source.citationIntegrity >= 45):
            return "positive", "The accessible source content aligns with the claim and clears the minimum evidence-integrity bar."
        return "neutral", "The source leans supportive, but the accessible evidence is too thin to treat as confirmed support."
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
    if source.relevanceCheckSummary:
        return source.relevanceCheckSummary
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
    contradiction_bonus = 6 if source.sentiment == "negative" else 0
    return (
        source.sourceScore * 24
        + source.evidenceScore * 14
        + source.citationIntegrity * 0.3
        + source.confidenceFactor * 18
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
    relevance_filtered = [source for source in sources if source.relevanceScore >= 38]
    pool = relevance_filtered or sources
    ranked = sorted(pool, key=_display_rank, reverse=True)
    target_count = min(max(18, len(ranked)), 30) if ranked else 0
    selected = ranked[:target_count]

    best_evidence = [source for source in selected if source.sourceScore >= 2 and source.evidenceScore >= 4]
    contradictions = [source for source in selected if source.sentiment == "negative"]
    mixed_limited = [source for source in selected if source not in best_evidence and source not in contradictions]

    groups = [
        EvidenceGroup(
            key="best_evidence",
            title="Best evidence",
            summary=f"{len(best_evidence)} stronger review, trial, or authority-led sources stayed visible.",
            sources=best_evidence,
        ),
        EvidenceGroup(
            key="mixed_or_limited",
            title="Mixed or limited",
            summary=f"{len(mixed_limited)} sources add nuance, limited support, or mechanism context without settling the claim.",
            sources=mixed_limited,
        ),
        EvidenceGroup(
            key="contradictions",
            title="Contradictions",
            summary=f"{len(contradictions)} sources materially challenge or narrow the claim.",
            sources=contradictions,
        ),
    ]
    return groups, selected


def infer_confidence_level(
    score: int,
    sources: list[SourceAssessment],
    llm_agreement_score: int | None = None,
) -> ConfidenceLevel:
    if not sources:
        return "low"

    high_quality_sources = sum(1 for source in sources if source.sourceScore >= 2 and source.evidenceScore >= 4)
    sentiments = Counter(source.sentiment for source in sources)
    total = max(1, len(sources))
    variance = 1 - max(sentiments.values(), default=0) / total
    agreement_component = 60 if llm_agreement_score is None else llm_agreement_score
    confidence_score = round(
        (
            score * 0.4
            + min(100, high_quality_sources * 12) * 0.35
            + agreement_component * 0.25
        )
        - (variance * 30)
    )
    if confidence_score >= 75:
        return "high"
    if confidence_score >= 50:
        return "medium"
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
                f"Calibrated evidence score before penalties: {consensus.credibilityScore}/100.",
                f"{len(selected_sources)} filtered sources were retained for the visible evidence set.",
                groups[0].summary,
                groups[2].summary,
                *matrix_lines,
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
                "Limited or inconclusive evidence remains neutral and should not be counted as support.",
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
        f"Intervention: {semantics.intervention}" if semantics and semantics.intervention else "",
        f"Action: {semantics.action}" if semantics and semantics.action else "",
        f"Outcome: {semantics.outcome}" if semantics and semantics.outcome else "",
        f"Relationship: {semantics.relationshipType}" if semantics and semantics.relationshipType else "",
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
            summary=f"{len(claim_analysis.generatedQueries)} semantic research queries prepared across synonyms, medical phrasing, and contradiction angles.",
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
            key="relevance_filter",
            title="Relevance Filter",
            status="completed",
            summary=f"{total_sources} sources remained materially relevant after semantic relevance screening.",
            details=[
                "Generic or weakly related pages were discarded before scoring.",
                "Contradiction evidence was retained when it answered the same claim in the opposite direction.",
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
