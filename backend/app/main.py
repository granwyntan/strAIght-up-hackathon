from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import repository
from .ai import stage_target_label
from .core.orchestrator import queue_investigation, start_investigation_workers
from .database import init_db
from .knowledge.base import BOOTSTRAP
from .services.query_support import fetch_claim_suggestions, is_health_related_query
from .models import (
    BootstrapPayload,
    InvestigationCollection,
    InvestigationComparisonRequest,
    InvestigationComparisonResponse,
    InvestigationCreateRequest,
    InvestigationDetail,
    NotificationRegistrationRequest,
    NotificationRegistrationResponse,
)
from .agents.comparison_agent import compare_investigations
from .routes.supplements import router as supplements_router
from .settings import settings


app = FastAPI(
    title="GramWIN API",
    version="2.0.0",
    description="Multi-agent backend for investigating the credibility of health and wellness claims.",
)

cors_origins = settings.cors_allowed_origins_list

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials="*" not in cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(supplements_router)


@app.on_event("startup")
def startup() -> None:
    init_db()
    start_investigation_workers()


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "providers": {
            "openai": settings.has_openai,
            "claude": settings.has_claude,
            "gemini": settings.has_gemini,
            "xai": settings.has_xai,
            "deepseek": settings.has_deepseek,
            "nlpcloud": settings.has_nlpcloud,
            "tavily": settings.has_tavily,
            "serpapi": settings.has_serpapi,
            "exa": settings.has_exa,
        },
        "publicBaseUrl": settings.backend_public_base_url,
        "llmRoutes": {
            "research": stage_target_label("research"),
            "audit": stage_target_label("audit"),
            "reasoning": stage_target_label("reasoning"),
            "consensus": stage_target_label("consensus"),
            "synthesis": stage_target_label("writer"),
        },
        "searchStrategy": {
            "breadth": "SerpAPI",
            "depth": "Tavily, Exa",
        },
        "cache": {
            "searchStableTtlSeconds": settings.search_cache_ttl_stable_seconds,
            "searchTrendingTtlSeconds": settings.search_cache_ttl_trending_seconds,
            "extractionTtlSeconds": settings.extraction_cache_ttl_seconds,
            "finalResultReuse": False,
        },
        "pipeline": {
            "maxConcurrency": settings.pipeline_max_concurrency,
            "quickSourceTarget": settings.source_target_quick,
            "standardSourceTarget": settings.source_target_standard,
            "deepSourceTarget": settings.source_target_deep,
        },
        "database": {
            "resolvedPath": str(settings.resolved_database_path),
        },
    }


@app.get("/api/bootstrap", response_model=BootstrapPayload)
def get_bootstrap() -> BootstrapPayload:
    return BOOTSTRAP


@app.get("/api/investigations", response_model=InvestigationCollection)
def get_investigations() -> InvestigationCollection:
    return InvestigationCollection(items=repository.list_investigations())


@app.get("/api/claim-suggestions")
async def get_claim_suggestions(q: str = Query(default="", min_length=0, max_length=160)) -> dict[str, list[str]]:
    try:
        return {"items": await fetch_claim_suggestions(q)}
    except Exception:
        return {"items": []}


@app.post("/api/investigations", response_model=InvestigationDetail)
def create_investigation(payload: InvestigationCreateRequest) -> InvestigationDetail:
    if not is_health_related_query(payload.claim, payload.context):
        raise HTTPException(
            status_code=422,
            detail="This tool is currently limited to health, medical, clinical, wellness, and research-related claims.",
        )
    summary = repository.create_investigation(
        claim=payload.claim,
        context=payload.context,
        mode=payload.mode,
        desired_depth=payload.desiredDepth,
    )
    queue_investigation(summary.id, payload)
    detail = repository.get_investigation_detail(summary.id)
    if detail is None:
        raise HTTPException(status_code=500, detail="Failed to initialize investigation")
    return detail


@app.get("/api/investigations/{investigation_id}", response_model=InvestigationDetail)
def get_investigation(investigation_id: str) -> InvestigationDetail:
    detail = repository.get_investigation_detail(investigation_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return detail


@app.post("/api/investigations/{investigation_id}/cancel")
def cancel_investigation(investigation_id: str) -> dict[str, bool]:
    cancelled = repository.request_cancellation(investigation_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Investigation is not running or could not be stopped")
    return {"cancelled": True}


@app.post("/api/investigations/compare", response_model=InvestigationComparisonResponse)
def compare_saved_investigations(payload: InvestigationComparisonRequest) -> InvestigationComparisonResponse:
    left = repository.get_investigation_detail(payload.investigationIds[0])
    right = repository.get_investigation_detail(payload.investigationIds[1])
    if left is None or right is None:
        raise HTTPException(status_code=404, detail="One or both investigations could not be found")
    return compare_investigations(left, right)


@app.delete("/api/investigations/{investigation_id}")
def delete_investigation(investigation_id: str) -> dict[str, bool]:
    deleted = repository.delete_investigation(investigation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return {"deleted": True}


@app.delete("/api/investigations")
def clear_investigations() -> dict[str, int]:
    cleared = repository.clear_investigations()
    return {"cleared": cleared}


@app.post("/api/notifications/register", response_model=NotificationRegistrationResponse)
def register_notifications(payload: NotificationRegistrationRequest) -> NotificationRegistrationResponse:
    registered_at = repository.save_push_subscription(payload.expoPushToken, payload.platform)
    return NotificationRegistrationResponse(success=True, registeredAt=registered_at)
