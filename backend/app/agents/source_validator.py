import asyncio
import re

import httpx
from pydantic import BaseModel, Field

from ..async_utils import gather_limited, retry_async
from ..cache import cache_key, get_json, set_json
from ..ai import generate_structured_output
from ..models import SourceAssessment
from ..settings import settings


class SourceValidationOutput(BaseModel):
    keep: bool = True
    linkAlive: bool = True
    contentAccessible: bool = True
    directEvidenceEligible: bool = False
    similarityScore: int = Field(default=0, ge=0, le=100)
    evidenceQuote: str = ""
    resolvedUrl: str = ""
    statusCode: int | None = None
    contentType: str = ""
    extractedText: str = ""
    note: str = Field(min_length=10, max_length=400)


VISIBLE_TEXT_TAGS = re.compile(r"<(script|style).*?>.*?</\1>", re.IGNORECASE | re.DOTALL)
HTML_TAGS = re.compile(r"<[^>]+>")
WHITESPACE = re.compile(r"\s+")
TOKEN_PATTERN = re.compile(r"[a-z0-9]+", re.IGNORECASE)
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
FETCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/135.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}
SOFT_BLOCK_STATUS_CODES = {401, 403, 405, 406, 408, 409, 412, 425, 429, 451, 500, 502, 503, 504}
REJECT_EVIDENCE_DOMAIN_MARKERS = (
    "consensus.app",
    "droracle.ai",
    "drstanfield.com",
    "reddit.com",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "instagram.com",
    "facebook.com",
    "x.com",
    "twitter.com",
    "quora.com",
    "medium.com",
    "substack.com",
    "pinterest.com",
    "usamedical.com",
)
CONTEXT_ONLY_DOMAIN_MARKERS = (
    "npr.org",
    "sacbee.com",
    "cnn.com",
    "foxnews.com",
    "newsweek.com",
    "forbes.com",
    "msn.com",
    "yahoo.com",
)
APPROVED_GENERAL_HEALTH_DOMAIN_MARKERS = (
    "sleepfoundation.org",
    "webmd.com",
    "medicalnewstoday.com",
    "healthline.com",
    "mayoclinic.org",
    "clevelandclinic.org",
    "bannerhealth.com",
    "medlineplus.gov",
    "nih.gov",
    "nccih.nih.gov",
    "ods.od.nih.gov",
    "aad.org",
    "aap.org",
    "aasm.org",
)


def _clean_text(raw_text: str) -> str:
    no_scripts = VISIBLE_TEXT_TAGS.sub(" ", raw_text)
    no_tags = HTML_TAGS.sub(" ", no_scripts)
    return WHITESPACE.sub(" ", no_tags).strip()


def _normalized(text: str) -> str:
    return WHITESPACE.sub(" ", text).strip().lower()


def _trusted_excerpt(review_excerpt: str, extracted_text: str) -> str:
    candidate = (review_excerpt or "").strip()
    trusted = (extracted_text or "").strip()
    if not candidate:
        return trusted
    if not trusted:
        return ""
    normalized_candidate = _normalized(candidate)
    normalized_trusted = _normalized(trusted)
    if normalized_candidate and normalized_candidate in normalized_trusted:
        return candidate
    return trusted


def _tokenize(text: str) -> set[str]:
    return {token.lower() for token in TOKEN_PATTERN.findall(text) if len(token) > 2}


def _trim_quote(text: str, limit: int = 220) -> str:
    cleaned = WHITESPACE.sub(" ", text).strip().strip("\"")
    if len(cleaned) <= limit:
        return cleaned
    truncated = cleaned[:limit].rsplit(" ", 1)[0].strip()
    return truncated or cleaned[:limit].strip()


def _semantic_similarity(source: SourceAssessment, extracted_text: str) -> int:
    query_terms = _tokenize(" ".join([source.query, source.title, source.snippet]))
    text_terms = _tokenize(extracted_text)
    if not query_terms or not text_terms:
        return 0
    overlap = len(query_terms & text_terms)
    union = len(query_terms | text_terms)
    jaccard = overlap / max(1, union)
    title_overlap = len(_tokenize(source.title) & text_terms) / max(1, len(_tokenize(source.title)))
    return max(0, min(100, round(((jaccard * 0.7) + (title_overlap * 0.3)) * 100)))


