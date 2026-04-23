import json
import logging
import time
import uuid
from dataclasses import dataclass
from functools import lru_cache
from threading import Lock
from threading import local
from typing import Any, Literal, TypeVar

import httpx
from openai import OpenAI
from pydantic import BaseModel

from .settings import settings


StageModel = TypeVar("StageModel", bound=BaseModel)
ProviderName = Literal["openai", "claude", "gemini", "xai", "deepseek"]
VALID_PROVIDERS: tuple[ProviderName, ...] = ("openai", "claude", "gemini", "xai", "deepseek")
ANTHROPIC_VERSION = "2023-06-01"
_ORCHESTRATION_STATE = local()
_PROVIDER_LOCK = Lock()
_PROVIDER_COOLDOWNS: dict[ProviderName, float] = {}
PROVIDER_FAILURE_COOLDOWN_SECONDS = 900
PROVIDER_HARD_FAILURE_MARKERS = (
    "quota",
    "credit balance",
    "insufficient balance",
    "rate limit",
    "permission",
    "forbidden",
    "authentication",
    "unauthorized",
    "401",
    "403",
    "429",
)
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StageTarget:
    provider: ProviderName
    model: str


@dataclass(frozen=True)
class StructuredProviderResult:
    provider: ProviderName
    model: str
    payload: BaseModel
    raw_text: str


@dataclass(frozen=True)
class StructuredProviderFailure:
    provider: ProviderName
    model: str
    error: str


def reset_stage_rotation() -> None:
    _ORCHESTRATION_STATE.last_provider = None


def _last_provider() -> ProviderName | None:
    return getattr(_ORCHESTRATION_STATE, "last_provider", None)


def _remember_provider(provider: ProviderName) -> None:
    _ORCHESTRATION_STATE.last_provider = provider


def llm_enabled() -> bool:
    return settings.llm_agents_enabled


def _route_attr(stage: str) -> str:
    if stage == "research":
        return "research_stage_providers"
    if stage == "audit":
        return "audit_stage_providers"
    if stage == "writer":
        return "synthesis_stage_providers"
    if stage == "consensus":
        return "consensus_stage_providers"
    return "reasoning_stage_providers"


def _ordered_providers(raw_value: str) -> list[ProviderName]:
    ordered: list[ProviderName] = []
    for item in raw_value.split(","):
        normalized = item.strip().lower()
        if normalized in VALID_PROVIDERS and normalized not in ordered:
            ordered.append(normalized)
    return ordered or list(VALID_PROVIDERS)


def _provider_enabled(provider: ProviderName) -> bool:
    if provider == "openai":
        return settings.has_openai
    if provider == "claude":
        return settings.has_claude
    if provider == "gemini":
        return settings.has_gemini
    if provider == "xai":
        return settings.has_xai
    return settings.has_deepseek


def _provider_in_cooldown(provider: ProviderName) -> bool:
    now = time.time()
    with _PROVIDER_LOCK:
        cooldown_until = _PROVIDER_COOLDOWNS.get(provider)
        if cooldown_until is None:
            return False
        if cooldown_until <= now:
            _PROVIDER_COOLDOWNS.pop(provider, None)
            return False
        return True


def _mark_provider_failure(provider: ProviderName, exc: Exception) -> None:
    message = f"{type(exc).__name__}: {exc}".lower()
    if not any(marker in message for marker in PROVIDER_HARD_FAILURE_MARKERS):
        return
    with _PROVIDER_LOCK:
        _PROVIDER_COOLDOWNS[provider] = time.time() + PROVIDER_FAILURE_COOLDOWN_SECONDS


def _clear_provider_failure(provider: ProviderName) -> None:
    with _PROVIDER_LOCK:
        _PROVIDER_COOLDOWNS.pop(provider, None)


def clear_provider_failures(providers: list[ProviderName] | None = None) -> None:
    targets = providers or list(VALID_PROVIDERS)
    with _PROVIDER_LOCK:
        for provider in targets:
            _PROVIDER_COOLDOWNS.pop(provider, None)


def _provider_api_key(provider: ProviderName) -> str | None:
    if provider == "openai":
        return settings.openai_api_key
    if provider == "claude":
        return settings.claude_api_key
    if provider == "gemini":
        return settings.gemini_api_key
    if provider == "xai":
        return settings.xai_api_key
    return settings.deepseek_api_key


def _provider_base_url(provider: ProviderName) -> str:
    if provider == "openai":
        return settings.openai_api_base_url
    if provider == "claude":
        return settings.claude_api_base_url
    if provider == "gemini":
        return settings.gemini_api_base_url
    if provider == "xai":
        return settings.xai_api_base_url
    return settings.deepseek_api_base_url


def _stage_model_attr(stage: str) -> str:
    if stage == "research":
        return "research_model"
    if stage == "audit":
        return "citation_auditor_model"
    if stage == "writer":
        return "synthesis_model"
    return "reasoning_model"


