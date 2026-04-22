import asyncio
from queue import Queue
from threading import Lock, Thread

from .. import repository
from ..agents.claim_analyzer import analyze_claim
from ..agents.citation_auditor import audit_citations
from ..agents.decision_agent import summarize_decision, user_facing_verdict_label
from ..agents.hoax_detector import detect_hoax_risk
from ..agents.investigation_brief_agent import create_investigation_brief
from ..agents.nlp_cloud_agent import refine_claim_with_nlp_cloud
from ..agents.consensus_reviewer import review_consensus
from ..agents.provider_panel import run_provider_panel
from ..agents.query_planner import refine_claim_analysis
from ..agents.quote_verifier import verify_quotes
from ..agents.quote_sentiment_agent import analyze_quote_sentiments
from ..agents.relevance_filter import filter_relevant_sources
from ..agents.reasoning_panel import reconcile_reasoning_panel
from ..agents.report_writer import draft_report
from ..agents.sentiment_consensus import apply_sentiment_consensus
from ..agents.source_credibility_agent import assess_source_credibility
from ..agents.source_scout import scout_sources
from ..agents.source_validator import validate_sources
from ..agents.study_classifier import classify_sources
from ..agents.verdict_reviewer import review_verdict
from ..ai import reset_stage_rotation
from ..context.builder import build_context
from ..models import InvestigationCreateRequest, InvestigationState, PipelineStepSummary
from ..core.workflow_engine import workflow_default_step_summaries, workflow_stage_by_key
from ..presentation import (
    build_claim_graph,
    build_evidence_graph,
    build_sections,
    build_sentiment_distribution,
    build_source_groups,
    build_source_registry,
    enrich_sources,
    infer_confidence_level,
)
from ..progress.tracker import ProgressTracker
from ..services.notifications import send_investigation_ready_notification
from ..settings import settings

_JOB_QUEUE: Queue[tuple[str, InvestigationCreateRequest]] = Queue()
_WORKER_LOCK = Lock()
_WORKERS_STARTED = False
DEPTH_SOURCE_WINDOWS: dict[str, tuple[int, int]] = {
    "quick": (30, 50),
    "standard": (70, 84),
    "deep": (100, 132),
}


def _default_step_summaries() -> list[PipelineStepSummary]:
    return workflow_default_step_summaries()


def _merge_step_summaries(
    current: list[PipelineStepSummary],
    *,
    step_key: str,
    status: str,
    summary: str,
    details: list[str] | None = None,
) -> list[PipelineStepSummary]:
    summaries = current or _default_step_summaries()
    next_steps: list[PipelineStepSummary] = []
    found = False
    for step in summaries:
        if step.key != step_key:
            next_steps.append(step)
            continue
        stage = workflow_stage_by_key(step_key)
        next_steps.append(
            step.model_copy(
                update={
                    "title": step.title or f"{stage.title} · {stage.role}",
                    "role": step.role or stage.role,
                    "goal": step.goal or stage.goal,
                    "status": status,
                    "summary": summary,
                    "details": details if details is not None else step.details,
                }
            )
        )
        found = True
    if not found:
        stage = workflow_stage_by_key(step_key)
        next_steps.append(
            PipelineStepSummary(
                key=step_key,
                title=f"{stage.title} · {stage.role}",
                role=stage.role,
                goal=stage.goal,
                status=status,
                summary=summary,
                details=details or [stage.goal],
            )
        )
    return next_steps


def _set_step_state(
    investigation_id: str,
    step_key: str,
    status: str,
    summary: str,
    *,
    details: list[str] | None = None,
    progress: int | None = None,
) -> None:
    def mutate(state: InvestigationState) -> InvestigationState:
        update: dict[str, object] = {
            "stepSummaries": _merge_step_summaries(
                state.stepSummaries,
                step_key=step_key,
                status=status,
                summary=summary,
                details=details,
            )
        }
        if progress is not None:
            update["progressPercent"] = progress
        return state.model_copy(update=update)

    repository.update_state(investigation_id, mutate)


def _fail_active_step(investigation_id: str, summary: str) -> None:
    def mutate(state: InvestigationState) -> InvestigationState:
        summaries = state.stepSummaries or _default_step_summaries()
        failed = False
        next_steps: list[PipelineStepSummary] = []
        for step in summaries:
            if not failed and step.status == "running":
                next_steps.append(step.model_copy(update={"status": "failed", "summary": summary}))
                failed = True
            else:
                next_steps.append(step)
        if not failed:
            next_steps = _merge_step_summaries(
                next_steps,
                step_key="finalizing_results",
                status="failed",
                summary=summary,
            )
        return state.model_copy(update={"stepSummaries": next_steps})

    repository.update_state(investigation_id, mutate)


def _worker_loop() -> None:
    while True:
        investigation_id, request = _JOB_QUEUE.get()
        try:
            asyncio.run(run_investigation(investigation_id, request))
        finally:
            _JOB_QUEUE.task_done()


def start_investigation_workers() -> None:
    global _WORKERS_STARTED
    with _WORKER_LOCK:
        if _WORKERS_STARTED:
            return
        worker_count = max(1, settings.background_worker_count)
        for index in range(worker_count):
            Thread(target=_worker_loop, daemon=True, name=f"gramwin-investigation-worker-{index + 1}").start()
        _WORKERS_STARTED = True


def queue_investigation(investigation_id: str, request: InvestigationCreateRequest) -> None:
    start_investigation_workers()
    _JOB_QUEUE.put((investigation_id, request))


async def _run_stage(investigation_id: str, agent_key: str, title: str, fn):
    run_id = repository.start_agent_run(investigation_id, agent_key, title)
    try:
        result, summary = await fn()
        repository.finish_agent_run(run_id, "completed", summary)
        return result
    except Exception as exc:
        repository.finish_agent_run(run_id, "failed", str(exc))
        raise