def _candidate_quote(source: SourceAssessment, extracted_text: str) -> str:
    sentences = [sentence.strip() for sentence in SENTENCE_SPLIT.split(WHITESPACE.sub(" ", extracted_text)) if sentence.strip()]
    if not sentences:
        return ""
    query_terms = _tokenize(" ".join([source.query, source.title, source.snippet]))
    best_sentence = ""
    best_score = (-1, -1)
    for sentence in sentences[:28]:
        if len(sentence) < 36:
            continue
        candidate = _trim_quote(sentence)
        overlap = len(_tokenize(candidate) & query_terms)
        score = (overlap, min(len(candidate), 220))
        if score > best_score:
            best_sentence = candidate
            best_score = score
    return best_sentence or _trim_quote(sentences[0])


def _quote_present(extracted_text: str, quote: str) -> bool:
    normalized_quote = _normalized(quote)
    normalized_text = _normalized(extracted_text)
    return bool(normalized_quote and normalized_quote in normalized_text)


def _domain_matches(domain: str, patterns: tuple[str, ...]) -> bool:
    lowered = domain.lower()
    return any(lowered == pattern or lowered.endswith(f".{pattern}") or pattern in lowered for pattern in patterns)


def _snippet_rescue_text(source: SourceAssessment) -> str:
    return _clean_text(source.extractedText or source.snippet or source.title)[: settings.source_validation_rescue_excerpt_chars]


def _can_rescue_with_search_excerpt(source: SourceAssessment, rescued_excerpt: str, *, status_code: int | None = None) -> bool:
    if not rescued_excerpt:
        return False
    if status_code in {404, 410}:
        return False
    minimum_chars = settings.source_validation_general_rescue_min_chars
    if source.sourceScore >= 2 or source.evidenceScore >= 3 or source.stance in {"supportive", "mixed", "contradictory"}:
        minimum_chars = min(minimum_chars, 96)
    if len(rescued_excerpt) < minimum_chars:
        return False
    if source.cacheStatus == "fallback" and source.sourceScore <= 1 and source.evidenceScore <= 2:
        return False
    if source.sourceScore >= 2 or source.evidenceScore >= 3:
        return True
    if source.stance in {"supportive", "mixed", "contradictory"}:
        return True
    title_or_query = _normalized(" ".join([source.title, source.query]))
    snippet_text = _normalized(rescued_excerpt)
    overlap = len(set(title_or_query.split()) & set(snippet_text.split()))
    if status_code in SOFT_BLOCK_STATUS_CODES:
        return overlap >= 3
    return overlap >= 4


