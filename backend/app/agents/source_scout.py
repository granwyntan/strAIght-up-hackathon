from urllib.parse import urlparse
from uuid import uuid4

from ..core.scoring import EVIDENCE_TIER_TO_SCORE, SOURCE_BUCKET_TO_SCORE
from ..models import SourceAssessment
from ..tools.search import SearchDocument, infer_evidence_tier, infer_source_bucket, infer_stance, search


def _rank_source(document: SearchDocument, claim: str) -> tuple[int, int, int]:
    source_bucket = document.sourceBucket if document.sourceBucket else infer_source_bucket(document.domain)
    evidence_tier = document.evidenceTier if document.evidenceTier else infer_evidence_tier(document.title, document.snippet)
    stance = document.stance if document.stance != "unclear" else infer_stance(claim, document.snippet)
    stance_bonus = 1 if stance in {"supportive", "contradictory", "mixed"} else 0
    return (
        SOURCE_BUCKET_TO_SCORE[source_bucket],
        EVIDENCE_TIER_TO_SCORE[evidence_tier],
        stance_bonus,
    )


def scout_sources(claim: str, queries: list[str], source_urls: list[str], mode: str = "auto", desired_depth: str = "standard") -> list[SourceAssessment]:
    seen_urls: set[str] = set()
    discovered: list[SearchDocument] = []
    sources: list[SourceAssessment] = []
    max_sources = 50 if desired_depth == "deep" else 30
    query_budget = len(queries) if mode == "offline" else min(len(queries), 8 if desired_depth == "standard" else 12)

    for query in queries[:query_budget]:
        for result in search(query, mode=mode):
            if result.url in seen_urls:
                continue
            seen_urls.add(result.url)
            discovered.append(result)
            if mode != "offline" and len(discovered) >= max_sources * 3:
                break
        if mode != "offline" and len(discovered) >= max_sources * 3:
            break

    for result in sorted(discovered, key=lambda item: _rank_source(item, claim), reverse=True):
        source_bucket = result.sourceBucket if result.sourceBucket else infer_source_bucket(result.domain)
        evidence_tier = result.evidenceTier if result.evidenceTier else infer_evidence_tier(result.title, result.snippet)
        stance = result.stance if result.stance != "unclear" else infer_stance(claim, result.snippet)

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
                notes=[f"Discovered from query: {result.query}", f"Retrieved via {result.provider}."],
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
                notes=["Added directly by the user."],
            )
        )

    return sources[:max_sources]
