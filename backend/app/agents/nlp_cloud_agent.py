from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Literal

import httpx
from pydantic import BaseModel, Field

from ..models import SourceAssessment, SourceSentiment
from ..settings import settings


ClaimRelationship = Literal["causal", "correlational", "opinion"]

RELATIONSHIP_LABELS = {
    "causal claim": "causal",
    "correlational claim": "correlational",
    "opinionated claim": "opinion",
}

STRENGTH_LABELS = {
    "absolute wording": 5,
    "moderate wording": 3,
    "speculative wording": 1,
}

STANCE_LABELS = {
    "supports the claim": "positive",
    "neutral or mixed": "neutral",
    "contradicts or fails to support the claim": "negative",
}


class NlpCloudClaimSignals(BaseModel):
    entities: list[str] = Field(default_factory=list)
    relationshipType: ClaimRelationship | None = None
    strength: int | None = Field(default=None, ge=1, le=5)


def _headers() -> dict[str, str]:
    api_key = settings.nlpcloud_api_key
    if not api_key:
        return {}
    return {
        "Authorization": f"Token {api_key}",
        "Content-Type": "application/json",
    }


def _endpoint(model: str, route: str) -> str:
    return f"{settings.nlpcloud_api_base_url.rstrip('/')}/{model}/{route.lstrip('/')}"


def _post(model: str, route: str, payload: dict[str, object]) -> dict | list:
    if not settings.has_nlpcloud:
        return {}
    response = httpx.post(
        _endpoint(model, route),
        headers=_headers(),
        json=payload,
        timeout=settings.nlpcloud_timeout_seconds,
    )
    response.raise_for_status()
    return response.json()


def _classify(text: str, labels: list[str]) -> dict[str, float]:
    if not settings.has_nlpcloud or not text.strip():
        return {}
    payload = _post(
        settings.nlpcloud_classification_model,
        "classification",
        {
            "text": text,
            "labels": labels,
            "multi_class": True,
        },
    )
    if not isinstance(payload, dict):
        return {}

    raw_labels = payload.get("labels", []) or []
    raw_scores = payload.get("scores", []) or []
    scores: dict[str, float] = {}
    for label, score in zip(raw_labels, raw_scores, strict=False):
        try:
            scores[str(label)] = float(score)
        except (TypeError, ValueError):
            continue
    return scores


def _best_label(scores: dict[str, float], threshold: float = 0.45) -> str | None:
    if not scores:
        return None
    label, score = max(scores.items(), key=lambda item: item[1])
    if score < threshold:
        return None
    return label


def _extract_entities(payload: dict | list) -> list[str]:
    entries = payload if isinstance(payload, list) else payload.get("entities", []) if isinstance(payload, dict) else []
    entities: list[str] = []
    for item in entries:
        if isinstance(item, dict):
            text = str(item.get("text", "")).strip()
        else:
            text = str(item).strip()
        lowered = text.lower()
        if text and lowered not in {entity.lower() for entity in entities}:
            entities.append(text)
    return entities[:8]


def refine_claim_with_nlp_cloud(claim: str, context: str = "") -> NlpCloudClaimSignals | None:
    if not settings.has_nlpcloud:
        return None

    try:
        with ThreadPoolExecutor(max_workers=3) as executor:
            entities_future = executor.submit(
                _post,
                settings.nlpcloud_entity_model,
                "entities",
                {
                    "text": claim,
                },
            )
            relationship_future = executor.submit(
                _classify,
                f"Claim: {claim}\nContext: {context}".strip(),
                list(RELATIONSHIP_LABELS),
            )
            strength_future = executor.submit(
                _classify,
                claim,
                list(STRENGTH_LABELS),
            )
            entities_payload = entities_future.result()
            relationship_scores = relationship_future.result()
            strength_scores = strength_future.result()
    except Exception:
        return None

    relationship_label = _best_label(relationship_scores)
    strength_label = _best_label(strength_scores)

    return NlpCloudClaimSignals(
        entities=_extract_entities(entities_payload),
        relationshipType=RELATIONSHIP_LABELS.get(relationship_label) if relationship_label else None,
        strength=STRENGTH_LABELS.get(strength_label) if strength_label else None,
    )


def _classify_source_sentiment(claim: str, source: SourceAssessment) -> tuple[str, SourceSentiment] | None:
    source_excerpt = (source.extractedText or source.snippet or source.title).strip()
    if not source_excerpt:
        return None

    try:
        scores = _classify(
            f"Claim: {claim}\nSource evidence: {source_excerpt[:1200]}",
            list(STANCE_LABELS),
        )
    except Exception:
        return None

    label = _best_label(scores)
    if not label:
        return None

    sentiment = STANCE_LABELS.get(label)
    if not sentiment:
        return None
    return source.id, sentiment


def refine_source_sentiments_with_nlp_cloud(claim: str, sources: list[SourceAssessment]) -> dict[str, SourceSentiment]:
    if not settings.has_nlpcloud:
        return {}

    results: dict[str, SourceSentiment] = {}
    limit = max(0, settings.nlpcloud_max_stance_refinements)
    candidates = [source for source in sources[:limit] if (source.extractedText or source.snippet or source.title).strip()]
    if not candidates:
        return results

    max_workers = max(2, min(6, len(candidates)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(_classify_source_sentiment, claim, source) for source in candidates]
        for future in as_completed(futures):
            try:
                outcome = future.result()
            except Exception:
                continue
            if outcome is None:
                continue
            source_id, sentiment = outcome
            results[source_id] = sentiment

    return results
