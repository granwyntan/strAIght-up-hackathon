import logging
import math
import re
import time
import uuid

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile, status
from openai import RateLimitError
from pydantic import BaseModel

from ..services.supplement_analyzer import (
    DrugDeepDiveResult,
    SupplementSection,
    analyze_supplement,
    analyze_supplement_by_name,
    fetch_drug_deep_dive,
    fetch_drug_info,
)


DEFAULT_CONDITIONS = "NIL"
DEFAULT_GOALS = "Reduce belly fat, Improve cognitive power"
EXTENSION_TO_CONTENT_TYPE = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

router = APIRouter(prefix="/api/supplements", tags=["supplements"])
logger = logging.getLogger(__name__)


class SupplementSectionResponse(BaseModel):
    heading: str
    content: str


class SupplementAnalysisResponse(BaseModel):
    analysisText: str
    sections: list[SupplementSectionResponse]
    infographicImageDataUrl: str
    detectedDrugs: list[str]
    structuredAnalysis: dict[str, object] | None = None
    generationTiming: dict[str, float | None]


class SupplementSearchRequest(BaseModel):
    supplementName: str
    conditions: str = DEFAULT_CONDITIONS
    goals: str = DEFAULT_GOALS
    generateInfographic: bool = True


class SupplementDrugInfoRequest(BaseModel):
    drugName: str
    profileContext: str = ""


class SupplementDrugInfoResponse(BaseModel):
    drug: str
    usage: str
    sideEffects: str


class SupplementDrugDeepDiveResponse(BaseModel):
    analysisText: str
    sections: list[SupplementSectionResponse]
    structuredAnalysis: dict[str, object] | None = None


def _to_section_payload(section: SupplementSection) -> SupplementSectionResponse:
    return SupplementSectionResponse(heading=section.heading, content=section.content)


def _retry_after_from_rate_limit(exc: RateLimitError) -> int | None:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers:
        direct = headers.get("retry-after") or headers.get("Retry-After")
        if direct:
            try:
                parsed = int(math.ceil(float(direct)))
                if parsed > 0:
                    return parsed
            except (TypeError, ValueError):
                pass

        # Some providers expose reset in milliseconds.
        reset_ms = (
            headers.get("x-ratelimit-reset-requests-ms")
            or headers.get("x-ratelimit-reset-tokens-ms")
            or headers.get("x-ratelimit-reset-ms")
        )
        if reset_ms:
            try:
                parsed_ms = int(float(reset_ms))
                if parsed_ms > 0:
                    return max(1, int(math.ceil(parsed_ms / 1000)))
            except (TypeError, ValueError):
                pass

    message = str(exc)
    # Fallback parse e.g. "...Please try again in 12.5s..."
    match = re.search(r"try again in\s*([0-9]+(?:\.[0-9]+)?)\s*s", message, flags=re.IGNORECASE)
    if match:
        try:
            parsed = int(math.ceil(float(match.group(1))))
            if parsed > 0:
                return parsed
        except (TypeError, ValueError):
            return None
    return None


@router.post("/analyze", response_model=SupplementAnalysisResponse)
async def analyze_supplement_endpoint(
    photo: UploadFile = File(...),
    conditions: str = Form(DEFAULT_CONDITIONS),
    goals: str = Form(DEFAULT_GOALS),
    generateInfographic: bool = Form(True),
    x_client_action_id: str | None = Header(default=None, alias="X-Client-Action-Id"),
) -> SupplementAnalysisResponse:
    endpoint_request_id = str(uuid.uuid4())
    print(
        f"ENDPOINT HIT path=/api/supplements/analyze request_id={endpoint_request_id} client_action_id={x_client_action_id or '-'} ts={time.time()}"
    )
    logger.info(
        "ENDPOINT HIT path=%s request_id=%s client_action_id=%s ts=%s",
        "/api/supplements/analyze",
        endpoint_request_id,
        x_client_action_id or "-",
        time.time(),
    )
    image_bytes = await photo.read()
    content_type = (photo.content_type or "").strip().lower()
    if content_type == "image/jpg":
        content_type = "image/jpeg"
    if not content_type and photo.filename:
        lower_name = photo.filename.lower()
        for ext, mapped_type in EXTENSION_TO_CONTENT_TYPE.items():
            if lower_name.endswith(ext):
                content_type = mapped_type
                break

    try:
        result = analyze_supplement(
            image_bytes=image_bytes,
            content_type=content_type,
            conditions=conditions,
            goals=goals,
            generate_infographic=generateInfographic,
            request_id=endpoint_request_id,
        )
    except RateLimitError as exc:
        logger.warning("OpenAI rate limit during supplement image analysis: %s", exc)
        retry_after = _retry_after_from_rate_limit(exc)
        headers = {"Retry-After": str(retry_after)} if retry_after else None
        detail = "OpenAI rate limit reached. Please retry in a moment."
        if retry_after:
            detail = f"OpenAI rate limit reached. Please retry in about {retry_after} seconds."
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers=headers,
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Supplement analysis failed.") from exc

    return SupplementAnalysisResponse(
        analysisText=result.analysis_text,
        sections=[_to_section_payload(item) for item in result.sections],
        infographicImageDataUrl=result.infographic_image_data_url,
        detectedDrugs=result.detected_drugs,
        structuredAnalysis=result.structured_analysis,
        generationTiming={
            "textStartedAt": result.text_generation_started_at,
            "textCompletedAt": result.text_generation_completed_at,
            "imageStartedAt": result.image_generation_started_at,
            "imageCompletedAt": result.image_generation_completed_at,
        },
    )


