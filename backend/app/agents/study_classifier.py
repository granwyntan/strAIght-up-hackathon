from ..core.scoring import EVIDENCE_TIER_TO_SCORE
from ..models import SourceAssessment
from ..tools.search import infer_evidence_tier


def classify_sources(sources: list[SourceAssessment]) -> list[SourceAssessment]:
    classified: list[SourceAssessment] = []
    for source in sources:
        evidence_tier = source.evidenceTier
        if evidence_tier == "blog" and source.sourceScore >= 2:
            evidence_tier = infer_evidence_tier(source.title, source.snippet)

        journal_type = source.journalType
        if journal_type in {"", "user supplied"}:
            journal_type = evidence_tier.replace("_", " ")

        notes = list(source.notes)
        notes.append(
            f"Classified as {evidence_tier.replace('_', ' ')} based on journal/source wording, giving it an evidence score of {EVIDENCE_TIER_TO_SCORE[evidence_tier]}/5."
        )
        classified.append(
            source.model_copy(
                update={
                    "evidenceTier": evidence_tier,
                    "evidenceScore": EVIDENCE_TIER_TO_SCORE[evidence_tier],
                    "journalType": journal_type,
                    "notes": notes,
                }
            )
        )
    return classified

