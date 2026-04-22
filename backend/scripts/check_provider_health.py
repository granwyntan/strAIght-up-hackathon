import json
import sys
from pathlib import Path
from typing import Any

import httpx
from openai import OpenAI


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.ai import ANTHROPIC_VERSION  # noqa: E402
from backend.app.settings import settings  # noqa: E402


def _result(provider: str, status: str, message: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "provider": provider,
        "status": status,
        "message": message,
    }
    if extra:
        payload.update(extra)
    return payload


def _classify_exception(provider: str, exc: Exception, model: str | None = None) -> dict[str, Any]:
    status_code = getattr(exc, "status_code", None)
    response = getattr(exc, "response", None)
    if status_code is None and response is not None:
        status_code = getattr(response, "status_code", None)

    body = ""
    if response is not None:
        try:
            body = response.text[:300]
        except Exception:
            body = ""

    extra = {"model": model} if model else None
    if status_code == 400:
        return _result(provider, "bad_request", f"Bad request. {body}".strip(), extra)
    if status_code == 401:
        return _result(provider, "invalid_key", f"Unauthorized. {body or 'The API key is invalid, revoked, or expired.'}", extra)
    if status_code == 402:
        return _result(provider, "insufficient_balance", f"Billing or balance issue. {body}".strip(), extra)
    if status_code == 403:
        return _result(provider, "forbidden", f"Forbidden. {body or 'The key may lack access to this API or model.'}", extra)
    if status_code == 404:
        return _result(provider, "model_or_endpoint_error", f"Model or endpoint not found. {body}".strip(), extra)
    if status_code == 429:
        return _result(provider, "rate_limited", f"Rate limit or quota reached. {body}".strip(), extra)
    if status_code is not None and status_code >= 500:
        return _result(provider, "provider_error", f"Provider returned {status_code}.", extra)
    if isinstance(exc, httpx.TimeoutException):
        return _result(provider, "timeout", "Request timed out.", extra)
    if isinstance(exc, httpx.HTTPError):
        return _result(provider, "http_error", f"HTTP error: {exc}", extra)
    return _result(provider, "error", f"{type(exc).__name__}: {exc}", extra)


def _openai_models(provider: str) -> list[str]:
    names = [
        getattr(settings, f"{provider}_model", ""),
        getattr(settings, f"{provider}_research_model", ""),
        getattr(settings, f"{provider}_reasoning_model", ""),
        getattr(settings, f"{provider}_synthesis_model", ""),
        getattr(settings, f"{provider}_citation_auditor_model", ""),
    ]
    deduped: list[str] = []
    for name in names:
        cleaned = str(name).strip()
        if cleaned and cleaned not in deduped:
            deduped.append(cleaned)
    return deduped


def _test_openai_compatible(provider: str, base_url: str, api_key: str, models: list[str]) -> list[dict[str, Any]]:
    client = OpenAI(api_key=api_key, base_url=base_url, timeout=settings.llm_timeout_seconds, max_retries=0)
    results: list[dict[str, Any]] = []
    for model in models:
        try:
            response = client.responses.create(
                model=model,
                input=[
                    {"role": "system", "content": "Reply with OK."},
                    {"role": "user", "content": "Health check"},
                ],
                max_output_tokens=16,
            )
            text = getattr(response, "output_text", "") or "OK"
            results.append(_result(provider, "ok", f"Model responded: {text[:60].strip() or 'OK'}", {"model": model}))
        except Exception as exc:
            results.append(_classify_exception(provider, exc, model=model))
    return results


def _test_deepseek(api_key: str, base_url: str, models: list[str]) -> list[dict[str, Any]]:
    client = OpenAI(api_key=api_key, base_url=base_url, timeout=settings.llm_timeout_seconds, max_retries=0)
    results: list[dict[str, Any]] = []
    for model in models:
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "Reply with a short JSON object."},
                    {"role": "user", "content": '{"task":"health_check"}'},
                ],
                response_format={"type": "json_object"},
                max_tokens=32,
            )
            text = getattr(response.choices[0].message, "content", "") if getattr(response, "choices", None) else ""
            results.append(_result("deepseek", "ok", f"Model responded: {text[:60].strip() or 'OK'}", {"model": model}))
        except Exception as exc:
            results.append(_classify_exception("deepseek", exc, model=model))
    return results


def _test_claude(api_key: str, base_url: str, models: list[str]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for model in models:
        try:
            response = httpx.post(
                base_url,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": ANTHROPIC_VERSION,
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 16,
                    "system": "Reply with OK.",
                    "messages": [{"role": "user", "content": "Health check"}],
                },
                timeout=settings.llm_timeout_seconds,
            )
            response.raise_for_status()
            results.append(_result("claude", "ok", "Model responded successfully.", {"model": model}))
        except Exception as exc:
            results.append(_classify_exception("claude", exc, model=model))
    return results


