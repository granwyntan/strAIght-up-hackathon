from __future__ import annotations

import base64
import hashlib
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

from openai import OpenAI

from ..database import get_connection
from ..settings import settings


ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
DEFAULT_AGE = 25.0
DEFAULT_BMI = 22.0
DEFAULT_ACTIVITY_LEVEL = "moderate"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
CALORIE_ANALYSIS_MODEL = "gpt-4.1-mini"
ACTIVITY_MULTIPLIER = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

_analysis_cache: dict[str, "CalorieCalculationResult"] = {}


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
) -> str:
    digest = hashlib.sha256(image_bytes).hexdigest()
    return f"{digest}|{age:.2f}|{bmi:.2f}|{activity_level}|{sex or ''}|{weight_kg or ''}|{height_cm or ''}"


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
        "You are a nutrition assistant and calorie estimator. "
        "Look carefully at the food image and identify the main dish and visible ingredients. "
        "Estimate realistic mass in grams for each item, then estimate calories per item. "
        "Provide concise markdown with these H2 sections: "
        "Meal Summary, Itemized Breakdown, Daily Intake Context, Recommendation. "
        "In Itemized Breakdown, use bullet points with item, grams, and calories. "
        "Include a final line: Total Estimated Calories.\n\n"
        f"User age: {context.age:.0f}\n"
        f"User BMI: {context.bmi:.1f}\n"
        f"Activity level: {context.activity_level}\n"
        f"Estimated daily calorie target: {context.daily_target} kcal\n"
        f"Context note: {context.note}\n"
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
    )
    cached = _analysis_cache.get(cache_key)
    if cached is not None:
        return cached

    client = OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_api_base_url)
    image_data = base64.b64encode(image_bytes).decode("utf-8")
    try:
        response = client.responses.create(
            model=CALORIE_ANALYSIS_MODEL,
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": _build_prompt(context)},
                        {"type": "input_image", "image_url": f"data:{content_type};base64,{image_data}"},
                    ],
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
