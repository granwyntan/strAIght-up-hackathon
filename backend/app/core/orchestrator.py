import asyncio
from threading import Thread

from .. import repository
from ..agents.claim_analyzer import analyze_claim
from ..agents.consensus_reviewer import review_consensus
from ..agents.citation_auditor import audit_citations
from ..agents.decision_agent import summarize_decision, user_facing_verdict_label
from ..agents.query_planner import refine_claim_analysis
from ..agents.quote_verifier import verify_quotes
from ..agents.report_writer import draft_report
from ..agents.sentiment_consensus import apply_sentiment_consensus
from ..agents.source_scout import scout_sources
from ..agents.source_validator import validate_sources
from ..agents.study_classifier import classify_sources
from ..agents.verdict_reviewer import review_verdict
from ..ai import reset_stage_rotation, stage_target_label
from ..cache import cache_key, get_json, set_json
from ..context.builder import build_context
from ..models import InvestigationCreateRequest, InvestigationState
from ..presentation import (
    build_sections,
    build_sentiment_distribution,
    build_source_groups,
    build_step_summaries,
    enrich_sources,
    infer_confidence_level,
)
from ..progress.tracker import ProgressTracker
from ..settings import settings


def queue_investigation(investigation_id: str, request: InvestigationCreateRequest) -> None:
    worker = Thread(
        target=lambda: asyncio.run(run_investigation(investigation_id, request)),
        daemon=True,
    )
    worker.start()


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


def _resolved_mode(request: InvestigationCreateRequest) -> str:
    if request.mode == "offline":
        return "offline"
    if request.mode == "live":
        return "live" if settings.has_tavily or settings.has_serpapi else "offline"
    return "live" if settings.has_tavily or settings.has_serpapi else "offline"


def _final_cache_key(request: InvestigationCreateRequest) -> str:
    source_urls = ",".join(sorted(url.strip() for url in request.sourceUrls if url.strip()))
    return cache_key(
        "final",
        request.claim.strip().lower(),
        request.context.strip().lower(),
        request.mode,
        request.desiredDepth,
        source_urls,
    )


def _state_cache_status(sources) -> str:
    if not sources:
        return "fallback"
    if any(source.cacheStatus == "fallback" for source in sources):
        return "fallback"
    if any(source.cacheStatus == "cached" for source in sources):
        return "cached"
    return "live"


