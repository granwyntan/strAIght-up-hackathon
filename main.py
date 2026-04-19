import base64
import html
import imghdr
import os
import re
import uuid
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from openai import OpenAI
from werkzeug.utils import secure_filename

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional convenience dependency
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATE_DIR = BASE_DIR / "templates"
UPLOAD_DIR = STATIC_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=str(TEMPLATE_DIR))
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
DEFAULT_AGE = "25"
DEFAULT_BMI = "22.0"


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def parse_positive_number(value: str, field_name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Please enter a valid {field_name}.") from exc

    if number <= 0:
        raise ValueError(f"{field_name.capitalize()} must be greater than 0.")
    return number


def estimate_daily_calories(age: float, bmi: float) -> tuple[str, int]:
    if bmi < 18.5:
        target = 2400
        note = "You are in the underweight BMI range, so the estimate leans toward a gentle calorie surplus."
    elif bmi < 25:
        target = 2000
        note = "You are in the healthy BMI range, so the estimate aims at maintenance calories."
    elif bmi < 30:
        target = 1750
        note = "You are in the overweight BMI range, so the estimate uses a modest calorie deficit."
    else:
        target = 1550
        note = "You are in the obesity BMI range, so the estimate uses a stronger but still practical calorie deficit."

    if age < 18:
        target += 200
    elif age >= 50:
        target -= 150
    elif age >= 65:
        target -= 250

    return note, max(1200, int(target))


def build_calorie_prompt(age: float, bmi: float, daily_target: int) -> str:
    return (
        "You are a nutrition assistant and calorie estimator. "
        "Look carefully at the food image and identify the main dish and each visible ingredient or food item. "
        "Estimate the mass of each item in grams as realistically as possible from the image. "
        "Then estimate the calories for each identified item. "
        f"The user is {int(age) if age.is_integer() else age} years old with a BMI of {bmi:.1f}. "
        f"The estimated daily calorie target for this user is about {daily_target} kcal. "
        "Format the answer neatly with these sections and headings: "
        "1. Meal Summary "
        "2. Itemized Breakdown "
        "3. Daily Intake Context "
        "Under Itemized Breakdown, list each food item with its estimated mass and estimated calories. "
        "At the very bottom, include a final line labeled Total Estimated Calories. "
        "Keep the estimates practical, concise, and easy to read."
    )


async def save_uploaded_file(file_storage: UploadFile) -> str:
    filename = secure_filename(file_storage.filename or "")
    if not filename or not allowed_file(filename):
        raise ValueError("Please upload a PNG, JPG, JPEG, or WEBP image.")

    extension = filename.rsplit(".", 1)[1].lower()
    stored_name = f"{uuid.uuid4().hex}.{extension}"
    destination = UPLOAD_DIR / stored_name
    destination.write_bytes(await file_storage.read())
    return stored_name


def save_webcam_capture(data_url: str) -> str:
    if not data_url or "," not in data_url:
        raise ValueError("The webcam image was empty. Please take the photo again.")

    _, encoded = data_url.split(",", 1)

    try:
        image_bytes = base64.b64decode(encoded)
    except Exception as exc:
        raise ValueError("The webcam image data could not be read.") from exc

    extension = imghdr.what(None, h=image_bytes) or "png"
    if extension == "jpeg":
        extension = "jpg"
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError("Unsupported webcam image format.")

    stored_name = f"{uuid.uuid4().hex}.{extension}"
    destination = UPLOAD_DIR / stored_name
    destination.write_bytes(image_bytes)
    return stored_name


def analyze_food(image_filename: str, age: float, bmi: float, daily_target: int) -> str:
    image_path = UPLOAD_DIR / image_filename
    image_bytes = image_path.read_bytes()
    mime_type = f"image/{image_filename.rsplit('.', 1)[1].lower()}".replace("jpg", "jpeg")
    image_data = base64.b64encode(image_bytes).decode("utf-8")

    response = client.responses.create(
        model="gpt-5.4-mini",
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": build_calorie_prompt(age, bmi, daily_target)},
                    {
                        "type": "input_image",
                        "image_url": f"data:{mime_type};base64,{image_data}",
                    },
                ],
            }
        ],
    )

    return response.output_text.strip()


