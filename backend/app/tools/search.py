from urllib.parse import urlparse

import httpx

from ..knowledge.base import GENERIC_AUTHORITY_SOURCES, KNOWLEDGE_SOURCES, KnowledgeSource
from ..models import EvidenceTier, SourceBucket, SourceStance
from ..settings import settings


class SearchDocument(KnowledgeSource):
    query: str
    provider: str = "seeded"


def _normalize(text: str) -> list[str]:
    return [token.strip(".,:;!?()[]").lower() for token in text.split() if len(token.strip(".,:;!?()[]")) > 2]


def _score_overlap(query: str, source: KnowledgeSource) -> int:
    query_tokens = set(_normalize(query))
    topic_tokens = set(token.lower() for token in source.topics)
    title_tokens = set(_normalize(source.title))
    snippet_tokens = set(_normalize(source.snippet))
    return len(query_tokens & topic_tokens) * 5 + len(query_tokens & title_tokens) * 3 + len(query_tokens & snippet_tokens)


def _result_rank(document: SearchDocument) -> tuple[int, int, int]:
    return (
        SOURCE_BUCKET_TO_SCORE[infer_source_bucket(document.domain)],
        EVIDENCE_TIER_TO_SCORE[infer_evidence_tier(document.title, document.snippet)],
        len(_normalize(document.snippet)),
    )


def _fallback_documents(query: str) -> list[SearchDocument]:
    target_count = 20
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

    return [SearchDocument(**item.model_dump(), query=query, provider="seeded") for item in matches]


def _search_tavily(query: str) -> list[SearchDocument]:
    if not settings.tavily_api_key:
        return []

    response = httpx.post(
        "https://api.tavily.com/search",
        json={
            "api_key": settings.tavily_api_key,
            "query": query,
            "max_results": settings.tavily_max_results,
            "search_depth": "advanced",
            "include_answer": False,
        },
        timeout=settings.search_timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json()
    results: list[SearchDocument] = []

    for index, item in enumerate(payload.get("results", []), start=1):
        url = item.get("url", "")
        if not url:
            continue
        domain = urlparse(url).netloc or "unknown"
        bucket = infer_source_bucket(domain)
        tier = infer_evidence_tier(item.get("title", ""), item.get("content", ""))
        results.append(
            SearchDocument(
                id=f"tavily-{index}-{abs(hash((query, url)))}",
                title=item.get("title", "Untitled source"),
                url=url,
                domain=domain,
                snippet=item.get("content", "") or item.get("snippet", ""),
                sourceBucket=bucket,
                journalType=tier.replace("_", " "),
                evidenceTier=tier,
                stance="unclear",
                topics=_normalize(query),
                citations=[],
                query=query,
                provider="tavily",
            )
        )
    return results


def _search_serpapi(query: str) -> list[SearchDocument]:
    if not settings.serpapi_api_key:
        return []

    response = httpx.get(
        "https://serpapi.com/search.json",
        params={
            "engine": settings.serpapi_engine,
            "q": query,
            "api_key": settings.serpapi_api_key,
            "num": settings.serpapi_num_results,
        },
        timeout=settings.search_timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json()
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
                snippet=snippet,
                sourceBucket=bucket,
                journalType=tier.replace("_", " "),
                evidenceTier=tier,
                stance="unclear",
                topics=_normalize(query),
                citations=[],
                query=query,
                provider="serpapi",
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


def search(query: str, mode: str = "auto") -> list[SearchDocument]:
    if mode == "offline":
        return _fallback_documents(query)

    live_documents: list[SearchDocument] = []
    errors: list[str] = []

    if settings.has_tavily:
        try:
            live_documents.extend(_search_tavily(query))
        except Exception as exc:
            errors.append(f"Tavily: {exc}")

    if settings.has_serpapi:
        try:
            live_documents.extend(_search_serpapi(query))
        except Exception as exc:
            errors.append(f"SerpAPI: {exc}")

    merged = _merge_documents(live_documents)
    if merged:
        return merged

    return _fallback_documents(query)


def infer_source_bucket(domain: str) -> SourceBucket:
    lowered = domain.lower()
    if any(lowered == token or lowered.endswith(f".{token}") for token in settings.verified_authorities_list):
        return "tier_3_authority"
    if any(lowered == token or lowered.endswith(f".{token}") for token in settings.established_sources_list):
        return "tier_2_scholarly"
    if any(lowered == token or lowered.endswith(f".{token}") for token in settings.general_sources_list):
        return "tier_1_blog"
    if any(token in lowered for token in ["jamanetwork", "bmj", "thelancet", "nejm", "nature", "sciencedirect", "springer", ".edu", ".org"]):
        return "tier_2_scholarly"
    return "tier_1_blog"


def infer_evidence_tier(title: str, snippet: str) -> EvidenceTier:
    text = f"{title} {snippet}".lower()
    if any(token in text for token in ["systematic review", "meta-analysis", "guideline", "consensus", "review"]):
        return "review"
    if any(token in text for token in ["randomized", "randomised", "trial", "placebo", "double-blind"]):
        return "rct"
    if any(token in text for token in ["cohort", "observational", "association", "cross-sectional", "case-control"]):
        return "observational"
    if "case report" in text:
        return "case_report"
    return "blog"


def infer_stance(claim: str, snippet: str) -> SourceStance:
    claim_tokens = set(_normalize(claim))
    lowered = snippet.lower()
    negative_phrases = [
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
    neutral_phrases = [
        "limited evidence",
        "mixed results",
        "inconclusive",
        "suggests",
        "possible link",
        "preliminary",
        "more research needed",
    ]
    if any(phrase in lowered for phrase in negative_phrases):
        return "contradictory"
    if any(phrase in lowered for phrase in neutral_phrases):
        return "mixed"
    if any(
        phrase in lowered
        for phrase in [
            "insufficient",
            "limited evidence",
            "not supported",
            "modest",
            "at best",
            "does not cure",
            "no significant effect",
            "no effect",
            "not effective",
            "no benefit",
            "fails to support",
            "no correlation",
            "not associated",
        ]
    ):
        return "contradictory"
    if any(
        phrase in lowered
        for phrase in [
            "mixed",
            "inconsistent",
            "varied",
            "plausible",
            "unclear",
            "more research",
            "inconclusive",
            "under investigation",
            "needs validation",
        ]
    ):
        return "mixed"
    if claim_tokens and any(token in lowered for token in claim_tokens):
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
