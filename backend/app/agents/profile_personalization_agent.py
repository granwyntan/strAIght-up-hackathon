from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..models import ProfilePersonalizationReview, SourceAssessment


class ProfilePersonalizationOutput(BaseModel):
    relevanceLabel: str = Field(default="not_available")
    summary: str = Field(default="", max_length=420)
    keyPoints: list[str] = Field(default_factory=list)
    alerts: list[str] = Field(default_factory=list)


def review_profile_personalization(claim: str, profile_context: str, sources: list[SourceAssessment]) -> ProfilePersonalizationReview:
    cleaned_profile = (profile_context or "").strip()
    if not cleaned_profile:
        return ProfilePersonalizationReview(
            relevanceLabel="not_available",
            summary="No saved profile context was available, so this run stayed general rather than user-specific.",
            keyPoints=["Complete your profile to connect claims with conditions, allergies, goals, and food rules."],
            alerts=[],
        )

    ai_review = generate_structured_output(
        "reasoning",
        (
            "You are the profile personalization reviewer inside a medical claim-check workflow. "
            "Professional role: clinician translating evidence into user-specific relevance. "
            "Return JSON only with relevanceLabel, summary, keyPoints, and alerts. "
            "Allowed relevanceLabel values: high, medium, low, not_available. "
            "Focus on conditions, allergies, goals, diet type, eating pattern, religious or cultural food rules, medications, and supplements when relevant. "
            "Do not invent contraindications. If the profile only weakly changes the interpretation, say so."
        ),
        {
            "claim": claim,
            "profileContext": cleaned_profile,
            "sources": [
                {
                    "title": source.title,
                    "domain": source.domain,
                    "sentiment": source.sentiment,
                    "summary": source.sentimentSummary or source.relevanceSummary or source.snippet,
                    "quote": source.evidence.quotedEvidence if source.evidence else "",
                    "studyType": source.evidence.studyType if source.evidence else source.evidenceTier,
                    "quoteVerified": source.quoteVerified,
                }
                for source in sources[:10]
            ],
            "instructions": [
                "Explain how the evidence connects to this user's profile, not just whether the claim is true in general.",
                "Call out allergy, medication, condition, or dietary-rule conflicts only when they are actually supported by the evidence summary.",
                "Keep the summary concise and practical.",
            ],
        },
        ProfilePersonalizationOutput,
        preferred_providers=["openai", "gemini", "claude"],
    )

    if ai_review is None:
        return ProfilePersonalizationReview(
            relevanceLabel="medium",
            summary="Profile context was available, but the personalization pass could only make a cautious relevance read from the current evidence set.",
            keyPoints=["The claim was still reviewed against the saved profile context before final scoring."],
            alerts=[],
        )

    normalized_label = ai_review.relevanceLabel if ai_review.relevanceLabel in {"high", "medium", "low", "not_available"} else "medium"
    return ProfilePersonalizationReview(
        relevanceLabel=normalized_label,
        summary=ai_review.summary,
        keyPoints=ai_review.keyPoints[:5],
        alerts=ai_review.alerts[:5],
    )
