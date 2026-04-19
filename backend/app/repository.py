import json
from datetime import UTC, datetime
import sqlite3
from uuid import uuid4

from .database import get_connection
from .models import AgentRun, InvestigationDetail, InvestigationState, InvestigationSummary, ProgressEvent, SourceAssessment


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _parse_state(payload: str | None) -> InvestigationState:
    if not payload:
        return InvestigationState()
    return InvestigationState.model_validate(json.loads(payload))


def create_investigation(claim: str, context: str, mode: str, desired_depth: str) -> InvestigationSummary:
    investigation_id = str(uuid4())
    now = utc_now_iso()
    state = InvestigationState()

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO investigations (
                id, claim, context, status, mode, desired_depth, created_at, updated_at, summary, state_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (investigation_id, claim, context, "queued", mode, desired_depth, now, now, "", state.model_dump_json()),
        )

    return InvestigationSummary(
        id=investigation_id,
        claim=claim,
        context=context,
        status="queued",
        mode=mode,
        desiredDepth=desired_depth,
        createdAt=now,
        updatedAt=now,
        overallScore=None,
        verdict=None,
        summary="Queued for investigation.",
    )


def set_investigation_status(investigation_id: str, status: str, summary: str | None = None, overall_score: int | None = None, verdict: str | None = None) -> None:
    now = utc_now_iso()
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE investigations
            SET status = ?,
                updated_at = ?,
                summary = COALESCE(?, summary),
                overall_score = COALESCE(?, overall_score),
                verdict = COALESCE(?, verdict)
            WHERE id = ?
            """,
            (status, now, summary, overall_score, verdict, investigation_id),
        )


def update_state(investigation_id: str, mutate_fn) -> InvestigationState:
    with get_connection() as connection:
        row = connection.execute("SELECT state_json FROM investigations WHERE id = ?", (investigation_id,)).fetchone()
        if row is None:
            raise KeyError(f"Unknown investigation {investigation_id}")

        state = _parse_state(row["state_json"])
        new_state = mutate_fn(state)
        if not isinstance(new_state, InvestigationState):
            raise TypeError("State mutator must return InvestigationState")

        connection.execute(
            "UPDATE investigations SET state_json = ?, updated_at = ? WHERE id = ?",
            (new_state.model_dump_json(), utc_now_iso(), investigation_id),
        )
        return new_state


def list_investigations() -> list[InvestigationSummary]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, claim, context, status, mode, desired_depth, created_at, updated_at, overall_score, verdict, summary
            FROM investigations
            ORDER BY created_at DESC
            """
        ).fetchall()

    return [
        InvestigationSummary(
            id=row["id"],
            claim=row["claim"],
            context=row["context"],
            status=row["status"],
            mode=row["mode"],
            desiredDepth=row["desired_depth"],
            createdAt=row["created_at"],
            updatedAt=row["updated_at"],
            overallScore=row["overall_score"],
            verdict=row["verdict"],
            summary=row["summary"],
        )
        for row in rows
    ]


def delete_investigation(investigation_id: str) -> bool:
    with get_connection() as connection:
        existing = connection.execute("SELECT id FROM investigations WHERE id = ?", (investigation_id,)).fetchone()
        if existing is None:
            return False
        connection.execute("DELETE FROM progress_events WHERE investigation_id = ?", (investigation_id,))
        connection.execute("DELETE FROM agent_runs WHERE investigation_id = ?", (investigation_id,))
        connection.execute("DELETE FROM investigations WHERE id = ?", (investigation_id,))
    return True


