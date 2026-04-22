import re
from collections import Counter

from pydantic import BaseModel, Field

from ..ai import generate_structured_output
from ..models import InvestigationComparisonAxis, InvestigationComparisonResponse, InvestigationDetail


STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "to",
    "with",
}


def _normalize_claim(text: str) -> str:
    return " ".join(text.lower().split()).strip()


def _claim_tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", _normalize_claim(text))
        if len(token) > 2 and token not in STOPWORDS
    }


def _similarity(left: str, right: str) -> int:
    left_key = _normalize_claim(left)
    right_key = _normalize_claim(right)
    if left_key == right_key:
        return 100
    left_tokens = _claim_tokens(left)
    right_tokens = _claim_tokens(right)
    if not left_tokens or not right_tokens:
        return 0
    overlap = len(left_tokens & right_tokens)
    union = len(left_tokens | right_tokens)
    token_score = round((overlap / max(1, union)) * 100)
    return max(token_score, 65 if overlap >= 4 else 0)


def _compatible(left: InvestigationDetail, right: InvestigationDetail) -> tuple[bool, int, bool]:
    similarity = _similarity(left.claim, right.claim)
    same_claim = _normalize_claim(left.claim) == _normalize_claim(right.claim)
    claim_domains = {left.claimAnalysis.claimDomain if left.claimAnalysis else "", right.claimAnalysis.claimDomain if right.claimAnalysis else ""}
    same_domain = len({domain for domain in claim_domains if domain}) <= 1
    return same_claim or (similarity >= 55 and same_domain), similarity, same_claim


class ComparisonOutput(BaseModel):
    compatible: bool = False
    similarityScore: int = Field(default=0, ge=0, le=100)
    sameClaim: bool = False
    summary: str = Field(default="", max_length=260)
    shortSnippet: str = Field(default="", max_length=180)
    detail: str = Field(default="", max_length=1200)
    axes: list[InvestigationComparisonAxis] = Field(default_factory=list)
    notableDifferences: list[str] = Field(default_factory=list)


def compare_investigations(left: InvestigationDetail, right: InvestigationDetail) -> InvestigationComparisonResponse:
    compatible, similarity, same_claim = _compatible(left, right)
    baseline = ComparisonOutput(
        compatible=compatible,
        similarityScore=similarity,
        sameClaim=same_claim,
        summary=(
            "These two saved runs are similar enough to compare side by side."
            if compatible
            else "These runs are too different in topic to compare fairly."
        ),
        shortSnippet=(
            "Compare score, confidence, and evidence coverage."
            if compatible
            else "Pick two runs about the same claim or a closely related variation."
        ),
        detail=(
            f"Run A analyzed {left.sourceCount} sources and Run B analyzed {right.sourceCount}. "
            f"Similarity landed at {similarity}/100."
        ),
        axes=[
            InvestigationComparisonAxis(label="Verdict", summary=f"{left.verdict or 'pending'} versus {right.verdict or 'pending'}"),
            InvestigationComparisonAxis(
                label="Evidence depth",
                summary=f"{left.sourceCount} analyzed sources versus {right.sourceCount}",
            ),
            InvestigationComparisonAxis(
                label="Confidence",
                summary=f"{left.confidenceLevel or 'unknown'} versus {right.confidenceLevel or 'unknown'}",
            ),
        ],
        notableDifferences=[
            f"Run A score: {left.overallScore if left.overallScore is not None else '--'}/100.",
            f"Run B score: {right.overallScore if right.overallScore is not None else '--'}/100.",
        ],
    )
    if not compatible:
        return InvestigationComparisonResponse.model_validate(baseline.model_dump())

    payload = {
        "baseline": baseline.model_dump(),
        "left": {
            "claim": left.claim,
            "summary": left.summary,
            "verdict": left.verdict,
            "classification": left.truthClassification,
            "confidenceLevel": left.confidenceLevel,
            "score": left.overallScore,
            "sources": left.sourceCount,
            "keyFindings": left.keyFindings[:6],
            "contradictions": left.contradictions[:4],
        },
        "right": {
            "claim": right.claim,
            "summary": right.summary,
            "verdict": right.verdict,
            "classification": right.truthClassification,
            "confidenceLevel": right.confidenceLevel,
            "score": right.overallScore,
            "sources": right.sourceCount,
            "keyFindings": right.keyFindings[:6],
            "contradictions": right.contradictions[:4],
        },
        "instructions": [
            "Return JSON only.",
            "Only compare these runs if they are about the same claim or a close variation of the same health question.",
            "Write user-facing language, not backend jargon.",
            "Call out score, confidence, evidence coverage, and the biggest reason for divergence.",
        ],
    }

    primary = generate_structured_output(
        "reasoning",
        (
            "You compare two saved health-claim investigations for GramWIN. "
            "Professional role: evidence synthesis editor. "
            "Write concise, user-facing comparison output. Return JSON only."
        ),
        payload,
        ComparisonOutput,
        preferred_providers=["openai", "gemini", "claude"],
    )
    checker = generate_structured_output(
        "reasoning",
        (
            "You are the checker for a two-run investigation comparison. "
            "Professional role: clinical fact-check editor. "
            "Validate that the comparison is fair, not overly skeptical, and not overly gullible. Return JSON only."
        ),
        payload,
        ComparisonOutput,
        preferred_providers=["gemini", "openai", "claude"],
    )

    result = primary or checker or baseline
    if primary and checker:
        if primary.compatible != checker.compatible or abs(primary.similarityScore - checker.similarityScore) >= 18:
            arbiter = generate_structured_output(
                "reasoning",
                (
                    "You arbitrate disagreements between two investigation-comparison reviewers. "
                    "Keep only fair, user-facing, evidence-aligned comparisons. Return JSON only."
                ),
                {"baseline": baseline.model_dump(), "primary": primary.model_dump(), "checker": checker.model_dump(), "payload": payload},
                ComparisonOutput,
                preferred_providers=["claude", "openai", "gemini"],
            )
            result = arbiter or checker
        else:
            merged_differences = list(dict.fromkeys([*primary.notableDifferences, *checker.notableDifferences]))[:6]
            merged_axes = primary.axes or checker.axes
            result = primary.model_copy(update={"notableDifferences": merged_differences, "axes": merged_axes})

    if not result.compatible:
        result = result.model_copy(update={"similarityScore": similarity, "sameClaim": same_claim})
    return InvestigationComparisonResponse.model_validate(result.model_dump())
