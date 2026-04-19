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
    return settings.source_weight_for_bucket(source.sourceBucket)


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
    ambiguous_sources = [source for source in sources if source.stance in {"mixed", "unclear"} or source.evidenceScore >= 3]
    nlp_cloud_task = asyncio.to_thread(refine_source_sentiments_with_nlp_cloud, claim, ambiguous_sources) if settings.has_nlpcloud else None
    if nlp_cloud_task is not None:
        scientific_map, critical_map, nlp_cloud_map = await asyncio.gather(scientific_task, critical_task, nlp_cloud_task)
    else:
        scientific_map, critical_map = await asyncio.gather(scientific_task, critical_task)
        nlp_cloud_map = {}

    updated: list[SourceAssessment] = []
    for source in sources:
        heuristic_sentiment, heuristic_summary = classify_source_sentiment(source)
        scientific = scientific_map.get(source.id)
        critical = critical_map.get(source.id)
        nlp_cloud_sentiment = nlp_cloud_map.get(source.id)

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
            elif nlp_cloud_sentiment == final_sentiment:
                agreement_factor = max(agreement_factor, 0.8)

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
