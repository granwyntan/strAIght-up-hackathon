from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = BASE_DIR / "backend" / "data" / "investigations.sqlite3"


class Settings(BaseSettings):
    app_env: str = "development"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    backend_public_base_url: str = "http://127.0.0.1:8000"
    cors_allowed_origins: str = "*"
    agentic_workflow_enabled: bool = True
    llm_max_output_tokens: int = 1200
    llm_timeout_seconds: float = 12.0

    openai_api_key: str | None = None
    openai_api_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-5.2"
    openai_research_model: str = "gpt-5-mini"
    openai_reasoning_model: str = "gpt-5.2"
    openai_synthesis_model: str = "gpt-4.1"
    openai_citation_auditor_model: str = "gpt-5-mini"

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

    research_stage_providers: str = "gemini,openai,claude,deepseek,xai"
    audit_stage_providers: str = "claude,openai,gemini,deepseek,xai"
    reasoning_stage_providers: str = "openai,xai,claude,deepseek,gemini"
    synthesis_stage_providers: str = "xai,openai,claude,gemini,deepseek"
    consensus_stage_providers: str = "deepseek,claude,openai,gemini,xai"

    tavily_api_key: str | None = None
    tavily_max_results: int = 5
    serpapi_api_key: str | None = None
    serpapi_engine: str = "google"
    serpapi_num_results: int = 5
    search_timeout_seconds: float = 3.0
    verified_authorities: str = (
        "who.int,nih.gov,cdc.gov,fda.gov,ods.od.nih.gov,nccih.nih.gov,medlineplus.gov,"
        "ncbi.nlm.nih.gov,pubmed.ncbi.nlm.nih.gov,cochrane.org,cochranelibrary.com"
    )
    established_sources: str = (
        "jamanetwork.com,bmj.com,thelancet.com,nejm.org,nature.com,sciencedirect.com,"
        "springer.com,cell.com,harvard.edu,stanford.edu,mayoclinic.org,clevelandclinic.org"
    )
    general_sources: str = ""
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
    def llm_agents_enabled(self) -> bool:
        return self.agentic_workflow_enabled and self.has_any_llm

    @property
    def has_tavily(self) -> bool:
        return bool(self.tavily_api_key)

    @property
    def has_serpapi(self) -> bool:
        return bool(self.serpapi_api_key)

    @property
    def cors_allowed_origins_list(self) -> list[str]:
        values = [item.strip() for item in self.cors_allowed_origins.split(",") if item.strip()]
        return values or ["*"]

    @staticmethod
    def _split_domains(raw_value: str) -> list[str]:
        return [item.strip().lower() for item in raw_value.split(",") if item.strip()]

    @property
    def verified_authorities_list(self) -> list[str]:
        return self._split_domains(self.verified_authorities)

    @property
    def established_sources_list(self) -> list[str]:
        return self._split_domains(self.established_sources)

    @property
    def general_sources_list(self) -> list[str]:
        return self._split_domains(self.general_sources)


settings = Settings()