async def run_investigation(investigation_id: str, request: InvestigationCreateRequest) -> None:
    tracker = ProgressTracker(investigation_id)
    repository.set_investigation_status(investigation_id, "running", summary="Investigation running.")
    reset_stage_rotation()

    try:
        resolved_mode = _resolved_mode(request)
        final_key = _final_cache_key(request)
        cached_result = get_json("final", final_key)
        if cached_result is not None:
            cached_state = InvestigationState.model_validate(cached_result["state"]).model_copy(
                update={
                    "resolvedMode": resolved_mode,
                    "cacheStatus": "cached",
                    "orchestrationNotes": ["Loaded a fresh final result from cache."],
                }
            )
            repository.update_state(investigation_id, lambda _: cached_state)
            repository.set_investigation_status(
                investigation_id,
                "completed",
                summary=cached_result["summary"],
                overall_score=cached_result["overallScore"],
                verdict=cached_result["verdict"],
            )
            tracker.info("orchestrator", "Returned a cached final result without rerunning the full pipeline.")
            return

        context = build_context(request)
        tracker.info("orchestrator", "Context assembled for the investigation run.")
        if request.mode == "live" and resolved_mode == "offline":
            tracker.warning("orchestrator", "Live mode was requested but no live search API key is configured, so the system fell back to offline retrieval.")
        elif resolved_mode == "live":
            providers: list[str] = []
            if settings.has_tavily:
                providers.append("Tavily")
            if settings.has_serpapi:
                providers.append("SerpAPI")
            if providers:
                tracker.info("orchestrator", f"Live search providers enabled: {', '.join(providers)}.")
        else:
            tracker.info("orchestrator", "Offline retrieval mode is active, so cached or seeded evidence will be used.")

        claim_analysis = await _run_stage(
            investigation_id,
            "claim",
            "Claim analyzer",
            lambda: asyncio.to_thread(
                lambda: (
                    analyze_claim(request.claim, request.context, request.desiredDepth),
                    "Parsed the full claim semantically and scored its certainty language.",
                )
            ),
        )
        tracker.info("claim", "Claim analyzer finished semantic parsing and language-risk scoring.")

        if settings.llm_agents_enabled:
            research_target = stage_target_label("research")
            claim_analysis = await _run_stage(
                investigation_id,
                "planner",
                "Query planner",
                lambda: asyncio.to_thread(
                    lambda: (
                        refine_claim_analysis(request.claim, request.context, request.desiredDepth, claim_analysis),
                        f"Expanded the semantic query plan with {research_target}.",
                    )
                ),
            )
            tracker.info("planner", f"Query planner expanded the search plan with {research_target}.")
        else:
            tracker.info("planner", "Query planner skipped because no LLM providers are configured.")

        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(
                update={
                    "claimAnalysis": claim_analysis,
                    "recommendedQueries": claim_analysis.generatedQueries,
                    "resolvedMode": resolved_mode,
                    "cacheStatus": "live",
                    "orchestrationNotes": [f"Mode resolved to {resolved_mode}.", f"Prepared {len(claim_analysis.generatedQueries)} semantic queries."],
                }
            ),
        )

        raw_sources = await _run_stage(
            investigation_id,
            "search",
            "Source scout",
            lambda: _with_summary(
                scout_sources(request.claim, claim_analysis.generatedQueries, request.sourceUrls, resolved_mode, request.desiredDepth),
                "Collected a diverse candidate pool across supporting, neutral, and contradictory evidence.",
            ),
        )
        tracker.info("search", f"Source scout collected {len(raw_sources)} candidate sources.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(update={"sources": raw_sources, "cacheStatus": _state_cache_status(raw_sources)}),
        )

        validated_sources = await _run_stage(
            investigation_id,
            "validate",
            "Source validator",
            lambda: _with_summary(
                validate_sources(request.claim, raw_sources, resolved_mode),
                "Discarded inaccessible links and kept only readable, claim-relevant sources.",
            ),
        )
        tracker.info("validate", f"Source validator retained {len(validated_sources)} accessible sources.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(update={"sources": validated_sources, "cacheStatus": _state_cache_status(validated_sources)}),
        )

        classified_sources = await _run_stage(
            investigation_id,
            "classify",
            "Study classifier",
            lambda: asyncio.to_thread(
                lambda: (
                    classify_sources(validated_sources),
                    "Classified evidence tiers from reviews and RCTs down to observational work and general web content.",
                )
            ),
        )
        tracker.info("classify", "Study classifier assigned evidence tiers and study-quality factors.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(update={"sources": classified_sources}),
        )

        audited_sources = await _run_stage(
            investigation_id,
            "citations",
            "Citation auditor",
            lambda: asyncio.to_thread(
                lambda: (
                    audit_citations(request.claim, classified_sources),
                    "Audited citation chains for broken links and weak supporting references.",
                )
            ),
        )
        tracker.info("citations", "Citation auditor completed subsource checks.")
        enriched_sources = enrich_sources(audited_sources, claim_analysis)
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(update={"sources": enriched_sources}),
        )

        quote_verified_sources = await _run_stage(
            investigation_id,
            "quotes",
            "Quote verifier",
            lambda: _with_summary(
                verify_quotes(enriched_sources),
                "Verified displayed quotes against accessible source text and removed unconfirmed quotes.",
            ),
        )
        tracker.info("quotes", "Quote verifier removed any quote that could not be confirmed directly.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(update={"sources": quote_verified_sources}),
        )

        sentiment_sources = await _run_stage(
            investigation_id,
            "sentiment",
            "Sentiment consensus",
            lambda: _with_summary(
                apply_sentiment_consensus(request.claim, quote_verified_sources),
                "Ran scientific and contradiction-focused stance reviews and calibrated confidence factors per source.",
            ),
        )
        tracker.info("sentiment", "Dual stance review completed and confidence factors were calibrated.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(update={"sources": sentiment_sources, "cacheStatus": _state_cache_status(sentiment_sources)}),
        )

        matrix, consensus_breakdown, score, verdict, narrative, strengths, concerns, misinformation_risk = await _run_stage(
            investigation_id,
            "decision",
            "Decision engine",
            lambda: asyncio.to_thread(
                lambda: (
                    summarize_decision(request.claim, claim_analysis, sentiment_sources),
                    "Combined weighted evidence, calibration, and contradiction penalties into a final credibility score.",
                )
            ),
        )
        tracker.info("decision", "Decision engine produced the calibrated credibility verdict.")

        llm_verdicts = [verdict]
        llm_score_adjustments: list[int] = []

        if settings.llm_agents_enabled:
            reasoning_target = stage_target_label("reasoning")
            consensus_target = stage_target_label("consensus")
            review_result, consensus_result = await asyncio.gather(
                _run_stage(
                    investigation_id,
                    "review",
                    "Verdict reviewer",
                    lambda: asyncio.to_thread(
                        lambda: (
                            review_verdict(request.claim, claim_analysis, sentiment_sources, matrix, score, verdict),
                            f"Reviewed the heuristic verdict with {reasoning_target}.",
                        )
                    ),
                ),
                _run_stage(
                    investigation_id,
                    "consensus",
                    "Consensus challenger",
                    lambda: asyncio.to_thread(
                        lambda: (
                            review_consensus(request.claim, claim_analysis, sentiment_sources, score, verdict),
                            f"Challenged the verdict with {consensus_target}.",
                        )
                    ),
                ),
            )

            if review_result is not None:
                score = max(0, min(100, score + review_result.scoreAdjustment))
                verdict = review_result.verdict
                llm_verdicts.append(review_result.verdict)
                llm_score_adjustments.append(abs(review_result.scoreAdjustment))
                strengths = list(dict.fromkeys([*strengths, *review_result.strengths]))
                concerns = list(dict.fromkeys([*concerns, *review_result.concerns, review_result.rationale]))
                tracker.info("review", "Verdict reviewer adjusted the final judgment and surfaced extra reasoning notes.")
            else:
                tracker.info("review", "Verdict reviewer returned no changes, so the baseline verdict was kept.")

            if consensus_result is not None:
                score = max(0, min(100, score + consensus_result.scoreAdjustment))
                verdict = consensus_result.verdict
                llm_verdicts.append(consensus_result.verdict)
                llm_score_adjustments.append(abs(consensus_result.scoreAdjustment))
                concerns = list(dict.fromkeys([*concerns, *consensus_result.cautions, *consensus_result.contradictions, consensus_result.rationale]))
                tracker.info("consensus", "Consensus challenger pressure-tested the verdict and surfaced contradictions.")
            else:
                tracker.info("consensus", "Consensus challenger returned no changes, so the reviewed verdict was kept.")
        else:
            tracker.info("review", "Cross-validation reviewers skipped because no LLM providers are configured.")

        if settings.llm_agents_enabled:
            writer_target = stage_target_label("writer")
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
                        f"Drafted the final evidence synthesis with {writer_target}.",
                    )
                ),
            )
            if report_draft is not None:
                narrative = report_draft.narrative
                strengths = report_draft.strengths or strengths
                concerns = report_draft.concerns or concerns
                tracker.info("report", "Report writer polished the final narrative and key takeaways.")
            else:
                tracker.info("report", "Report writer returned no draft, so the baseline decision narrative was kept.")
        else:
            tracker.info("report", "Report writer skipped because no LLM providers are configured.")

        source_groups, display_sources = build_source_groups(sentiment_sources)
        sentiment = build_sentiment_distribution(display_sources)
        agreement_penalty = len(set(llm_verdicts)) - 1
        source_agreement_score = (
            round((sum(source.agreementFactor for source in display_sources) / max(1, len(display_sources))) * 100)
            if display_sources
            else 0
        )
        llm_agreement_score = None
        if settings.llm_agents_enabled:
            reviewer_agreement_score = max(0, min(100, 100 - (agreement_penalty * 25) - (sum(llm_score_adjustments) * 3)))
            llm_agreement_score = round((source_agreement_score + reviewer_agreement_score) / 2)
            if agreement_penalty > 0:
                concerns = list(dict.fromkeys([*concerns, "Cross-validation models did not fully agree, so confidence was reduced."]))

        confidence_level = infer_confidence_level(score, display_sources, llm_agreement_score)
        verdict_summary = narrative.split(".")[0].strip()
        if verdict_summary and not verdict_summary.endswith("."):
            verdict_summary = f"{verdict_summary}."
        matrix_lines = [f"{item.name}: {item.score}/100." for item in matrix]
        evidence_breakdown, key_findings, contradictions, methodology = build_sections(
            request.claim,
            claim_analysis,
            display_sources,
            source_groups,
            matrix_lines,
            strengths,
            concerns,
        )
        step_summaries = build_step_summaries(
            claim_analysis,
            source_groups,
            sentiment,
            verdict_summary or narrative,
            confidence_level,
            matrix_lines,
        )

        cache_status = _state_cache_status(display_sources)
        final_state = InvestigationState(
            claimAnalysis=claim_analysis,
            recommendedQueries=claim_analysis.generatedQueries,
            sources=display_sources,
            sourceGroups=source_groups,
            stepSummaries=step_summaries,
            sentiment=sentiment,
            consensus=consensus_breakdown,
            matrix=matrix,
            confidenceLevel=confidence_level,
            llmAgreementScore=llm_agreement_score,
            misinformationRisk=misinformation_risk,
            resolvedMode=resolved_mode,
            cacheStatus=cache_status,
            orchestrationNotes=[
                f"Mode resolved to {resolved_mode}.",
                f"Final result assembled from {len(display_sources)} visible sources.",
                f"Cache state: {cache_status}.",
            ],
            expertInsight=verdict_summary or narrative,
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
        set_json(
            "final",
            final_key,
            {
                "state": final_state.model_dump(),
                "overallScore": score,
                "verdict": verdict,
                "summary": final_summary,
            },
            settings.final_cache_ttl_seconds,
        )
        tracker.info("orchestrator", f"Investigation completed using mode {resolved_mode} at depth {context['desiredDepth']}.")
    except Exception as exc:
        repository.set_investigation_status(investigation_id, "failed", summary=str(exc))
        tracker.error("orchestrator", f"Investigation failed: {exc}")
