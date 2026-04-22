import asyncio

from pydantic import BaseModel, Field

from .nlp_cloud_agent import refine_source_sentiments_with_nlp_cloud
from ..ai import ProviderName, generate_structured_list
from ..models import EffectDirection, SourceAssessment, SourceSentiment
from ..presentation import classify_source_sentiment
from ..settings import settings


class SourceSentimentJudgment(BaseModel):
    id: str
    sentiment: SourceSentiment
    rationale: str = Field(min_length=10, max_length=400)


def _batch_sentiment_review(
    claim: str,
    sources: list[SourceAssessment],
    preferred_providers: list[ProviderName],
    stage: str,
    reviewer_name: str,
) -> dict[str, SourceSentimentJudgment]:
    judgments = generate_structured_list(
        stage,
        (
            f"You are {reviewer_name} for a health-claim investigation. "
            "Professional role: Stance Agent with an epidemiology perspective. "
            "Goal: decide whether each source supports, contradicts, or fails to support the claim as worded. "
            "Standpoint: semantic, negation-aware, conservative with causation, and strict about evidence gaps. "
            "Return JSON only as an array of objects with id, sentiment, and rationale. "
            "Use sentiment values positive, neutral, or negative. "
            "Judge whether each source supports, contradicts, or fails to support the claim. "
            "Be negation-aware and conservative with causation claims."
        ),
        {
            "claim": claim,
            "sources": [
                {
                    "id": source.id,
                    "title": source.title,
                    "snippet": source.snippet,
                    "extractedText": source.extractedText[:1600],
                    "sourceBucket": source.sourceBucket,
                    "evidenceTier": source.evidenceTier,
                    "stance": source.stance,
                    "citationIntegrity": source.citationIntegrity,
                }
                for source in sources
            ],
            "instructions": [
                "Return positive only for genuine support, negative for contradiction or failure to support, and neutral for mixed or uncertain evidence.",
                "Treat disagreement, unclear mechanism, or weak causal logic conservatively.",
                'Hard rules: "no evidence of", "not associated", "fails to show", and "no significant effect" are negative.',
                'Hard rules: "insufficient evidence", "inconclusive", "limited evidence", and "further research is needed" are neutral.',
                'Examples: "X may help Y" = positive, "No association found between X and Y" = negative, "Results were inconsistent across studies" = neutral.',
            ],
        },
        SourceSentimentJudgment,
        preferred_providers=preferred_providers,
    )
    return {item.id: item for item in judgments}


def _batch_disagreement_review(
    claim: str,
    sources: list[SourceAssessment],
    scientific_map: dict[str, SourceSentimentJudgment],
    critical_map: dict[str, SourceSentimentJudgment],
) -> dict[str, SourceSentimentJudgment]:
    if not sources:
        return {}

    judgments = generate_structured_list(
        "reasoning",
        (
            "You are the disagreement resolver for a health-claim investigation. "
            "Professional role: Consensus Agent mediating between two stance reviewers. "
            "Goal: reconcile disagreements without inventing certainty and without discarding legitimate contradiction evidence. "
            "Standpoint: if support is weak or wording is too strong, err toward neutral or negative rather than optimistic support. "
            "Return JSON only as an array of objects with id, sentiment, and rationale. "
            "Use sentiment values positive, neutral, or negative. "
            "Choose the most evidence-faithful stance when the scientific and critical reviewers disagree."
        ),
        {
            "claim": claim,
            "sources": [
                {
                    "id": source.id,
                    "title": source.title,
                    "snippet": source.snippet,
                    "extractedText": source.extractedText[:1600],
                    "sourceBucket": source.sourceBucket,
                    "evidenceTier": source.evidenceTier,
                    "stance": source.stance,
                    "scientificDraft": scientific_map.get(source.id).model_dump() if scientific_map.get(source.id) else None,
                    "criticalDraft": critical_map.get(source.id).model_dump() if critical_map.get(source.id) else None,
                }
                for source in sources
            ],
            "instructions": [
                "Pick positive only when the source genuinely supports the claim in the direction stated.",
                "Pick negative for contradiction or failure to support a strong claim.",
                "Pick neutral when the disagreement is best explained by mixed, limited, or inconclusive evidence.",
                "Respect hard rules: 'no evidence', 'not associated', and 'no significant effect' are negative.",
                "Respect hard rules: 'limited evidence', 'inconclusive', and 'more research is needed' are neutral.",
            ],
        },
        SourceSentimentJudgment,
        preferred_providers=["claude", "openai", "gemini"],
    )
    return {item.id: item for item in judgments}


