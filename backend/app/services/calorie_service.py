from __future__ import annotations

import base64
import hashlib
import logging
import random
import re
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

from openai import APIConnectionError, APIError, APITimeoutError, OpenAI, RateLimitError

from ..database import get_connection
from ..settings import settings
from .image_preprocess import optimize_image_for_openai


ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
DEFAULT_AGE = 25.0
DEFAULT_BMI = 22.0
DEFAULT_ACTIVITY_LEVEL = "moderate"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
CALORIE_ANALYSIS_MODEL = "gpt-5.4-mini"
OPENAI_RETRY_ATTEMPTS = 3
OPENAI_RETRY_BASE_SECONDS = 0.8
ACTIVITY_MULTIPLIER = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

_analysis_cache: dict[str, "CalorieCalculationResult"] = {}
logger = logging.getLogger(__name__)


def _extract_openai_error_code(exc: Exception) -> str:
    direct_code = getattr(exc, "code", None)
    if isinstance(direct_code, str) and direct_code.strip():
        return direct_code.strip().lower()

    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        nested = body.get("error")
        if isinstance(nested, dict):
            nested_code = nested.get("code")
            if isinstance(nested_code, str) and nested_code.strip():
                return nested_code.strip().lower()
        body_code = body.get("code")
        if isinstance(body_code, str) and body_code.strip():
            return body_code.strip().lower()

    message = str(exc).lower()
    if "insufficient_quota" in message:
        return "insufficient_quota"
    return ""


def _is_insufficient_quota_error(exc: Exception) -> bool:
    return _extract_openai_error_code(exc) == "insufficient_quota"


def _is_retryable_api_status_error(exc: APIError) -> bool:
    status_code = getattr(exc, "status_code", None)
    return isinstance(status_code, int) and status_code >= 500


def _response_with_rate_limit_retry(
    client: OpenAI,
    *,
    model: str,
    input_payload: list[dict],
    request_id: str,
    trigger_source: str,
) -> object:
    for attempt in range(OPENAI_RETRY_ATTEMPTS):
        try:
            print("OPENAI CALL ID:", request_id)
            print("CALL START", time.time())
            print(
                f"[OpenAI API] responses.create model={model} trigger={trigger_source} request_id={request_id} attempt={attempt + 1}"
            )
            logger.info(
                "OpenAI API call: responses.create model=%s trigger=%s request_id=%s attempt=%s",
                model,
                trigger_source,
                request_id,
                attempt + 1,
            )
            response = client.responses.create(model=model, input=input_payload)
            print(f"SUCCESS RECEIVED request_id={request_id} attempt={attempt + 1}")
            logger.info("OpenAI API call success: request_id=%s trigger=%s attempt=%s", request_id, trigger_source, attempt + 1)
            return response
        except RateLimitError as exc:
            error_code = _extract_openai_error_code(exc)
            logger.warning(
                "OpenAI API call failed: request_id=%s trigger=%s attempt=%s error_type=%s error=%s",
                request_id,
                trigger_source,
                attempt + 1,
                type(exc).__name__,
                str(exc),
            )
            if _is_insufficient_quota_error(exc):
                logger.error(
                    "Non-retryable OpenAI quota error: request_id=%s trigger=%s attempt=%s error_code=%s",
                    request_id,
                    trigger_source,
                    attempt + 1,
                    error_code or "-",
                )
                raise
            if attempt == OPENAI_RETRY_ATTEMPTS - 1:
                raise
            delay = OPENAI_RETRY_BASE_SECONDS * (2**attempt) + random.uniform(0.0, 0.35)
            time.sleep(delay)
        except (APIConnectionError, APITimeoutError) as exc:
            logger.warning(
                "OpenAI API transient connection failure: request_id=%s trigger=%s attempt=%s error_type=%s error=%s",
                request_id,
                trigger_source,
                attempt + 1,
                type(exc).__name__,
                str(exc),
            )
            if attempt == OPENAI_RETRY_ATTEMPTS - 1:
                raise
            delay = OPENAI_RETRY_BASE_SECONDS * (2**attempt) + random.uniform(0.0, 0.35)
            time.sleep(delay)
        except APIError as exc:
            logger.warning(
                "OpenAI API status failure: request_id=%s trigger=%s attempt=%s status_code=%s error=%s",
                request_id,
                trigger_source,
                attempt + 1,
                getattr(exc, "status_code", None),
                str(exc),
            )
            if not _is_retryable_api_status_error(exc):
                raise
            if attempt == OPENAI_RETRY_ATTEMPTS - 1:
                raise
            delay = OPENAI_RETRY_BASE_SECONDS * (2**attempt) + random.uniform(0.0, 0.35)
            time.sleep(delay)


