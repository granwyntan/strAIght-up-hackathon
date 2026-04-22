import re

from pydantic import BaseModel, Field

from .nlp_cloud_agent import NlpCloudClaimSignals, refine_claim_signals
from ..ai import generate_structured_output
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
    "fix": 10,
    "proven": 10,
    "definitely": 14,
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

PHRASE_SYNONYMS = {
    "gut health": ["gut microbiome", "intestinal health", "digestive health"],
    "gut microbiome": ["intestinal microbiota", "microbiota"],
    "eczema": ["atopic dermatitis"],
    "blood sugar": ["glycemic control", "glucose control"],
    "heart disease": ["cardiovascular disease"],
    "high blood pressure": ["hypertension"],
    "weight loss": ["body weight reduction"],
    "sleep": ["sleep quality", "sleep outcomes"],
    "anxiety": ["anxiety symptoms"],
    "depression": ["depressive symptoms"],
    "inflammation": ["inflammatory markers"],
    "water": ["drinking water", "plain water", "hydration"],
    "healthy": ["health benefits", "positive health outcomes"],
}

TOKEN_SYNONYMS = {
    "supplements": ["supplementation", "dietary supplements"],
    "supplement": ["supplementation", "dietary supplement"],
    "probiotics": ["live biotherapeutics", "beneficial bacteria"],
    "probiotic": ["live biotherapeutic", "beneficial bacteria"],
    "cure": ["treatment", "therapeutic effect"],
    "cures": ["treats", "has therapeutic effect on"],
    "fix": ["improve", "treat"],
    "fixes": ["improves", "treats"],
    "linked": ["associated", "correlated"],
    "help": ["improve", "support"],
    "helps": ["improves", "supports"],
    "healthy": ["healthful", "beneficial"],
}

POSITIVE_DIRECTION_TERMS = {
    "healthy",
    "healthful",
    "beneficial",
    "good for",
    "supports",
    "support",
    "improves",
    "improve",
    "effective",
    "safe",
    "positive health outcomes",
    "reduces risk",
}

NEGATIVE_DIRECTION_TERMS = {
    "unhealthy",
    "harmful",
    "bad for",
    "unsafe",
    "toxic",
    "causes",
    "cause",
    "raises risk",
    "increases risk",
    "damages",
    "worsens",
    "ineffective",
}


class ClaimAnalyzerOutput(BaseModel):
    claimType: str = Field(min_length=3, max_length=80)
    summary: str = Field(min_length=20, max_length=600)
    focusTerms: list[str] = Field(default_factory=list)
    redFlags: list[str] = Field(default_factory=list)
    subject: str = ""
    intervention: str = ""
    action: str = ""
    outcome: str = ""
    relationshipType: str = "correlational"
    strength: int = Field(default=1, ge=1, le=5)


def _clean_phrase(text: str) -> str:
    return " ".join(text.strip(" .,!?:;").split())


def _clean_query_phrase(text: str) -> str:
    tokens: list[str] = []
    for token in _clean_phrase(text).split():
        if not tokens or token.lower() != tokens[-1].lower():
            tokens.append(token)
    return " ".join(tokens)


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
        return 1
    return 2


def _relationship_type(claim: str, implied_causation: bool) -> str:
    lowered = claim.lower()
    if any(token in lowered for token in ["i think", "i believe", "opinion", "good for", "bad for", "healthy", "unhealthy"]):
        return "opinion"
    if implied_causation or any(
        token in lowered
        for token in ["cause", "causes", "cure", "cures", "prevent", "prevents", "reverse", "improve", "improves", "reduce", "reduces", "treat", "treats", "fix", "fixes"]
    ):
        return "causal"
    return "correlational"


def _intervention_from_subject(subject: str) -> str:
    cleaned = _clean_phrase(subject)
    if cleaned:
        return cleaned
    return "unspecified intervention"