async def _with_summary(awaitable, summary: str):
    return await awaitable, summary


def _depth_source_window(desired_depth: str) -> tuple[int, int]:
    return DEPTH_SOURCE_WINDOWS.get(desired_depth, DEPTH_SOURCE_WINDOWS["standard"])


def _source_trim_rank(source) -> tuple[int, int, int, int, int, int]:
    quality_bonus = {"verified": 3, "established": 2, "general": 1}.get(source.sourceQualityLabel, 1)
    quote_bonus = 1 if source.quoteVerified else 0
    return (
        source.relevanceScore,
        source.citationIntegrity,
        round(source.sourceWeight * 100),
        round(source.confidenceFactor * 100),
        (source.sourceScore * 10) + source.evidenceScore + quality_bonus + quote_bonus,
        len((source.extractedText or source.snippet or "").split()),
    )


def _source_direction(source) -> str:
    if source.sentiment == "negative":
        return "contradictory"
    if source.sentiment == "positive":
        return "supportive"
    if source.stance in {"supportive", "mixed", "contradictory"}:
        return source.stance
    return "mixed"


def _trim_sources_for_depth(sources, desired_depth: str):
    _, target_max = _depth_source_window(desired_depth)
    if len(sources) <= target_max:
        return sources

    ranked = sorted(sources, key=_source_trim_rank, reverse=True)
    contradictory = [source for source in ranked if _source_direction(source) == "contradictory"]
    mixed = [source for source in ranked if _source_direction(source) == "mixed"]

    contradiction_floor_map = {"quick": 5, "standard": 8, "deep": 12}
    mixed_floor_map = {"quick": 7, "standard": 12, "deep": 18}
    domain_cap_map = {"quick": 2, "standard": 3, "deep": 4}
    contradiction_target = min(
        len(contradictory),
        max(contradiction_floor_map.get(desired_depth, 8), round(target_max * 0.18)),
    )
    mixed_target = min(
        len(mixed),
        max(mixed_floor_map.get(desired_depth, 12), round(target_max * 0.22)),
    )
    domain_cap = domain_cap_map.get(desired_depth, 3)

    selected = []
    seen_ids: set[str] = set()
    domain_counts: dict[str, int] = {}

    def add_candidates(candidates, limit: int | None = None, *, ignore_domain_cap: bool = False):
        added = 0
        for source in candidates:
            if len(selected) >= target_max:
                break
            if limit is not None and added >= limit:
                break
            if source.id in seen_ids:
                continue
            domain = (source.domain or "unknown").lower()
            if not ignore_domain_cap and domain_counts.get(domain, 0) >= domain_cap:
                continue
            selected.append(source)
            seen_ids.add(source.id)
            domain_counts[domain] = domain_counts.get(domain, 0) + 1
            added += 1

    add_candidates(contradictory, contradiction_target)
    add_candidates(mixed, mixed_target)
    add_candidates(ranked)
    if len(selected) < target_max:
        add_candidates(ranked, ignore_domain_cap=True)
    return selected[:target_max]


def _resolved_mode(request: InvestigationCreateRequest) -> str:
    if request.mode == "offline":
        return "offline"
    if request.mode == "live":
        return "live" if settings.has_tavily or settings.has_serpapi or settings.has_exa else "offline"
    return "live" if settings.has_tavily or settings.has_serpapi or settings.has_exa else "offline"


def _state_cache_status(sources) -> str:
    if not sources:
        return "fallback"
    if any(source.cacheStatus == "fallback" for source in sources):
        return "fallback"
    if any(source.cacheStatus == "cached" for source in sources):
        return "cached"
    return "live"


def _merge_duplicate_sources(sources):
    merged_by_key = {}
    quality_rank = {"general": 1, "established": 2, "verified": 3}
    sentiment_rank = {"negative": 3, "neutral": 2, "positive": 1}
    for source in sources:
        key = (
            (source.evidenceUrl or source.resolvedUrl or source.discoveredUrl or source.url).strip().lower()
            or f"{source.domain.lower()}::{source.title.strip().lower()}"
        )
        existing = merged_by_key.get(key)
        if existing is None:
            merged_by_key[key] = source
            continue

        current_strength = (
            existing.directEvidenceEligible,
            existing.quoteVerified,
            quality_rank.get(existing.sourceQualityLabel, 1),
            existing.citationIntegrity,
            existing.relevanceScore,
            existing.evidenceScore,
            existing.sourceScore,
        )
        incoming_strength = (
            source.directEvidenceEligible,
            source.quoteVerified,
            quality_rank.get(source.sourceQualityLabel, 1),
            source.citationIntegrity,
            source.relevanceScore,
            source.evidenceScore,
            source.sourceScore,
        )
        primary = source if incoming_strength > current_strength else existing
        secondary = existing if primary is source else source
        merged_citations = []
        seen_citation_urls: set[str] = set()
        for citation in [*primary.citations, *secondary.citations]:
            citation_url = citation.url.strip().lower()
            if citation_url and citation_url not in seen_citation_urls:
                merged_citations.append(citation)
                seen_citation_urls.add(citation_url)
        merged_by_key[key] = primary.model_copy(
            update={
                "notes": list(dict.fromkeys([*primary.notes, *secondary.notes]))[:16],
                "credibilityNotes": list(dict.fromkeys([*primary.credibilityNotes, *secondary.credibilityNotes]))[:10],
                "methodologyInsights": list(dict.fromkeys([*primary.methodologyInsights, *secondary.methodologyInsights]))[:8],
                "biasNotes": list(dict.fromkeys([*primary.biasNotes, *secondary.biasNotes]))[:6],
                "citations": merged_citations[:12],
                "query": " | ".join(list(dict.fromkeys([part for part in [primary.query, secondary.query] if part]))[:4]),
                "sourceProvider": ", ".join(list(dict.fromkeys([part for part in [primary.sourceProvider, secondary.sourceProvider] if part]))[:4]),
                "citationIntegrity": max(primary.citationIntegrity, secondary.citationIntegrity),
                "relevanceScore": max(primary.relevanceScore, secondary.relevanceScore),
                "semanticSimilarity": max(primary.semanticSimilarity, secondary.semanticSimilarity),
                "sourceScore": max(primary.sourceScore, secondary.sourceScore),
                "evidenceScore": max(primary.evidenceScore, secondary.evidenceScore),
                "spamRiskScore": max(primary.spamRiskScore, secondary.spamRiskScore),
                "sourceWeight": max(primary.sourceWeight, secondary.sourceWeight),
                "confidenceFactor": max(primary.confidenceFactor, secondary.confidenceFactor),
                "agreementFactor": max(primary.agreementFactor, secondary.agreementFactor),
                "studyQualityFactor": max(primary.studyQualityFactor, secondary.studyQualityFactor),
                "clarityFactor": max(primary.clarityFactor, secondary.clarityFactor),
                "directEvidenceEligible": primary.directEvidenceEligible or secondary.directEvidenceEligible,
                "quoteVerified": primary.quoteVerified or secondary.quoteVerified,
                "linkAlive": primary.linkAlive or secondary.linkAlive,
                "contentAccessible": primary.contentAccessible or secondary.contentAccessible,
                "sentiment": primary.sentiment if sentiment_rank.get(primary.sentiment, 0) >= sentiment_rank.get(secondary.sentiment, 0) else secondary.sentiment,
                "sourceQualityLabel": (
                    primary.sourceQualityLabel
                    if quality_rank.get(primary.sourceQualityLabel, 1) >= quality_rank.get(secondary.sourceQualityLabel, 1)
                    else secondary.sourceQualityLabel
                ),
            }
        )
    return list(merged_by_key.values())