def _effect_direction(sentiment: SourceSentiment) -> EffectDirection:
    if sentiment == "positive":
        return "support"
    if sentiment == "negative":
        return "contradict"
    return "neutral"


def _clarity_factor(source: SourceAssessment, heuristic_sentiment: SourceSentiment) -> float:
    score = 0.5
    if source.linkAlive and source.contentAccessible:
        score += 0.12
    if source.quoteVerified:
        score += 0.08
    if source.citationIntegrity >= 70:
        score += 0.15
    elif source.citationIntegrity >= 45:
        score += 0.08
    if heuristic_sentiment in {"positive", "negative"}:
        score += 0.08
    return max(0.5, min(1.0, round(score, 2)))


def _confidence_factor(source: SourceAssessment, agreement_factor: float, clarity_factor: float) -> float:
    study_quality = source.studyQualityFactor or {
        "review": 1.0,
        "rct": 0.95,
        "observational": 0.8,
        "case_report": 0.65,
        "blog": 0.5,
    }[source.evidenceTier]
    value = round((agreement_factor + clarity_factor + study_quality) / 3, 2)
    return max(0.5, min(1.0, value))


def _source_weight(source: SourceAssessment) -> float:
    quality_multiplier = {
        "verified": 1.0,
        "established": 0.86,
        "general": 0.65,
    }.get(source.sourceQualityLabel, 0.65)
    spam_multiplier = max(0.45, 1 - (source.spamRiskScore / 140))
    weighted = settings.source_weight_for_bucket(source.sourceBucket) * quality_multiplier * spam_multiplier
    return round(max(0.2, min(1.0, weighted)), 3)


def _stance_score(sentiment: SourceSentiment) -> int:
    if sentiment == "positive":
        return 1
    if sentiment == "negative":
        return -1
    return 0