@dataclass(slots=True)
class CalorieSection:
    heading: str
    content: str


@dataclass(slots=True)
class CalorieContext:
    age: float
    bmi: float
    daily_target: int
    note: str
    activity_level: str
    bmr: int | None


@dataclass(slots=True)
class CalorieCalculationResult:
    analysis_text: str
    sections: list[CalorieSection]
    calorie_context: CalorieContext
    total_estimated_calories: int | None


@dataclass(slots=True)
class CalorieTrackerEntry:
    id: str
    entry_date: str
    calories: int
    meal_name: str
    created_at: str


@dataclass(slots=True)
class CalorieDailyTotal:
    entry_date: str
    total_calories: int
    entry_count: int


@dataclass(slots=True)
class CalorieTrackerWeek:
    week_start: str
    week_end: str
    days: list[CalorieDailyTotal]
    entries: list[CalorieTrackerEntry]


def _parse_float(value: str | None, label: str, minimum: float | None = None, maximum: float | None = None) -> float | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    try:
        parsed = float(trimmed)
    except ValueError as exc:
        raise ValueError(f"Please enter a valid {label}.") from exc
    if minimum is not None and parsed < minimum:
        raise ValueError(f"{label.capitalize()} must be at least {minimum}.")
    if maximum is not None and parsed > maximum:
        raise ValueError(f"{label.capitalize()} must be at most {maximum}.")
    return parsed


def _normalize_activity_level(value: str | None) -> str:
    candidate = (value or DEFAULT_ACTIVITY_LEVEL).strip().lower().replace(" ", "_")
    if candidate not in ACTIVITY_MULTIPLIER:
        return DEFAULT_ACTIVITY_LEVEL
    return candidate


def _normalize_sex(value: str | None) -> str | None:
    if value is None:
        return None
    candidate = value.strip().lower()
    if candidate in {"male", "m"}:
        return "male"
    if candidate in {"female", "f"}:
        return "female"
    return None


def _build_cache_key(
    image_bytes: bytes,
    age: float,
    bmi: float,
    activity_level: str,
    sex: str | None,
    weight_kg: float | None,
    height_cm: float | None,
    medical_history: str | None,
) -> str:
    digest = hashlib.sha256(image_bytes).hexdigest()
    return (
        f"{digest}|{age:.2f}|{bmi:.2f}|{activity_level}|{sex or ''}|{weight_kg or ''}|{height_cm or ''}|"
        f"{(medical_history or '').strip().lower()}"
    )


def _estimate_daily_target_from_bmi(age: float, bmi: float) -> tuple[str, int]:
    if bmi < 18.5:
        target = 2400
        note = "Underweight BMI range: target leans toward a gentle calorie surplus."
    elif bmi < 25:
        target = 2000
        note = "Healthy BMI range: target is set near maintenance calories."
    elif bmi < 30:
        target = 1750
        note = "Overweight BMI range: target uses a modest calorie deficit."
    else:
        target = 1550
        note = "Obesity BMI range: target uses a stronger but practical calorie deficit."

    if age < 18:
        target += 200
    elif age >= 65:
        target -= 250
    elif age >= 50:
        target -= 150

    return note, max(1200, int(target))


