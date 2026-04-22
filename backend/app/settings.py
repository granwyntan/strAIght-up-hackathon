import json
from functools import cached_property
from pathlib import Path

from pydantic import BaseModel, Field

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = BASE_DIR / "backend" / "data" / "investigations.sqlite3"
DEFAULT_SOURCE_TIER_PATH = BASE_DIR / "backend" / "app" / "config" / "source_tiers.json"


class SourceTierBucketConfig(BaseModel):
    weight: float = Field(default=0.4, ge=0.0, le=1.0)
    domains: list[str] = Field(default_factory=list)


class SourceTierConfig(BaseModel):
    verifiedAuthorities: SourceTierBucketConfig = Field(default_factory=lambda: SourceTierBucketConfig(weight=1.0))
    establishedSources: SourceTierBucketConfig = Field(default_factory=lambda: SourceTierBucketConfig(weight=0.75))
    generalSources: SourceTierBucketConfig = Field(default_factory=SourceTierBucketConfig)


class Settings(BaseSettings):
    app_env: str = "development"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    backend_public_base_url: str = "http://127.0.0.1:8000"
    app_deep_link_scheme: str = "gramwin"
    cors_allowed_origins: str = "*"
    agentic_workflow_enabled: bool = True
    llm_max_output_tokens: int = 1200
    llm_timeout_seconds: float = 28.0
    pipeline_max_concurrency: int = 16
    background_worker_count: int = 2
    search_query_budget_quick: int = 12
    search_query_budget_standard: int = 24
    search_query_budget_deep: int = 36
    source_target_quick: int = 42
    source_target_standard: int = 72
    source_target_deep: int = 128
    search_cache_ttl_trending_seconds: int = 1800
    search_cache_ttl_stable_seconds: int = 86400
    extraction_cache_ttl_seconds: int = 43200
    final_cache_ttl_seconds: int = 21600
    cache_cleanup_probability: float = 0.08
    openai_api_key: str | None = None
    openai_api_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-5.4"
    openai_research_model: str = "gpt-5.4-mini"
    openai_reasoning_model: str = "gpt-5.4"
    openai_synthesis_model: str = "gpt-5.4"
    openai_citation_auditor_model: str = "gpt-5.4-mini"

    claude_api_key: str | None = None
    claude_api_base_url: str = "https://api.anthropic.com/v1/messages"
    claude_model: str = "claude-sonnet-4-20250514"
    claude_research_model: str = "claude-sonnet-4-20250514"
    claude_reasoning_model: str = "claude-opus-4-1-20250805"
    claude_synthesis_model: str = "claude-sonnet-4-20250514"
    claude_citation_auditor_model: str = "claude-sonnet-4-20250514"

    gemini_api_key: str | None = None
    gemini_api_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_model: str = "gemini-2.5-pro"
    gemini_research_model: str = "gemini-2.5-pro"
    gemini_reasoning_model: str = "gemini-2.5-pro"
    gemini_synthesis_model: str = "gemini-2.5-flash"
    gemini_citation_auditor_model: str = "gemini-2.5-flash"

    xai_api_key: str | None = None
    xai_api_base_url: str = "https://api.x.ai/v1"
    xai_model: str = "grok-4.20-reasoning"
    xai_research_model: str = "grok-4.20-reasoning"
    xai_reasoning_model: str = "grok-4.20-reasoning"
    xai_synthesis_model: str = "grok-4.20-reasoning"
    xai_citation_auditor_model: str = "grok-4.20-reasoning"

    deepseek_api_key: str | None = None
    deepseek_api_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"
    deepseek_research_model: str = "deepseek-reasoner"
    deepseek_reasoning_model: str = "deepseek-reasoner"
    deepseek_synthesis_model: str = "deepseek-chat"
    deepseek_citation_auditor_model: str = "deepseek-chat"

    nlpcloud_api_key: str | None = None
    nlpcloud_api_base_url: str = "https://api.nlpcloud.io/v1"
    nlpcloud_entity_model: str = "en_core_web_lg"
    nlpcloud_classification_model: str = "bart-large-mnli-yahoo-answers"
    nlpcloud_timeout_seconds: float = 8.0
    nlpcloud_max_stance_refinements: int = 16
    huggingface_api_key: str | None = None
    huggingface_api_base_url: str = "https://api-inference.huggingface.co/models"
    huggingface_entity_model: str = "dslim/bert-base-NER"
    huggingface_classification_model: str = "facebook/bart-large-mnli"
    huggingface_timeout_seconds: float = 12.0
    sentiment_disagreement_review_limit: int = 24

    research_stage_providers: str = "gemini,openai,claude,deepseek,xai"
    audit_stage_providers: str = "openai,gemini,claude,xai,deepseek"
    reasoning_stage_providers: str = "openai,gemini,claude,xai,deepseek"
    synthesis_stage_providers: str = "gemini,openai,claude,xai,deepseek"
    consensus_stage_providers: str = "openai,gemini,claude,xai,deepseek"

    tavily_api_key: str | None = None
    tavily_max_results: int = 24
    serpapi_api_key: str | None = None
    serpapi_engine: str = "google"
    serpapi_num_results: int = 24
    exa_api_key: str | None = None
    exa_max_results: int = 20
    source_validation_timeout_seconds: float = 18.0
    source_validation_llm_review_limit: int = 10
    source_validation_rescue_excerpt_chars: int = 3200
    source_validation_general_rescue_min_chars: int = 120
    notifications_enabled: bool = True
    expo_push_api_url: str = "https://exp.host/--/api/v2/push/send"
    search_timeout_seconds: float = 12.0
    source_tier_config_path: str = str(DEFAULT_SOURCE_TIER_PATH)
    database_path: str = str(DEFAULT_DB_PATH)

    model_config = SettingsConfigDict(
        env_file=(
            str(BASE_DIR / ".env"),
            str(BASE_DIR / ".env.local"),
            str(BASE_DIR / "backend" / ".env"),
            str(BASE_DIR / "backend" / ".env.local"),
        ),
        env_prefix="",
        extra="ignore",
    )

    @property
    def has_openai(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def has_claude(self) -> bool:
        return bool(self.claude_api_key)

    @property
    def has_gemini(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def has_xai(self) -> bool:
        return bool(self.xai_api_key)

    @property
    def has_deepseek(self) -> bool:
        return bool(self.deepseek_api_key)

    @property
    def has_any_llm(self) -> bool:
        return any([self.has_openai, self.has_claude, self.has_gemini, self.has_xai, self.has_deepseek])

    @property
    def has_nlpcloud(self) -> bool:
        return bool(self.nlpcloud_api_key)

    @property
    def has_huggingface(self) -> bool:
        return bool(self.huggingface_api_key)

    @property
    def llm_agents_enabled(self) -> bool:
        return self.agentic_workflow_enabled and self.has_any_llm

    @property
    def has_tavily(self) -> bool:
        return bool(self.tavily_api_key)

    @property
    def has_serpapi(self) -> bool:
        return bool(self.serpapi_api_key)

    @property
    def has_exa(self) -> bool:
        return bool(self.exa_api_key)

    @property
    def cors_allowed_origins_list(self) -> list[str]:
        values = [item.strip() for item in self.cors_allowed_origins.split(",") if item.strip()]
        return values or ["*"]

    @staticmethod
    def _normalize_domains(raw_values: list[str]) -> list[str]:
        domains: list[str] = []
        for item in raw_values:
            normalized = item.strip().lower()
            if normalized and normalized not in domains:
                domains.append(normalized)
        return domains

    def _resolve_repo_path(self, raw_path: str) -> Path:
        candidate = Path(raw_path)
        if not candidate.is_absolute():
            candidate = BASE_DIR / candidate
        return candidate

    def _legacy_backend_path(self, raw_path: str) -> Path | None:
        candidate = Path(raw_path)
        if candidate.is_absolute():
            return None
        candidate_parts = tuple(part.lower() for part in candidate.parts)
        if candidate_parts and candidate_parts[0] == "backend":
            return None
        legacy = BASE_DIR / "backend" / candidate
        return legacy

    def _resolve_data_path(self, raw_path: str) -> Path:
        canonical = self._resolve_repo_path(raw_path)
        legacy = self._legacy_backend_path(raw_path)
        if canonical.exists():
            return canonical
        if legacy is not None and legacy.exists():
            return legacy
        return canonical

    @cached_property
    def source_tier_config(self) -> SourceTierConfig:
        config_path = self._resolve_repo_path(self.source_tier_config_path)
        try:
            payload = json.loads(config_path.read_text(encoding="utf-8"))
            return SourceTierConfig.model_validate(payload)
        except Exception:
            return SourceTierConfig()

    @cached_property
    def resolved_database_path(self) -> Path:
        return self._resolve_data_path(self.database_path)

    @property
    def verified_authorities_list(self) -> list[str]:
        return self._normalize_domains(self.source_tier_config.verifiedAuthorities.domains)

    @property
    def established_sources_list(self) -> list[str]:
        return self._normalize_domains(self.source_tier_config.establishedSources.domains)

    @property
    def general_sources_list(self) -> list[str]:
        return self._normalize_domains(self.source_tier_config.generalSources.domains)

    @property
    def source_bucket_weights(self) -> dict[str, float]:
        return {
            "tier_3_authority": self.source_tier_config.verifiedAuthorities.weight,
            "tier_2_scholarly": self.source_tier_config.establishedSources.weight,
            "tier_1_blog": self.source_tier_config.generalSources.weight,
        }

    def source_weight_for_bucket(self, bucket: str) -> float:
        return self.source_bucket_weights.get(bucket, self.source_tier_config.generalSources.weight)


settings = Settings()
