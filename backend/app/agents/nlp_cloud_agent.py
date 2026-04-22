from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Literal

import httpx
from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..models import SourceAssessment, SourceSentiment
from ..settings import settings


ClaimRelationship = Literal["causal", "correlational", "opinion"]

RELATIONSHIP_LABELS = {
    "causal claim": "causal",
    "correlational claim": "correlational",
    "opinionated claim": "opinion",
}

CLAIM_DOMAIN_LABELS = {
    "supplement or medication claim": "supplement",
    "nutrition or food claim": "nutrition",
    "condition or disease claim": "condition outcome",
    "general wellness claim": "general health claim",
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
    claimDomain: str | None = None


class AiClaimSignalsOutput(BaseModel):
    entities: list[str] = Field(default_factory=list)
    relationshipType: ClaimRelationship | None = None
    strength: int | None = Field(default=None, ge=1, le=5)
    claimDomain: str | None = None


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
        with ThreadPoolExecutor(max_workers=4) as executor:
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
            domain_future = executor.submit(
                _classify,
                f"Claim: {claim}\nContext: {context}".strip(),
                list(CLAIM_DOMAIN_LABELS),
            )
            entities_payload = entities_future.result()
            relationship_scores = relationship_future.result()
            strength_scores = strength_future.result()
            domain_scores = domain_future.result()
    except Exception:
        return None

    relationship_label = _best_label(relationship_scores)
    strength_label = _best_label(strength_scores)
    domain_label = _best_label(domain_scores)

    return NlpCloudClaimSignals(
        entities=_extract_entities(entities_payload),
        relationshipType=RELATIONSHIP_LABELS.get(relationship_label) if relationship_label else None,
        strength=STRENGTH_LABELS.get(strength_label) if strength_label else None,
        claimDomain=CLAIM_DOMAIN_LABELS.get(domain_label) if domain_label else None,
    )


def _ai_claim_signal_primary(claim: str, context: str) -> AiClaimSignalsOutput | None:
    return generate_structured_output(
        "research",
        (
            "You extract structured claim-analysis signals for a health misinformation workflow. "
            "Return JSON only with entities, relationshipType, strength, and claimDomain. "
            "Use relationshipType values causal, correlational, or opinion. "
            "Use strength from 1 to 5 where 5 is absolute wording."
        ),
        {
            "claim": claim,
            "context": context,
            "instructions": [
                "Extract the main medical or health entities only.",
                "Be conservative about causation.",
                "Claim domain should be a short phrase like supplement, nutrition, condition outcome, or general health claim.",
            ],
        },
        AiClaimSignalsOutput,
        preferred_providers=["openai", "gemini", "claude"],
    )


def _ai_claim_signal_checker(claim: str, context: str, draft: AiClaimSignalsOutput) -> AiClaimSignalsOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You audit a structured claim-analysis signal draft for a health-claim investigation. "
            "Return JSON only with entities, relationshipType, strength, and claimDomain."
        ),
        {
            "claim": claim,
            "context": context,
            "draft": draft.model_dump(),
            "instructions": [
                "Correct missing entities or overconfident causation labels.",
                "Do not inflate wording strength unless the claim is clearly absolute.",
            ],
        },
        AiClaimSignalsOutput,
        preferred_providers=["gemini", "openai", "claude"],
    )


def _ai_claim_signal_arbiter(
    claim: str,
    context: str,
    primary: AiClaimSignalsOutput,
    checker: AiClaimSignalsOutput,
) -> AiClaimSignalsOutput | None:
    return generate_structured_output(
        "consensus",
        (
            "You arbitrate a disagreement in structured claim-analysis signals for a health-claim workflow. "
            "Return JSON only with entities, relationshipType, strength, and claimDomain."
        ),
        {
            "claim": claim,
            "context": context,
            "primary": primary.model_dump(),
            "checker": checker.model_dump(),
            "instructions": [
                "Prefer the more conservative interpretation when the signals disagree.",
                "Keep the output short, structured, and faithful to the original claim.",
            ],
        },
        AiClaimSignalsOutput,
        preferred_providers=["openai", "gemini", "claude"],
    )


def _merge_claim_signals(
    base: NlpCloudClaimSignals | None,
    secondary: AiClaimSignalsOutput | None,
) -> NlpCloudClaimSignals | None:
    if base is None and secondary is None:
        return None
    entities = list(
        dict.fromkeys(
            [
                *(base.entities if base is not None else []),
                *(secondary.entities if secondary is not None else []),
            ]
        )
    )[:8]
    return NlpCloudClaimSignals(
        entities=entities,
        relationshipType=(secondary.relationshipType if secondary and secondary.relationshipType else base.relationshipType if base else None),
        strength=(secondary.strength if secondary and secondary.strength is not None else base.strength if base else None),
        claimDomain=(secondary.claimDomain if secondary and secondary.claimDomain else base.claimDomain if base else None),
    )


def refine_claim_signals(claim: str, context: str = "") -> NlpCloudClaimSignals | None:
    nlp_result = refine_claim_with_nlp_cloud(claim, context)
    primary = _ai_claim_signal_primary(claim, context)
    if primary is None:
        return nlp_result
    checker = _ai_claim_signal_checker(claim, context, primary)
    effective = checker or primary
    if checker is not None and (
        checker.relationshipType != primary.relationshipType
        or checker.strength != primary.strength
        or checker.claimDomain != primary.claimDomain
        or set(checker.entities) != set(primary.entities)
    ):
        arbiter = _ai_claim_signal_arbiter(claim, context, primary, checker)
        if arbiter is not None:
            effective = arbiter
    return _merge_claim_signals(nlp_result, effective)


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
