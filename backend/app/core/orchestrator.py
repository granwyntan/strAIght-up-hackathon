from threading import Thread

from .. import repository
from ..agents.claim_analyzer import analyze_claim
from ..agents.consensus_reviewer import review_consensus
from ..agents.citation_auditor import audit_citations
from ..agents.decision_agent import summarize_decision
from ..agents.query_planner import refine_claim_analysis
from ..agents.quote_verifier import verify_quotes
from ..agents.report_writer import draft_report
from ..agents.sentiment_consensus import apply_sentiment_consensus
from ..agents.source_scout import scout_sources
from ..agents.source_validator import validate_sources
from ..agents.study_classifier import classify_sources
from ..agents.verdict_reviewer import review_verdict
from ..ai import reset_stage_rotation, stage_target_label
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
    worker = Thread(target=run_investigation, args=(investigation_id, request), daemon=True)
    worker.start()


def _run_stage(investigation_id: str, agent_key: str, title: str, fn):
    run_id = repository.start_agent_run(investigation_id, agent_key, title)
    try:
        result, summary = fn()
        repository.finish_agent_run(run_id, "completed", summary)
        return result
    except Exception as exc:
        repository.finish_agent_run(run_id, "failed", str(exc))
        raise


def run_investigation(investigation_id: str, request: InvestigationCreateRequest) -> None:
    tracker = ProgressTracker(investigation_id)
    repository.set_investigation_status(investigation_id, "running", summary="Investigation running.")
    reset_stage_rotation()

    try:
        context = build_context(request)
        tracker.info("orchestrator", "Context assembled for the investigation run.")
        if request.mode == "live" and not settings.tavily_api_key and not settings.serpapi_api_key:
            tracker.warning("orchestrator", "Live mode was requested but no live search API key is configured, so the system will fall back to seeded knowledge.")
        elif request.mode != "offline":
            providers: list[str] = []
            if settings.has_tavily:
                providers.append("Tavily")
            if settings.has_serpapi:
                providers.append("SerpAPI")
            if providers:
                tracker.info("orchestrator", f"Live search providers enabled: {', '.join(providers)}.")

        claim_analysis = _run_stage(
            investigation_id,
            "claim",
            "Claim analyzer",
            lambda: (
                analyze_claim(request.claim, request.context, request.desiredDepth),
                "Flagged strength of language and generated secondary evidence queries.",
            ),
        )
        tracker.info("claim", "Claim analyzer finished language-risk scoring and query planning.")

        if settings.llm_agents_enabled:
            research_target = stage_target_label("research")
            claim_analysis = _run_stage(
                investigation_id,
                "planner",
                "Query planner",
                lambda: (
                    refine_claim_analysis(request.claim, request.context, request.desiredDepth, claim_analysis),
                    f"Refined the claim summary and search plan with {research_target}.",
                ),
            )
            tracker.info("planner", f"Query planner refined the search plan with {research_target}.")
        else:
            tracker.info("planner", "Query planner skipped because no LLM providers are configured.")

        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(
                update={"claimAnalysis": claim_analysis, "recommendedQueries": claim_analysis.generatedQueries}
            ),
        )

        raw_sources = _run_stage(
            investigation_id,
            "search",
            "Source scout",
            lambda: (
                scout_sources(request.claim, claim_analysis.generatedQueries, request.sourceUrls, request.mode, request.desiredDepth),
                "Collected candidate sources and first-pass source-quality scores.",
            ),
        )
        tracker.info("search", f"Source scout collected {len(raw_sources)} candidate sources.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(update={"sources": raw_sources}),
        )

        validated_sources = _run_stage(
            investigation_id,
            "validate",
            "Source validator",
            lambda: (
                validate_sources(request.claim, raw_sources, request.mode),
                "Discarded inaccessible links and kept only readable, claim-relevant sources.",
            ),
        )
        tracker.info("validate", f"Source validator retained {len(validated_sources)} accessible sources.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(update={"sources": validated_sources}),
        )

        classified_sources = _run_stage(
            investigation_id,
            "classify",
            "Study classifier",
            lambda: (
                classify_sources(validated_sources),
                "Classified evidence tiers from reviews and RCTs down to blog-style sources.",
            ),
        )
        tracker.info("classify", "Study classifier assigned evidence tiers and study scores.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(update={"sources": classified_sources}),
        )

        audited_sources = _run_stage(
            investigation_id,
            "citations",
            "Citation auditor",
            lambda: (
                audit_citations(request.claim, classified_sources),
                "Audited citation chains for broken links and weak supporting references.",
            ),
        )
        tracker.info("citations", "Citation auditor completed subsource checks.")
        enriched_sources = enrich_sources(audited_sources, claim_analysis)
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(update={"sources": enriched_sources}),
        )

        quote_verified_sources = _run_stage(
            investigation_id,
            "quotes",
            "Quote verifier",
            lambda: (
                verify_quotes(enriched_sources),
                "Verified displayed quotes against accessible source text and removed unconfirmed quotes.",
            ),
        )
        tracker.info("quotes", "Quote verifier removed any quote that could not be confirmed directly.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(update={"sources": quote_verified_sources}),
        )

        sentiment_sources = _run_stage(
            investigation_id,
            "sentiment",
            "Sentiment consensus",
            lambda: (
                apply_sentiment_consensus(request.claim, quote_verified_sources),
                "Ran scientific and critical sentiment reviews and downgraded disagreements to neutral.",
            ),
        )
        tracker.info("sentiment", "Dual sentiment review completed and disagreement penalties were applied.")
        repository.update_state(
            investigation_id,
            lambda state: state.model_copy(update={"sources": sentiment_sources}),
        )

        matrix, consensus_breakdown, score, verdict, narrative, strengths, concerns, misinformation_risk = _run_stage(
            investigation_id,
            "decision",
            "Decision engine",
            lambda: (
                summarize_decision(request.claim, claim_analysis, sentiment_sources),
                "Combined agent findings into a final credibility score and verdict.",
            ),
        )
        tracker.info("decision", "Decision engine produced the final credibility verdict.")

        llm_verdicts = [verdict]
        llm_score_adjustments: list[int] = []

        if settings.llm_agents_enabled:
            reasoning_target = stage_target_label("reasoning")
            review = _run_stage(
                investigation_id,
                "review",
                "Verdict reviewer",
                lambda: (
                    review_verdict(request.claim, claim_analysis, sentiment_sources, matrix, score, verdict),
                    f"Reviewed the heuristic verdict with {reasoning_target}.",
                ),
            )
            if review is not None:
                score = max(0, min(100, score + review.scoreAdjustment))
                verdict = review.verdict
                llm_verdicts.append(review.verdict)
                llm_score_adjustments.append(abs(review.scoreAdjustment))
                strengths = list(dict.fromkeys([*strengths, *review.strengths]))
                concerns = list(dict.fromkeys([*concerns, *review.concerns, review.rationale]))
                tracker.info("review", "Verdict reviewer adjusted the final judgment and surfaced extra reasoning notes.")
            else:
                tracker.info("review", "Verdict reviewer returned no changes, so the heuristic verdict was kept.")
        else:
            tracker.info("review", "Verdict reviewer skipped because no LLM providers are configured.")

        if settings.llm_agents_enabled:
            consensus_target = stage_target_label("consensus")
            consensus = _run_stage(
                investigation_id,
                "consensus",
                "Consensus challenger",
                lambda: (
                    review_consensus(request.claim, claim_analysis, sentiment_sources, score, verdict),
                    f"Challenged the verdict with {consensus_target}.",
                ),
            )
            if consensus is not None:
                score = max(0, min(100, score + consensus.scoreAdjustment))
                verdict = consensus.verdict
                llm_verdicts.append(consensus.verdict)
                llm_score_adjustments.append(abs(consensus.scoreAdjustment))
                concerns = list(dict.fromkeys([*concerns, *consensus.cautions, *consensus.contradictions, consensus.rationale]))
                tracker.info("consensus", "Consensus challenger pressure-tested the verdict and surfaced contradictions.")
            else:
                tracker.info("consensus", "Consensus challenger returned no changes, so the reviewed verdict was kept.")
        else:
            tracker.info("consensus", "Consensus challenger skipped because no LLM providers are configured.")

        if settings.llm_agents_enabled:
            writer_target = stage_target_label("writer")
            report_draft = _run_stage(
                investigation_id,
                "report",
                "Report writer",
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
        source_agreement_score = round(
            (sum(source.agreementFactor for source in display_sources) / max(1, len(display_sources))) * 100
        ) if display_sources else 0
        llm_agreement_score = None
        if settings.llm_agents_enabled:
            reviewer_agreement_score = max(0, min(100, 100 - (agreement_penalty * 25) - (sum(llm_score_adjustments) * 3)))
            llm_agreement_score = round((source_agreement_score + reviewer_agreement_score) / 2)
        confidence_level = infer_confidence_level(score, sentiment, concerns, llm_agreement_score)
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

        repository.update_state(
            investigation_id,
            lambda state: InvestigationState(
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
                expertInsight=verdict_summary or narrative,
                verdictSummary=verdict_summary or narrative,
                finalNarrative=narrative,
                evidenceBreakdown=evidence_breakdown,
                keyFindings=key_findings,
                contradictions=contradictions,
                methodology=methodology,
                strengths=strengths,
                concerns=concerns,
            ),
        )

        repository.set_investigation_status(
            investigation_id,
            "completed",
            summary=f"{verdict.title()} result with score {score}/100.",
            overall_score=score,
            verdict=verdict,
        )
        tracker.info("orchestrator", f"Investigation completed using mode {context['mode']} at depth {context['desiredDepth']}.")
    except Exception as exc:
        repository.set_investigation_status(investigation_id, "failed", summary=str(exc))
        tracker.error("orchestrator", f"Investigation failed: {exc}")
