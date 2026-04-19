from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..core.scoring import EVIDENCE_TIER_TO_SCORE, SOURCE_BUCKET_TO_SCORE
from ..models import CitationAssessment, SourceAssessment
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


def audit_citations(claim: str, sources: list[SourceAssessment]) -> list[SourceAssessment]:
    audited: list[SourceAssessment] = []

    for index, source in enumerate(sources):
        resolved_citations: list[CitationAssessment] = []
        broken_links = 0
        supporting_strength = 0

        knowledge_entry = resolve_source_by_url(source.url)
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
            citation_integrity = round((citation_integrity + llm_review.citationIntegrity) / 2)
            if llm_review.stance in {"supportive", "mixed", "contradictory", "unclear"}:
                reviewed_stance = llm_review.stance
            note = f"{note} {llm_review.note}"

        notes = list(source.notes)
        notes.append(note)

        audited.append(
            source.model_copy(
                update={
                    "citationIntegrity": citation_integrity,
                    "citations": resolved_citations,
                    "stance": reviewed_stance,
                    "notes": notes,
                }
            )
        )

    return audited