async def apply_sentiment_consensus(claim: str, sources: list[SourceAssessment]) -> list[SourceAssessment]:
    scientific_task = asyncio.to_thread(
        _batch_sentiment_review,
        claim,
        sources,
        ["gemini", "openai"],
        "research",
        "the scientific evidence interpreter",
    )
    critical_task = asyncio.to_thread(
        _batch_sentiment_review,
        claim,
        sources,
        ["xai", "deepseek", "claude"],
        "reasoning",
        "the contradiction-focused critical reviewer",
    )
    scientific_map, critical_map = await asyncio.gather(scientific_task, critical_task)

    disagreement_sources = [
        source
        for source in sources
        if scientific_map.get(source.id)
        and critical_map.get(source.id)
        and scientific_map[source.id].sentiment != critical_map[source.id].sentiment
    ][: settings.sentiment_disagreement_review_limit]
    disagreement_map = (
        await asyncio.to_thread(_batch_disagreement_review, claim, disagreement_sources, scientific_map, critical_map)
        if disagreement_sources
        else {}
    )

    nlp_cloud_candidates: list[SourceAssessment] = []
    if settings.has_nlpcloud:
        candidate_ids: set[str] = set()
        disagreement_ids = {item.id for item in disagreement_sources}
        for source in sources:
            should_include = (
                source.stance in {"mixed", "unclear"}
                or source.evidenceScore >= 3
                or source.id in disagreement_ids
                or source.sourceScore >= 2
            )
            if should_include and source.id not in candidate_ids:
                candidate_ids.add(source.id)
                nlp_cloud_candidates.append(source)
        nlp_cloud_map = await asyncio.to_thread(refine_source_sentiments_with_nlp_cloud, claim, nlp_cloud_candidates)
    else:
        nlp_cloud_map = {}

    updated: list[SourceAssessment] = []
    for source in sources:
        heuristic_sentiment, heuristic_summary = classify_source_sentiment(source)
        scientific = scientific_map.get(source.id)
        critical = critical_map.get(source.id)
        nlp_cloud_sentiment = nlp_cloud_map.get(source.id)
        disagreement_review = disagreement_map.get(source.id)

        scientific_sentiment = scientific.sentiment if scientific else heuristic_sentiment
        critical_sentiment = critical.sentiment if critical else heuristic_sentiment

        if heuristic_sentiment == "negative":
            final_sentiment: SourceSentiment = "negative"
            agreement_factor = 1.0 if "negative" in {scientific_sentiment, critical_sentiment} else 0.6
            summary = heuristic_summary
        elif heuristic_sentiment == "neutral":
            final_sentiment = "neutral"
            agreement_factor = 0.8 if scientific_sentiment == critical_sentiment else 0.6
            summary = heuristic_summary
        elif scientific_sentiment == critical_sentiment:
            final_sentiment = scientific_sentiment
            agreement_factor = 1.0
            summary = scientific.rationale if scientific else heuristic_summary
        elif disagreement_review is not None:
            final_sentiment = disagreement_review.sentiment
            agreement_factor = 0.74 if disagreement_review.sentiment in {scientific_sentiment, critical_sentiment} else 0.66
            summary = disagreement_review.rationale
        else:
            final_sentiment = "neutral"
            agreement_factor = 0.5
            summary = "Scientific and critical reviews disagreed, so the final sentiment was downgraded to neutral."

        if nlp_cloud_sentiment and heuristic_sentiment != "negative":
            can_upgrade_positive = nlp_cloud_sentiment != "positive" or source.evidenceScore >= 3 or source.sourceScore >= 2
            if final_sentiment == "neutral" and can_upgrade_positive:
                final_sentiment = nlp_cloud_sentiment
                agreement_factor = max(agreement_factor, 0.72 if nlp_cloud_sentiment != "neutral" else 0.6)
                if nlp_cloud_sentiment == "neutral":
                    summary = summary
                else:
                    summary = "NLP Cloud classification supported the evidence direction when the other signals were still ambiguous."
            elif nlp_cloud_sentiment == "negative" and final_sentiment == "positive":
                if "negative" in {scientific_sentiment, critical_sentiment} or source.citationIntegrity < 70 or source.evidenceScore < 4:
                    final_sentiment = "negative" if "negative" in {scientific_sentiment, critical_sentiment} else "neutral"
                    agreement_factor = min(agreement_factor, 0.66)
                    summary = "NLP Cloud and cross-check signals flagged that the source fails to cleanly support the claim as stated."
            elif nlp_cloud_sentiment == final_sentiment:
                agreement_factor = max(agreement_factor, 0.8)

        if (
            final_sentiment == "positive"
            and source.sourceQualityLabel == "general"
            and source.spamRiskScore >= 65
            and source.evidenceScore <= 2
        ):
            final_sentiment = "neutral"
            agreement_factor = min(agreement_factor, 0.62)
            summary = "The source leaned supportive, but low credibility and promotional risk kept it from counting as reliable support."

        clarity_factor = _clarity_factor(source, heuristic_sentiment)
        confidence_factor = _confidence_factor(source, agreement_factor, clarity_factor)
        source_weight = _source_weight(source)
        weighted_contribution = round(source_weight * _stance_score(final_sentiment) * confidence_factor, 3)

        evidence = None
        if source.evidence:
            evidence = source.evidence.model_copy(
                update={
                    "effectDirection": _effect_direction(final_sentiment),
                    "conclusion": summary[:220],
                }
            )

        updated.append(
            source.model_copy(
                update={
                    "sentimentScientific": scientific_sentiment,
                    "sentimentCritical": critical_sentiment,
                    "sentiment": final_sentiment,
                    "agreementFactor": agreement_factor,
                    "clarityFactor": clarity_factor,
                    "confidenceFactor": confidence_factor,
                    "sourceWeight": source_weight,
                    "weightedContribution": weighted_contribution,
                    "sentimentSummary": summary,
                    "evidence": evidence,
                }
            )
        )

    return updated
