from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import repository
from .ai import stage_target_label
from .core.orchestrator import queue_investigation
from .database import init_db
from .knowledge.base import BOOTSTRAP
from .models import BootstrapPayload, InvestigationCollection, InvestigationCreateRequest, InvestigationDetail
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
            "depth": "Tavily",
        },
        "cache": {
            "searchStableTtlSeconds": settings.search_cache_ttl_stable_seconds,
            "searchTrendingTtlSeconds": settings.search_cache_ttl_trending_seconds,
            "finalTtlSeconds": settings.final_cache_ttl_seconds,
        },
        "pipeline": {
            "maxConcurrency": settings.pipeline_max_concurrency,
            "standardSourceTarget": settings.source_target_standard,
            "deepSourceTarget": settings.source_target_deep,
        },
    }


@app.get("/api/bootstrap", response_model=BootstrapPayload)
def get_bootstrap() -> BootstrapPayload:
    return BOOTSTRAP


@app.get("/api/investigations", response_model=InvestigationCollection)
def get_investigations() -> InvestigationCollection:
    return InvestigationCollection(items=repository.list_investigations())


@app.post("/api/investigations", response_model=InvestigationDetail)
def create_investigation(payload: InvestigationCreateRequest) -> InvestigationDetail:
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


@app.delete("/api/investigations/{investigation_id}")
def delete_investigation(investigation_id: str) -> dict[str, bool]:
    deleted = repository.delete_investigation(investigation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return {"deleted": True}