async def _fetch_source_text(
    source: SourceAssessment,
    mode: str,
    client: httpx.AsyncClient | None = None,
) -> tuple[bool, bool, str, str, str, dict[str, str | int | None]]:
    if mode == "offline":
        text = source.snippet or source.title
        return True, True, text, "Offline mode used the seeded source excerpt as accessible evidence text.", "fallback", {
            "resolvedUrl": source.resolvedUrl or source.discoveredUrl or source.url,
            "statusCode": None,
            "contentType": "offline",
        }

    key = cache_key("extract", source.url)
    cached_payload = get_json("extract", key)
    if cached_payload is not None:
        return (
            bool(cached_payload.get("linkAlive", False)),
            bool(cached_payload.get("contentAccessible", False)),
            str(cached_payload.get("extractedText", "")),
            str(cached_payload.get("note", "Loaded cached extraction.")),
            "cached",
            {
                "resolvedUrl": str(cached_payload.get("resolvedUrl", source.resolvedUrl or source.discoveredUrl or source.url)),
                "statusCode": cached_payload.get("statusCode"),
                "contentType": str(cached_payload.get("contentType", "")),
            },
        )

    owns_client = client is None
    request_client = client
    try:
        if request_client is None:
            request_client = httpx.AsyncClient(
                follow_redirects=True,
                timeout=settings.source_validation_timeout_seconds,
                headers=FETCH_HEADERS,
            )
        response = await retry_async(lambda: request_client.get(source.url))
        response.raise_for_status()
        resolved_url = str(response.url)
        status_code = int(response.status_code)
        content_type = (response.headers.get("content-type") or "").lower()
        if "pdf" in content_type or source.url.lower().endswith(".pdf"):
            extracted = _snippet_rescue_text(source)
            if extracted:
                payload = {
                    "linkAlive": True,
                    "contentAccessible": True,
                    "extractedText": extracted,
                    "resolvedUrl": resolved_url,
                    "statusCode": status_code,
                    "contentType": content_type,
                    "note": "The source appears to be a PDF, so the search-provider excerpt was retained as limited evidence text.",
                }
                set_json("extract", key, payload, settings.extraction_cache_ttl_seconds)
                return True, True, extracted, payload["note"], "fallback", {
                    "resolvedUrl": resolved_url,
                    "statusCode": status_code,
                    "contentType": content_type,
                }
            payload = {
                "linkAlive": True,
                "contentAccessible": False,
                "extractedText": "",
                "resolvedUrl": resolved_url,
                "statusCode": status_code,
                "contentType": content_type,
                "note": "The source appears to be a PDF, but no readable excerpt was available to retain.",
            }
            set_json("extract", key, payload, settings.extraction_cache_ttl_seconds)
            return True, False, "", payload["note"], "live", {
                "resolvedUrl": resolved_url,
                "statusCode": status_code,
                "contentType": content_type,
            }
        if "text" not in content_type and "json" not in content_type and "html" not in content_type:
            payload = {
                "linkAlive": True,
                "contentAccessible": False,
                "extractedText": "",
                "resolvedUrl": resolved_url,
                "statusCode": status_code,
                "contentType": content_type,
                "note": "The link responded, but the content could not be extracted as readable text.",
            }
            set_json("extract", key, payload, settings.extraction_cache_ttl_seconds)
            return True, False, "", payload["note"], "live", {
                "resolvedUrl": resolved_url,
                "statusCode": status_code,
                "contentType": content_type,
            }
        extracted = _clean_text(response.text)[:9000]
        if not extracted:
            payload = {
                "linkAlive": True,
                "contentAccessible": False,
                "extractedText": "",
                "resolvedUrl": resolved_url,
                "statusCode": status_code,
                "contentType": content_type,
                "note": "The link responded, but no readable text could be extracted.",
            }
            set_json("extract", key, payload, settings.extraction_cache_ttl_seconds)
            return True, False, "", payload["note"], "live", {
                "resolvedUrl": resolved_url,
                "statusCode": status_code,
                "contentType": content_type,
            }

        payload = {
            "linkAlive": True,
            "contentAccessible": True,
            "extractedText": extracted,
            "resolvedUrl": resolved_url,
            "statusCode": status_code,
            "contentType": content_type,
            "note": "The link responded and readable source text was extracted.",
        }
        set_json("extract", key, payload, settings.extraction_cache_ttl_seconds)
        return True, True, extracted, payload["note"], "live", {
            "resolvedUrl": resolved_url,
            "statusCode": status_code,
            "contentType": content_type,
        }
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code if exc.response is not None else 0
        rescued_excerpt = _snippet_rescue_text(source)
        if _can_rescue_with_search_excerpt(source, rescued_excerpt, status_code=status_code):
            return (
                True,
                True,
                rescued_excerpt,
                f"The direct page fetch returned HTTP {status_code}, so the live search excerpt was retained as limited-access evidence text instead of discarding the source.",
                "fallback",
                {
                    "resolvedUrl": source.resolvedUrl or source.discoveredUrl or source.url,
                    "statusCode": status_code,
                    "contentType": "",
                },
            )
        return False, False, "", f"The source could not be reached reliably: {exc}.", "fallback", {
            "resolvedUrl": source.resolvedUrl or source.discoveredUrl or source.url,
            "statusCode": status_code,
            "contentType": "",
        }
    except httpx.TimeoutException as exc:
        rescued_excerpt = _snippet_rescue_text(source)
        if _can_rescue_with_search_excerpt(source, rescued_excerpt):
            return True, True, rescued_excerpt, "The direct page fetch timed out, so the live search excerpt was retained as limited-access evidence text.", "fallback", {
                "resolvedUrl": source.resolvedUrl or source.discoveredUrl or source.url,
                "statusCode": None,
                "contentType": "",
            }
        return False, False, "", f"The source could not be reached reliably: {exc}.", "fallback", {
            "resolvedUrl": source.resolvedUrl or source.discoveredUrl or source.url,
            "statusCode": None,
            "contentType": "",
        }
    except httpx.HTTPError as exc:
        rescued_excerpt = _snippet_rescue_text(source)
        if _can_rescue_with_search_excerpt(source, rescued_excerpt):
            return True, True, rescued_excerpt, "The direct page fetch could not complete cleanly, so the live search excerpt was retained as limited-access evidence text.", "fallback", {
                "resolvedUrl": source.resolvedUrl or source.discoveredUrl or source.url,
                "statusCode": None,
                "contentType": "",
            }
        return False, False, "", f"The source could not be reached reliably: {exc}.", "fallback", {
            "resolvedUrl": source.resolvedUrl or source.discoveredUrl or source.url,
            "statusCode": None,
            "contentType": "",
        }
    except Exception as exc:
        rescued_excerpt = _snippet_rescue_text(source)
        if _can_rescue_with_search_excerpt(source, rescued_excerpt):
            return True, True, rescued_excerpt, "The direct page fetch failed unexpectedly, so the live search excerpt was retained as limited-access evidence text.", "fallback", {
                "resolvedUrl": source.resolvedUrl or source.discoveredUrl or source.url,
                "statusCode": None,
                "contentType": "",
            }
        return False, False, "", f"The source could not be reached reliably: {exc}.", "fallback", {
            "resolvedUrl": source.resolvedUrl or source.discoveredUrl or source.url,
            "statusCode": None,
            "contentType": "",
        }
    finally:
        if owns_client and request_client is not None:
            await request_client.aclose()