def _semantic_frame(claim: str) -> ClaimSemantics:
    cleaned = _clean_phrase(claim)
    match = MAIN_VERB_PATTERN.search(cleaned)
    if not match:
        return ClaimSemantics(
            subject=cleaned,
            intervention=_intervention_from_subject(cleaned),
            action="asserts a health effect",
            outcome="unspecified outcome",
            impliedCausation=False,
            relationshipType="correlational",
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
        intervention=_intervention_from_subject(subject),
        action=action,
        outcome=outcome,
        impliedCausation=implied_causation,
        relationshipType=_relationship_type(cleaned, implied_causation),
        strength=_semantic_strength(cleaned),
    )


def _text_variants(text: str) -> list[str]:
    cleaned = _clean_phrase(text)
    if not cleaned:
        return []

    variants = [cleaned]
    lowered = cleaned.lower()

    for phrase, replacements in PHRASE_SYNONYMS.items():
        if phrase not in lowered:
            continue
        for replacement in replacements:
            candidate = _clean_phrase(lowered.replace(phrase, replacement))
            if candidate and candidate not in variants:
                variants.append(candidate)

    tokens = lowered.split()
    for index, token in enumerate(tokens):
        replacements = TOKEN_SYNONYMS.get(token)
        if not replacements:
            continue
        for replacement in replacements:
            candidate_tokens = [*tokens]
            candidate_tokens[index] = replacement
            candidate = _clean_phrase(" ".join(candidate_tokens))
            if candidate and candidate not in variants:
                variants.append(candidate)

    return variants[:6]


def _claim_direction(claim: str, semantics: ClaimSemantics) -> str:
    lowered = claim.lower()
    if any(token in lowered for token in NEGATIVE_DIRECTION_TERMS):
        return "negative"
    if any(token in lowered for token in POSITIVE_DIRECTION_TERMS):
        return "positive"
    if semantics.relationshipType == "opinion" and "healthy" in lowered:
        return "positive"
    return "neutral"


def _outcome_expansions(claim: str, semantics: ClaimSemantics) -> list[str]:
    lowered_claim = claim.lower()
    lowered_outcome = (semantics.outcome or "").lower()
    expansions: list[str] = []

    if any(token in lowered_claim or token in lowered_outcome for token in {"healthy", "healthful", "beneficial", "good for"}):
        expansions.extend(["positive health outcomes", "health benefits", "clinical outcomes"])
    if any(token in lowered_claim or token in lowered_outcome for token in {"unhealthy", "harmful", "bad for", "toxic"}):
        expansions.extend(["adverse health outcomes", "health risks", "harm"])
    if "water" in lowered_claim or "hydration" in lowered_claim:
        expansions.extend(["hydration outcomes", "fluid intake outcomes", "cardiometabolic health"])
    if "sleep" in lowered_claim:
        expansions.extend(["sleep quality", "sleep outcomes", "sleep duration"])

    deduped: list[str] = []
    for item in expansions:
        cleaned = _clean_phrase(item)
        if cleaned and cleaned not in deduped:
            deduped.append(cleaned)
    return deduped[:6]


