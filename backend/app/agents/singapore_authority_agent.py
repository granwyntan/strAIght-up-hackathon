from collections import Counter

from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..models import SingaporeAuthorityReview, SourceAssessment


SINGAPORE_AUTHORITY_DOMAINS = (
    "moh.gov.sg",
    "hsa.gov.sg",
    "hpb.gov.sg",
    "aic.sg",
    "smc.gov.sg",
    "a-star.edu.sg",
    "cris.sg",
    "scri.edu.sg",
    "npm.sg",
    "stcc.sg",
    "singhealthdukenus.com.sg",
    "nuhs.edu.sg",
    "healthhub.sg",
    "healthxchange.sg",
    "mindline.sg",
    "healthiersg.gov.sg",
    "samhealth.org.sg",
    "cda.gov.sg",
    "ncid.sg",
    "moht.com.sg",
    "actris.sg",
    "nhic.sg",
    "nmrc.gov.sg",
    "healthprofessionals.gov.sg",
    "ams.edu.sg",
    "ncis.com.sg",
    "nccs.com.sg",
    "nhcs.com.sg",
    "nni.com.sg",
    "snec.com.sg",
    "imh.com.sg",
    "synapxe.sg",
    "chas.sg",
    "caretogobeyond.sg",
    "ace-hta.gov.sg",
    "shqsa.com.sg",
)


def _is_singapore_authority(domain: str) -> bool:
    lowered = (domain or "").lower()
    return any(lowered == item or lowered.endswith(f".{item}") for item in SINGAPORE_AUTHORITY_DOMAINS)


class SingaporeAuthorityOutput(BaseModel):
    agreementLabel: str = Field(default="insufficient")
    summary: str = Field(default="", max_length=400)
    keyPoints: list[str] = Field(default_factory=list)


def review_singapore_authorities(claim: str, sources: list[SourceAssessment]) -> SingaporeAuthorityReview:
    lowered_claim = claim.lower()
    singapore_marked_claim = any(marker in lowered_claim for marker in ("singapore", "sg", "moh", "hsa", "healthhub", "ncid"))
    singapore_sources = [
        source
        for source in sources
        if _is_singapore_authority(source.domain)
        or "singapore" in (source.sourceName or "").lower()
        or "singapore" in (source.title or "").lower()
    ]
    if not singapore_sources:
        return SingaporeAuthorityReview(
            totalSources=0,
            agreementLabel="insufficient",
            summary=(
                "No Singapore authority or Singapore institutional source was retained in this review."
                if singapore_marked_claim
                else "This claim did not surface retained Singapore-specific authority evidence in the current run."
            ),
            keyPoints=[
                "No retained Singapore authority source cleared the final evidence screen for this run."
            ]
            if singapore_marked_claim
            else [],
        )

    sentiment_counts = Counter(source.sentiment for source in singapore_sources)
    supportive = sentiment_counts.get("positive", 0)
    neutral = sentiment_counts.get("neutral", 0)
    contradictory = sentiment_counts.get("negative", 0)
    if supportive > contradictory and supportive >= max(1, neutral):
        label = "supportive"
    elif contradictory > supportive and contradictory >= max(1, neutral):
        label = "contradictory"
    else:
        label = "mixed"

    baseline = SingaporeAuthorityReview(
        totalSources=len(singapore_sources),
        supportiveCount=supportive,
        neutralCount=neutral,
        contradictoryCount=contradictory,
        agreementLabel=label,
        summary=(
            f"Singapore-linked authorities contributed {len(singapore_sources)} retained sources: "
            f"{supportive} supportive, {neutral} mixed or uncertain, and {contradictory} contradictory."
        ),
        keyPoints=list(
            dict.fromkeys(
                [
                    *(source.evidence.conclusion for source in singapore_sources[:3] if source.evidence and source.evidence.conclusion),
                    *(source.relevanceSummary for source in singapore_sources[:3] if source.relevanceSummary),
                ]
            )
        )[:5],
        domains=list(dict.fromkeys(source.domain for source in singapore_sources))[:20],
        sourceIds=[source.id for source in singapore_sources],
    )

    ai_review = generate_structured_output(
        "consensus",
        (
            "You are the Singapore authority reviewer for a medical fact-checking workflow. "
            "Professional role: Singapore public-health and clinical-guidance synthesis editor. "
            "Return JSON only with agreementLabel, summary, and keyPoints. "
            "Allowed agreementLabel values: supportive, mixed, contradictory, insufficient."
        ),
        {
            "claim": claim,
            "baseline": baseline.model_dump(),
            "sources": [
                {
                    "domain": source.domain,
                    "title": source.title,
                    "sentiment": source.sentiment,
                    "quoteVerified": source.quoteVerified,
                    "summary": source.sentimentSummary or source.relevanceSummary or source.snippet,
                    "quote": source.evidence.quotedEvidence if source.evidence else "",
                }
                for source in singapore_sources[:12]
            ],
            "instructions": [
                "Summarize only what the Singapore authority or Singapore institutional sources suggest about the claim.",
                "Do not overstate agreement if the Singapore sources are mixed, narrow, or mostly contextual.",
            ],
        },
        SingaporeAuthorityOutput,
        preferred_providers=["openai", "gemini", "claude"],
    )

    if ai_review is None:
        return baseline
    return baseline.model_copy(
        update={
            "agreementLabel": ai_review.agreementLabel if ai_review.agreementLabel in {"supportive", "mixed", "contradictory", "insufficient"} else baseline.agreementLabel,
            "summary": ai_review.summary or baseline.summary,
            "keyPoints": ai_review.keyPoints or baseline.keyPoints,
        }
    )
