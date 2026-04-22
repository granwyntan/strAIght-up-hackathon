from pydantic import BaseModel, Field

from ..ai import ProviderName, generate_structured_list
from ..models import SourceAssessment, SourceQualityLabel
from ..settings import settings


QUALITY_LABEL_RANK = {
    "general": 0,
    "established": 1,
    "verified": 2,
}

QUALITY_LABEL_TO_SCORE = {
    "general": 1,
    "established": 2,
    "verified": 3,
}

QUALITY_LABEL_TO_WEIGHT = {
    "general": 0.4,
    "established": 0.75,
    "verified": 1.0,
}

PROMOTIONAL_TERMS = (
    "cure",
    "miracle",
    "secret",
    "forever",
    "guaranteed",
    "instantly",
    "doctor hates",
    "one weird trick",
    "detox",
    "shocking",
)
LOW_TRUST_DOMAIN_MARKERS = (
    "consensus.app",
    "droracle.ai",
    "drstanfield.com",
    "reddit.com",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "instagram.com",
    "facebook.com",
    "x.com",
    "twitter.com",
    "quora.com",
    "medium.com",
    "substack.com",
    "usamedical.com",
)
CONTEXT_REPORTING_DOMAIN_MARKERS = (
    "npr.org",
    "sacbee.com",
    "cnn.com",
    "foxnews.com",
    "newsweek.com",
    "forbes.com",
    "msn.com",
    "yahoo.com",
)


class SourceCredibilityReview(BaseModel):
    id: str
    sourceQualityLabel: SourceQualityLabel
    spamRiskScore: int = Field(default=0, ge=0, le=100)
    reason: str = Field(min_length=10, max_length=400)
    credibilityNotes: list[str] = Field(default_factory=list)


def _domain_matches(domain: str, configured_domains: list[str]) -> bool:
    lowered = domain.lower()
    return any(lowered == candidate or lowered.endswith(f".{candidate}") for candidate in configured_domains)


def _heuristic_quality_label(source: SourceAssessment) -> SourceQualityLabel:
    domain = source.domain.lower()
    if _domain_matches(domain, settings.verified_authorities_list) or source.sourceBucket == "tier_3_authority":
        return "verified"
    if _domain_matches(domain, settings.established_sources_list) or source.sourceBucket == "tier_2_scholarly":
        return "established"
    return "general"


def _heuristic_spam_risk(source: SourceAssessment, label: SourceQualityLabel) -> tuple[int, list[str]]:
    text = f"{source.title} {source.snippet}".lower()
    domain = source.domain.lower()
    risk = {"verified": 8, "established": 20, "general": 40}[label]
    notes: list[str] = []

    if any(term in text for term in PROMOTIONAL_TERMS):
        risk += 26
        notes.append("Promotional or sensational wording was detected in the title or snippet.")
    if source.domain.lower().endswith(".blog"):
        risk += 18
        notes.append("The domain uses a blog-style host, which increases the chance of low editorial standards.")
    if any(domain == marker or domain.endswith(f".{marker}") or marker in domain for marker in LOW_TRUST_DOMAIN_MARKERS):
        risk += 36
        notes.append("The domain behaves like an AI-answer, user-generated, or social source rather than primary medical evidence.")
    if any(domain == marker or domain.endswith(f".{marker}") or marker in domain for marker in CONTEXT_REPORTING_DOMAIN_MARKERS):
        risk += 18
        notes.append("The domain looks more like general reporting than direct medical evidence.")
    if source.citationIntegrity >= 70:
        risk -= 12
        notes.append("Citation support was comparatively stronger than average.")
    elif source.citationIntegrity < 35:
        risk += 10
        notes.append("Citation support looked weak or incomplete.")
    if source.evidenceTier in {"review", "rct"}:
        risk -= 6
        notes.append("The visible evidence tier is stronger than general commentary.")
    if source.evidenceTier == "blog":
        risk += 8
        notes.append("The source behaves more like commentary than primary medical evidence.")

    return max(0, min(100, risk)), notes


def _more_conservative_label(*labels: SourceQualityLabel) -> SourceQualityLabel:
    return min(labels, key=lambda label: QUALITY_LABEL_RANK[label])