def _generate_queries(claim: str, context: str, semantics: ClaimSemantics, focus_terms: list[str], desired_depth: str) -> list[str]:
    claim_text = _clean_phrase(claim)
    subject = semantics.subject or " ".join(focus_terms[:3]) or claim_text
    outcome = semantics.outcome if semantics.outcome and semantics.outcome != "unspecified outcome" else claim_text
    intervention = semantics.intervention or subject
    subject_variants = _text_variants(subject)
    intervention_variants = _text_variants(intervention)
    outcome_variants = _text_variants(outcome)
    claim_variants = _text_variants(claim_text)
    direction = _claim_direction(claim_text, semantics)
    outcome_expansions = _outcome_expansions(claim_text, semantics)
    context_tail = _clean_phrase(context)
    target_count = _target_query_count(semantics, focus_terms, context, desired_depth)

    query_templates = [
        "{claim_variant} systematic review",
        "{claim_variant} meta analysis",
        "{claim_variant} guideline",
        "{intervention_variant} {outcome_variant} clinical evidence",
        "{intervention_variant} {outcome_variant} randomized trial",
        "{intervention_variant} {outcome_variant} observational study",
        "{intervention_variant} {outcome_variant} guideline evidence",
        "{intervention_variant} {outcome_variant} mechanism study",
        "{intervention_variant} {outcome_variant} safety clinical evidence",
        "{intervention_variant} {outcome_variant} causation versus correlation",
        "{subject_variant} {outcome_variant} evidence review",
        "{claim_variant} pubmed",
    ]
    if direction == "positive":
        query_templates.extend(
            [
                "{intervention_variant} {outcome_variant} positive health outcomes",
                "{intervention_variant} {outcome_variant} health benefits",
                "{intervention_variant} {outcome_variant} contradiction evidence",
                "{intervention_variant} {outcome_variant} no evidence",
                "{intervention_variant} {outcome_variant} not associated",
                "{intervention_variant} {outcome_variant} no significant effect",
                "{intervention_variant} {outcome_variant} limited evidence",
                "{intervention_variant} {outcome_variant} ineffective",
            ]
        )
    elif direction == "negative":
        query_templates.extend(
            [
                "{intervention_variant} {outcome_variant} adverse effects",
                "{intervention_variant} {outcome_variant} harmful effects",
                "{intervention_variant} {outcome_variant} contradiction evidence",
                "{intervention_variant} {outcome_variant} not associated with harm",
                "{intervention_variant} {outcome_variant} safety review",
                "{intervention_variant} {outcome_variant} protective effect",
                "{intervention_variant} {outcome_variant} beneficial effect",
            ]
        )
    else:
        query_templates.extend(
            [
                "{intervention_variant} {outcome_variant} contradiction evidence",
                "{intervention_variant} {outcome_variant} no evidence",
                "{intervention_variant} {outcome_variant} not associated",
                "{intervention_variant} {outcome_variant} limited evidence",
            ]
        )
    if context_tail:
        query_templates.extend(
            [
                "{intervention_variant} {outcome_variant} " + context_tail,
                "{claim_variant} " + context_tail + " evidence",
            ]
        )
    if desired_depth == "deep":
        query_templates.extend(
            [
                "{intervention_variant} {outcome_variant} sample size limitation",
                "{intervention_variant} {outcome_variant} subgroup analysis",
                "{intervention_variant} {outcome_variant} adverse events",
                "{intervention_variant} {outcome_variant} clinical consensus statement",
                "{intervention_variant} {outcome_variant} fails to demonstrate",
                "{intervention_variant} {outcome_variant} ineffective",
            ]
        )

    queries: list[str] = []
    subject_pool = subject_variants or [subject]
    intervention_pool = intervention_variants or [intervention]
    outcome_pool = [*dict.fromkeys([*(outcome_variants or [outcome]), *outcome_expansions])]
    claim_pool = claim_variants or [claim_text]

    for template in query_templates:
        for claim_variant in claim_pool[:3]:
            for subject_variant in subject_pool[:3]:
                for intervention_variant in intervention_pool[:3]:
                    for outcome_variant in outcome_pool[:3]:
                        query = _clean_query_phrase(
                            template.format(
                                claim_variant=claim_variant,
                                subject_variant=subject_variant,
                                intervention_variant=intervention_variant,
                                outcome_variant=outcome_variant,
                            )
                        )
                        if query and query not in queries:
                            queries.append(query)
                        if len(queries) >= target_count:
                            return queries

    return queries[:target_count]


def _target_query_count(semantics: ClaimSemantics, focus_terms: list[str], context: str, desired_depth: str) -> int:
    if desired_depth == "quick":
        base = 12
    elif desired_depth == "deep":
        base = 30
    else:
        base = 22
    if semantics.relationshipType == "causal":
        base += 3
    if semantics.strength >= 4:
        base += 3
    if semantics.impliedCausation:
        base += 2
    if len(focus_terms) >= 5:
        base += 2
    if _clean_phrase(context):
        base += 2

    if desired_depth == "quick":
        floor, ceiling = 10, 18
    elif desired_depth == "deep":
        floor, ceiling = 28, 48
    else:
        floor, ceiling = 20, 36
    return max(floor, min(ceiling, base))


