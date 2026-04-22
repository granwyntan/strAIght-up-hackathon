import asyncio

from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..async_utils import gather_limited
from ..core.scoring import EVIDENCE_TIER_TO_SCORE, SOURCE_BUCKET_TO_SCORE
from ..models import CitationAssessment, SourceAssessment
from ..settings import settings
from ..tools.search import infer_evidence_tier, infer_source_bucket, infer_stance, resolve_citation, resolve_source_by_url


class CitationReviewOutput(BaseModel):
    citationIntegrity: int = Field(ge=0, le=100)
    stance: str = Field(min_length=3, max_length=32)
    note: str = Field(min_length=10, max_length=400)


def _llm_citation_review(claim: str, source: SourceAssessment, resolved_citations: list[CitationAssessment]) -> CitationReviewOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You are a citation auditor for health-claim investigations. "
            "Return JSON only with citationIntegrity, stance, and note. "
            "Judge how well the source's support appears to match the claim and whether its reference chain looks dependable."
        ),
        {
            "claim": claim,
            "source": {
                "title": source.title,
                "url": source.url,
                "domain": source.domain,
                "snippet": source.snippet,
                "sourceBucket": source.sourceBucket,
                "evidenceTier": source.evidenceTier,
                "query": source.query,
            },
            "resolved_citations": [citation.model_dump() for citation in resolved_citations],
            "instructions": [
                "Use lower scores when the source is promotional, vague, or light on real references.",
                "Use higher scores when citations are strong reviews, RCTs, or authoritative guidance that actually address the claim.",
                "Set stance to supportive, mixed, contradictory, or unclear.",
            ],
        },
        CitationReviewOutput,
    )


def _llm_citation_check(
    claim: str,
    source: SourceAssessment,
    resolved_citations: list[CitationAssessment],
    draft_review: CitationReviewOutput,
) -> CitationReviewOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You are the checker for a citation-audit stage in a health-claim investigation. "
            "Return JSON only with citationIntegrity, stance, and note. "
            "Verify whether the draft review matches the citation chain and the source's apparent relationship to the claim."
        ),
        {
            "claim": claim,
            "source": {
                "title": source.title,
                "url": source.url,
                "domain": source.domain,
                "snippet": source.snippet,
                "sourceBucket": source.sourceBucket,
                "evidenceTier": source.evidenceTier,
                "query": source.query,
            },
            "resolved_citations": [citation.model_dump() for citation in resolved_citations],
            "draft_review": draft_review.model_dump(),
            "instructions": [
                "Keep the stance limited to supportive, mixed, contradictory, or unclear.",
                "Use lower integrity when the citation chain is weak, broken, or generic.",
                "Use higher integrity when the chain includes strong guidance, reviews, or trials that actually address the claim.",
            ],
        },
        CitationReviewOutput,
        preferred_providers=["openai", "claude", "gemini"],
    )


def _audit_one(claim: str, index: int, source: SourceAssessment) -> SourceAssessment:
    resolved_citations: list[CitationAssessment] = []
    broken_links = 0
    supporting_strength = 0

    knowledge_entry = resolve_source_by_url(source.url) if source.sourceProvider == "seeded" else None
    citation_refs = knowledge_entry.citations if knowledge_entry else []

    for citation in citation_refs:
        resolved = resolve_citation(citation.refId)
        if resolved is None:
            broken_links += 1
            resolved_citations.append(
                CitationAssessment(
                    title="Broken or unresolved citation",
                    url="missing",
                    sourceBucket="tier_1_blog",
                    evidenceTier="blog",
                    stance="unclear",
                    broken=True,
                )
            )
            continue

        source_bucket = resolved.sourceBucket if resolved.sourceBucket else infer_source_bucket(resolved.domain)
        evidence_tier = resolved.evidenceTier if resolved.evidenceTier else infer_evidence_tier(resolved.title, resolved.snippet)
        stance = resolved.stance if resolved.stance != "unclear" else infer_stance(claim, resolved.snippet)
        supporting_strength += SOURCE_BUCKET_TO_SCORE[source_bucket] + EVIDENCE_TIER_TO_SCORE[evidence_tier]
        resolved_citations.append(
            CitationAssessment(
                title=resolved.title,
                url=resolved.url,
                sourceBucket=source_bucket,
                evidenceTier=evidence_tier,
                stance=stance,
                broken=False,
            )
        )

    if not resolved_citations:
        citation_integrity = 35 if source.sourceScore == 1 else 55
        note = "No resolvable citations were found, so citation integrity stays limited."
    else:
        base = 55 + min(supporting_strength * 3, 35)
        penalty = broken_links * 22
        citation_integrity = max(10, min(100, base - penalty))
        note = f"Citation chain reviewed with {len(resolved_citations) - broken_links} resolved references and {broken_links} broken links."

    llm_review = None
    if index < 6 and (source.sourceScore >= 2 or source.evidenceScore >= 3):
        llm_review = _llm_citation_review(claim, source, resolved_citations)
    reviewed_stance = source.stance
    if llm_review is not None:
        checker_review = _llm_citation_check(claim, source, resolved_citations, llm_review)
        effective_review = checker_review or llm_review
        integrity_values = [citation_integrity, llm_review.citationIntegrity]
        if checker_review is not None:
            integrity_values.append(checker_review.citationIntegrity)
        citation_integrity = round(sum(integrity_values) / len(integrity_values))
        if effective_review.stance in {"supportive", "mixed", "contradictory", "unclear"}:
            reviewed_stance = effective_review.stance
        note = f"{note} {effective_review.note}"

    notes = list(source.notes)
    notes.append(note)

    return source.model_copy(
        update={
            "citationIntegrity": citation_integrity,
            "citations": resolved_citations,
            "stance": reviewed_stance,
            "notes": notes,
        }
    )


async def audit_citations(claim: str, sources: list[SourceAssessment]) -> list[SourceAssessment]:
    return await gather_limited(
        list(enumerate(sources)),
        lambda item: asyncio.to_thread(_audit_one, claim, item[0], item[1]),
        concurrency=max(2, min(settings.pipeline_max_concurrency, 6)),
    )