def _llm_source_validation(claim: str, source: SourceAssessment, extracted_text: str) -> SourceValidationOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You validate whether a retrieved health-claim source is reachable and relevant. "
            "Return JSON only with keep, linkAlive, contentAccessible, directEvidenceEligible, similarityScore, evidenceQuote, resolvedUrl, statusCode, contentType, extractedText, and note. "
            "Reject sources that are broken, inaccessible, or obviously mismatched to the claim."
        ),
        {
            "claim": claim,
            "source": {
                "title": source.title,
                "url": source.url,
                "domain": source.domain,
                "snippet": source.snippet,
                "evidenceTier": source.evidenceTier,
                "sourceBucket": source.sourceBucket,
                "discoveredUrl": source.discoveredUrl or source.url,
            },
            "extracted_excerpt": extracted_text[:2200],
            "instructions": [
                "Prefer keeping the source when the excerpt clearly aligns with the claim or its contradiction.",
                "Discard sources that are obviously inaccessible, unrelated, or too empty to validate.",
                "Only mark directEvidenceEligible true when the source is directly usable as a first-class evidence card.",
                "Keep similarityScore conservative.",
                "Keep extractedText concise and copied only from the provided excerpt.",
            ],
        },
        SourceValidationOutput,
        preferred_providers=["deepseek", "gemini", "openai"],
    )