def _llm_semantic_pass(claim: str, context: str, baseline: ClaimSemantics, claim_type: str, red_flags: list[str]) -> ClaimAnalyzerOutput | None:
    return generate_structured_output(
        "reasoning",
        (
            "You are the Claim Analyst for a health-claim investigation. "
            "Professional role: medical doctor with strong clinical reasoning discipline. "
            "Goal: preserve the full meaning of the claim, identify what is actually being asserted, and flag wording that outruns the evidence. "
            "Standpoint: clinically cautious, evidence-first, and strict about overclaiming. "
            "Parse the claim as one intact meaning-preserving assertion. "
            "Return JSON only with claimType, summary, focusTerms, redFlags, subject, intervention, action, outcome, relationshipType, and strength."
        ),
        {
            "claim": claim,
            "context": context,
            "baseline": {
                "claimType": claim_type,
                "redFlags": red_flags,
                "semantics": baseline.model_dump(),
            },
            "instructions": [
                "Do not split the claim into unrelated fragments.",
                "Extract subject, intervention, and outcome explicitly.",
                "Use relationshipType values causal, correlational, or opinion.",
                "Use the strength scale exactly: 1 speculative, 3 moderate, 5 absolute.",
                "Preserve caution: limited or inconclusive evidence is not support.",
            ],
        },
        ClaimAnalyzerOutput,
        preferred_providers=["claude", "openai"],
    )


def _llm_semantic_check(claim: str, context: str, draft: ClaimAnalyzerOutput, baseline: ClaimSemantics) -> ClaimAnalyzerOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You are the verifier for a health-claim semantic analysis. "
            "Professional role: senior clinical reviewer auditing the Claim Analyst. "
            "Goal: correct semantic drift, over-fragmentation, and casual wording errors without rewriting for style alone. "
            "Standpoint: preserve the real claim, be strict about causation, and keep unsupported certainty visible as risk. "
            "Review the draft claim parsing and return JSON only with claimType, summary, focusTerms, redFlags, subject, intervention, action, outcome, relationshipType, and strength."
        ),
        {
            "claim": claim,
            "context": context,
            "draft": draft.model_dump(),
            "baseline": baseline.model_dump(),
            "instructions": [
                "Preserve the full meaning of the claim and correct any over-fragmentation.",
                "Be strict about exaggerated language and causal wording.",
                "If the draft is sound, keep it close rather than rewriting for style alone.",
            ],
        },
        ClaimAnalyzerOutput,
        preferred_providers=["openai", "gemini", "claude"],
    )


def _llm_semantic_arbiter(
    claim: str,
    context: str,
    primary: ClaimAnalyzerOutput,
    checker: ClaimAnalyzerOutput,
    baseline: ClaimSemantics,
) -> ClaimAnalyzerOutput | None:
    return generate_structured_output(
        "consensus",
        (
            "You arbitrate a disagreement in health-claim semantic parsing. "
            "Return JSON only with claimType, summary, focusTerms, redFlags, subject, intervention, action, outcome, relationshipType, and strength."
        ),
        {
            "claim": claim,
            "context": context,
            "baseline": baseline.model_dump(),
            "primary": primary.model_dump(),
            "checker": checker.model_dump(),
            "instructions": [
                "Prefer the more conservative causal interpretation when the analyses disagree.",
                "Preserve the full meaning of the original claim.",
            ],
        },
        ClaimAnalyzerOutput,
        preferred_providers=["openai", "gemini", "claude"],
    )