def _batch_credibility_review(
    claim: str,
    sources: list[SourceAssessment],
    preferred_providers: list[ProviderName],
    system_prompt: str,
) -> dict[str, SourceCredibilityReview]:
    reviews = generate_structured_list(
        "audit",
        system_prompt,
        {
            "claim": claim,
            "sources": [
                {
                    "id": source.id,
                    "title": source.title,
                    "url": source.url,
                    "domain": source.domain,
                    "snippet": source.snippet,
                    "sourceBucket": source.sourceBucket,
                    "evidenceTier": source.evidenceTier,
                    "citationIntegrity": source.citationIntegrity,
                }
                for source in sources
            ],
            "instructions": [
                "Return JSON only.",
                "Use sourceQualityLabel values verified, established, or general.",
                "Be conservative with health claims. Promotional or weakly sourced domains should not be upgraded.",
                "If a source looks credible but the visible snippet is still thin, keep the label but note the limitation.",
                "Use spamRiskScore to reflect clickbait, promotional tone, weak citation habits, or low-authority hosting.",
            ],
        },
        SourceCredibilityReview,
        preferred_providers=preferred_providers,
    )
    return {review.id: review for review in reviews}


def assess_source_credibility(claim: str, sources: list[SourceAssessment]) -> list[SourceAssessment]:
    if not sources:
        return []

    heuristic_map: dict[str, SourceCredibilityReview] = {}
    for source in sources:
        label = _heuristic_quality_label(source)
        spam_risk, notes = _heuristic_spam_risk(source, label)
        heuristic_map[source.id] = SourceCredibilityReview(
            id=source.id,
            sourceQualityLabel=label,
            spamRiskScore=spam_risk,
            reason="Baseline credibility was inferred from the domain tier, evidence type, and citation signals.",
            credibilityNotes=notes,
        )

    review_targets = sources[:24]
    primary_map = _batch_credibility_review(
        claim,
        review_targets,
        ["claude", "openai", "gemini"],
        (
            "You are the Source Credibility Agent for a health-claim investigation. "
            "Return JSON only as an array with id, sourceQualityLabel, spamRiskScore, reason, and credibilityNotes. "
            "Your job is to validate whether each source behaves like a verified medical authority, an established scientific source, or a general web source."
        ),
    )
    checker_map = _batch_credibility_review(
        claim,
        review_targets,
        ["openai", "xai", "deepseek"],
        (
            "You are the checker for a source-credibility review in a health-claim investigation. "
            "Return JSON only as an array with id, sourceQualityLabel, spamRiskScore, reason, and credibilityNotes. "
            "Do not upgrade a source unless the supplied domain, evidence tier, and snippet justify it."
        ),
    )

    updated: list[SourceAssessment] = []
    for source in sources:
        heuristic = heuristic_map[source.id]
        primary = primary_map.get(source.id)
        checker = checker_map.get(source.id)

        reviewed_label = heuristic.sourceQualityLabel
        if primary is not None:
            reviewed_label = _more_conservative_label(reviewed_label, primary.sourceQualityLabel)
        if checker is not None:
            reviewed_label = _more_conservative_label(reviewed_label, checker.sourceQualityLabel)

        reviewed_spam = max(
            heuristic.spamRiskScore,
            primary.spamRiskScore if primary is not None else 0,
            checker.spamRiskScore if checker is not None else 0,
        )
        if reviewed_spam >= 72 and reviewed_label == "verified":
            reviewed_label = "established"
        if reviewed_spam >= 82 and reviewed_label == "established":
            reviewed_label = "general"

        notes = list(
            dict.fromkeys(
                [
                    *heuristic.credibilityNotes,
                    *(primary.credibilityNotes if primary is not None else []),
                    *(checker.credibilityNotes if checker is not None else []),
                ]
            )
        )[:4]
        reason = (
            checker.reason
            if checker is not None
            else primary.reason
            if primary is not None
            else heuristic.reason
        )

        source_score = min(source.sourceScore, QUALITY_LABEL_TO_SCORE[reviewed_label])
        source_weight = min(
            QUALITY_LABEL_TO_WEIGHT[reviewed_label],
            settings.source_weight_for_bucket(source.sourceBucket),
        )
        updated.append(
            source.model_copy(
                update={
                    "sourceQualityLabel": reviewed_label,
                    "sourceQualityReason": reason,
                    "spamRiskScore": reviewed_spam,
                    "credibilityNotes": notes,
                    "sourceScore": source_score,
                    "sourceWeight": source_weight,
                }
            )
        )

    return updated