def _estimate_bmr(age: float, sex: str | None, weight_kg: float | None, height_cm: float | None) -> int | None:
    if weight_kg is None or height_cm is None:
        return None
    # Mifflin-St Jeor equation
    baseline = (10 * weight_kg) + (6.25 * height_cm) - (5 * age)
    if sex == "male":
        baseline += 5
    elif sex == "female":
        baseline -= 161
    else:
        baseline -= 78  # neutral fallback
    return max(1000, int(round(baseline)))


def _build_calorie_context(
    age: float,
    bmi: float,
    activity_level: str,
    sex: str | None,
    weight_kg: float | None,
    height_cm: float | None,
) -> CalorieContext:
    bmr = _estimate_bmr(age, sex, weight_kg, height_cm)
    if bmr is not None:
        target = max(1200, int(round(bmr * ACTIVITY_MULTIPLIER[activity_level])))
        note = "Daily target is based on estimated BMR and selected activity level."
        return CalorieContext(
            age=age,
            bmi=bmi,
            daily_target=target,
            note=note,
            activity_level=activity_level,
            bmr=bmr,
        )

    note, target = _estimate_daily_target_from_bmi(age, bmi)
    return CalorieContext(
        age=age,
        bmi=bmi,
        daily_target=target,
        note=note,
        activity_level=activity_level,
        bmr=None,
    )


def _build_prompt(context: CalorieContext) -> str:
    return (
        "You are an AI food, drink, and consumables analysis assistant. "
        "Internally work in 3 lightweight passes: Food Input Processor, User Context Engine, and Insight Generator. "
        "First standardize the input into a likely meal or drink identity, core ingredients, portion estimate, and timing context. "
        "Then compare that structured meal against likely ingredient properties, nutrition signals, claims, and user profile context. "
        "Finally convert the findings into concise user-facing insights with clear confidence and practical next steps. "
        "The FIRST LINE of your response must be exactly: 'Food Name: <name>'. "
        "Use the most likely local or culturally accurate item name from the image and do not add any text before that first line. "
        "Preserve dish identity carefully for regional foods and drinks. For example, keep names like Hokkien mee, nasi lemak, laksa, teh tarik, kopi, bubble tea, or mee goreng when the image supports them. "
        "Do not relabel an Asian noodle dish as generic seafood pasta unless you are truly certain it is pasta. "
        "Look carefully at the image and identify whether it is a meal, snack, drink, packaged item, or supplement/consumable. "
        "Estimate realistic portion size, likely ingredients, calories, and major nutrition signals. "
        "Provide concise markdown with these exact H2 sections in this order: "
        "Summary, Ingredients, Body Impact, How This Affects You, Claims vs Reality, Benefits, Drawbacks, Food or Drink Quality, Smart Suggestions. "
        "In Summary, use bullet points for: Item, Portion, Context, Overall Read, Confidence, Calories, Protein, Carbs, Fat, Sugar, Caffeine, Alcohol, Sodium, Quick Tags, Extended Summary. "
        "Overall Read should be one of: Supportive, Mixed, or Watch-outs. "
        "Confidence should explain certainty briefly, especially when portion size or image clarity is weak. "
        "In Ingredients, list as many meaningful ingredients or components as you can infer, one bullet per ingredient in this format: Ingredient | Type | Why it matters. "
        "In Body Impact, use bullets for Blood Sugar Impact, Energy Effect, Fullness, and when relevant Hydration, Stimulant Effect, Alcohol Effect. "
        "In How This Affects You, use bullets for Goal fit, Condition links, Allergy links, Eating pattern fit, Diet type fit, Food rules or dislikes, Religious or cultural fit, Daily context, and Alerts. "
        "Only mention lines that are relevant. If nothing notable applies, use a bullet that says 'Profile fit: No major mismatch detected.' "
        "In Claims vs Reality, detect implied claims like healthy, low fat, sugar-free, energy-boosting, high protein, recovery drink, or fat-burning and judge each as Supported, Mixed, or Weak / misleading. "
        "In Benefits, use one bullet per benefit in this format: Benefit | Why it helps | Best for. "
        "In Drawbacks, use one bullet per drawback in this format: Drawback | Why it matters | Watch-out. "
        "In Food or Drink Quality, describe processing level, sugar density, additive load, ingredient quality, and whether it feels minimally processed or ultra-processed. "
        "In Smart Suggestions, give practical next steps or swaps. "
        "Include a final line: Total Estimated Calories.\n"
        "In that final line, write calories as digits only with NO commas or separators (for example 1000, not 1,000).\n\n"
        f"User age: {context.age:.0f}\n"
        f"User BMI: {context.bmi:.1f}\n"
        f"Activity level: {context.activity_level}\n"
        f"Estimated daily calorie target: {context.daily_target} kcal\n"
        f"Context note: {context.note}\n"
    )


