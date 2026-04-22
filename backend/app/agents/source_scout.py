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


QUALITY_LABEL_BY_BUCKET = {
    "tier_3_authority": "verified",
    "tier_2_scholarly": "established",
    "tier_1_blog": "general",
}


def _seeded_top_up_floor(desired_depth: str) -> int:
    if desired_depth == "quick":
        return 10
    if desired_depth == "deep":
        return 36
    return 22


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
    per_query_factor = {"quick": 1.9, "standard": 2.5, "deep": 3.3}
    ceiling_map = {
        "quick": max(settings.source_target_quick, 50),
        "standard": max(settings.source_target_standard, 84),
        "deep": max(settings.source_target_deep, 140),
    }
    per_query_target = round(len(queries) * per_query_factor.get(desired_depth, 2.4))
    manual_bonus = min(8, len(source_urls) * 2)
    ceiling = ceiling_map.get(desired_depth, 72)
    return max(configured, min(ceiling, per_query_target + manual_bonus))


def _discovery_target(source_target: int, desired_depth: str) -> int:
    multiplier = {"quick": 1.35, "standard": 1.45, "deep": 1.6}
    ceiling_map = {
        "quick": max(settings.source_target_quick + 16, 60),
        "standard": max(settings.source_target_standard + 24, 108),
        "deep": max(settings.source_target_deep + 40, 184),
    }
    ceiling = ceiling_map.get(desired_depth, max(source_target, 120))
    return max(source_target, min(ceiling, round(source_target * multiplier.get(desired_depth, 1.4))))


def _supplemental_deep_queries(claim: str, queries: list[str]) -> list[str]:
    claim_text = " ".join(claim.strip().split())
    seed = queries[0] if queries else claim_text
    candidates = [
        f"{claim_text} randomized trial",
        f"{claim_text} systematic review",
        f"{claim_text} meta analysis",
        f"site:pubmed.ncbi.nlm.nih.gov {seed}",
        f"site:nih.gov {seed}",
        f"site:cochranelibrary.com {seed}",
        f"site:jamanetwork.com {seed}",
        f"site:bmj.com {seed}",
        f"site:nejm.org {seed}",
        f"site:nature.com {seed}",
    ]
    deduped: list[str] = []
    for item in candidates:
        cleaned = " ".join(item.split()).strip()
        normalized = cleaned.lower()
        if cleaned and normalized not in {query.lower() for query in deduped} and normalized not in {query.lower() for query in queries}:
            deduped.append(cleaned)
    return deduped


def _singapore_authority_queries(claim: str, queries: list[str]) -> list[str]:
    source_text = " ".join([claim, *queries]).lower()
    singapore_markers = ("singapore", "sg", "hsa", "moh", "healthhub", "ncid", "healthier sg")
    if not any(marker in source_text for marker in singapore_markers):
        return []
    claim_text = " ".join(claim.strip().split())
    candidates = [
        f"site:moh.gov.sg {claim_text}",
        f"site:hsa.gov.sg {claim_text}",
        f"site:hpb.gov.sg {claim_text}",
        f"site:healthhub.sg {claim_text}",
        f"site:healthiersg.gov.sg {claim_text}",
        f"site:ncid.sg {claim_text}",
        f"site:ace-hta.gov.sg {claim_text}",
        f"site:healthxchange.sg {claim_text}",
        f"site:a-star.edu.sg {claim_text}",
        f"site:scri.edu.sg {claim_text}",
        f"site:nhic.sg {claim_text}",
        f"site:singhealthdukenus.com.sg {claim_text}",
        f"site:nuhs.edu.sg {claim_text}",
    ]
    deduped: list[str] = []
    seen: set[str] = set()
    for item in candidates:
        normalized = item.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(item)
    return deduped


