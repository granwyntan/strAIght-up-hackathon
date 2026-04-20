from urllib.parse import urlparse
from uuid import uuid4

from ..async_utils import gather_limited
from ..models import SourceAssessment
from ..settings import settings
from ..tools.search import (
    EVIDENCE_TIER_TO_SCORE,
    SOURCE_BUCKET_TO_SCORE,
    SearchDocument,
    infer_evidence_tier,
    infer_source_bucket,
    infer_stance,
    search,
)


def _rank_source(document: SearchDocument, claim: str) -> tuple[int, int, int, int]:
    source_bucket = document.sourceBucket if document.sourceBucket else infer_source_bucket(document.domain)
    evidence_tier = document.evidenceTier if document.evidenceTier else infer_evidence_tier(document.title, document.snippet)
    stance = document.stance if document.stance != "unclear" else infer_stance(claim, document.snippet)
    stance_bonus = {"supportive": 1, "mixed": 1, "contradictory": 2, "unclear": 0}[stance]
    return (
        SOURCE_BUCKET_TO_SCORE[source_bucket],
        EVIDENCE_TIER_TO_SCORE[evidence_tier],
        stance_bonus,
        len((document.snippet or "").split()),
    )


def _query_budget(desired_depth: str) -> int:
    if desired_depth == "quick":
        return settings.search_query_budget_quick
    if desired_depth == "deep":
        return settings.search_query_budget_deep
    return settings.search_query_budget_standard


def _source_target(desired_depth: str) -> int:
    if desired_depth == "quick":
        return settings.source_target_quick
    if desired_depth == "deep":
        return settings.source_target_deep
    return settings.source_target_standard


def _dynamic_query_budget(queries: list[str], desired_depth: str) -> int:
    if not queries:
        return 0
    configured = _query_budget(desired_depth)
    scale_map = {"quick": 0.68, "standard": 0.75, "deep": 0.82}
    floor_map = {"quick": 8, "standard": 10, "deep": 14}
    scaled = round(len(queries) * scale_map.get(desired_depth, 0.75))
    floor = floor_map.get(desired_depth, 10)
    return min(len(queries), max(floor, configured, scaled))


def _dynamic_source_target(queries: list[str], source_urls: list[str], desired_depth: str) -> int:
    configured = _source_target(desired_depth)
    per_query_factor = {"quick": 1.9, "standard": 2.4, "deep": 3.1}
    ceiling_map = {"quick": 30, "standard": 72, "deep": 128}
    per_query_target = round(len(queries) * per_query_factor.get(desired_depth, 2.4))
    manual_bonus = min(8, len(source_urls) * 2)
    ceiling = ceiling_map.get(desired_depth, 72)
    return max(configured, min(ceiling, per_query_target + manual_bonus))


def _diversify(documents: list[SearchDocument], claim: str, limit: int) -> list[SearchDocument]:
    ranked = sorted(documents, key=lambda item: _rank_source(item, claim), reverse=True)
    contradictory = [item for item in ranked if (item.stance if item.stance != "unclear" else infer_stance(claim, item.snippet)) == "contradictory"]
    mixed = [item for item in ranked if (item.stance if item.stance != "unclear" else infer_stance(claim, item.snippet)) == "mixed"]
    supportive = [item for item in ranked if (item.stance if item.stance != "unclear" else infer_stance(claim, item.snippet)) == "supportive"]
    unclear = [item for item in ranked if item not in contradictory and item not in mixed and item not in supportive]

    selected: list[SearchDocument] = []
    seen_urls: set[str] = set()
    target_negative = max(6, round(limit * 0.18))
    target_neutral = max(8, round(limit * 0.22))

    for bucket, bucket_limit in ((contradictory, target_negative), (mixed, target_neutral)):
        for item in bucket[:bucket_limit]:
            if item.url not in seen_urls:
                selected.append(item)
                seen_urls.add(item.url)

    for bucket in (supportive, unclear, ranked):
        for item in bucket:
            if len(selected) >= limit:
                break
            if item.url in seen_urls:
                continue
            selected.append(item)
            seen_urls.add(item.url)
        if len(selected) >= limit:
            break

    return selected[:limit]


async def scout_sources(
    claim: str,
    queries: list[str],
    source_urls: list[str],
    mode: str = "auto",
    desired_depth: str = "standard",
) -> list[SourceAssessment]:
    seen_urls: set[str] = set()
    sources: list[SourceAssessment] = []
    max_sources = _dynamic_source_target(queries, source_urls, desired_depth)
    query_budget = _dynamic_query_budget(queries, desired_depth)

    discovered_batches = await gather_limited(
        queries[:query_budget],
        lambda query: search(query, mode=mode),
        concurrency=settings.pipeline_max_concurrency,
    )

    discovered: list[SearchDocument] = []
    for batch in discovered_batches:
        for result in batch:
            if result.url in seen_urls:
                continue
            seen_urls.add(result.url)
            discovered.append(result)

    for result in _diversify(discovered, claim, max_sources):
        source_bucket = result.sourceBucket if result.sourceBucket else infer_source_bucket(result.domain)
        evidence_tier = result.evidenceTier if result.evidenceTier else infer_evidence_tier(result.title, result.snippet)
        stance = result.stance if result.stance != "unclear" else infer_stance(claim, result.snippet)
        cache_status = result.cacheStatus if result.cacheStatus in {"live", "cached", "fallback"} else "live"

        sources.append(
            SourceAssessment(
                id=str(uuid4()),
                title=result.title,
                url=result.url,
                domain=result.domain,
                sourceName=result.domain,
                query=result.query,
                snippet=result.snippet,
                sourceBucket=source_bucket,
                sourceScore=SOURCE_BUCKET_TO_SCORE[source_bucket],
                journalType=result.journalType,
                evidenceTier=evidence_tier,
                evidenceScore=EVIDENCE_TIER_TO_SCORE[evidence_tier],
                stance=stance,
                cacheStatus=cache_status,
                sourceWeight=settings.source_weight_for_bucket(source_bucket),
                notes=[f"Discovered from query: {result.query}", f"Retrieved via {result.provider} ({cache_status})."],
            )
        )

    for raw_url in source_urls:
        if raw_url in seen_urls:
            continue
        domain = urlparse(raw_url).netloc or "manual-source"
        source_bucket = infer_source_bucket(domain)
        evidence_tier = "blog" if source_bucket == "tier_1_blog" else "review"
        sources.append(
            SourceAssessment(
                id=str(uuid4()),
                title=f"User provided source from {domain}",
                url=raw_url,
                domain=domain,
                sourceName=domain,
                query="user supplied",
                snippet="Manual source added by the user for review.",
                sourceBucket=source_bucket,
                sourceScore=SOURCE_BUCKET_TO_SCORE[source_bucket],
                journalType="user supplied",
                evidenceTier=evidence_tier,
                evidenceScore=EVIDENCE_TIER_TO_SCORE[evidence_tier],
                stance="unclear",
                sourceWeight=settings.source_weight_for_bucket(source_bucket),
                notes=["Added directly by the user."],
            )
        )

    return sources[:max_sources]
