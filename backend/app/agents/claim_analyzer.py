import re

from ..models import AtomicClaim, ClaimAnalysis, ClaimSemantics


RED_FLAG_WEIGHTS = {
    "cure": 18,
    "cures": 18,
    "will cure": 24,
    "reverse": 16,
    "detox": 14,
    "guaranteed": 18,
    "miracle": 20,
    "instantly": 14,
    "forever": 10,
    "100%": 12,
    "always": 8,
    "never": 8,
    "burns fat": 16,
    "fix": 8,
    "proven": 10,
    "definitely": 10,
}

STOP_WORDS = {
    "the",
    "and",
    "that",
    "with",
    "from",
    "this",
    "your",
    "into",
    "have",
    "about",
    "there",
    "they",
    "them",
    "their",
    "does",
    "because",
    "than",
}

MAIN_VERB_PATTERN = re.compile(
    r"\b("
    r"is|are|was|were|can|could|may|might|will|would|should|does|do|did|"
    r"helps?|improves?|reduces?|prevents?|causes?|treats?|fix(?:es)?|cures?|"
    r"boosts?|supports?|harms?|safe|effective|linked|associated"
    r")\b",
    re.IGNORECASE,
)


def _clean_phrase(text: str) -> str:
    return " ".join(text.strip(" .,!?:;").split())


def _focus_terms(text: str) -> list[str]:
    terms: list[str] = []
    for token in text.replace("/", " ").replace(",", " ").split():
        normalized = token.strip(".!?;:()[]\"'").lower()
        if len(normalized) < 3 or normalized in STOP_WORDS:
            continue
        if normalized not in terms:
            terms.append(normalized)
    return terms[:10]


def _claim_type(text: str) -> str:
    lowered = text.lower()
    if any(token in lowered for token in ["supplement", "vitamin", "magnesium", "probiotic", "capsule", "herb"]):
        return "supplement"
    if any(token in lowered for token in ["diet", "meal", "vinegar", "seed oil", "sugar", "fasting", "consumption"]):
        return "nutrition"
    if any(token in lowered for token in ["eczema", "insomnia", "anxiety", "disease", "syndrome", "depression", "adhd", "infection"]):
        return "condition outcome"
    return "general health claim"


def _language_flags(text: str) -> tuple[list[str], int]:
    lowered = text.lower()
    flags: list[str] = []
    total = 0
    for phrase, weight in RED_FLAG_WEIGHTS.items():
        if phrase in lowered:
            flags.append(f'Uses strong claim language: "{phrase}"')
            total += weight
    return flags, min(total, 100)


def _risk_label(score: int) -> str:
    if score >= 70:
        return "Very aggressive"
    if score >= 45:
        return "Overstated"
    if score >= 20:
        return "Moderately confident"
    return "Measured"


def _semantic_strength(claim: str) -> int:
    lowered = claim.lower()
    if any(token in lowered for token in ["definitely", "guaranteed", "always", "never", "100%", "cure", "cures", "will "]):
        return 5
    if any(token in lowered for token in ["reduces", "improves", "prevents", "fixes", "treats", "causes", "safe", "effective"]):
        return 4
    if any(token in lowered for token in ["can", "helps", "linked", "associated", "supports"]):
        return 3
    if "may" in lowered or "might" in lowered:
        return 2
    return 1


def _semantic_frame(claim: str) -> ClaimSemantics:
    cleaned = _clean_phrase(claim)
    match = MAIN_VERB_PATTERN.search(cleaned)
    if not match:
        return ClaimSemantics(
            subject=cleaned,
            action="asserts a health effect",
            outcome="unspecified outcome",
            impliedCausation=False,
            strength=_semantic_strength(cleaned),
        )

    subject = _clean_phrase(cleaned[: match.start()]) or cleaned
    action = _clean_phrase(match.group(0))
    outcome = _clean_phrase(cleaned[match.end() :]) or "unspecified outcome"
    lowered = cleaned.lower()
    implied_causation = any(
        token in lowered
        for token in ["cure", "fix", "prevent", "cause", "reverse", "safe", "effective", "good for", "beneficial for"]
    )
    return ClaimSemantics(
        subject=subject,
        action=action,
        outcome=outcome,
        impliedCausation=implied_causation,
        strength=_semantic_strength(cleaned),
    )


def _generate_queries(claim: str, context: str, semantics: ClaimSemantics, focus_terms: list[str], desired_depth: str) -> list[str]:
    claim_text = _clean_phrase(claim)
    subject = semantics.subject or " ".join(focus_terms[:3]) or claim_text
    outcome = semantics.outcome if semantics.outcome and semantics.outcome != "unspecified outcome" else claim_text
    context_tail = f" {context}".strip()
    queries = [
        f"{claim_text} systematic review".strip(),
        f"{subject} {outcome} clinical evidence".strip(),
        f"{subject} {outcome} human study".strip(),
        f"{subject} {outcome} guideline evidence".strip(),
        f"{subject} {outcome} contradiction evidence".strip(),
        f"{subject} {outcome} mechanism study".strip(),
        f"{subject} {outcome} safety clinical evidence".strip(),
        f"{claim_text} pubmed".strip(),
    ]
    if desired_depth == "deep":
        queries.extend(
            [
                f"{subject} {outcome} meta analysis".strip(),
                f"{subject} {outcome} randomized trial".strip(),
                f"{subject} {outcome} causation versus correlation".strip(),
                f"{subject} {outcome} sample size limitation{context_tail}".strip(),
            ]
        )

    deduped: list[str] = []
    for query in queries:
        normalized = _clean_phrase(query)
        if normalized and normalized not in deduped:
            deduped.append(normalized)
    return deduped[:12]


def analyze_claim(claim: str, context: str = "", desired_depth: str = "standard") -> ClaimAnalysis:
    cleaned_claim = _clean_phrase(claim)
    focus_terms = _focus_terms(f"{cleaned_claim} {context}")
    red_flags, language_risk = _language_flags(cleaned_claim)
    semantics = _semantic_frame(cleaned_claim)
    claim_strength = max(semantics.strength, min(5, max(1, round(language_risk / 20) + 1)))
    queries = _generate_queries(cleaned_claim, context, semantics, focus_terms, desired_depth)
    claim_type = _claim_type(cleaned_claim)
    atomic_claim = AtomicClaim(
        text=cleaned_claim,
        strength=claim_strength,
        rationale=(
            f"The claim is evaluated as a whole statement about {semantics.subject or 'the subject'} "
            f"and whether it {semantics.action} {semantics.outcome}."
        ),
    )

    summary = (
        f'The claim is treated as one semantic assertion about {semantics.subject or "the subject"}, '
        f'its claimed action "{semantics.action}", and outcome "{semantics.outcome}". '
        f"It carries a {claim_strength}/5 claim-strength profile and a {_risk_label(language_risk).lower()} language profile."
    )

    return ClaimAnalysis(
        claimType=claim_type,
        summary=summary,
        focusTerms=focus_terms,
        redFlags=red_flags,
        languageRiskScore=language_risk,
        languageLabel=_risk_label(language_risk),
        generatedQueries=queries,
        atomicClaims=[atomic_claim],
        semantics=semantics.model_copy(update={"strength": claim_strength}),
    )
