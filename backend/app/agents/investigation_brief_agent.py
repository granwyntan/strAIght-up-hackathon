from pydantic import BaseModel, Field

from ..ai import generate_structured_output


class InvestigationBriefOutput(BaseModel):
    summary: str = Field(min_length=20, max_length=500)
    workingContext: str = Field(min_length=20, max_length=1200)
    goal: str = Field(min_length=10, max_length=220)
    guardrails: list[str] = Field(default_factory=list)
    followUpAngles: list[str] = Field(default_factory=list)


def _fallback_context(claim: str, user_context: str, desired_depth: str) -> InvestigationBriefOutput:
    cleaned_user_context = user_context.strip()
    working_context = cleaned_user_context or (
        "Primary goal: determine whether the claim is truthful, overstated, uncertain, or false, "
        "using current evidence quality, contradiction checks, and quote-grounded sources."
    )
    return InvestigationBriefOutput(
        summary=f"Frame the review around whether the claim is supportable as written at {desired_depth} depth.",
        workingContext=working_context,
        goal="Prioritize truthfulness, contradiction evidence, and up-to-date evidence quality.",
        guardrails=[
            "Do not treat limited or inconclusive evidence as support.",
            "Surface contradiction evidence clearly when it directly addresses the claim.",
            "Prefer current high-quality sources and exact quote verification where possible.",
        ],
        followUpAngles=[
            "What exact outcome is being promised?",
            "Is the wording causal, absolute, or merely associative?",
            "What would strong contradiction evidence look like for this claim?",
        ],
    )


def create_investigation_brief(claim: str, user_context: str, desired_depth: str) -> InvestigationBriefOutput:
    fallback = _fallback_context(claim, user_context, desired_depth)

    draft = generate_structured_output(
        "reasoning",
        (
            "You are the Investigation Brief Agent for GramWIN. "
            "Professional role: clinical intake strategist and truth guard for a health-claim investigation. "
            "Goal: create a concise internal working brief that helps the downstream agents uphold truths, expose falsehoods or hoaxes, "
            "reduce misinformation risk, and stay current and evidence-grounded. "
            "Standpoint: cautious, anti-hallucination, and strict about overclaiming. "
            "Return JSON only with summary, workingContext, goal, guardrails, and followUpAngles."
        ),
        {
            "claim": claim,
            "user_context": user_context,
            "desired_depth": desired_depth,
            "app_goals": [
                "Keep the investigation truthful and current.",
                "Bring falsehoods, hoaxes, and overstated claims to light.",
                "Avoid misinformation, hallucinated certainty, and unsupported medical framing.",
                "Keep the internal context short, useful, and relevant to the claim.",
            ],
            "instructions": [
                "Do not ask the user follow-up questions.",
                "If the user context is sparse, infer only safe internal guidance and keep it concise.",
                "Focus on what the downstream search, validation, and consensus agents need to know.",
                "Do not turn this into a long essay.",
            ],
        },
        InvestigationBriefOutput,
        preferred_providers=["openai", "claude", "gemini"],
    )
    if draft is None:
        return fallback

    checked = generate_structured_output(
        "audit",
        (
            "You are the checker for an investigation brief in GramWIN. "
            "Professional role: senior auditor reviewing the intake brief before the evidence pipeline begins. "
            "Goal: remove unnecessary context, preserve truth-seeking guardrails, and keep the brief accurate and useful. "
            "Return JSON only with summary, workingContext, goal, guardrails, and followUpAngles."
        ),
        {
            "claim": claim,
            "user_context": user_context,
            "desired_depth": desired_depth,
            "draft": draft.model_dump(),
            "instructions": [
                "Keep the brief short and practical for downstream agents.",
                "Preserve anti-misinformation, anti-hallucination, and contradiction-seeking guardrails.",
                "Do not add facts that are not implied by the claim or the provided user context.",
            ],
        },
        InvestigationBriefOutput,
        preferred_providers=["claude", "openai", "gemini"],
    )
    return checked or draft
