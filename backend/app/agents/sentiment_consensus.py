from pydantic import BaseModel, Field

from ..ai import ProviderName, generate_structured_list
from ..models import EffectDirection, SourceAssessment, SourceSentiment
from ..presentation import classify_source_sentiment


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
            "Be negation-aware and conservative with causation claims."
        ),
        {
            "claim": claim,
            "sources": [
                {
                    "id": source.id,
                    "title": source.title,
                    "snippet": source.snippet,
                    "extractedText": source.extractedText[:1200],
                    "sourceBucket": source.sourceBucket,
                    "evidenceTier": source.evidenceTier,
                    "stance": source.stance,
                }
                for source in sources
            ],
            "instructions": [
                "Return positive only for genuine support, negative for contradiction, and neutral for mixed or uncertain evidence.",
                "Treat disagreement, unclear mechanism, or weak causal logic conservatively.",
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


def apply_sentiment_consensus(claim: str, sources: list[SourceAssessment]) -> list[SourceAssessment]:
    scientific_map = _batch_sentiment_review(claim, sources, ["gemini"], "research", "the scientific evidence interpreter")
    critical_map = _batch_sentiment_review(claim, sources, ["xai"], "reasoning", "the contradiction-focused critical reviewer")

    updated: list[SourceAssessment] = []
    for source in sources:
        heuristic_sentiment, heuristic_summary = classify_source_sentiment(source)
        scientific = scientific_map.get(source.id)
        critical = critical_map.get(source.id)

        scientific_sentiment = scientific.sentiment if scientific else heuristic_sentiment
        critical_sentiment = critical.sentiment if critical else heuristic_sentiment
        agreement_factor = 1.0 if scientific_sentiment == critical_sentiment else 0.5
        final_sentiment: SourceSentiment = scientific_sentiment if agreement_factor == 1.0 else "neutral"

        if agreement_factor == 1.0:
            summary = scientific.rationale if scientific else heuristic_summary
        else:
            summary = "Scientific and critical reviews disagreed, so the final sentiment was downgraded to neutral."

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
                    "sentimentSummary": summary,
                    "evidence": evidence,
                }
            )
        )

    return updated