def get_investigation_detail(investigation_id: str) -> InvestigationDetail | None:
    with get_connection() as connection:
        investigation = connection.execute(
            """
            SELECT id, claim, context, status, mode, desired_depth, created_at, updated_at, overall_score, verdict, summary, state_json
            FROM investigations
            WHERE id = ?
            """,
            (investigation_id,),
        ).fetchone()
        if investigation is None:
            return None

        run_rows = connection.execute(
            """
            SELECT id, agent_key, title, status, summary, started_at, finished_at
            FROM agent_runs
            WHERE investigation_id = ?
            ORDER BY started_at ASC
            """,
            (investigation_id,),
        ).fetchall()
        event_rows = connection.execute(
            """
            SELECT id, agent_key, level, message, created_at
            FROM progress_events
            WHERE investigation_id = ?
            ORDER BY created_at ASC
            """,
            (investigation_id,),
        ).fetchall()

    state = _parse_state(investigation["state_json"])

    return InvestigationDetail(
        id=investigation["id"],
        claim=investigation["claim"],
        context=investigation["context"],
        status=investigation["status"],
        mode=investigation["mode"],
        desiredDepth=investigation["desired_depth"],
        createdAt=investigation["created_at"],
        updatedAt=investigation["updated_at"],
        overallScore=investigation["overall_score"],
        verdict=investigation["verdict"],
        summary=investigation["summary"],
        claimAnalysis=state.claimAnalysis,
        recommendedQueries=state.recommendedQueries,
        sources=state.sources,
        sourceGroups=state.sourceGroups,
        stepSummaries=state.stepSummaries,
        sentiment=state.sentiment,
        consensus=state.consensus,
        matrix=state.matrix,
        confidenceLevel=state.confidenceLevel,
        llmAgreementScore=state.llmAgreementScore,
        misinformationRisk=state.misinformationRisk,
        progressPercent=state.progressPercent,
        truthClassification=state.truthClassification,
        discoveredDomains=state.discoveredDomains,
        expertInsight=state.expertInsight,
        aiSummary=state.aiSummary,
        verdictSummary=state.verdictSummary,
        finalNarrative=state.finalNarrative,
        evidenceBreakdown=state.evidenceBreakdown,
        keyFindings=state.keyFindings,
        contradictions=state.contradictions,
        methodology=state.methodology,
        strengths=state.strengths,
        concerns=state.concerns,
        agentRuns=[
            AgentRun(
                id=row["id"],
                agentKey=row["agent_key"],
                title=row["title"],
                status=row["status"],
                summary=row["summary"],
                startedAt=row["started_at"],
                finishedAt=row["finished_at"],
            )
            for row in run_rows
        ],
        progressEvents=[
            ProgressEvent(
                id=row["id"],
                agentKey=row["agent_key"],
                level=row["level"],
                message=row["message"],
                createdAt=row["created_at"],
            )
            for row in event_rows
        ],
    )


def start_agent_run(investigation_id: str, agent_key: str, title: str) -> str:
    run_id = str(uuid4())
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO agent_runs (id, investigation_id, agent_key, title, status, summary, started_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (run_id, investigation_id, agent_key, title, "running", "", utc_now_iso()),
        )
    return run_id


def finish_agent_run(run_id: str, status: str, summary: str) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE agent_runs
            SET status = ?, summary = ?, finished_at = ?
            WHERE id = ?
            """,
            (status, summary, utc_now_iso(), run_id),
        )


def add_progress_event(investigation_id: str, agent_key: str, level: str, message: str) -> None:
    event_id = str(uuid4())
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO progress_events (id, investigation_id, agent_key, level, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (event_id, investigation_id, agent_key, level, message, utc_now_iso()),
        )


def register_source_domains(sources: list[SourceAssessment]) -> None:
    now = utc_now_iso()
    bucket_rank = {
        "tier_1_blog": 1,
        "tier_2_scholarly": 2,
        "tier_3_authority": 3,
    }
    with get_connection() as connection:
        for source in sources:
            domain = (source.domain or "").strip().lower()
            url = (source.url or "").strip()
            bucket = (source.sourceBucket or "tier_1_blog").strip() or "tier_1_blog"
            if not domain or not url:
                continue

            row = connection.execute(
                "SELECT seen_count, source_bucket FROM source_domains WHERE domain = ?",
                (domain,),
            ).fetchone()
            if row is None:
                connection.execute(
                    """
                    INSERT INTO source_domains (domain, latest_url, source_bucket, first_seen_at, last_seen_at, seen_count)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (domain, url, bucket, now, now, 1),
                )
                continue

            previous_bucket = row["source_bucket"] or "tier_1_blog"
            stronger_bucket = previous_bucket if bucket_rank.get(previous_bucket, 1) >= bucket_rank.get(bucket, 1) else bucket
            connection.execute(
                """
                UPDATE source_domains
                SET latest_url = ?, source_bucket = ?, last_seen_at = ?, seen_count = ?
                WHERE domain = ?
                """,
                (url, stronger_bucket, now, int(row["seen_count"] or 0) + 1, domain),
            )


def lookup_source_bucket(domain: str) -> str | None:
    cleaned = (domain or "").strip().lower()
    if not cleaned:
        return None

    try:
        with get_connection() as connection:
            row = connection.execute(
                "SELECT source_bucket FROM source_domains WHERE domain = ?",
                (cleaned,),
            ).fetchone()
    except sqlite3.OperationalError:
        return None

    if row is None:
        return None
    return row["source_bucket"] or None


def list_known_source_domains(limit: int = 24) -> list[str]:
    try:
        with get_connection() as connection:
            rows = connection.execute(
                """
                SELECT domain
                FROM source_domains
                ORDER BY last_seen_at DESC, seen_count DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
    except sqlite3.OperationalError:
        return []

    return [row["domain"] for row in rows if row["domain"]]
