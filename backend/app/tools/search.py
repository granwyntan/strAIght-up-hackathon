import asyncio
from urllib.parse import urlparse

import httpx

from .. import repository
from ..cache import cache_key, get_json, set_json
from ..knowledge.base import GENERIC_AUTHORITY_SOURCES, KNOWLEDGE_SOURCES, KnowledgeSource
from ..models import EvidenceTier, SourceBucket, SourceStance
from ..settings import settings


class SearchDocument(KnowledgeSource):
    query: str
    provider: str = "seeded"
    cacheStatus: str = "live"


SOURCE_BUCKET_TO_SCORE = {
    "tier_1_blog": 1,
    "tier_2_scholarly": 2,
    "tier_3_authority": 3,
}

EVIDENCE_TIER_TO_SCORE = {
    "blog": 1,
    "case_report": 2,
    "observational": 3,
    "rct": 4,
    "review": 5,
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
    "no significant effect",
]

NEUTRAL_PHRASES = [
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

POSITIVE_PHRASES = [
    "improves",
    "effective",
    "associated with improvement",
    "beneficial",
    "benefit",
    "health benefit",
    "health benefits",
    "supports health",
    "positive health outcomes",
    "associated with positive health outcomes",
    "better health outcomes",
    "healthier",
    "reduced symptoms",
    "supports",
]

TOKEN_ALIASES = {
    "healthy": "health",
    "healthier": "health",
    "healthiest": "health",
    "beneficial": "benefit",
    "benefits": "benefit",
    "improves": "improve",
    "improved": "improve",
    "improvement": "improve",
    "associated": "association",
    "associations": "association",
    "outcomes": "outcome",
    "hydration": "hydrate",
}


def _normalize_token(token: str) -> str:
    normalized = token.strip(".,:;!?()[]\"'").lower()
    if normalized.endswith("ies") and len(normalized) > 4:
        normalized = normalized[:-3] + "y"
    elif normalized.endswith("s") and len(normalized) > 4:
        normalized = normalized[:-1]
    return TOKEN_ALIASES.get(normalized, normalized)


def _normalize(text: str) -> list[str]:
    normalized_tokens: list[str] = []
    for token in text.split():
        normalized = _normalize_token(token)
        if len(normalized) > 2:
            normalized_tokens.append(normalized)
    return normalized_tokens


def _score_overlap(query: str, source: KnowledgeSource) -> int:
    query_tokens = set(_normalize(query))
    topic_tokens = set(token.lower() for token in source.topics)
    title_tokens = set(_normalize(source.title))
    snippet_tokens = set(_normalize(source.snippet))
    return len(query_tokens & topic_tokens) * 5 + len(query_tokens & title_tokens) * 3 + len(query_tokens & snippet_tokens)


def _result_rank(document: SearchDocument) -> tuple[int, int, int, int]:
    return (
        SOURCE_BUCKET_TO_SCORE[infer_source_bucket(document.domain)],
        EVIDENCE_TIER_TO_SCORE[infer_evidence_tier(document.title, document.snippet)],
        1 if document.stance == "contradictory" else 0,
        len(_normalize(document.snippet)),
    )


def _published_at_from_payload(*candidates: object) -> str | None:
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _query_is_trending(query: str) -> bool:
    lowered = query.lower()
    return any(token in lowered for token in ["today", "latest", "new study", "news", "2025", "2026", "recent"])


def _search_cache_ttl(query: str) -> int:
    return settings.search_cache_ttl_trending_seconds if _query_is_trending(query) else settings.search_cache_ttl_stable_seconds


def _fallback_documents(query: str) -> list[SearchDocument]:
    target_count = 36
    ranked = sorted(KNOWLEDGE_SOURCES, key=lambda item: _score_overlap(query, item), reverse=True)
    matches = [item for item in ranked if _score_overlap(query, item) > 0][:target_count]
    if len(matches) < target_count:
        seen_ids = {item.id for item in matches}
        remainder = [candidate for candidate in [*ranked, *GENERIC_AUTHORITY_SOURCES] if candidate.id not in seen_ids]
        if remainder:
            offset = abs(hash(query)) % len(remainder)
            remainder = remainder[offset:] + remainder[:offset]
        for candidate in remainder:
            if candidate.id in seen_ids:
                continue
            matches.append(candidate)
            seen_ids.add(candidate.id)
            if len(matches) >= target_count:
                break

    return [SearchDocument(**item.model_dump(), query=query, provider="seeded", cacheStatus="fallback") for item in matches]


def _provider_result_cap(provider: str, desired_depth: str) -> int:
    if provider == "tavily":
        configured = settings.tavily_max_results
    elif provider == "serpapi":
        configured = settings.serpapi_num_results
    else:
        configured = settings.exa_max_results
    configured = configured if configured > 0 else 24
    if provider == "tavily":
        configured = min(configured, 20)
    elif provider == "exa":
        configured = min(configured, 20)
    if desired_depth == "quick":
        return min(configured, 10)
    if desired_depth == "deep":
        return max(configured, 20 if provider in {"tavily", "exa"} else 24)
    return min(max(configured, 16), 18)


def _search_tavily_payload(query: str, desired_depth: str) -> dict:
    response = httpx.post(
        "https://api.tavily.com/search",
        json={
            "api_key": settings.tavily_api_key,
            "query": query,
            "max_results": _provider_result_cap("tavily", desired_depth),
            "search_depth": "advanced",
            "include_answer": False,
            "topic": "news" if _query_is_trending(query) else "general",
        },
        timeout=settings.search_timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


async def _search_tavily(query: str, desired_depth: str) -> list[SearchDocument]:
    if not settings.tavily_api_key:
        return []

    payload = await asyncio.to_thread(_search_tavily_payload, query, desired_depth)

    results: list[SearchDocument] = []
    for index, item in enumerate(payload.get("results", []), start=1):
        url = item.get("url", "")
        if not url:
            continue
        domain = urlparse(url).netloc or "unknown"
        bucket = infer_source_bucket(domain)
        tier = infer_evidence_tier(item.get("title", ""), item.get("content", ""))
        snippet = item.get("content", "") or item.get("snippet", "")
        results.append(
            SearchDocument(
                id=f"tavily-{index}-{abs(hash((query, url)))}",
                title=item.get("title", "Untitled source"),
                url=url,
                domain=domain,
                publishedAt=_published_at_from_payload(
                    item.get("published_date"),
                    item.get("publishedDate"),
                    item.get("date"),
                ),
                snippet=snippet,
                sourceBucket=bucket,
                journalType=tier.replace("_", " "),
                evidenceTier=tier,
                stance=infer_stance(query, snippet),
                topics=_normalize(query),
                citations=[],
                query=query,
                provider="tavily",
                cacheStatus="live",
            )
        )
    return results


def _search_serpapi_payload(query: str, desired_depth: str) -> dict:
    response = httpx.get(
        "https://serpapi.com/search.json",
        params={
            "engine": settings.serpapi_engine,
            "q": query,
            "api_key": settings.serpapi_api_key,
            "num": _provider_result_cap("serpapi", desired_depth),
        },
        timeout=settings.search_timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


async def _search_serpapi(query: str, desired_depth: str) -> list[SearchDocument]:
    if not settings.serpapi_api_key:
        return []

    payload = await asyncio.to_thread(_search_serpapi_payload, query, desired_depth)

    results: list[SearchDocument] = []
    for index, item in enumerate(payload.get("organic_results", []), start=1):
        url = item.get("link", "")
        if not url:
            continue
        domain = urlparse(url).netloc or "unknown"
        title = item.get("title", "Untitled source")
        snippet = item.get("snippet", "") or item.get("rich_snippet", {}).get("top", {}).get("detected_extensions", {}).get("summary", "")
        bucket = infer_source_bucket(domain)
        tier = infer_evidence_tier(title, snippet)
        results.append(
            SearchDocument(
                id=f"serpapi-{index}-{abs(hash((query, url)))}",
                title=title,
                url=url,
                domain=domain,
                publishedAt=_published_at_from_payload(
                    item.get("date"),
                    item.get("published_date"),
                    item.get("publishedDate"),
                ),
                snippet=snippet,
                sourceBucket=bucket,
                journalType=tier.replace("_", " "),
                evidenceTier=tier,
                stance=infer_stance(query, snippet),
                topics=_normalize(query),
                citations=[],
                query=query,
                provider="serpapi",
                cacheStatus="live",
            )
        )
    return results


def _search_exa_payload(query: str, desired_depth: str) -> dict:
    response = httpx.post(
        "https://api.exa.ai/search",
        headers={
            "x-api-key": settings.exa_api_key or "",
            "Content-Type": "application/json",
        },
        json={
            "query": query,
            "numResults": _provider_result_cap("exa", desired_depth),
            "type": "auto",
            "contents": {
                "text": {
                    "maxCharacters": 600,
                }
            },
        },
        timeout=settings.search_timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


async def _search_exa(query: str, desired_depth: str) -> list[SearchDocument]:
    if not settings.exa_api_key:
        return []

    payload = await asyncio.to_thread(_search_exa_payload, query, desired_depth)

    results: list[SearchDocument] = []
    for index, item in enumerate(payload.get("results", []), start=1):
        url = item.get("url", "")
        if not url:
            continue
        domain = urlparse(url).netloc or "unknown"
        title = item.get("title", "Untitled source")
        snippet = item.get("text", "") or item.get("highlights", [{}])[0].get("text", "") if item.get("highlights") else ""
        bucket = infer_source_bucket(domain)
        tier = infer_evidence_tier(title, snippet)
        results.append(
            SearchDocument(
                id=f"exa-{index}-{abs(hash((query, url)))}",
                title=title,
                url=url,
                domain=domain,
                publishedAt=_published_at_from_payload(
                    item.get("publishedDate"),
                    item.get("published_date"),
                ),
                snippet=snippet,
                sourceBucket=bucket,
                journalType=tier.replace("_", " "),
                evidenceTier=tier,
                stance=infer_stance(query, snippet),
                topics=_normalize(query),
                citations=[],
                query=query,
                provider="exa",
                cacheStatus="live",
            )
        )
    return results


def _merge_documents(documents: list[SearchDocument]) -> list[SearchDocument]:
    by_url: dict[str, SearchDocument] = {}
    for document in documents:
        existing = by_url.get(document.url)
        if existing is None or _result_rank(document) > _result_rank(existing):
            by_url[document.url] = document
    return sorted(by_url.values(), key=_result_rank, reverse=True)


async def search(query: str, mode: str = "auto", allow_seeded_fallback: bool = True, desired_depth: str = "standard") -> list[SearchDocument]:
    if mode == "offline":
        return _fallback_documents(query)

    live_search_expected = settings.has_tavily or settings.has_serpapi or settings.has_exa
    if live_search_expected:
        allow_seeded_fallback = False

    key = cache_key("search", mode, desired_depth, query.strip().lower())
    cached_payload = get_json("search", key)
    if cached_payload is not None:
        cached_documents = [SearchDocument.model_validate({**item, "cacheStatus": "cached"}) for item in cached_payload]
        cached_seeded = any(item.provider == "seeded" for item in cached_documents)
        if not (cached_seeded and not allow_seeded_fallback):
            return cached_documents

    async def load_tavily() -> list[SearchDocument]:
        if not settings.has_tavily:
            return []
        try:
            return await _search_tavily(query, desired_depth)
        except Exception:
            return []

    async def load_serpapi() -> list[SearchDocument]:
        if not settings.has_serpapi:
            return []
        try:
            return await _search_serpapi(query, desired_depth)
        except Exception:
            return []

    async def load_exa() -> list[SearchDocument]:
        if not settings.has_exa:
            return []
        try:
            return await _search_exa(query, desired_depth)
        except Exception:
            return []

    tavily_results, serpapi_results, exa_results = await asyncio.gather(
        load_tavily(),
        load_serpapi(),
        load_exa(),
    )
    live_documents = [*tavily_results, *serpapi_results, *exa_results]

    merged = _merge_documents(live_documents)
    if merged:
        set_json("search", key, [item.model_dump() for item in merged], _search_cache_ttl(query))
        return merged

    if not allow_seeded_fallback:
        return []

    fallback = _fallback_documents(query)
    set_json("search", key, [item.model_dump() for item in fallback], min(120, _search_cache_ttl(query)))
    return fallback


def infer_source_bucket(domain: str) -> SourceBucket:
    lowered = domain.lower()
    if any(lowered == token or lowered.endswith(f".{token}") for token in settings.verified_authorities_list):
        return "tier_3_authority"
    if any(lowered == token or lowered.endswith(f".{token}") for token in settings.established_sources_list):
        return "tier_2_scholarly"
    if any(lowered == token or lowered.endswith(f".{token}") for token in settings.general_sources_list):
        return "tier_1_blog"
    learned_bucket = repository.lookup_source_bucket(lowered)
    if learned_bucket in {"tier_3_authority", "tier_2_scholarly", "tier_1_blog"}:
        return learned_bucket
    if any(token in lowered for token in ["jamanetwork", "bmj", "thelancet", "nejm", "nature", "sciencedirect", "springer", ".edu", ".gov", ".org"]):
        return "tier_2_scholarly"
    return "tier_1_blog"


def infer_evidence_tier(title: str, snippet: str) -> EvidenceTier:
    text = f"{title} {snippet}".lower()
    if any(token in text for token in ["systematic review", "meta-analysis", "meta analysis", "guideline", "consensus", "review"]):
        return "review"
    if any(token in text for token in ["randomized", "randomised", "trial", "placebo", "double-blind", "double blind"]):
        return "rct"
    if any(token in text for token in ["cohort", "observational", "association", "cross-sectional", "cross sectional", "case-control", "case control"]):
        return "observational"
    if "case report" in text:
        return "case_report"
    return "blog"


def infer_stance(claim: str, snippet: str) -> SourceStance:
    lowered = snippet.lower()
    if any(phrase in lowered for phrase in NEGATIVE_PHRASES):
        return "contradictory"
    if any(phrase in lowered for phrase in NEUTRAL_PHRASES):
        return "mixed"

    claim_tokens = set(_normalize(claim))
    snippet_tokens = set(_normalize(snippet))
    token_overlap = len(claim_tokens & snippet_tokens)
    health_claim = bool({"health", "healthy", "wellness", "benefit"} & claim_tokens)
    if health_claim and token_overlap >= 1 and any(
        phrase in lowered
        for phrase in [
            "positive health outcomes",
            "associated with positive health outcomes",
            "better health outcomes",
            "health benefits",
            "supports health",
            "healthy choice",
        ]
    ):
        return "supportive"
    if token_overlap >= 2 and any(phrase in lowered for phrase in POSITIVE_PHRASES):
        return "supportive"
    return "unclear"


def resolve_citation(ref_id: str) -> KnowledgeSource | None:
    for source in KNOWLEDGE_SOURCES + GENERIC_AUTHORITY_SOURCES:
        if source.id == ref_id:
            return source
    return None


def resolve_source_by_url(url: str) -> KnowledgeSource | None:
    for source in KNOWLEDGE_SOURCES + GENERIC_AUTHORITY_SOURCES:
        if source.url == url:
            return source
    return None