def _require_sources(
    sources,
    *,
    stage_label: str,
    resolved_mode: str,
    guidance: str,
) -> None:
    if sources:
        return
    if resolved_mode == "live":
        raise RuntimeError(f"{stage_label} produced 0 sources during live mode. {guidance}")
    raise RuntimeError(f"{stage_label} produced 0 sources in offline mode. {guidance}")


def _truth_classification(verdict: str | None) -> str:
    if verdict == "trustworthy":
        return "Likely fact pattern"
    if verdict == "untrustworthy":
        return "Likely falsehood or hoax"
    return "Needs nuance"


def _max_misinformation_risk(*risks: str | None) -> str | None:
    order = {"low": 1, "moderate": 2, "high": 3}
    cleaned = [risk for risk in risks if risk in order]
    if not cleaned:
        return None
    return max(cleaned, key=lambda item: order[item])


def _apply_hoax_penalty(score: int, verdict: str, risk: str | None) -> tuple[int, str]:
    adjusted_score = score
    adjusted_verdict = verdict
    if risk == "high":
        adjusted_score = max(0, score - 8)
        if verdict == "trustworthy":
            adjusted_verdict = "overstated" if adjusted_score >= 40 else "untrustworthy"
    elif risk == "moderate":
        adjusted_score = max(0, score - 4)
        if verdict == "trustworthy" and adjusted_score < 70:
            adjusted_verdict = "mixed"
    return adjusted_score, adjusted_verdict