def _provider_stage_model(provider: ProviderName, stage: str) -> str:
    stage_attr = _stage_model_attr(stage)
    provider_specific = getattr(settings, f"{provider}_{stage_attr}", "")
    if provider_specific:
        return provider_specific
    return getattr(settings, f"{provider}_model", "")


def stage_targets(
    stage: str,
    preferred_providers: list[ProviderName] | None = None,
    *,
    allow_rotation: bool = True,
) -> list[StageTarget]:
    ordered = preferred_providers or _ordered_providers(getattr(settings, _route_attr(stage), ",".join(VALID_PROVIDERS)))
    targets: list[StageTarget] = []
    for provider in ordered:
        if not _provider_enabled(provider):
            continue
        if _provider_in_cooldown(provider):
            continue
        model = _provider_stage_model(provider, stage).strip()
        if model:
            targets.append(StageTarget(provider=provider, model=model))
    if not allow_rotation:
        return targets
    last_provider = _last_provider()
    if last_provider and len(targets) > 1:
        preferred = [target for target in targets if target.provider != last_provider]
        deferred = [target for target in targets if target.provider == last_provider]
        if preferred:
            return [*preferred, *deferred]
    return targets


def stage_model(stage: str) -> str:
    targets = stage_targets(stage)
    return targets[0].model if targets else ""


def stage_target_label(stage: str) -> str:
    targets = stage_targets(stage)
    if not targets:
        return "no configured provider"
    target = targets[0]
    return f"{target.provider}:{target.model}"


@lru_cache(maxsize=16)
def _openai_client(api_key: str, base_url: str) -> OpenAI:
    return OpenAI(api_key=api_key, base_url=base_url, timeout=settings.llm_timeout_seconds, max_retries=0)


def _payload_text(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=True, indent=2)


def _extract_text(response: Any) -> str:
    output_text = getattr(response, "output_text", "")
    if output_text:
        return output_text

    chunks: list[str] = []
    for item in getattr(response, "output", []) or []:
        for content in getattr(item, "content", []) or []:
            text = getattr(content, "text", "")
            if text:
                chunks.append(text)
    return "\n".join(chunks).strip()


def _extract_anthropic_text(payload: dict[str, Any]) -> str:
    chunks: list[str] = []
    for item in payload.get("content", []) or []:
        if item.get("type") == "text" and item.get("text"):
            chunks.append(item["text"])
    return "\n".join(chunks).strip()


def _extract_gemini_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates", []) or []
    if not candidates:
        return ""
    content = candidates[0].get("content", {})
    parts = content.get("parts", []) or []
    text_chunks = [part.get("text", "") for part in parts if part.get("text")]
    return "\n".join(text_chunks).strip()


def _extract_chat_completion_text(response: Any) -> str:
    choices = getattr(response, "choices", []) or []
    if not choices:
        return ""
    message = getattr(choices[0], "message", None)
    if message is None:
        return ""
    content = getattr(message, "content", "")
    return content.strip() if isinstance(content, str) else ""


def _extract_json_object(text: str) -> dict[str, Any]:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Model did not return a JSON object.")
    return json.loads(text[start : end + 1])


def _extract_json_array(text: str) -> list[dict[str, Any]]:
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Model did not return a JSON array.")
    payload = json.loads(text[start : end + 1])
    if not isinstance(payload, list):
        raise ValueError("Model response was not a JSON array.")
    return payload


def _openai_messages(system_prompt: str, payload: dict[str, Any]) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": _payload_text(payload)},
    ]


def _call_openai_responses(target: StageTarget, system_prompt: str, payload: dict[str, Any]) -> str:
    api_key = _provider_api_key(target.provider)
    if not api_key:
        return ""
    client = _openai_client(api_key, _provider_base_url(target.provider))
    if target.provider == "openai":
        print("OPENAI CALL ID:", uuid.uuid4())
        print("CALL START", time.time())
        print(f"[OpenAI API] responses.create model={target.model} stage-payload-size={len(_payload_text(payload))}")
        logger.info("OpenAI API call: responses.create model=%s", target.model)
    response = client.responses.create(
        model=target.model,
        input=_openai_messages(system_prompt, payload),
        max_output_tokens=settings.llm_max_output_tokens,
    )
    return _extract_text(response)


def _call_deepseek_chat(target: StageTarget, system_prompt: str, payload: dict[str, Any]) -> str:
    api_key = _provider_api_key(target.provider)
    if not api_key:
        return ""
    client = _openai_client(api_key, _provider_base_url(target.provider))
    if target.provider == "openai":
        print("OPENAI CALL ID:", uuid.uuid4())
        print("CALL START", time.time())
        print(f"[OpenAI API] chat.completions.create model={target.model} stage-payload-size={len(_payload_text(payload))}")
        logger.info("OpenAI API call: chat.completions.create model=%s", target.model)
    response = client.chat.completions.create(
        model=target.model,
        messages=_openai_messages(system_prompt, payload),
        response_format={"type": "json_object"},
        max_tokens=settings.llm_max_output_tokens,
    )
    return _extract_chat_completion_text(response)


