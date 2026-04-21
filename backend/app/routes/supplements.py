from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from ..services.supplement_analyzer import SupplementSection, analyze_supplement, analyze_supplement_by_name


DEFAULT_CONDITIONS = "NIL"
DEFAULT_GOALS = "Reduce belly fat, Improve cognitive power"
EXTENSION_TO_CONTENT_TYPE = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

router = APIRouter(prefix="/api/supplements", tags=["supplements"])


class SupplementSectionResponse(BaseModel):
    heading: str
    content: str


class SupplementAnalysisResponse(BaseModel):
    analysisText: str
    sections: list[SupplementSectionResponse]
    infographicImageDataUrl: str


class SupplementSearchRequest(BaseModel):
    supplementName: str
    conditions: str = DEFAULT_CONDITIONS
    goals: str = DEFAULT_GOALS


def _to_section_payload(section: SupplementSection) -> SupplementSectionResponse:
    return SupplementSectionResponse(heading=section.heading, content=section.content)


@router.post("/analyze", response_model=SupplementAnalysisResponse)
async def analyze_supplement_endpoint(
    photo: UploadFile = File(...),
    conditions: str = Form(DEFAULT_CONDITIONS),
    goals: str = Form(DEFAULT_GOALS),
) -> SupplementAnalysisResponse:
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
        )
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
    )


@router.post("/search", response_model=SupplementAnalysisResponse)
def search_supplement_endpoint(payload: SupplementSearchRequest) -> SupplementAnalysisResponse:
    try:
        result = analyze_supplement_by_name(
            supplement_name=payload.supplementName,
            conditions=payload.conditions,
            goals=payload.goals,
        )
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
    )