async def run_investigation(investigation_id: str, request: InvestigationCreateRequest) -> None:
    tracker = ProgressTracker(investigation_id)
    repository.set_investigation_status(investigation_id, "running", summary="Investigation running.")
    reset_stage_rotation()
    repository.update_state(
        investigation_id,
        lambda state: state.model_copy(
            update={
                "progressPercent": 3,
                "discoveredDomains": repository.list_known_source_domains(),
                "stepSummaries": _default_step_summaries(),
            }
        ),
    )

    try:
        resolved_mode = _resolved_mode(request)
        context = build_context(request)
        tracker.info("orchestrator", "Context assembled for the investigation run.")
        if request.mode == "live" and resolved_mode == "offline":
            tracker.warning("orchestrator", "Live search was requested, but the app had to fall back to saved or seeded evidence.")
        elif resolved_mode == "live":
            tracker.info("orchestrator", "Live web evidence search is active for this review.")
        else:
            tracker.info("orchestrator", "Saved or seeded evidence is being used for this review.")

        investigation_brief = None
        enriched_context = request.context
        _set_step_state(
            investigation_id,
            "briefing",
            "running",
            "Creating a truth-first investigation brief for the rest of the workflow.",
            progress=5,
        )
        if settings.llm_agents_enabled:
            investigation_brief = await _run_stage(
                investigation_id,
                "brief",
                "Investigation brief",
                lambda: asyncio.to_thread(
                    lambda: (
                        create_investigation_brief(request.claim, request.context, request.desiredDepth),
                        "Built a working brief so the rest of the agents stay anchored to the exact claim, evidence boundaries, and contradiction paths.",
                    )
                ),
            )
            enriched_context = investigation_brief.workingContext or request.context
            tracker.info("brief", "Investigation brief set the truth-first guardrails for the run.")
            briefing_details = [
                investigation_brief.summary,
                *investigation_brief.guardrails[:4],
            ]
        else:
            tracker.info("brief", "Investigation brief skipped because LLM providers are unavailable.")
            briefing_details = [
                "No LLM brief was available, so the workflow used the raw claim and context directly.",
            ]
        _set_step_state(
            investigation_id,
            "briefing",
            "completed",
            "The investigation brief is ready and the downstream stages have guardrails.",
            details=briefing_details,
            progress=8,
        )

        _set_step_state(
            investigation_id,
            "nlp_claim_scan",
            "running",
            "Using NLP Cloud to extract entities, claim domain, and relationship type.",
            progress=9,
        )
        nlp_cloud_signals = None
        if settings.has_nlpcloud:
            nlp_cloud_signals = await _run_stage(
                investigation_id,
                "nlp_claim",
                "NLP Cloud claim scan",
                lambda: asyncio.to_thread(
                    lambda: (
                        refine_claim_with_nlp_cloud(request.claim, enriched_context),
                        "Used NLP Cloud to extract entities and wording signals before the deeper claim framing step.",
                    )
                ),
            )
            tracker.info("nlp_claim", "NLP Cloud returned specialist claim-analysis signals.")
        else:
            tracker.info("nlp_claim", "NLP Cloud is not configured, so the workflow continued without the specialist NLP pass.")
        nlp_details = []
        if nlp_cloud_signals is not None:
            nlp_details.extend(
                [
                    f"Detected entities: {', '.join(nlp_cloud_signals.entities[:6]) or 'none detected'}.",
                    f"Relationship type: {nlp_cloud_signals.relationshipType or 'not classified'}.",
                    f"Claim domain: {nlp_cloud_signals.claimDomain or 'not classified'}.",
                    f"Wording strength: {nlp_cloud_signals.strength or 'not classified'}.",
                ]
            )
        else:
            nlp_details.append("No specialist NLP Cloud output was available for this run.")
        _set_step_state(
            investigation_id,
            "nlp_claim_scan",
            "completed",
            "The NLP claim scan finished and its signals are ready for the claim-framing stage.",
            details=nlp_details,
            progress=14,
        )

        _set_step_state(
            investigation_id,
            "claim_analysis",
            "running",
            "Framing the claim as one medical assertion and scoring its wording risk.",
            progress=15,
        )
        claim_analysis = await _run_stage(
            investigation_id,
            "claim",
            "Claim analyzer",
            lambda: asyncio.to_thread(
                lambda: (
                    analyze_claim(request.claim, enriched_context, request.desiredDepth, nlp_cloud_signals=nlp_cloud_signals),
                    "Framed the claim semantically, scored its wording discipline, and preserved its full meaning.",
                )
            ),
        )
        tracker.info("claim", "Claim analyzer finished semantic framing and language-risk scoring.")
        _set_step_state(
            investigation_id,
            "claim_analysis",
            "completed",
            "The claim framing step is complete and the working semantics are locked in.",
            details=[
                claim_analysis.summary,
                f"Claim domain: {claim_analysis.claimDomain or claim_analysis.claimType}.",
                f"NLP entities: {', '.join(claim_analysis.nlpEntities[:6]) or 'none detected'}.",
                f"Language risk: {claim_analysis.languageRiskScore}/100 ({claim_analysis.languageLabel}).",
            ],
            progress=20,
        )

        _set_step_state(
            investigation_id,
            "query_planning",
            "running",
            "Building search paths across support, contradiction, and hoax-sensitive angles.",
            progress=21,
        )
        if settings.llm_agents_enabled:
            claim_analysis = await _run_stage(
                investigation_id,
                "planner",
                "Query planner",
                lambda: asyncio.to_thread(
                    lambda: (
                        refine_claim_analysis(request.claim, enriched_context, request.desiredDepth, claim_analysis),
                        "Expanded the search plan with support, contradiction, and overclaim-sensitive evidence paths.",
                    )
                ),
            )
            tracker.info("planner", "Query planner expanded the evidence-search strategy.")
        else:
            tracker.info("planner", "Using the baseline search plan because LLM providers are unavailable.")
        _set_step_state(
            investigation_id,
            "query_planning",
            "completed",
            f"Prepared {len(claim_analysis.generatedQueries)} search paths for the evidence run.",
            details=claim_analysis.generatedQueries[:8],
            progress=26,
        )

        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(
                update={
                    "claimAnalysis": claim_analysis,
                    "recommendedQueries": claim_analysis.generatedQueries,
                    "progressPercent": 26,
                    "resolvedMode": resolved_mode,
                    "cacheStatus": "live",
                    "discoveredDomains": repository.list_known_source_domains(),
                    "orchestrationNotes": [
                        f"Mode resolved to {resolved_mode}.",
                        f"Prepared {len(claim_analysis.generatedQueries)} semantic queries.",
                        *( [investigation_brief.summary] if investigation_brief is not None else [] ),
                        *(
                            [
                                f"NLP domain: {nlp_cloud_signals.claimDomain or 'unknown'}.",
                                f"NLP relationship: {nlp_cloud_signals.relationshipType or 'unknown'}.",
                            ]
                            if nlp_cloud_signals is not None
                            else []
                        ),
                    ],
                }
            ),
        )

        _set_step_state(
            investigation_id,
            "source_retrieval",
            "running",
            "Running broad web, deeper reasoning, and contradiction-heavy retrieval passes in parallel.",
            progress=28,
        )
        raw_sources = await _run_stage(
            investigation_id,
            "search",
            "Source scout",
            lambda: _with_summary(
                scout_sources(request.claim, claim_analysis.generatedQueries, request.sourceUrls, resolved_mode, request.desiredDepth),
                "Collected a candidate evidence pool across support, contradiction, and uncertainty paths.",
            ),
        )
        tracker.info("search", f"Source scout collected {len(raw_sources)} candidate sources.")
        _require_sources(
            raw_sources,
            stage_label="Source retrieval",
            resolved_mode=resolved_mode,
            guidance="Tavily and SerpAPI did not return a usable evidence pool. Check API connectivity, quotas, and search-provider health.",
        )
        repository.register_source_domains(raw_sources)
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(
                update={
                    "sources": raw_sources,
                    "progressPercent": 36,
                    "cacheStatus": _state_cache_status(raw_sources),
                    "discoveredDomains": repository.list_known_source_domains(),
                }
            ),
        )
        _set_step_state(
            investigation_id,
            "source_retrieval",
            "completed",
            f"Collected {len(raw_sources)} candidate sources before link and credibility screening.",
            details=[
                f"Mode: {resolved_mode}.",
                f"Depth: {request.desiredDepth}.",
                "Live web search is not restricted to pre-verified domains; authority tiers only affect weighting later.",
                *claim_analysis.generatedQueries[:4],
            ],
            progress=36,
        )

        _set_step_state(
            investigation_id,
            "link_validation",
            "running",
            "Checking reachability, rescuing blocked-but-usable excerpts, and preserving strong live web evidence.",
            progress=38,
        )
        validated_sources = await _run_stage(
            investigation_id,
            "validate",
            "Source validator",
            lambda: _with_summary(
                validate_sources(request.claim, raw_sources, resolved_mode),
                "Removed dead links, unreadable pages, and inaccessible evidence where possible.",
            ),
        )
        tracker.info("validate", f"Source validator retained {len(validated_sources)} accessible sources.")
        _require_sources(
            validated_sources,
            stage_label="Link validation",
            resolved_mode=resolved_mode,
            guidance="The validator rejected every candidate source. This usually means the retrieved links were blocked, dead, or off-topic.",
        )
        repository.register_source_domains(validated_sources)
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(
                update={
                    "sources": validated_sources,
                    "progressPercent": 44,
                    "cacheStatus": _state_cache_status(validated_sources),
                    "discoveredDomains": repository.list_known_source_domains(),
                }
            ),
        )
        _set_step_state(
            investigation_id,
            "link_validation",
            "completed",
            f"Retained {len(validated_sources)} readable sources after link validation.",
            details=[
                "Truly dead links were removed, but blocked or timed-out pages could still survive as limited-access evidence when the live search excerpt was strong enough.",
                "Authority tiers are weighting hints only, so general web sources can still survive if they are relevant and readable.",
                f"Readable sources retained: {len(validated_sources)}.",
            ],
            progress=44,
        )

        _set_step_state(
            investigation_id,
            "credibility_audit",
            "running",
            "Scoring domain authority, promotional risk, and source trust signals.",
            progress=46,
        )
        credibility_checked_sources = await _run_stage(
            investigation_id,
            "credibility",
            "Source credibility agent",
            lambda: asyncio.to_thread(
                lambda: (
                    assess_source_credibility(request.claim, validated_sources),
                    "Scored domain authority, citation discipline, and promotional-risk signals before weighting.",
                )
            ),
        )
        tracker.info("credibility", "Source credibility audit completed.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(
                update={
                    "sources": credibility_checked_sources,
                    "progressPercent": 52,
                    "cacheStatus": _state_cache_status(credibility_checked_sources),
                }
            ),
        )
        _set_step_state(
            investigation_id,
            "credibility_audit",
            "completed",
            f"Credibility auditing finished for {len(credibility_checked_sources)} sources.",
            details=[
                "Authority tiers, spam risk, and trust signals were applied before later scoring.",
                f"Verified or established sources in pool: {sum(1 for source in credibility_checked_sources if source.sourceQualityLabel != 'general')}.",
                f"General-web sources in pool: {sum(1 for source in credibility_checked_sources if source.sourceQualityLabel == 'general')}.",
            ],
            progress=52,
        )

        _set_step_state(
            investigation_id,
            "relevance_screen",
            "running",
            "Removing adjacent or generic pages that do not truly answer the claim.",
            progress=54,
        )
        relevant_sources = await _run_stage(
            investigation_id,
            "relevance",
            "Relevance filter",
            lambda: _with_summary(
                filter_relevant_sources(request.claim, claim_analysis, credibility_checked_sources),
                "Kept only evidence that materially addresses the claim or its contradiction path.",
            ),
        )
        depth_calibrated_sources = _trim_sources_for_depth(relevant_sources, request.desiredDepth)
        tracker.info(
            "relevance",
            f"Relevance filter kept {len(relevant_sources)} sources and depth calibration retained {len(depth_calibrated_sources)}.",
        )
        _require_sources(
            depth_calibrated_sources,
            stage_label="Relevance screening",
            resolved_mode=resolved_mode,
            guidance="Sources were retrieved, but none survived the claim-matching filters. Try a clearer claim or inspect provider/search quality.",
        )
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(
                update={
                    "sources": depth_calibrated_sources,
                    "progressPercent": 60,
                    "cacheStatus": _state_cache_status(depth_calibrated_sources),
                }
            ),
        )
        target_min, target_max = _depth_source_window(request.desiredDepth)
        _set_step_state(
            investigation_id,
            "relevance_screen",
            "completed",
            f"Relevance screening kept {len(depth_calibrated_sources)} claim-matched sources for {request.desiredDepth} depth.",
            details=[
                "Generic or only loosely adjacent pages were removed from the working evidence pool.",
                "Contradiction evidence stayed visible when it answered the same question from the opposite direction.",
                f"Relevant sources before depth calibration: {len(relevant_sources)}.",
                f"Target source window for this depth: {target_min} to {target_max}.",
                f"Working sources retained after depth calibration: {len(depth_calibrated_sources)}.",
            ],
            progress=60,
        )

        _set_step_state(
            investigation_id,
            "study_citation_audit",
            "running",
            "Classifying study quality and auditing citation support before final stance analysis.",
            progress=62,
        )
        classified_sources = await _run_stage(
            investigation_id,
            "classify",
            "Study classifier",
            lambda: asyncio.to_thread(
                lambda: (
                    classify_sources(depth_calibrated_sources),
                    "Classified evidence tiers from review-level evidence down to case reports and general web material.",
                )
            ),
        )
        tracker.info("classify", "Study classifier assigned evidence tiers.")
        audited_sources = await _run_stage(
            investigation_id,
            "citations",
            "Citation auditor",
            lambda: _with_summary(
                audit_citations(request.claim, classified_sources),
                "Audited citation chains for breakage, weakness, and mismatch to the claim.",
            ),
        )
        tracker.info("citations", "Citation auditor completed reference-chain checks.")
        enriched_sources = enrich_sources(audited_sources, claim_analysis)
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(update={"sources": enriched_sources, "progressPercent": 72}),
        )
        _set_step_state(
            investigation_id,
            "study_citation_audit",
            "completed",
            "Study classification and citation auditing are complete.",
            details=[
                f"Review or RCT sources: {sum(1 for source in enriched_sources if source.evidenceTier in {'review', 'rct'})}.",
                f"Sources with citation integrity below 50: {sum(1 for source in enriched_sources if source.citationIntegrity < 50)}.",
                "The evidence pool now carries study-quality and citation-integrity signals into the later scoring steps.",
            ],
            progress=72,
        )

        _set_step_state(
            investigation_id,
            "quote_sentiment_analysis",
            "running",
            "Verifying quotes and classifying whether each source supports, weakens, or leaves the claim uncertain.",
            progress=74,
        )
        quote_verified_sources = await _run_stage(
            investigation_id,
            "quotes",
            "Quote verifier",
            lambda: _with_summary(
                verify_quotes(enriched_sources),
                "Verified highlighted quotes directly against accessible evidence text and removed unconfirmed wording.",
            ),
        )
        tracker.info("quotes", "Quote verification finished.")
        quote_sources, quote_distribution = await _run_stage(
            investigation_id,
            "quote_stance",
            "Quote sentiment agent",
            lambda: _with_summary(
                analyze_quote_sentiments(request.claim, quote_verified_sources),
                "Classified quote highlights as supportive, unsupportive, or uncertain.",
            ),
        )
        tracker.info(
            "quote_stance",
            f"Quote sentiment analysis labeled {quote_distribution.get('supportive', 0)} supportive, "
            f"{quote_distribution.get('uncertain', 0)} uncertain, and {quote_distribution.get('unsupportive', 0)} unsupportive quotes.",
        )
        sentiment_sources = await _run_stage(
            investigation_id,
            "sentiment",
            "Sentiment consensus",
            lambda: _with_summary(
                apply_sentiment_consensus(request.claim, quote_sources),
                "Ran the final support-versus-contradiction stance pass across the evidence pool.",
            ),
        )
        sentiment_sources = _merge_duplicate_sources(sentiment_sources)
        tracker.info("sentiment", "Support-versus-contradiction analysis finished.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(
                update={
                    "sources": sentiment_sources,
                    "progressPercent": 84,
                    "cacheStatus": _state_cache_status(sentiment_sources),
                    "discoveredDomains": repository.list_known_source_domains(),
                }
            ),
        )
        _set_step_state(
            investigation_id,
            "quote_sentiment_analysis",
            "completed",
            "Quote verification and source-direction analysis finished.",
            details=[
                f"Verified quotes kept: {sum(1 for source in sentiment_sources if source.quoteVerified)}.",
                f"Supportive quote highlights: {quote_distribution.get('supportive', 0)}.",
                f"Unsupportive quote highlights: {quote_distribution.get('unsupportive', 0)}.",
                f"Uncertain quote highlights: {quote_distribution.get('uncertain', 0)}.",
            ],
            progress=84,
        )

        _set_step_state(
            investigation_id,
            "hoax_detection",
            "running",
            "Scanning for hoax-style framing, evidence mismatch, and overclaim risk.",
            progress=86,
        )
        hoax_assessment = await _run_stage(
            investigation_id,
            "hoax",
            "Hoax detector",
            lambda: asyncio.to_thread(
                lambda: (
                    detect_hoax_risk(request.claim, claim_analysis, sentiment_sources),
                    "Scanned the claim for hoax-like patterns, overclaiming, and evidence mismatch.",
                )
            ),
        )
        tracker.info("hoax", f"Hoax detector rated the claim at {hoax_assessment.riskScore}/100 risk.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(
                update={
                    "hoaxSignals": hoax_assessment.signals,
                    "misinformationRisk": hoax_assessment.classification,
                    "progressPercent": 90,
                }
            ),
        )
        _set_step_state(
            investigation_id,
            "hoax_detection",
            "completed",
            f"Hoax detection finished with a {hoax_assessment.classification} misinformation-risk label.",
            details=[
                hoax_assessment.summary,
                *(f"{signal.label}: {signal.rationale}" for signal in hoax_assessment.signals[:4]),
            ],
            progress=90,
        )

        _set_step_state(
            investigation_id,
            "decision_engine",
            "running",
            "Combining weighted evidence, contradiction pressure, and source quality into the base score.",
            progress=91,
        )
        matrix, consensus_breakdown, score, verdict, narrative, strengths, concerns, misinformation_risk = await _run_stage(
            investigation_id,
            "decision",
            "Decision engine",
            lambda: asyncio.to_thread(
                lambda: (
                    summarize_decision(request.claim, claim_analysis, sentiment_sources),
                    "Calculated the weighted evidence score and baseline verdict before the panel review.",
                )
            ),
        )
        score, verdict = _apply_hoax_penalty(score, verdict, hoax_assessment.classification)
        misinformation_risk = _max_misinformation_risk(misinformation_risk, hoax_assessment.classification) or misinformation_risk
        strengths = list(dict.fromkeys([*strengths, f"Hoax-risk scan: {hoax_assessment.summary}"]))
        concerns = list(
            dict.fromkeys(
                [
                    *concerns,
                    *(f"{signal.label}: {signal.rationale}" for signal in hoax_assessment.signals[:4]),
                ]
            )
        )
        tracker.info("decision", "Decision engine produced the baseline credibility verdict.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(
                update={
                    "progressPercent": 94,
                    "truthClassification": _truth_classification(verdict),
                    "misinformationRisk": misinformation_risk,
                }
            ),
        )
        _set_step_state(
            investigation_id,
            "decision_engine",
            "completed",
            f"Base score settled at {score}/100 with a {verdict} verdict before the model panel challenge.",
            details=[
                f"Truth classification: {_truth_classification(verdict)}.",
                f"Weighted contradiction share: {round(consensus_breakdown.contradictionShare * 100)}%.",
                f"Misinformation risk: {misinformation_risk}.",
            ],
            progress=94,
        )

        _set_step_state(
            investigation_id,
            "cross_model_review",
            "running",
            "Running challenger reviews, reconciling them, and then auditing the result with the multi-model panel.",
            progress=95,
        )
        verdict_review = await _run_stage(
            investigation_id,
            "verdict_review",
            "Reasoning reviewer",
            lambda: asyncio.to_thread(
                lambda: (
                    review_verdict(
                        request.claim,
                        claim_analysis,
                        sentiment_sources,
                        matrix,
                        score,
                        verdict,
                    ),
                    "Ran a cautious reasoning review over the base score and decision matrix.",
                )
            ),
        )
        consensus_review = await _run_stage(
            investigation_id,
            "consensus_review",
            "Contrarian challenger",
            lambda: asyncio.to_thread(
                lambda: (
                    review_consensus(
                        request.claim,
                        claim_analysis,
                        sentiment_sources,
                        score,
                        verdict,
                    ),
                    "Ran a contradiction-heavy challenge pass to pressure-test the current conclusion.",
                )
            ),
        )
        reasoning_panel = await _run_stage(
            investigation_id,
            "reasoning_panel",
            "Judge reconciliation panel",
            lambda: asyncio.to_thread(
                lambda: (
                    reconcile_reasoning_panel(
                        request.claim,
                        claim_analysis,
                        sentiment_sources,
                        score,
                        verdict,
                        verdict_review,
                        consensus_review,
                    ),
                    "Reconciled the reviewer and challenger into one conservative pre-panel adjustment.",
                )
            ),
        )
        if reasoning_panel is not None:
            score = max(0, min(100, score + reasoning_panel.scoreAdjustment))
            verdict = reasoning_panel.verdict
            strengths = list(dict.fromkeys([*strengths, *reasoning_panel.strengths]))
            concerns = list(dict.fromkeys([*concerns, *reasoning_panel.concerns]))
            tracker.info("reasoning_panel", "The judge reconciliation panel adjusted the base decision before the provider panel.")
        panel_result = await _run_stage(
            investigation_id,
            "provider_panel",
            "Cross-model fact-check panel",
            lambda: asyncio.to_thread(
                lambda: (
                    run_provider_panel(
                        request.claim,
                        claim_analysis,
                        sentiment_sources,
                        score,
                        verdict,
                        hoax_assessment.signals,
                    ),
                    "Queried the available model panel and ran an additional audit over the panel outputs.",
                )
            ),
        )
        tracker.info("provider_panel", f"Cross-model review completed with {len(panel_result.reviews)} provider reviews.")
        if panel_result.reviews:
            score = max(0, min(100, score + panel_result.scoreAdjustment))
            verdict = panel_result.verdict
            strengths = list(dict.fromkeys([*strengths, *panel_result.strengths]))
            concerns = list(dict.fromkeys([*concerns, *panel_result.concerns, *panel_result.hallucinationFlags]))
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(
                update={
                    "providerReviews": panel_result.reviews,
                    "llmAgreementScore": panel_result.agreementScore if panel_result.reviews else state.llmAgreementScore,
                    "progressPercent": 97,
                    "truthClassification": _truth_classification(verdict),
                }
            ),
        )
        _set_step_state(
            investigation_id,
            "cross_model_review",
            "completed",
            f"Cross-model panel review finished with {panel_result.agreementScore if panel_result.reviews else 0}% agreement.",
            details=[
                reasoning_panel.rationale if reasoning_panel is not None else "The pre-panel challenger loop did not return an extra adjustment.",
                verdict_review.rationale if verdict_review is not None else "No reasoning-review draft was available.",
                consensus_review.rationale if consensus_review is not None else "No contrarian challenge draft was available.",
                panel_result.summary or "No panel summary was available.",
                *(f"{review.provider}: {review.verdict} ({review.confidence}/100)" for review in panel_result.reviews[:5]),
                *(f"Hallucination risk: {flag}" for flag in panel_result.hallucinationFlags[:3]),
            ],
            progress=97,
        )

        _set_step_state(
            investigation_id,
            "finalizing_results",
            "running",
            "Writing the concise summary, the simple explanation, and the detailed explanation.",
            progress=98,
        )
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(
                update={
                    "progressPercent": 98,
                    "truthClassification": _truth_classification(verdict),
                }
            ),
        )

        expert_insight = narrative
        eli15_summary = ""
        if settings.llm_agents_enabled:
            report_draft = await _run_stage(
                investigation_id,
                "report",
                "Report writer",
                lambda: asyncio.to_thread(
                    lambda: (
                        draft_report(
                            request.claim,
                            claim_analysis,
                            sentiment_sources,
                            verdict,
                            score,
                            narrative,
                            strengths,
                            concerns,
                        ),
                        "Drafted the final narrative, the user summary, and the plain-language explanation.",
                    )
                ),
            )
            if report_draft is not None:
                narrative = report_draft.narrative
                ai_summary = report_draft.userSummary
                eli15_summary = report_draft.eli15Summary
                expert_insight = report_draft.expertInsight
                strengths = report_draft.strengths or strengths
                concerns = report_draft.concerns or concerns
                tracker.info("report", "Report writer polished the final investigation write-up.")
            else:
                ai_summary = narrative
                eli15_summary = ai_summary
                tracker.info("report", "Report writer returned no draft, so the baseline narrative was kept.")
        else:
            ai_summary = narrative
            eli15_summary = ai_summary
            tracker.info("report", "Report writer skipped because no LLM providers are configured.")

        claim_graph = build_claim_graph(claim_analysis)
        source_registry = build_source_registry(sentiment_sources)
        source_groups, display_sources = build_source_groups(sentiment_sources)
        evidence_graph = build_evidence_graph(claim_graph, sentiment_sources)
        sentiment = build_sentiment_distribution(sentiment_sources)
        source_agreement_score = (
            round((sum(source.agreementFactor for source in sentiment_sources) / max(1, len(sentiment_sources))) * 100)
            if sentiment_sources
            else 0
        )
        llm_agreement_score = None
        if panel_result.reviews:
            llm_agreement_score = round((source_agreement_score + panel_result.agreementScore) / 2)
        elif settings.llm_agents_enabled:
            llm_agreement_score = source_agreement_score

        confidence_level = infer_confidence_level(score, sentiment_sources, llm_agreement_score)
        verdict_summary = narrative.split(".")[0].strip()
        if verdict_summary and not verdict_summary.endswith("."):
            verdict_summary = f"{verdict_summary}."
        matrix_lines = [f"{item.name}: {item.score}/100." for item in matrix]
        evidence_breakdown, key_findings, contradictions, methodology = build_sections(
            request.claim,
            claim_analysis,
            sentiment_sources,
            source_groups,
            matrix_lines,
            strengths,
            concerns,
        )

        current_state = repository.get_investigation_state(investigation_id)
        final_step_details = [
            f"Analyzed sources: {len(sentiment_sources)}.",
            f"Visible evidence cards: {len(display_sources)}.",
            f"Confidence: {confidence_level}.",
            f"Panel agreement: {panel_result.agreementScore if panel_result.reviews else 0}%.",
            f"Quote highlights classified as supportive / uncertain / unsupportive: "
            f"{quote_distribution.get('supportive', 0)} / {quote_distribution.get('uncertain', 0)} / {quote_distribution.get('unsupportive', 0)}.",
            f"{user_facing_verdict_label(verdict)} result with score {score}/100.",
        ]
        step_summaries = _merge_step_summaries(
            current_state.stepSummaries,
            step_key="finalizing_results",
            status="completed",
            summary="Saved the final investigation report, summaries, and visible evidence deck.",
            details=final_step_details,
        )
        cache_status = _state_cache_status(sentiment_sources)
        final_state = InvestigationState(
            claimAnalysis=claim_analysis,
            claimGraph=claim_graph,
            evidenceGraph=evidence_graph,
            sourceRegistry=source_registry,
            recommendedQueries=claim_analysis.generatedQueries,
            sources=sentiment_sources,
            sourceGroups=source_groups,
            stepSummaries=step_summaries,
            providerReviews=panel_result.reviews,
            hoaxSignals=hoax_assessment.signals,
            sentiment=sentiment,
            consensus=consensus_breakdown,
            matrix=matrix,
            confidenceLevel=confidence_level,
            llmAgreementScore=llm_agreement_score,
            misinformationRisk=misinformation_risk,
            progressPercent=100,
            resolvedMode=resolved_mode,
            cacheStatus=cache_status,
            truthClassification=_truth_classification(verdict),
            discoveredDomains=repository.list_known_source_domains(),
            orchestrationNotes=[
                f"Mode resolved to {resolved_mode}.",
                f"Analyzed {len(sentiment_sources)} sources and surfaced {len(display_sources)} visible evidence cards.",
                f"Cache state: {cache_status}.",
                f"Panel reviews completed: {len(panel_result.reviews)}.",
                hoax_assessment.summary,
            ],
            expertInsight=expert_insight,
            aiSummary=ai_summary,
            eli15Summary=eli15_summary,
            verdictSummary=verdict_summary or narrative,
            finalNarrative=narrative,
            evidenceBreakdown=evidence_breakdown,
            keyFindings=key_findings,
            contradictions=contradictions,
            methodology=methodology,
            strengths=strengths,
            concerns=concerns,
        )

        repository.update_state(investigation_id, lambda _: final_state)
        final_summary = f"{user_facing_verdict_label(verdict)} result with score {score}/100."
        repository.set_investigation_status(
            investigation_id,
            "completed",
            summary=final_summary,
            overall_score=score,
            verdict=verdict,
        )
        repository.persist_investigation_snapshot(
            investigation_id,
            confidence_level=confidence_level,
            truth_classification=final_state.truthClassification,
            source_count=len(sentiment_sources),
            positive_count=sentiment.positive if sentiment else 0,
            neutral_count=sentiment.neutral if sentiment else 0,
            negative_count=sentiment.negative if sentiment else 0,
        )
        try:
            delivered = await send_investigation_ready_notification(
                investigation_id,
                request.claim,
                ai_summary or final_summary,
            )
            if delivered:
                tracker.info("notifications", f"Sent investigation-ready notifications to {delivered} subscribed device(s).")
        except Exception as notification_exc:
            tracker.warning("notifications", f"Investigation completed, but push delivery failed: {notification_exc}")
        tracker.info("orchestrator", f"Investigation completed using mode {resolved_mode} at depth {context['desiredDepth']}.")
    except Exception as exc:
        repository.set_investigation_status(investigation_id, "failed", summary=str(exc))
        _fail_active_step(investigation_id, str(exc))
        tracker.error("orchestrator", f"Investigation failed: {exc}")