def _llm_source_validation_check(
    claim: str,
    source: SourceAssessment,
    extracted_text: str,
    draft: SourceValidationOutput,
) -> SourceValidationOutput | None:
    return generate_structured_output(
        "audit",
        (
            "You check a source-validation decision for a health-claim investigation. "
            "Return JSON only with keep, linkAlive, contentAccessible, directEvidenceEligible, similarityScore, evidenceQuote, resolvedUrl, statusCode, contentType, extractedText, and note. "
            "Reject sources that are still broken, inaccessible, or obviously unrelated."
        ),
        {
            "claim": claim,
            "draft": draft.model_dump(),
            "source": {
                "title": source.title,
                "url": source.url,
                "domain": source.domain,
                "snippet": source.snippet,
                "evidenceTier": source.evidenceTier,
                "sourceBucket": source.sourceBucket,
                "discoveredUrl": source.discoveredUrl or source.url,
            },
            "extracted_excerpt": extracted_text[:2200],
            "instructions": [
                "Keep contradiction evidence when it clearly addresses the claim.",
                "Do not approve a source just because it is reachable if the content is off-topic or too thin.",
                "You may correct the draft if it is too permissive or too strict.",
            ],
        },
        SourceValidationOutput,
        preferred_providers=["claude", "openai", "xai"],
    )


def _llm_source_validation_arbiter(
    claim: str,
    source: SourceAssessment,
    extracted_text: str,
    primary: SourceValidationOutput,
    checker: SourceValidationOutput,
) -> SourceValidationOutput | None:
    return generate_structured_output(
        "consensus",
        (
            "You arbitrate a disagreement in a health-claim source-validation stage. "
            "Return JSON only with keep, linkAlive, contentAccessible, directEvidenceEligible, similarityScore, evidenceQuote, resolvedUrl, statusCode, contentType, extractedText, and note. "
            "Prefer caution and strict source integrity."
        ),
        {
            "claim": claim,
            "source": {
                "title": source.title,
                "url": source.url,
                "domain": source.domain,
                "snippet": source.snippet,
                "discoveredUrl": source.discoveredUrl or source.url,
            },
            "primary": primary.model_dump(),
            "checker": checker.model_dump(),
            "extracted_excerpt": extracted_text[:2200],
            "instructions": [
                "Only mark directEvidenceEligible true when the source is directly usable as a first-class evidence card.",
                "Prefer rejecting or downgrading doubtful sources rather than letting them through as strong evidence.",
                "Keep similarityScore conservative and only keep evidenceQuote if it exists in the excerpt.",
            ],
        },
        SourceValidationOutput,
        preferred_providers=["openai", "gemini", "claude"],
    )


