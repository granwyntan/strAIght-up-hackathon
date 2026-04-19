from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..core.scoring import EVIDENCE_TIER_TO_SCORE
from ..models import SourceAssessment
from ..tools.search import infer_evidence_tier


class ClassificationReviewOutput(BaseModel):
    evidenceTier: str = Field(min_length=3, max_length=32)
    studyQualityFactor: float = Field(ge=0.5, le=1.0)
    note: str = Field(min_length=10, max_length=400)


def _llm_classification_review(source: SourceAssessment, evidence_tier: str) -> ClassificationReviewOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You classify evidence strength for a health-claim investigation. "
            "Return JSON only with evidenceTier, studyQualityFactor, and note. "
            "Use one of: review, rct, observational, case_report, blog."
        ),
        {
            "source": {
                "title": source.title,
                "url": source.url,
                "domain": source.domain,
                "snippet": source.snippet,
                "journalType": source.journalType,
                "sourceBucket": source.sourceBucket,
                "citationIntegrity": source.citationIntegrity,
            },
            "draft_classification": {
                "evidenceTier": evidence_tier,
                "studyQualityFactor": {
                    "review": 1.0,
                    "rct": 0.95,
                    "observational": 0.8,
                    "case_report": 0.65,
                    "blog": 0.5,
                }[evidence_tier],
            },
            "instructions": [
                "Prefer stronger evidence tiers only when the title/snippet clearly suggest them.",
                "Use lower study quality for blogs, anecdotal material, and weak observational wording.",
            ],
        },
        ClassificationReviewOutput,
        preferred_providers=["gemini", "openai"],
    )


def _llm_classification_check(source: SourceAssessment, review: ClassificationReviewOutput) -> ClassificationReviewOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You are the checker for an evidence-classification stage in a health-claim investigation. "
            "Return JSON only with evidenceTier, studyQualityFactor, and note. "
            "Verify whether the draft evidence tier is justified by the source metadata."
        ),
        {
            "source": {
                "title": source.title,
                "url": source.url,
                "domain": source.domain,
                "snippet": source.snippet,
                "journalType": source.journalType,
                "sourceBucket": source.sourceBucket,
                "citationIntegrity": source.citationIntegrity,
            },
            "draft_review": review.model_dump(),
            "allowed_tiers": ["review", "rct", "observational", "case_report", "blog"],
            "instructions": [
                "Keep evidenceTier within the allowed values.",
                "Use studyQualityFactor between 0.5 and 1.0.",
            ],
        },
        ClassificationReviewOutput,
        preferred_providers=["claude", "xai", "openai"],
    )


def classify_sources(sources: list[SourceAssessment]) -> list[SourceAssessment]:
    classified: list[SourceAssessment] = []
    for index, source in enumerate(sources):
        evidence_tier = source.evidenceTier
        if evidence_tier == "blog" and source.sourceScore >= 2:
            evidence_tier = infer_evidence_tier(source.title, source.snippet)

        study_quality_factor = {
            "review": 1.0,
            "rct": 0.95,
            "observational": 0.8,
            "case_report": 0.65,
            "blog": 0.5,
        }[evidence_tier]
        classification_note = ""

        if index < 10 and (source.sourceScore >= 2 or source.citationIntegrity >= 60):
            llm_review = _llm_classification_review(source, evidence_tier)
            if llm_review is not None:
                checker_review = _llm_classification_check(source, llm_review)
                effective_review = checker_review or llm_review
                if effective_review.evidenceTier in EVIDENCE_TIER_TO_SCORE:
                    evidence_tier = effective_review.evidenceTier
                study_quality_factor = effective_review.studyQualityFactor
                classification_note = effective_review.note

        journal_type = source.journalType
        if journal_type in {"", "user supplied"}:
            journal_type = evidence_tier.replace("_", " ")

        notes = list(source.notes)
        notes.append(
            f"Classified as {evidence_tier.replace('_', ' ')} based on journal/source wording, giving it an evidence score of {EVIDENCE_TIER_TO_SCORE[evidence_tier]}/5."
        )
        if classification_note:
            notes.append(classification_note)
        classified.append(
            source.model_copy(
                update={
                    "evidenceTier": evidence_tier,
                    "evidenceScore": EVIDENCE_TIER_TO_SCORE[evidence_tier],
                    "studyQualityFactor": study_quality_factor,
                    "journalType": journal_type,
                    "notes": notes,
                }
            )
        )
    return classified
