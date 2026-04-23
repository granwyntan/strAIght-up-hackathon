from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from openai import OpenAI
from pydantic import BaseModel

from ..settings import settings

router = APIRouter(prefix="/api/workout-routine", tags=["workout"])

WORKOUT_MODEL = "gpt-5.4-mini"
logger = logging.getLogger(__name__)


class WorkoutRoutineRequest(BaseModel):
    age: str = ""
    heightCm: str = ""
    weightKg: str = ""
    goals: str = ""
    medicalHistory: str = ""


class WorkoutExerciseResponse(BaseModel):
    type: str
    duration: str
    intensity: str
    description: str
    frequency: str
    daysOfWeek: list[str] = []


class WorkoutRoutineResponse(BaseModel):
    routineTitle: str
    continuous: str
    trialWeeks: int
    exercises: list[WorkoutExerciseResponse]


def _extract_json(text: str) -> dict[str, Any]:
    raw = text.strip()
    if not raw:
        raise ValueError("Workout suggestion was empty.")
    try:
        payload = json.loads(raw)
        if isinstance(payload, dict):
            return payload
    except Exception:
        pass
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("Workout suggestion could not be parsed.")
    payload = json.loads(raw[start : end + 1])
    if not isinstance(payload, dict):
        raise ValueError("Workout suggestion format is invalid.")
    return payload


def _normalize_frequency(value: str) -> str:
    candidate = (value or "").strip().lower()
    if candidate in {"daily", "weekly", "once"}:
        return candidate
    return "daily"


def _normalize_intensity(value: str) -> str:
    candidate = (value or "").strip().lower()
    if candidate in {"easy", "medium", "hard", "max effort"}:
        return candidate
    if candidate in {"max", "very hard"}:
        return "max effort"
    return "medium"


@router.post("/suggest", response_model=WorkoutRoutineResponse)
def suggest_workout_routine(payload: WorkoutRoutineRequest) -> WorkoutRoutineResponse:
    if not settings.openai_api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Workout suggestion is unavailable because OPENAI_API_KEY is not configured.")

    client = OpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_api_base_url,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
    )

    prompt = (
        "Create a safe workout routine suggestion based on this profile. "
        "Return STRICT JSON only with this schema:\n"
        "{\n"
        '  "routineTitle": "string",\n'
        '  "continuous": "daily|weekly|once",\n'
        '  "trialWeeks": 2,\n'
        '  "exercises": [\n'
        "    {\n"
        '      "type": "run|gym|cycle|calisthenics|... ",\n'
        '      "duration": "e.g. 30 min",\n'
        '      "intensity": "easy|medium|hard|max effort",\n'
        '      "description": "short notes",\n'
        '      "frequency": "daily|weekly|once",\n'
        '      "daysOfWeek": ["mon","tue"]\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "Rules:\n"
        "- Keep exactly 3-7 exercises.\n"
        "- trialWeeks must be 2.\n"
        "- Keep descriptions concise and practical.\n"
        "- Consider medicalHistory safety.\n"
        f"Input age={payload.age or 'unknown'}, heightCm={payload.heightCm or 'unknown'}, weightKg={payload.weightKg or 'unknown'}, goals={payload.goals or 'unknown'}, medicalHistory={payload.medicalHistory or 'none'}"
    )

    try:
        print(f"[OpenAI API] responses.create model={WORKOUT_MODEL} trigger=workout_routine")
        logger.info("OpenAI API call: responses.create model=%s trigger=workout_routine", WORKOUT_MODEL)
        response = client.responses.create(
            model=WORKOUT_MODEL,
            input=[
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": prompt}],
                }
            ],
        )
        content = (response.output_text or "").strip()
        data = _extract_json(content)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Workout suggestion failed: {exc}") from exc

    exercises_raw = data.get("exercises")
    if not isinstance(exercises_raw, list) or len(exercises_raw) == 0:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Workout suggestion returned no exercises.")

    exercises: list[WorkoutExerciseResponse] = []
    for item in exercises_raw[:10]:
        if not isinstance(item, dict):
            continue
        exercise = WorkoutExerciseResponse(
            type=str(item.get("type", "")).strip() or "Workout",
            duration=str(item.get("duration", "")).strip() or "30 min",
            intensity=_normalize_intensity(str(item.get("intensity", ""))),
            description=str(item.get("description", "")).strip() or "Follow a moderate pace and maintain good form.",
            frequency=_normalize_frequency(str(item.get("frequency", ""))),
            daysOfWeek=[str(day).strip().lower() for day in (item.get("daysOfWeek") or []) if str(day).strip()],
        )
        exercises.append(exercise)

    if not exercises:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Workout suggestion returned invalid exercises.")

    continuous = _normalize_frequency(str(data.get("continuous", "")))
    trial_weeks = 2
    title = str(data.get("routineTitle", "")).strip() or "2-week routine"

    return WorkoutRoutineResponse(
        routineTitle=title,
        continuous=continuous,
        trialWeeks=trial_weeks,
        exercises=exercises,
    )