def _build_medical_warning_instructions(medical_history: str | None) -> str:
    normalized = (medical_history or "").strip()
    if not normalized:
        return ""
    return (
        "User profile context and restrictions:\n"
        f"{normalized}\n\n"
        "Check whether the meal, drink, or consumable conflicts with this profile. "
        "Look for allergies, food rules, cultural or religious restrictions, diet type mismatch, sodium or sugar concerns, stimulant timing, alcohol conflicts, and pattern mismatch. "
        "If there is a meaningful risk or restriction, add a short warning in the Personalized Impact or Smart Suggestions section using a bullet that starts with 'Warning:'. "
        "If there is no meaningful concern, do not invent one.\n\n"
    )


def _parse_sections(markdown: str) -> list[CalorieSection]:
    sections: list[CalorieSection] = []
    heading_pattern = re.compile(r"^\s*##\s+(.+?)\s*$")
    current_heading: str | None = None
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_heading, current_lines
        if current_heading:
            sections.append(CalorieSection(heading=current_heading, content="\n".join(current_lines).strip()))
        current_heading = None
        current_lines = []

    for raw_line in markdown.splitlines():
        match = heading_pattern.match(raw_line)
        if match:
            flush()
            current_heading = match.group(1).strip()
            continue
        if current_heading is None:
            if raw_line.strip():
                current_heading = "Summary"
                current_lines.append(raw_line.strip())
            continue
        current_lines.append(raw_line.rstrip())

    flush()
    if sections:
        return sections
    return [CalorieSection(heading="Summary", content=markdown.strip())]


def _extract_total_estimated_calories_from_final_line(analysis_text: str) -> int | None:
    lines = [line.strip() for line in analysis_text.splitlines() if line.strip()]
    if not lines:
        return None
    final_line = lines[-1]
    if "total estimated calories" not in final_line.lower():
        return None
    match = re.search(r"(-?\d[\d,]*)", final_line)
    if not match:
        return None
    try:
        parsed = int(match.group(1).replace(",", ""))
    except ValueError:
        return None
    return max(0, parsed)


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _parse_entry_date(value: str | None) -> date:
    if not value or not value.strip():
        return datetime.now(UTC).date()
    try:
        return date.fromisoformat(value.strip())
    except ValueError as exc:
        raise ValueError("Date must be in YYYY-MM-DD format.") from exc


def _parse_week_start(value: str | None) -> date:
    anchor = _parse_entry_date(value)
    return anchor - timedelta(days=anchor.weekday())


def _parse_positive_calories(value: str | int | float) -> int:
    try:
        parsed = int(float(str(value).strip()))
    except ValueError as exc:
        raise ValueError("Calories must be a valid number.") from exc
    if parsed <= 0:
        raise ValueError("Calories must be greater than 0.")
    if parsed > 10000:
        raise ValueError("Calories must be 10000 or less.")
    return parsed


