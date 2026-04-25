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
    activityLevel: str = ""
    sleepHours: str = ""
    sleepQuality: str = ""
    stressLevel: str = ""
    activityGoals: list[str] = []
    dietGoals: list[str] = []
    profileContext: str = ""


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


class SmartActivityInputRequest(BaseModel):
    text: str = ""


class SmartActivityInputResponse(BaseModel):
    title: str
    duration: str
    intensity: str
    notes: str


def _fallback_routine(payload: WorkoutRoutineRequest) -> WorkoutRoutineResponse:
    goals_text = (payload.goals or "").strip().lower()
    low_recovery = any(
        marker in f"{payload.sleepQuality} {payload.stressLevel} {payload.medicalHistory} {payload.profileContext}".lower()
        for marker in ["poor", "high", "injury", "pain", "recover", "fatigue"]
    )
    base_intensity = "easy" if low_recovery else "medium"
    cardio_duration = "20 min" if low_recovery else "30 min"
    strength_duration = "25 min" if low_recovery else "35 min"
    focus_title = "Balanced weekly plan"
    if any(marker in goals_text for marker in ["muscle", "strength", "gain"]):
        focus_title = "Strength-focused weekly plan"
    elif any(marker in goals_text for marker in ["fat", "loss", "lean"]):
        focus_title = "Fat-loss friendly weekly plan"
    elif any(marker in goals_text for marker in ["run", "endurance", "performance"]):
        focus_title = "Performance and conditioning plan"

    return WorkoutRoutineResponse(
        routineTitle=focus_title,
        continuous="weekly",
        trialWeeks=2,
        exercises=[
            WorkoutExerciseResponse(
                type="Walk",
                duration=cardio_duration,
                intensity=base_intensity,
                description="Steady movement block to build consistency without overwhelming recovery.",
                frequency="weekly",
                daysOfWeek=["mon", "thu"],
            ),
            WorkoutExerciseResponse(
                type="Strength training",
                duration=strength_duration,
                intensity="medium" if not low_recovery else "easy",
                description="Full-body session with controlled reps and enough rest between sets.",
                frequency="weekly",
                daysOfWeek=["tue", "fri"],
            ),
            WorkoutExerciseResponse(
                type="Mobility",
                duration="15 min",
                intensity="easy",
                description="Mobility and stretching to support recovery, posture, and adherence.",
                frequency="weekly",
                daysOfWeek=["wed", "sat"],
            ),
            WorkoutExerciseResponse(
                type="Recovery",
                duration="20 min",
                intensity="easy",
                description="Light recovery day with easy walking or gentle cycling only.",
                frequency="weekly",
                daysOfWeek=["sun"],
            ),
        ],
    )


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


def _normalize_activity_intensity(value: str) -> str:
    candidate = (value or "").strip().lower()
    if candidate in {"easy", "mid", "hard", "max"}:
        return candidate
    if candidate in {"medium", "moderate"}:
        return "mid"
    if candidate in {"max effort", "very hard"}:
        return "max"
    return "mid"


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
        "- Link the plan clearly to the user's goals, current activity level, recovery picture, and likely adherence.\n"
        "- Blend strength, cardio, movement, and recovery in a realistic way.\n"
        "- If sleep or stress look poor, tone recovery and intensity down appropriately.\n"
        "- If medicalHistory suggests caution, bias toward safer, lower-impact options.\n"
        f"Input age={payload.age or 'unknown'}, heightCm={payload.heightCm or 'unknown'}, weightKg={payload.weightKg or 'unknown'}, goals={payload.goals or 'unknown'}, "
        f"activityLevel={payload.activityLevel or 'unknown'}, sleepHours={payload.sleepHours or 'unknown'}, sleepQuality={payload.sleepQuality or 'unknown'}, stressLevel={payload.stressLevel or 'unknown'}, "
        f"activityGoals={', '.join(payload.activityGoals) if payload.activityGoals else 'none'}, dietGoals={', '.join(payload.dietGoals) if payload.dietGoals else 'none'}, "
        f"profileContext={payload.profileContext or 'none'}, medicalHistory={payload.medicalHistory or 'none'}"
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
    except Exception as exc:
        logger.warning("Workout suggestion provider failed, using fallback routine: %s", exc)
        return _fallback_routine(payload)

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


@router.post("/parse-activity-input", response_model=SmartActivityInputResponse)
def parse_activity_input(payload: SmartActivityInputRequest) -> SmartActivityInputResponse:
    raw_text = (payload.text or "").strip()
    if not raw_text:
        return SmartActivityInputResponse(title="Activity", duration="", intensity="mid", notes="")
    if not settings.openai_api_key:
        return SmartActivityInputResponse(title="Activity", duration="", intensity="mid", notes=raw_text)

    client = OpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_api_base_url,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
    )

    prompt = (
        "Parse this workout/activity note and return STRICT JSON only with:\n"
        '{ "title": "string", "duration": "string", "intensity": "easy|mid|hard|max", "notes": "string" }\n'
        "Rules:\n"
        "- title should be a concise exercise title.\n"
        "- duration should be estimated if absent, e.g. '30 min'.\n"
        "- notes should keep useful details from the input and add a short plain-language summary if needed.\n"
        f"Input: {raw_text}"
    )
    try:
        logger.info("OpenAI API call: responses.create model=%s trigger=parse_activity_input", WORKOUT_MODEL)
        response = client.responses.create(
            model=WORKOUT_MODEL,
            input=[{"role": "user", "content": [{"type": "input_text", "text": prompt}]}],
        )
        data = _extract_json((response.output_text or "").strip())
        return SmartActivityInputResponse(
            title=str(data.get("title", "")).strip() or "Activity",
            duration=str(data.get("duration", "")).strip() or "30 min",
            intensity=_normalize_activity_intensity(str(data.get("intensity", ""))),
            notes=str(data.get("notes", "")).strip() or raw_text,
        )
    except Exception:
        return SmartActivityInputResponse(title="Activity", duration="", intensity="mid", notes=raw_text)