def analyze_claim(
    claim: str,
    context: str = "",
    desired_depth: str = "standard",
    nlp_cloud_signals: NlpCloudClaimSignals | None = None,
) -> ClaimAnalysis:
    cleaned_claim = _clean_phrase(claim)
    focus_terms = _focus_terms(f"{cleaned_claim} {context}")
    red_flags, language_risk = _language_flags(cleaned_claim)
    heuristics = _semantic_frame(cleaned_claim)
    claim_type = _claim_type(cleaned_claim)
    nlp_cloud_signals = nlp_cloud_signals or refine_claim_signals(cleaned_claim, context)

    llm_analysis = _llm_semantic_pass(cleaned_claim, context, heuristics, claim_type, red_flags)
    if llm_analysis is not None:
        semantic_check = _llm_semantic_check(cleaned_claim, context, llm_analysis, heuristics)
        if semantic_check is not None and (
            semantic_check.relationshipType != llm_analysis.relationshipType
            or semantic_check.strength != llm_analysis.strength
            or semantic_check.subject != llm_analysis.subject
            or semantic_check.outcome != llm_analysis.outcome
        ):
            llm_analysis = _llm_semantic_arbiter(cleaned_claim, context, llm_analysis, semantic_check, heuristics) or semantic_check
        else:
            llm_analysis = semantic_check or llm_analysis
    semantics = heuristics
    direction = _claim_direction(cleaned_claim, heuristics)
    summary = (
        f'The claim is treated as one semantic assertion about {heuristics.subject or "the subject"}, '
        f'its claimed intervention "{heuristics.intervention}", action "{heuristics.action}", outcome "{heuristics.outcome}", '
        f'and {heuristics.relationshipType} relationship. The current analysis treats it as a {direction} evidence-direction hypothesis. '
        f'It carries a {heuristics.strength}/5 claim-strength profile and a '
        f'{_risk_label(language_risk).lower()} language profile.'
    )

    if llm_analysis is not None:
        semantics = heuristics.model_copy(
            update={
                "subject": llm_analysis.subject or heuristics.subject,
                "intervention": llm_analysis.intervention or heuristics.intervention,
                "action": llm_analysis.action or heuristics.action,
                "outcome": llm_analysis.outcome or heuristics.outcome,
                "relationshipType": llm_analysis.relationshipType if llm_analysis.relationshipType in {"causal", "correlational", "opinion"} else heuristics.relationshipType,
                "strength": llm_analysis.strength or heuristics.strength,
            }
        )
        claim_type = llm_analysis.claimType.strip() or claim_type
        focus_terms = [*dict.fromkeys([*focus_terms, *(term.strip().lower() for term in llm_analysis.focusTerms if term.strip())])][:10]
        red_flags = [*dict.fromkeys([*red_flags, *(flag.strip() for flag in llm_analysis.redFlags if flag.strip())])]
        summary = llm_analysis.summary.strip() or summary

    if nlp_cloud_signals is not None:
        focus_terms = [*dict.fromkeys([*focus_terms, *(item.strip().lower() for item in nlp_cloud_signals.entities if item.strip())])][:10]
        semantics = semantics.model_copy(
            update={
                "relationshipType": nlp_cloud_signals.relationshipType or semantics.relationshipType,
            }
        )
        claim_type = nlp_cloud_signals.claimDomain or claim_type

    claim_strength = max(semantics.strength, min(5, max(1, round(language_risk / 20) + 1)))
    if nlp_cloud_signals is not None and nlp_cloud_signals.strength is not None:
        claim_strength = max(claim_strength, nlp_cloud_signals.strength)
    semantics = semantics.model_copy(update={"strength": claim_strength})
    queries = _generate_queries(cleaned_claim, context, semantics, focus_terms, desired_depth)
    atomic_claim = AtomicClaim(
        text=cleaned_claim,
        strength=claim_strength,
        rationale=(
            f"The claim is evaluated as a whole statement about {semantics.subject or 'the subject'} "
            f"and whether the intervention {semantics.intervention} {semantics.action} {semantics.outcome}."
        ),
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
        semantics=semantics,
        nlpEntities=nlp_cloud_signals.entities if nlp_cloud_signals is not None else [],
        claimDomain=claim_type,
    )