def _test_gemini(api_key: str, base_url: str, models: list[str]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    trimmed_base = base_url.rstrip("/")
    for model in models:
        try:
            response = httpx.post(
                f"{trimmed_base}/models/{model}:generateContent",
                headers={
                    "x-goog-api-key": api_key,
                    "content-type": "application/json",
                },
                json={
                    "system_instruction": {"parts": [{"text": "Reply with OK."}]},
                    "contents": [{"parts": [{"text": "Health check"}]}],
                    "generationConfig": {"temperature": 0, "maxOutputTokens": 16},
                },
                timeout=settings.llm_timeout_seconds,
            )
            response.raise_for_status()
            results.append(_result("gemini", "ok", "Model responded successfully.", {"model": model}))
        except Exception as exc:
            results.append(_classify_exception("gemini", exc, model=model))
    return results


def _test_nlpcloud() -> dict[str, Any]:
    if not settings.nlpcloud_api_key:
        return _result("nlpcloud", "missing_key", "No NLP Cloud API key configured.")
    try:
        response = httpx.post(
            f"{settings.nlpcloud_api_base_url.rstrip('/')}/{settings.nlpcloud_classification_model}/classification",
            headers={
                "Authorization": f"Token {settings.nlpcloud_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "text": "Drinking water improves health.",
                "labels": ["supports the claim", "neutral or mixed", "contradicts or fails to support the claim"],
                "multi_class": True,
            },
            timeout=settings.nlpcloud_timeout_seconds,
        )
        response.raise_for_status()
        return _result("nlpcloud", "ok", "Classification endpoint responded successfully.")
    except Exception as exc:
        return _classify_exception("nlpcloud", exc)


def _test_tavily() -> dict[str, Any]:
    if not settings.tavily_api_key:
        return _result("tavily", "missing_key", "No Tavily API key configured.")
    try:
        response = httpx.post(
            "https://api.tavily.com/search",
            json={
                "api_key": settings.tavily_api_key,
                "query": "water health",
                "max_results": 1,
                "search_depth": "basic",
                "include_answer": False,
            },
            timeout=settings.search_timeout_seconds,
        )
        response.raise_for_status()
        return _result("tavily", "ok", "Search endpoint responded successfully.")
    except Exception as exc:
        return _classify_exception("tavily", exc)


def _test_serpapi() -> dict[str, Any]:
    if not settings.serpapi_api_key:
        return _result("serpapi", "missing_key", "No SerpAPI key configured.")
    try:
        response = httpx.get(
            "https://serpapi.com/search.json",
            params={
                "engine": settings.serpapi_engine,
                "q": "water health",
                "api_key": settings.serpapi_api_key,
                "num": 1,
            },
            timeout=settings.search_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("error"):
            return _result("serpapi", "error", str(payload["error"]))
        return _result("serpapi", "ok", "Search endpoint responded successfully.")
    except Exception as exc:
        return _classify_exception("serpapi", exc)


def _test_exa() -> dict[str, Any]:
    if not settings.exa_api_key:
        return _result("exa", "missing_key", "No Exa API key configured.")
    try:
        response = httpx.post(
            "https://api.exa.ai/search",
            headers={
                "x-api-key": settings.exa_api_key,
                "Content-Type": "application/json",
            },
            json={
                "query": "water health",
                "numResults": 1,
            },
            timeout=settings.search_timeout_seconds,
        )
        response.raise_for_status()
        return _result("exa", "ok", "Search endpoint responded successfully.")
    except Exception as exc:
        return _classify_exception("exa", exc)


def main() -> None:
    results: dict[str, Any] = {
        "openai": _test_openai_compatible("openai", settings.openai_api_base_url, settings.openai_api_key or "", _openai_models("openai"))
        if settings.openai_api_key
        else [_result("openai", "missing_key", "No OpenAI API key configured.")],
        "claude": _test_claude(settings.claude_api_key or "", settings.claude_api_base_url, _openai_models("claude"))
        if settings.claude_api_key
        else [_result("claude", "missing_key", "No Claude API key configured.")],
        "gemini": _test_gemini(settings.gemini_api_key or "", settings.gemini_api_base_url, _openai_models("gemini"))
        if settings.gemini_api_key
        else [_result("gemini", "missing_key", "No Gemini API key configured.")],
        "xai": _test_openai_compatible("xai", settings.xai_api_base_url, settings.xai_api_key or "", _openai_models("xai"))
        if settings.xai_api_key
        else [_result("xai", "missing_key", "No xAI API key configured.")],
        "deepseek": _test_deepseek(settings.deepseek_api_key or "", settings.deepseek_api_base_url, _openai_models("deepseek"))
        if settings.deepseek_api_key
        else [_result("deepseek", "missing_key", "No DeepSeek API key configured.")],
        "nlpcloud": _test_nlpcloud(),
        "tavily": _test_tavily(),
        "serpapi": _test_serpapi(),
        "exa": _test_exa(),
    }
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