@router.post("/search", response_model=SupplementAnalysisResponse)
def search_supplement_endpoint(
    payload: SupplementSearchRequest,
    x_client_action_id: str | None = Header(default=None, alias="X-Client-Action-Id"),
) -> SupplementAnalysisResponse:
    endpoint_request_id = str(uuid.uuid4())
    print(
        f"ENDPOINT HIT path=/api/supplements/search request_id={endpoint_request_id} client_action_id={x_client_action_id or '-'} ts={time.time()}"
    )
    logger.info(
        "ENDPOINT HIT path=%s request_id=%s client_action_id=%s ts=%s",
        "/api/supplements/search",
        endpoint_request_id,
        x_client_action_id or "-",
        time.time(),
    )
    try:
        result = analyze_supplement_by_name(
            supplement_name=payload.supplementName,
            conditions=payload.conditions,
            goals=payload.goals,
            generate_infographic=payload.generateInfographic,
            request_id=endpoint_request_id,
        )
    except RateLimitError as exc:
        logger.warning("OpenAI rate limit during supplement text search: %s", exc)
        retry_after = _retry_after_from_rate_limit(exc)
        headers = {"Retry-After": str(retry_after)} if retry_after else None
        detail = "OpenAI rate limit reached. Please retry in a moment."
        if retry_after:
            detail = f"OpenAI rate limit reached. Please retry in about {retry_after} seconds."
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers=headers,
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Supplement search failed.") from exc

    return SupplementAnalysisResponse(
        analysisText=result.analysis_text,
        sections=[_to_section_payload(item) for item in result.sections],
        infographicImageDataUrl=result.infographic_image_data_url,
        detectedDrugs=result.detected_drugs,
        structuredAnalysis=result.structured_analysis,
        generationTiming={
            "textStartedAt": result.text_generation_started_at,
            "textCompletedAt": result.text_generation_completed_at,
            "imageStartedAt": result.image_generation_started_at,
            "imageCompletedAt": result.image_generation_completed_at,
        },
    )


@router.post("/drug-info", response_model=SupplementDrugInfoResponse)
def supplement_drug_info_endpoint(
    payload: SupplementDrugInfoRequest,
    x_client_action_id: str | None = Header(default=None, alias="X-Client-Action-Id"),
) -> SupplementDrugInfoResponse:
    endpoint_request_id = str(uuid.uuid4())
    logger.info(
        "ENDPOINT HIT path=%s request_id=%s client_action_id=%s ts=%s",
        "/api/supplements/drug-info",
        endpoint_request_id,
        x_client_action_id or "-",
        time.time(),
    )
    try:
        result = fetch_drug_info(payload.drugName, request_id=endpoint_request_id)
    except RateLimitError as exc:
        logger.warning("OpenAI rate limit during supplement drug lookup: %s", exc)
        retry_after = _retry_after_from_rate_limit(exc)
        headers = {"Retry-After": str(retry_after)} if retry_after else None
        detail = "OpenAI rate limit reached. Please retry in a moment."
        if retry_after:
            detail = f"OpenAI rate limit reached. Please retry in about {retry_after} seconds."
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers=headers,
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Drug lookup failed.") from exc

    return SupplementDrugInfoResponse(drug=result.drug, usage=result.usage, sideEffects=result.side_effects)


@router.post("/drug-deep-dive", response_model=SupplementDrugDeepDiveResponse)
def supplement_drug_deep_dive_endpoint(
    payload: SupplementDrugInfoRequest,
    x_client_action_id: str | None = Header(default=None, alias="X-Client-Action-Id"),
) -> SupplementDrugDeepDiveResponse:
    endpoint_request_id = str(uuid.uuid4())
    logger.info(
        "ENDPOINT HIT path=%s request_id=%s client_action_id=%s ts=%s",
        "/api/supplements/drug-deep-dive",
        endpoint_request_id,
        x_client_action_id or "-",
        time.time(),
    )
    try:
        result: DrugDeepDiveResult = fetch_drug_deep_dive(
            payload.drugName,
            profile_context=payload.profileContext,
            request_id=endpoint_request_id,
        )
    except RateLimitError as exc:
        logger.warning("OpenAI rate limit during supplement drug deep-dive: %s", exc)
        retry_after = _retry_after_from_rate_limit(exc)
        headers = {"Retry-After": str(retry_after)} if retry_after else None
        detail = "OpenAI rate limit reached. Please retry in a moment."
        if retry_after:
            detail = f"OpenAI rate limit reached. Please retry in about {retry_after} seconds."
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers=headers,
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Drug deep-dive failed.") from exc

    return SupplementDrugDeepDiveResponse(
        analysisText=result.analysis_text,
        sections=[_to_section_payload(item) for item in result.sections],
        structuredAnalysis=result.structured_analysis,
    )
