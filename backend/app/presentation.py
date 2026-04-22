import re
from collections import Counter

from .core.scoring import weighted_consensus_breakdown
from .models import (
    ClaimAnalysis,
    ClaimGraphNode,
    ConfidenceLevel,
    EvidenceGraphNode,
    EffectDirection,
    EvidenceExtraction,
    EvidenceGroup,
    PipelineStepSummary,
    SentimentDistribution,
    SourceRegistryEntry,
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
APPROVED_GENERAL_HEALTH_DOMAIN_MARKERS = (
    "sleepfoundation.org",
    "webmd.com",
    "medicalnewstoday.com",
    "healthline.com",
    "mayoclinic.org",
    "clevelandclinic.org",
    "bannerhealth.com",
    "medlineplus.gov",
    "nih.gov",
    "nccih.nih.gov",
    "ods.od.nih.gov",
    "aad.org",
    "aap.org",
    "aasm.org",
    "healthhub.sg",
    "healthxchange.sg",
    "mindline.sg",
    "healthiersg.gov.sg",
    "ncid.sg",
    "moh.gov.sg",
    "hsa.gov.sg",
)


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
        "moh.gov.sg": "MOH Singapore",
        "hsa.gov.sg": "HSA Singapore",
        "hpb.gov.sg": "Health Promotion Board",
        "aic.sg": "Agency for Integrated Care",
        "healthhub.sg": "HealthHub",
        "healthxchange.sg": "HealthXchange",
        "mindline.sg": "mindline.sg",
        "healthiersg.gov.sg": "Healthier SG",
        "ncid.sg": "NCID",
        "ace-hta.gov.sg": "ACE Singapore",
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


def _domain_matches(domain: str, patterns: tuple[str, ...]) -> bool:
    lowered = domain.lower()
    return any(lowered == pattern or lowered.endswith(f".{pattern}") or pattern in lowered for pattern in patterns)


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
    if source.sourceQualityLabel == "general":
        notes.append("General-web source, so it should not carry the same weight as verified medical authorities or established journals.")
    if source.spamRiskScore >= 65:
        notes.append("Promotional or click-driven wording reduced confidence in the source.")
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
        quotedEvidence="",
        quoteVerified=False,
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
    direct_evidence_bonus = 10 if source.directEvidenceEligible else 0
    return (
        source.sourceScore * 24
        + source.evidenceScore * 14
        + source.citationIntegrity * 0.3
        + source.confidenceFactor * 18
        + contradiction_bonus
        + direct_evidence_bonus
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
    direct_evidence = [source for source in ranked if source.directEvidenceEligible]
    context_only = [
        source
        for source in ranked
        if (
            not source.directEvidenceEligible
            and (
                source.sourceQualityLabel != "general"
                or (
                    _domain_matches(source.domain, APPROVED_GENERAL_HEALTH_DOMAIN_MARKERS)
                    and (source.citationIntegrity >= 45 or source.relevanceScore >= 62)
                )
            )
        )
    ]
    general_context_only = [source for source in context_only if source.sourceQualityLabel == "general"]
    stronger_context_only = [source for source in context_only if source.sourceQualityLabel != "general"]
    target_count = min(max(18, len(direct_evidence) + min(12, len(context_only))), 48) if ranked else 0
    selected = [
        *direct_evidence[:target_count],
        *stronger_context_only[: max(0, target_count - len(direct_evidence[:target_count]))],
        *general_context_only[: min(6, max(0, target_count - len(direct_evidence[:target_count]) - len(stronger_context_only[: max(0, target_count - len(direct_evidence[:target_count]))])))],
    ]

    best_evidence = [source for source in selected if source.directEvidenceEligible and source.sourceScore >= 2 and source.evidenceScore >= 4]
    contradictions = [source for source in selected if source.directEvidenceEligible and source.sentiment == "negative"]
    mixed_limited = [source for source in selected if source not in best_evidence and source not in contradictions]

    groups = [
        EvidenceGroup(
            key="best_evidence",
            title="Best evidence",
            summary=f"{len(best_evidence)} validated sources passed the strict direct-evidence gate and stayed visible as first-class evidence.",
            sources=best_evidence,
        ),
        EvidenceGroup(
            key="mixed_or_limited",
            title="Mixed or limited",
            summary=f"{len(mixed_limited)} sources add nuance or context, but they are weaker, indirect, or limited-access rather than direct evidence cards.",
            sources=mixed_limited,
        ),
        EvidenceGroup(
            key="contradictions",
            title="Contradictions",
            summary=f"{len(contradictions)} validated sources materially challenge or narrow the claim.",
            sources=contradictions,
        ),
    ]
    return groups, selected


def build_claim_graph(claim_analysis: ClaimAnalysis) -> list[ClaimGraphNode]:
    nodes: list[ClaimGraphNode] = []
    relationship_type = claim_analysis.semantics.relationshipType if claim_analysis.semantics else "correlational"
    for index, atomic_claim in enumerate(claim_analysis.atomicClaims):
        if relationship_type == "causal":
            claim_type: str = "causal"
        elif relationship_type == "opinion":
            claim_type = "opinion"
        elif any(token in atomic_claim.text.lower() for token in ["%", "percent", "rate", "risk ratio", "odds"]):
            claim_type = "statistical"
        else:
            claim_type = "factual"
        nodes.append(
            ClaimGraphNode(
                id=f"claim-{index + 1}",
                text=atomic_claim.text,
                claimType=claim_type,
                importanceWeight=round(min(1.0, max(0.2, atomic_claim.strength / 5)), 2),
                entities=claim_analysis.nlpEntities[:6],
            )
        )
    if nodes:
        return nodes
    return [
        ClaimGraphNode(
            id="claim-1",
            text=claim_analysis.summary,
            claimType="causal" if relationship_type == "causal" else "opinion" if relationship_type == "opinion" else "factual",
            importanceWeight=0.8,
            entities=claim_analysis.nlpEntities[:6],
        )
    ]


def build_source_registry(sources: list[SourceAssessment]) -> list[SourceRegistryEntry]:
    registry: list[SourceRegistryEntry] = []
    for source in sources:
        registry.append(
            SourceRegistryEntry(
                sourceId=source.id,
                title=source.title,
                domain=source.domain,
                provider=source.sourceProvider,
                discoveredUrl=source.discoveredUrl or source.url,
                resolvedUrl=source.resolvedUrl or source.url,
                evidenceUrl=source.evidenceUrl or source.resolvedUrl or source.url,
                linkAlive=source.linkAlive,
                contentAccessible=source.contentAccessible,
                httpStatusCode=source.httpStatusCode,
                quoteVerified=source.quoteVerified,
                directEvidenceEligible=source.directEvidenceEligible,
                sourceQualityLabel=source.sourceQualityLabel,
            )
        )
    return registry


def build_evidence_graph(claim_graph: list[ClaimGraphNode], sources: list[SourceAssessment]) -> list[EvidenceGraphNode]:
    primary_claim_id = claim_graph[0].id if claim_graph else "claim-1"
    graph: list[EvidenceGraphNode] = []
    for index, source in enumerate(sources):
        graph.append(
            EvidenceGraphNode(
                id=f"evidence-{index + 1}",
                claimId=primary_claim_id,
                sourceId=source.id,
                stance=source.quoteStance,
                quote=(source.evidence.quotedEvidence if source.evidence else "")[:220],
                quoteVerified=source.quoteVerified,
                directEvidenceEligible=source.directEvidenceEligible,
                evidenceUrl=source.evidenceUrl or source.resolvedUrl or source.url,
                credibilityScore=min(100, round((source.citationIntegrity * 0.45) + (source.relevanceScore * 0.25) + (source.semanticSimilarity * 0.3))),
            )
        )
    return graph


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
    if confidence_score >= 80:
        return "high"
    if confidence_score >= 52:
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
                f"Weighted support share: {round(consensus.supportShare * 100)}%.",
                f"Weighted contradiction share: {round(consensus.contradictionShare * 100)}%.",
                groups[0].summary,
                groups[1].summary,
                groups[2].summary,
                *matrix_lines,
                consensus.summary,
            ]
        )
    )

    support_count = sum(1 for source in selected_sources if source.sentiment == "positive")
    contradiction_count = sum(1 for source in selected_sources if source.sentiment == "negative")
    authority_count = sum(1 for source in selected_sources if source.sourceQualityLabel == "verified")

    key_findings = list(
        dict.fromkeys(
            [
                f"{authority_count} verified-authority sources remained in the scored evidence pool.",
                f"{support_count} sources leaned supportive while {contradiction_count} pushed back or narrowed the claim.",
                *(source.evidence.conclusion for source in groups[0].sources[:3] if source.evidence and source.evidence.conclusion),
                *(source.evidence.expertAnalysis for source in groups[0].sources[:3] if source.evidence and source.evidence.expertAnalysis),
                *strengths,
            ]
        )
    )[:8]

    contradictions = list(
        dict.fromkeys(
            [
                *concerns,
                *(source.evidence.expertAnalysis for source in groups[2].sources[:4] if source.evidence),
                *(source.relevanceSummary for source in groups[2].sources[:5]),
                *(source.evidence.conclusion for source in groups[2].sources[:3] if source.evidence),
            ]
        )
    )[:8]

    methodology = list(
        dict.fromkeys(
            [
                *(insight for source in selected_sources[:10] for insight in source.methodologyInsights),
                "Correlation should not be treated as proof of causation unless stronger trial evidence supports it.",
                "Limited or inconclusive evidence remains neutral and should not be counted as support.",
                "Aggressive claim wording should be downgraded when the evidence base is narrow, short, or inconsistent.",
            ]
        )
    )[:10]

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
    investigation_brief_summary: str = "",
    investigation_brief_details: list[str] | None = None,
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
    if investigation_brief_summary:
        semantic_lines = [investigation_brief_summary, *(investigation_brief_details or []), *semantic_lines]

    return [
        PipelineStepSummary(
            key="claim_analysis",
            title="Claim analysis",
            status="completed",
            summary=f"The wording was parsed as a {max((item.strength for item in claim_analysis.atomicClaims), default=1)}/5 strength claim before evidence was gathered.",
            details=semantic_lines,
        ),
        PipelineStepSummary(
            key="searching_sources",
            title="Searching sources",
            status="completed",
            summary=f"{len(claim_analysis.generatedQueries)} search paths were prepared across support, contradiction, and medical phrasing angles.",
            details=claim_analysis.generatedQueries[:6],
        ),
        PipelineStepSummary(
            key="validating_sources",
            title="Validating sources",
            status="completed",
            summary=f"{total_sources} readable sources stayed in the review after link, accessibility, and credibility checks.",
            details=[
                "Broken or inaccessible links were removed before analysis.",
                "Domain credibility and promotional-risk checks ran before sources influenced the score.",
                groups[0].summary,
                groups[2].summary,
            ],
        ),
        PipelineStepSummary(
            key="analyzing_evidence",
            title="Analyzing evidence",
            status="completed",
            summary=f"{total_sources} sources remained after relevance filtering, quote verification, and stance analysis.",
            details=[
                "Generic or weakly related pages were discarded before scoring.",
                "Contradiction evidence stayed visible when it addressed the same claim from the opposite direction.",
                "Only exact quotes that matched accessible source text were allowed into the final evidence cards.",
            ],
        ),
        PipelineStepSummary(
            key="computing_score",
            title="Computing score",
            status="completed",
            summary=sentiment.summary,
            details=[
                f"Positive: {sentiment.positivePct}%",
                f"Neutral: {sentiment.neutralPct}%",
                f"Negative: {sentiment.negativePct}%",
            ],
        ),
        PipelineStepSummary(
            key="finalizing_results",
            title="Finalizing results",
            status="completed",
            summary=f"{confidence_level.title()} confidence. {verdict_summary}",
            details=matrix_lines[:4],
        ),
    ]
