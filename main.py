import base64
import html
import imghdr
import os
import re
import uuid
from pathlib import Path

from flask import Flask, render_template, request
from openai import OpenAI
from werkzeug.utils import secure_filename

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional convenience dependency
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = Flask(__name__, static_folder="static", template_folder="templates")
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


def save_uploaded_file(file_storage) -> str:
    filename = secure_filename(file_storage.filename or "")
    if not filename or not allowed_file(filename):
        raise ValueError("Please upload a PNG, JPG, JPEG, or WEBP image.")

    extension = filename.rsplit(".", 1)[1].lower()
    stored_name = f"{uuid.uuid4().hex}.{extension}"
    destination = UPLOAD_DIR / stored_name
    file_storage.save(destination)
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


@app.route("/", methods=["GET", "POST"])
def index():
    response_html = None
    error_message = None
    image_path = None
    calorie_context = None
    form_values = {
        "age": DEFAULT_AGE,
        "bmi": DEFAULT_BMI,
    }

    if request.method == "POST":
        form_values["age"] = request.form.get("age", DEFAULT_AGE).strip()
        form_values["bmi"] = request.form.get("bmi", DEFAULT_BMI).strip()
        webcam_image = request.form.get("webcam_image", "").strip()
        uploaded_file = request.files.get("photo")

        try:
            age = parse_positive_number(form_values["age"], "age")
            bmi = parse_positive_number(form_values["bmi"], "BMI")

            if webcam_image:
                image_filename = save_webcam_capture(webcam_image)
            elif uploaded_file and uploaded_file.filename:
                image_filename = save_uploaded_file(uploaded_file)
            else:
                raise ValueError("Please upload an image or take one with the webcam.")

            image_path = f"uploads/{image_filename}"

            if client.api_key is None:
                raise RuntimeError("Set OPENAI_API_KEY or OPEN_AI_KEY before using the calorie calculator.")

            calorie_note, daily_target = estimate_daily_calories(age, bmi)
            response_text = analyze_food(
                image_filename=image_filename,
                age=age,
                bmi=bmi,
                daily_target=daily_target,
            )
            response_html = render_analysis_html(response_text)
            calorie_context = {
                "age": int(age) if age.is_integer() else age,
                "bmi": f"{bmi:.1f}",
                "daily_target": daily_target,
                "note": calorie_note,
            }
        except Exception as exc:
            error_message = str(exc)

    return render_template(
        "index.html",
        response_html=response_html,
        error=error_message,
        image_path=image_path,
        calorie_context=calorie_context,
        form_values=form_values,
    )


if __name__ == "__main__":
    app.run(debug=True)