def apply_inline_formatting(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"<em>\1</em>", text)
    return text


def render_analysis_html(raw_text: str) -> str:
    escaped = html.escape(raw_text.strip())
    lines = escaped.splitlines()
    parts = []
    list_buffer = []

    def flush_list() -> None:
        nonlocal list_buffer
        if list_buffer:
            items = "".join(f"<li>{apply_inline_formatting(item)}</li>" for item in list_buffer)
            parts.append(f"<ul>{items}</ul>")
            list_buffer = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            flush_list()
            continue

        if stripped.startswith("### "):
            flush_list()
            parts.append(f"<h4>{apply_inline_formatting(stripped[4:].strip())}</h4>")
            continue
        if stripped.startswith("## "):
            flush_list()
            parts.append(f"<h3>{apply_inline_formatting(stripped[3:].strip())}</h3>")
            continue
        if stripped.startswith("# "):
            flush_list()
            parts.append(f"<h2>{apply_inline_formatting(stripped[2:].strip())}</h2>")
            continue
        if stripped.startswith(("- ", "* ")):
            list_buffer.append(stripped[2:].strip())
            continue

        numbered_match = re.match(r"^\d+\.\s+(.*)$", stripped)
        if numbered_match:
            list_buffer.append(numbered_match.group(1).strip())
            continue

        flush_list()
        parts.append(f"<p>{apply_inline_formatting(stripped)}</p>")

    flush_list()
    return "\n".join(parts)


def build_index_context(request: Request) -> dict[str, object]:
    return {
        "request": request,
        "response_html": None,
        "error": None,
        "image_path": None,
        "calorie_context": None,
        "form_values": {
            "age": DEFAULT_AGE,
            "bmi": DEFAULT_BMI,
        },
    }


def ensure_api_key() -> None:
    if client.api_key is None:
        raise RuntimeError("Set OPENAI_API_KEY or OPEN_AI_KEY before using the calorie calculator.")


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    context = build_index_context(request)
    return templates.TemplateResponse(request, "index.html", context)


@app.post("/", response_class=HTMLResponse)
async def analyze_index(
    request: Request,
    age: str = Form(DEFAULT_AGE),
    bmi: str = Form(DEFAULT_BMI),
    webcam_image: str = Form(""),
    photo: UploadFile | None = File(default=None),
):
    context = build_index_context(request)
    context["form_values"] = {
        "age": age.strip(),
        "bmi": bmi.strip(),
    }

    try:
        parsed_age = parse_positive_number(context["form_values"]["age"], "age")
        parsed_bmi = parse_positive_number(context["form_values"]["bmi"], "BMI")

        if webcam_image.strip():
            image_filename = save_webcam_capture(webcam_image.strip())
        elif photo and photo.filename:
            image_filename = await save_uploaded_file(photo)
        else:
            raise ValueError("Please upload an image or take one with the webcam.")

        context["image_path"] = f"uploads/{image_filename}"
        ensure_api_key()

        calorie_note, daily_target = estimate_daily_calories(parsed_age, parsed_bmi)
        response_text = analyze_food(
            image_filename=image_filename,
            age=parsed_age,
            bmi=parsed_bmi,
            daily_target=daily_target,
        )
        context["response_html"] = render_analysis_html(response_text)
        context["calorie_context"] = {
            "age": int(parsed_age) if parsed_age.is_integer() else parsed_age,
            "bmi": f"{parsed_bmi:.1f}",
            "daily_target": daily_target,
            "note": calorie_note,
        }
    except Exception as exc:
        context["error"] = str(exc)

    return templates.TemplateResponse(request, "index.html", context)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