def calculate_calories(
    image_bytes: bytes,
    content_type: str,
    age: str | None,
    bmi: str | None,
    weight_kg: str | None,
    height_cm: str | None,
    activity_level: str | None,
    sex: str | None,
    medical_history: str | None = None,
) -> CalorieCalculationResult:
    if not settings.openai_api_key:
        raise RuntimeError("Calorie calculator is unavailable because OPENAI_API_KEY is not configured.")
    if not image_bytes:
        raise ValueError("The uploaded image was empty.")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError("Image is too large. Please upload an image smaller than 10MB.")
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError("Unsupported image type. Please upload PNG, JPG, JPEG, or WEBP.")

    parsed_age = _parse_float(age, "age", minimum=5, maximum=120) or DEFAULT_AGE
    parsed_bmi = _parse_float(bmi, "BMI", minimum=10, maximum=70)
    parsed_weight_kg = _parse_float(weight_kg, "weight", minimum=20, maximum=400)
    parsed_height_cm = _parse_float(height_cm, "height", minimum=90, maximum=260)
    parsed_activity_level = _normalize_activity_level(activity_level)
    parsed_sex = _normalize_sex(sex)

    if parsed_bmi is None and parsed_weight_kg is not None and parsed_height_cm is not None:
        meters = parsed_height_cm / 100.0
        parsed_bmi = parsed_weight_kg / (meters * meters)
    if parsed_bmi is None:
        parsed_bmi = DEFAULT_BMI

    context = _build_calorie_context(
        age=parsed_age,
        bmi=parsed_bmi,
        activity_level=parsed_activity_level,
        sex=parsed_sex,
        weight_kg=parsed_weight_kg,
        height_cm=parsed_height_cm,
    )

    cache_key = _build_cache_key(
        image_bytes=image_bytes,
        age=context.age,
        bmi=context.bmi,
        activity_level=context.activity_level,
        sex=parsed_sex,
        weight_kg=parsed_weight_kg,
        height_cm=parsed_height_cm,
        medical_history=medical_history,
    )
    cached = _analysis_cache.get(cache_key)
    if cached is not None:
        return cached

    optimized_bytes, optimized_content_type = optimize_image_for_openai(
        image_bytes,
        max_dimension=settings.openai_vision_max_dimension,
        jpeg_quality=settings.openai_vision_jpeg_quality,
    )

    client = OpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_api_base_url,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
    )
    request_id = str(uuid.uuid4())
    image_data = base64.b64encode(optimized_bytes).decode("utf-8")
    content_payload: list[dict[str, str]] = [{"type": "input_text", "text": _build_prompt(context)}]
    warning_instructions = _build_medical_warning_instructions(medical_history)
    if warning_instructions:
        content_payload.append({"type": "input_text", "text": warning_instructions})
    content_payload.append(
        {
            "type": "input_image",
            "image_url": f"data:{optimized_content_type};base64,{image_data}",
            "detail": settings.openai_vision_detail_normalized,
        }
    )
    try:
        response = _response_with_rate_limit_retry(
            client,
            model=CALORIE_ANALYSIS_MODEL,
            request_id=request_id,
            trigger_source="calorie_calculate",
            input_payload=[
                {
                    "role": "user",
                    "content": content_payload,
                }
            ],
        )
    except Exception as exc:
        raise RuntimeError(f"Calorie analysis provider call failed: {exc}") from exc
    analysis_text = response.output_text.strip()
    if not analysis_text:
        raise RuntimeError("The model returned an empty calorie analysis.")

    result = CalorieCalculationResult(
        analysis_text=analysis_text,
        sections=_parse_sections(analysis_text),
        calorie_context=context,
        total_estimated_calories=_extract_total_estimated_calories_from_final_line(analysis_text),
    )
    _analysis_cache[cache_key] = result
    return result