def _call_anthropic_messages(target: StageTarget, system_prompt: str, payload: dict[str, Any]) -> str:
    api_key = _provider_api_key(target.provider)
    if not api_key:
        return ""
    response = httpx.post(
        _provider_base_url(target.provider),
        headers={
            "x-api-key": api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        },
        json={
            "model": target.model,
            "max_tokens": settings.llm_max_output_tokens,
            "system": system_prompt,
            "messages": [{"role": "user", "content": _payload_text(payload)}],
        },
        timeout=settings.llm_timeout_seconds,
    )
    response.raise_for_status()
    return _extract_anthropic_text(response.json())


def _call_gemini_generate(target: StageTarget, system_prompt: str, payload: dict[str, Any]) -> str:
    api_key = _provider_api_key(target.provider)
    if not api_key:
        return ""
    base_url = _provider_base_url(target.provider).rstrip("/")
    response = httpx.post(
        f"{base_url}/models/{target.model}:generateContent",
        headers={
            "x-goog-api-key": api_key,
            "content-type": "application/json",
        },
        json={
            "system_instruction": {
                "parts": [
                    {"text": system_prompt},
                ]
            },
            "contents": [
                {
                    "parts": [
                        {"text": _payload_text(payload)},
                    ]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
                "maxOutputTokens": settings.llm_max_output_tokens,
            },
        },
        timeout=settings.llm_timeout_seconds,
    )
    response.raise_for_status()
    return _extract_gemini_text(response.json())


def _call_provider(target: StageTarget, system_prompt: str, payload: dict[str, Any]) -> str:
    if target.provider in {"openai", "xai"}:
        return _call_openai_responses(target, system_prompt, payload)
    if target.provider == "claude":
        return _call_anthropic_messages(target, system_prompt, payload)
    if target.provider == "gemini":
        return _call_gemini_generate(target, system_prompt, payload)
    return _call_deepseek_chat(target, system_prompt, payload)


def generate_structured_output(
    stage: str,
    system_prompt: str,
    payload: dict[str, Any],
    schema: type[StageModel],
    preferred_providers: list[ProviderName] | None = None,
) -> StageModel | None:
    if not llm_enabled():
        return None

    for target in stage_targets(stage, preferred_providers=preferred_providers):
        try:
            text = _call_provider(target, system_prompt, payload)
            if not text:
                continue
            parsed = schema.model_validate(_extract_json_object(text))
            _clear_provider_failure(target.provider)
            _remember_provider(target.provider)
            return parsed
        except Exception as exc:
            _mark_provider_failure(target.provider, exc)
            continue
    return None


def generate_structured_list(
    stage: str,
    system_prompt: str,
    payload: dict[str, Any],
    schema: type[StageModel],
    preferred_providers: list[ProviderName] | None = None,
) -> list[StageModel]:
    if not llm_enabled():
        return []

    for target in stage_targets(stage, preferred_providers=preferred_providers):
        try:
            text = _call_provider(target, system_prompt, payload)
            if not text:
                continue
            parsed = [schema.model_validate(item) for item in _extract_json_array(text)]
            _clear_provider_failure(target.provider)
            _remember_provider(target.provider)
            return parsed
        except Exception as exc:
            _mark_provider_failure(target.provider, exc)
            continue
    return []


def generate_structured_outputs_by_provider(
    stage: str,
    system_prompt: str,
    payload: dict[str, Any],
    schema: type[StageModel],
    preferred_providers: list[ProviderName] | None = None,
) -> tuple[list[StructuredProviderResult], list[StructuredProviderFailure]]:
    if not llm_enabled():
        return [], []

    successes: list[StructuredProviderResult] = []
    failures: list[StructuredProviderFailure] = []
    for target in stage_targets(stage, preferred_providers=preferred_providers, allow_rotation=False):
        try:
            text = _call_provider(target, system_prompt, payload)
            if not text:
                failures.append(
                    StructuredProviderFailure(
                        provider=target.provider,
                        model=target.model,
                        error="empty response",
                    )
                )
                continue
            parsed = schema.model_validate(_extract_json_object(text))
            _clear_provider_failure(target.provider)
            successes.append(
                StructuredProviderResult(
                    provider=target.provider,
                    model=target.model,
                    payload=parsed,
                    raw_text=text,
                )
            )
        except Exception as exc:
            _mark_provider_failure(target.provider, exc)
            failures.append(
                StructuredProviderFailure(
                    provider=target.provider,
                    model=target.model,
                    error=f"{type(exc).__name__}: {exc}",
                )
            )
    return successes, failures
