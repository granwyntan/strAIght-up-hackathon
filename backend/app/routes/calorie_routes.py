from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel

from ..services.calorie_service import (
    CalorieContext,
    CalorieDailyTotal,
    CalorieSection,
    CalorieTrackerEntry,
    add_calorie_entry,
    calculate_calories,
    delete_calorie_entry,
    get_weekly_calorie_history,
    update_calorie_entry,
)


EXTENSION_TO_CONTENT_TYPE = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

router = APIRouter(prefix="/api/calories", tags=["calories"])
legacy_router = APIRouter(prefix="/api/calorie", tags=["calories"])


class CalorieSectionResponse(BaseModel):
    heading: str
    content: str


class CalorieContextResponse(BaseModel):
    age: float
    bmi: float
    dailyTarget: int
    note: str
    activityLevel: str
    bmr: int | None


class CalorieCalculationResponse(BaseModel):
    analysisText: str
    sections: list[CalorieSectionResponse]
    calorieContext: CalorieContextResponse


class CalorieTrackerEntryResponse(BaseModel):
    id: str
    date: str
    calories: int
    mealName: str
    createdAt: str


class CalorieDailyTotalResponse(BaseModel):
    date: str
    totalCalories: int
    entryCount: int


class CalorieTrackerWeekResponse(BaseModel):
    weekStart: str
    weekEnd: str
    days: list[CalorieDailyTotalResponse]
    entries: list[CalorieTrackerEntryResponse]


class CalorieTrackerCreateResponse(BaseModel):
    entry: CalorieTrackerEntryResponse
    week: CalorieTrackerWeekResponse


class CalorieTrackerCreateRequest(BaseModel):
    calories: int
    mealName: str = ""
    date: str | None = None


class CalorieTrackerUpdateRequest(BaseModel):
    calories: int
    mealName: str = ""


class CalorieTrackerDeleteResponse(BaseModel):
    deleted: bool
    entryId: str


def _to_section_payload(section: CalorieSection) -> CalorieSectionResponse:
    return CalorieSectionResponse(heading=section.heading, content=section.content)


def _to_context_payload(context: CalorieContext) -> CalorieContextResponse:
    return CalorieContextResponse(
        age=context.age,
        bmi=context.bmi,
        dailyTarget=context.daily_target,
        note=context.note,
        activityLevel=context.activity_level,
        bmr=context.bmr,
    )


def _to_entry_payload(entry: CalorieTrackerEntry) -> CalorieTrackerEntryResponse:
    return CalorieTrackerEntryResponse(
        id=entry.id,
        date=entry.entry_date,
        calories=entry.calories,
        mealName=entry.meal_name,
        createdAt=entry.created_at,
    )


def _to_day_payload(day: CalorieDailyTotal) -> CalorieDailyTotalResponse:
    return CalorieDailyTotalResponse(
        date=day.entry_date,
        totalCalories=day.total_calories,
        entryCount=day.entry_count,
    )


def _to_week_payload(week) -> CalorieTrackerWeekResponse:
    return CalorieTrackerWeekResponse(
        weekStart=week.week_start,
        weekEnd=week.week_end,
        days=[_to_day_payload(day) for day in week.days],
        entries=[_to_entry_payload(entry) for entry in week.entries],
    )


async def _calculate_calories_response(
    photo: UploadFile = File(...),
    age: str | None = Form(default=None),
    bmi: str | None = Form(default=None),
    weightKg: str | None = Form(default=None),
    heightCm: str | None = Form(default=None),
    activityLevel: str | None = Form(default=None),
    sex: str | None = Form(default=None),
) -> CalorieCalculationResponse:
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
        result = calculate_calories(
            image_bytes=image_bytes,
            content_type=content_type,
            age=age,
            bmi=bmi,
            weight_kg=weightKg,
            height_cm=heightCm,
            activity_level=activityLevel,
            sex=sex,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Calorie calculation failed.") from exc

    return CalorieCalculationResponse(
        analysisText=result.analysis_text,
        sections=[_to_section_payload(item) for item in result.sections],
        calorieContext=_to_context_payload(result.calorie_context),
    )


@router.post("/calculate", response_model=CalorieCalculationResponse)
async def calculate_calories_endpoint(
    photo: UploadFile = File(...),
    age: str | None = Form(default=None),
    bmi: str | None = Form(default=None),
    weightKg: str | None = Form(default=None),
    heightCm: str | None = Form(default=None),
    activityLevel: str | None = Form(default=None),
    sex: str | None = Form(default=None),
) -> CalorieCalculationResponse:
    return await _calculate_calories_response(photo, age, bmi, weightKg, heightCm, activityLevel, sex)


@legacy_router.post("/calculate", response_model=CalorieCalculationResponse)
async def calculate_calories_endpoint_legacy(
    photo: UploadFile = File(...),
    age: str | None = Form(default=None),
    bmi: str | None = Form(default=None),
    weightKg: str | None = Form(default=None),
    heightCm: str | None = Form(default=None),
    activityLevel: str | None = Form(default=None),
    sex: str | None = Form(default=None),
) -> CalorieCalculationResponse:
    # Backward-compatible alias for clients calling /api/calorie/calculate
    return await _calculate_calories_response(photo, age, bmi, weightKg, heightCm, activityLevel, sex)


@router.get("/tracker", response_model=CalorieTrackerWeekResponse)
def get_calorie_tracker_week(weekStart: str | None = Query(default=None)) -> CalorieTrackerWeekResponse:
    try:
        week = get_weekly_calorie_history(week_start=weekStart)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _to_week_payload(week)


@router.post("/tracker", response_model=CalorieTrackerCreateResponse)
def create_calorie_tracker_entry(payload: CalorieTrackerCreateRequest) -> CalorieTrackerCreateResponse:
    try:
        entry = add_calorie_entry(
            calories=payload.calories,
            meal_name=payload.mealName,
            entry_date=payload.date,
        )
        week = get_weekly_calorie_history(week_start=entry.entry_date)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return CalorieTrackerCreateResponse(
        entry=_to_entry_payload(entry),
        week=_to_week_payload(week),
    )


@router.put("/entry/{entry_id}", response_model=CalorieTrackerEntryResponse)
def update_tracker_entry(entry_id: str, payload: CalorieTrackerUpdateRequest) -> CalorieTrackerEntryResponse:
    try:
        entry = update_calorie_entry(
            entry_id=entry_id,
            calories=payload.calories,
            meal_name=payload.mealName,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _to_entry_payload(entry)


@router.delete("/entry/{entry_id}", response_model=CalorieTrackerDeleteResponse)
def delete_tracker_entry(entry_id: str) -> CalorieTrackerDeleteResponse:
    try:
        delete_calorie_entry(entry_id=entry_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return CalorieTrackerDeleteResponse(deleted=True, entryId=entry_id)