def _emergency_live_queries(claim: str, queries: list[str], desired_depth: str) -> list[str]:
    claim_text = " ".join(claim.strip().split())
    seed = queries[0] if queries else claim_text
    candidates = [
        claim_text,
        seed,
        f"{claim_text} evidence",
        f"{claim_text} review",
        f"{claim_text} trial",
        f"{claim_text} guideline",
        f"site:pubmed.ncbi.nlm.nih.gov {claim_text}",
        f"site:pmc.ncbi.nlm.nih.gov {claim_text}",
        f"site:nih.gov {claim_text}",
        f"site:nccih.nih.gov {claim_text}",
        f"site:clinicaltrials.gov {claim_text}",
        f"site:cochranelibrary.com {claim_text}",
    ]
    if desired_depth != "quick":
        candidates.extend(
            [
                f"{claim_text} systematic review",
                f"{claim_text} meta analysis",
                f"{claim_text} randomized trial",
            ]
        )

    deduped: list[str] = []
    seen: set[str] = set()
    for item in candidates:
        cleaned = " ".join(item.split()).strip()
        normalized = cleaned.lower()
        if not cleaned or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(cleaned)
    return deduped[:10 if desired_depth == "quick" else 14]


def _diversify(documents: list[SearchDocument], claim: str, limit: int) -> list[SearchDocument]:
    ranked = sorted(documents, key=lambda item: _rank_source(item, claim), reverse=True)
    contradictory = [item for item in ranked if (item.stance if item.stance != "unclear" else infer_stance(claim, item.snippet)) == "contradictory"]
    mixed = [item for item in ranked if (item.stance if item.stance != "unclear" else infer_stance(claim, item.snippet)) == "mixed"]
    supportive = [item for item in ranked if (item.stance if item.stance != "unclear" else infer_stance(claim, item.snippet)) == "supportive"]
    unclear = [item for item in ranked if item not in contradictory and item not in mixed and item not in supportive]

    selected: list[SearchDocument] = []
    seen_urls: set[str] = set()
    domain_counts: dict[str, int] = {}
    target_negative = max(6, round(limit * 0.18))
    target_neutral = max(8, round(limit * 0.22))

    for bucket, bucket_limit in ((contradictory, target_negative), (mixed, target_neutral)):
        for item in bucket[:bucket_limit]:
            if item.url not in seen_urls and domain_counts.get(item.domain, 0) < 3:
                selected.append(item)
                seen_urls.add(item.url)
                domain_counts[item.domain] = domain_counts.get(item.domain, 0) + 1

    for bucket in (supportive, unclear, ranked):
        for item in bucket:
            if len(selected) >= limit:
                break
            if item.url in seen_urls:
                continue
            if domain_counts.get(item.domain, 0) >= 3:
                continue
            selected.append(item)
            seen_urls.add(item.url)
            domain_counts[item.domain] = domain_counts.get(item.domain, 0) + 1
        if len(selected) >= limit:
            break

    if len(selected) < limit:
        for item in ranked:
            if len(selected) >= limit:
                break
            if item.url in seen_urls:
                continue
            selected.append(item)
            seen_urls.add(item.url)

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
    effective_queries = [query for query in queries if query.strip()] or [claim]
    max_sources = _dynamic_source_target(effective_queries, source_urls, desired_depth)
    discovery_target = _discovery_target(max_sources, desired_depth)
    query_budget = _dynamic_query_budget(effective_queries, desired_depth)

    live_search_available = mode != "offline" and (
        settings.has_tavily or settings.has_serpapi or settings.has_exa
    )

    async def load_batches(*, allow_seeded_fallback: bool):
        return await gather_limited(
            effective_queries[:query_budget],
            lambda query: search(
                query,
                mode=mode,
                allow_seeded_fallback=allow_seeded_fallback,
                desired_depth=desired_depth,
            ),
            concurrency=settings.pipeline_max_concurrency,
        )

    async def load_emergency_batches(emergency_queries: list[str]):
        if not emergency_queries:
            return []
        emergency_concurrency = 2 if desired_depth == "deep" else 3
        return await gather_limited(
            emergency_queries,
            lambda query: search(
                query,
                mode=mode,
                allow_seeded_fallback=False,
                desired_depth=desired_depth,
            ),
            concurrency=emergency_concurrency,
        )

    discovered_batches = await load_batches(allow_seeded_fallback=mode == "offline" and not live_search_available)

    discovered: list[SearchDocument] = []
    for batch in discovered_batches:
        for result in batch:
            if result.url in seen_urls:
                continue
            seen_urls.add(result.url)
            discovered.append(result)

    if live_search_available and not discovered:
        emergency_queries = _emergency_live_queries(claim, effective_queries, desired_depth)
        emergency_batches = await load_emergency_batches(emergency_queries)
        for batch in emergency_batches:
            for result in batch:
                if result.url in seen_urls:
                    continue
                    seen_urls.add(result.url)
                    discovered.append(result)

    singapore_queries = _singapore_authority_queries(claim, effective_queries)
    if live_search_available and singapore_queries:
        singapore_batches = await load_emergency_batches(singapore_queries)
        for batch in singapore_batches:
            for result in batch:
                if result.url in seen_urls:
                    continue
                seen_urls.add(result.url)
                discovered.append(result)

    if desired_depth == "deep" and mode != "offline" and len(discovered) < 100:
        supplemental_queries = _supplemental_deep_queries(claim, effective_queries)
        supplemental_batches = await gather_limited(
            supplemental_queries,
            lambda query: search(query, mode=mode, allow_seeded_fallback=False, desired_depth=desired_depth),
            concurrency=min(settings.pipeline_max_concurrency, 3),
        )
        for batch in supplemental_batches:
            for result in batch:
                if result.url in seen_urls:
                    continue
                seen_urls.add(result.url)
                discovered.append(result)

    for result in _diversify(discovered, claim, discovery_target):
        source_bucket = result.sourceBucket if result.sourceBucket else infer_source_bucket(result.domain)
        evidence_tier = result.evidenceTier if result.evidenceTier else infer_evidence_tier(result.title, result.snippet)
        stance = result.stance if result.stance != "unclear" else infer_stance(claim, result.snippet)
        cache_status = result.cacheStatus if result.cacheStatus in {"live", "cached", "fallback"} else "live"
        if live_search_available and result.provider == "seeded":
            continue

        sources.append(
            SourceAssessment(
                id=str(uuid4()),
                title=result.title,
                url=result.url,
                discoveredUrl=result.url,
                resolvedUrl=result.url,
                evidenceUrl=result.url,
                domain=result.domain,
                publishedAt=result.publishedAt,
                author="",
                sourceName=result.domain,
                query=result.query,
                sourceProvider=result.provider,
                snippet=result.snippet,
                sourceBucket=source_bucket,
                sourceScore=SOURCE_BUCKET_TO_SCORE[source_bucket],
                journalType=result.journalType,
                evidenceTier=evidence_tier,
                evidenceScore=EVIDENCE_TIER_TO_SCORE[evidence_tier],
                stance=stance,
                cacheStatus=cache_status,
                sourceQualityLabel=QUALITY_LABEL_BY_BUCKET[source_bucket],
                sourceQualityReason="Initial credibility was inferred from the source domain tier before deeper validation.",
                sourceWeight=settings.source_weight_for_bucket(source_bucket),
                linkValidationSummary="This link is still at the discovery stage and has not passed the hard validation gate yet.",
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
                discoveredUrl=raw_url,
                resolvedUrl=raw_url,
                evidenceUrl=raw_url,
                domain=domain,
                publishedAt=None,
                author="",
                sourceName=domain,
                query="user supplied",
                sourceProvider="manual",
                snippet="Manual source added by the user for review.",
                sourceBucket=source_bucket,
                sourceScore=SOURCE_BUCKET_TO_SCORE[source_bucket],
                journalType="user supplied",
                evidenceTier=evidence_tier,
                evidenceScore=EVIDENCE_TIER_TO_SCORE[evidence_tier],
                stance="unclear",
                sourceQualityLabel=QUALITY_LABEL_BY_BUCKET[source_bucket],
                sourceQualityReason="Initial credibility was inferred from the domain because the source was provided manually.",
                sourceWeight=settings.source_weight_for_bucket(source_bucket),
                linkValidationSummary="This manual source still needs to pass the hard validation gate.",
                notes=["Added directly by the user."],
            )
        )

    return sources[:discovery_target]