def add_calorie_entry(calories: str | int | float, meal_name: str | None = None, entry_date: str | None = None) -> CalorieTrackerEntry:
    parsed_calories = _parse_positive_calories(calories)
    parsed_date = _parse_entry_date(entry_date)
    clean_meal_name = (meal_name or "").strip()
    if len(clean_meal_name) > 120:
        raise ValueError("Meal name must be 120 characters or less.")

    entry = CalorieTrackerEntry(
        id=str(uuid4()),
        entry_date=parsed_date.isoformat(),
        calories=parsed_calories,
        meal_name=clean_meal_name,
        created_at=_utc_now_iso(),
    )
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO calorie_entries (id, entry_date, calories, meal_name, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (entry.id, entry.entry_date, entry.calories, entry.meal_name, entry.created_at),
        )
    return entry


def get_weekly_calorie_history(week_start: str | None = None) -> CalorieTrackerWeek:
    parsed_week_start = _parse_week_start(week_start)
    parsed_week_end = parsed_week_start + timedelta(days=6)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, entry_date, calories, meal_name, created_at
            FROM calorie_entries
            WHERE entry_date >= ? AND entry_date <= ?
            ORDER BY entry_date ASC, created_at ASC
            """,
            (parsed_week_start.isoformat(), parsed_week_end.isoformat()),
        ).fetchall()

    entries = [
        CalorieTrackerEntry(
            id=row["id"],
            entry_date=row["entry_date"],
            calories=int(row["calories"]),
            meal_name=row["meal_name"] or "",
            created_at=row["created_at"],
        )
        for row in rows
    ]

    totals_map: dict[str, CalorieDailyTotal] = {}
    for offset in range(7):
        day = (parsed_week_start + timedelta(days=offset)).isoformat()
        totals_map[day] = CalorieDailyTotal(entry_date=day, total_calories=0, entry_count=0)

    for entry in entries:
        day_total = totals_map.get(entry.entry_date)
        if day_total is None:
            continue
        day_total.total_calories += entry.calories
        day_total.entry_count += 1

    return CalorieTrackerWeek(
        week_start=parsed_week_start.isoformat(),
        week_end=parsed_week_end.isoformat(),
        days=[totals_map[(parsed_week_start + timedelta(days=i)).isoformat()] for i in range(7)],
        entries=entries,
    )


def update_calorie_entry(entry_id: str, calories: str | int | float, meal_name: str | None = None) -> CalorieTrackerEntry:
    parsed_calories = _parse_positive_calories(calories)
    clean_meal_name = (meal_name or "").strip()
    if len(clean_meal_name) > 120:
        raise ValueError("Meal name must be 120 characters or less.")

    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, entry_date, calories, meal_name, created_at
            FROM calorie_entries
            WHERE id = ?
            """,
            (entry_id,),
        ).fetchone()
        if row is None:
            raise KeyError("Calorie entry not found.")

        connection.execute(
            """
            UPDATE calorie_entries
            SET calories = ?, meal_name = ?
            WHERE id = ?
            """,
            (parsed_calories, clean_meal_name, entry_id),
        )

        updated = connection.execute(
            """
            SELECT id, entry_date, calories, meal_name, created_at
            FROM calorie_entries
            WHERE id = ?
            """,
            (entry_id,),
        ).fetchone()

    if updated is None:
        raise KeyError("Calorie entry not found.")
    return CalorieTrackerEntry(
        id=updated["id"],
        entry_date=updated["entry_date"],
        calories=int(updated["calories"]),
        meal_name=updated["meal_name"] or "",
        created_at=updated["created_at"],
    )


def delete_calorie_entry(entry_id: str) -> str:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT entry_date FROM calorie_entries WHERE id = ?",
            (entry_id,),
        ).fetchone()
        if row is None:
            raise KeyError("Calorie entry not found.")
        entry_date = row["entry_date"]
        connection.execute("DELETE FROM calorie_entries WHERE id = ?", (entry_id,))
    return entry_date


def delete_calorie_entries_for_day(entry_date: str) -> int:
    parsed_date = _parse_entry_date(entry_date).isoformat()
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM calorie_entries WHERE entry_date = ?",
            (parsed_date,),
        )
    return int(cursor.rowcount or 0)