async def _validate_one(
    payload: tuple[int, SourceAssessment],
    claim: str,
    mode: str,
    client: httpx.AsyncClient | None = None,
) -> SourceAssessment | None:
    index, source = payload
    link_alive, content_accessible, extracted_text, note, cache_status, fetch_meta = await _fetch_source_text(source, mode, client)
    status_code = fetch_meta.get("statusCode")
    content_type = str(fetch_meta.get("contentType", ""))
    resolved_url = str(fetch_meta.get("resolvedUrl", source.resolvedUrl or source.discoveredUrl or source.url))
    similarity_score = _semantic_similarity(source, extracted_text or source.snippet)
    evidence_quote = _candidate_quote(source, extracted_text or source.snippet)
    quote_present = _quote_present(extracted_text or source.snippet, evidence_quote)
    rejected_domain = _domain_matches(source.domain, REJECT_EVIDENCE_DOMAIN_MARKERS)
    context_only_domain = _domain_matches(source.domain, CONTEXT_ONLY_DOMAIN_MARKERS)
    approved_general_health_domain = _domain_matches(source.domain, APPROVED_GENERAL_HEALTH_DOMAIN_MARKERS)
    keep = link_alive and content_accessible
    direct_evidence_eligible = bool(
        keep
        and cache_status != "fallback"
        and status_code == 200
        and similarity_score >= 22
        and quote_present
        and not rejected_domain
        and (
            source.sourceBucket != "tier_1_blog"
            or approved_general_health_domain
        )
    )

    llm_review = None
    llm_review_limit = max(0, settings.source_validation_llm_review_limit)
    rescued_from_search_excerpt = cache_status == "fallback" and extracted_text == _snippet_rescue_text(source)
    if keep and index < llm_review_limit and not rescued_from_search_excerpt:
        llm_review = await asyncio.to_thread(_llm_source_validation, claim, source, extracted_text or source.snippet)
    if llm_review is not None:
        checker_review = await asyncio.to_thread(_llm_source_validation_check, claim, source, extracted_text or source.snippet, llm_review)
        effective_review = checker_review or llm_review
        if checker_review is not None and (
            checker_review.keep != llm_review.keep
            or checker_review.directEvidenceEligible != llm_review.directEvidenceEligible
            or abs(checker_review.similarityScore - llm_review.similarityScore) >= 18
        ):
            arbiter_review = await asyncio.to_thread(
                _llm_source_validation_arbiter,
                claim,
                source,
                extracted_text or source.snippet,
                llm_review,
                checker_review,
            )
            if arbiter_review is not None:
                effective_review = arbiter_review
        keep = keep and effective_review.keep and effective_review.linkAlive and effective_review.contentAccessible
        link_alive = effective_review.linkAlive
        content_accessible = effective_review.contentAccessible
        extracted_text = _trusted_excerpt(effective_review.extractedText, extracted_text)
        similarity_score = max(similarity_score, effective_review.similarityScore)
        evidence_quote = evidence_quote if _quote_present(extracted_text or source.snippet, evidence_quote) else effective_review.evidenceQuote
        if _quote_present(extracted_text or source.snippet, effective_review.evidenceQuote):
            evidence_quote = effective_review.evidenceQuote
        if effective_review.resolvedUrl.strip():
            resolved_url = effective_review.resolvedUrl.strip()
        status_code = effective_review.statusCode if effective_review.statusCode is not None else status_code
        content_type = effective_review.contentType or content_type
        direct_evidence_eligible = (
            direct_evidence_eligible
            and effective_review.directEvidenceEligible
            and _quote_present(extracted_text or source.snippet, evidence_quote)
        )
        note = effective_review.note
        if not keep and _can_rescue_with_search_excerpt(source, _snippet_rescue_text(source)):
            keep = True
            link_alive = True
            content_accessible = True
            extracted_text = _snippet_rescue_text(source)
            evidence_quote = ""
            similarity_score = max(similarity_score, _semantic_similarity(source, extracted_text))
            direct_evidence_eligible = False
            note = "The validator review was stricter than the available fetch path, so the live search excerpt was kept as limited-access evidence instead of dropping the source."

    if rejected_domain:
        keep = False
    if context_only_domain:
        direct_evidence_eligible = False

    if not keep:
        return None

    notes = list(source.notes)
    if rejected_domain:
        notes.append("This domain behaves like an AI-answer, social, or user-generated source, so it was rejected as medical evidence.")
    elif context_only_domain:
        notes.append("This domain is treated as context-only reporting rather than direct medical evidence.")
    notes.append(note)
    return source.model_copy(
        update={
            "linkAlive": link_alive,
            "contentAccessible": content_accessible,
            "httpStatusCode": status_code if isinstance(status_code, int) else None,
            "contentType": content_type,
            "fetchRedirected": resolved_url.strip() not in {"", source.discoveredUrl or source.url, source.url},
            "resolvedUrl": resolved_url,
            "evidenceUrl": resolved_url if direct_evidence_eligible else source.evidenceUrl or resolved_url or source.url,
            "extractedText": extracted_text or source.snippet,
            "semanticSimilarity": similarity_score,
            "directEvidenceEligible": direct_evidence_eligible,
            "linkValidationSummary": (
                "This source is context-only and not treated as direct medical evidence."
                if context_only_domain
                else note
            ),
            "cacheStatus": cache_status if cache_status in {"live", "cached", "fallback"} else source.cacheStatus,
            "notes": notes,
        }
    )


async def validate_sources(claim: str, sources: list[SourceAssessment], mode: str) -> list[SourceAssessment]:
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=settings.source_validation_timeout_seconds,
        headers=FETCH_HEADERS,
    ) as client:
        validated = await gather_limited(
            list(enumerate(sources)),
            lambda item: _validate_one(item, claim, mode, None if mode == "offline" else client),
            concurrency=settings.pipeline_max_concurrency,
        )
    return [source for source in validated if source is not None]
