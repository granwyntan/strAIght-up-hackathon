import base64
import imghdr
import html
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
INFOGRAPHIC_DIR = BASE_DIR / "static" / "infographics"
UPLOAD_DIR.mkdir(exist_ok=True)
INFOGRAPHIC_DIR.mkdir(exist_ok=True)

app = Flask(__name__, static_folder="static", template_folder="templates")
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

DEFAULT_CONDITIONS = "NIL"
DEFAULT_GOALS = "Reduce belly fat, Improve cognitive power"


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def build_analysis_prompt(conditions: str, goals: str) -> str:
    normalized_conditions = conditions.strip() or "No prior illness or long term conditions."
    normalized_goals = goals.strip() or "General health support"
    return (
        "You are a pharmacist, deciding if this patient should consume this supplement. "
        "Break the answer into 4 important sections with clear headings. "
        "First, identify the supplement in the image, including the brand and primary ingredients. "
        "Second, explain the benefits of consuming this supplement and what the key ingredients do in the body. "
        "Third, list potential negative side effects, contraindications, and safety concerns. "
        "Fourth, analyze the patient's medical history and goals. "
        f"The patient's goals are: {normalized_goals}. "
        f"The patient's medical history is: {normalized_conditions}. "
        "Explain what food or supplements the patient should avoid based on each condition. "
        "Evaluate whether this supplement is suitable, whether it supports the patient's goals meaningfully, "
        "and give a practical recommendation. If unsuitable, suggest safer alternatives."
    )


def build_infographic_prompt(analysis_text: str, conditions: str, goals: str) -> str:
    normalized_conditions = conditions.strip() or "No prior illness or long term conditions."
    normalized_goals = goals.strip() or "General health support"
    return (
        "Create a polished pastel medical infographic in landscape orientation. "
        "Use a soft cream background with gentle peach, mint, and lavender accents. "
        "The design should feel clean, modern, friendly, and easy to read. "
        "Summarize the supplement analysis into clear visual sections: supplement identity, key benefits, key side effects, "
        "and recommendation for this patient. Use short phrases, icons, soft panels, and neat hierarchy. "
        "Do not crowd the layout and do not include tiny unreadable text. "
        f"The patient's medical history is: {normalized_conditions}. "
        f"The patient's goals are: {normalized_goals}. "
        f"Use this analysis as the content source: {analysis_text}"
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


def analyze_supplement(image_filename: str, conditions: str, goals: str) -> str:
    image_path = UPLOAD_DIR / image_filename
    image_bytes = image_path.read_bytes()
    mime_type = f"image/{image_filename.rsplit('.', 1)[1].lower()}".replace("jpg", "jpeg")
    image_data = base64.b64encode(image_bytes).decode("utf-8")

    response = client.responses.create(
        model="gpt-4.1-mini",
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": build_analysis_prompt(conditions, goals)},
                    {
                        "type": "input_image",
                        "image_url": f"data:{mime_type};base64,{image_data}",
                    },
                ],
            }
        ],
    )

    return response.output_text.strip()


def generate_infographic(analysis_text: str, conditions: str, goals: str) -> str:
    result = client.images.generate(
        model="gpt-image-1",
        prompt=build_infographic_prompt(analysis_text, conditions, goals),
        size="1024x1024",
    )

    image_base64 = result.data[0].b64_json
    image_bytes = base64.b64decode(image_base64)
    stored_name = f"{uuid.uuid4().hex}.png"
    destination = INFOGRAPHIC_DIR / stored_name
    destination.write_bytes(image_bytes)
    return f"infographics/{stored_name}"


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
    response_text = None
    response_html = None
    error_message = None
    image_path = None
    infographic_path = None
    form_values = {
        "conditions": DEFAULT_CONDITIONS,
        "goals": DEFAULT_GOALS,
    }

    if request.method == "POST":
        form_values["conditions"] = request.form.get("conditions", DEFAULT_CONDITIONS)
        form_values["goals"] = request.form.get("goals", DEFAULT_GOALS)
        webcam_image = request.form.get("webcam_image", "").strip()
        uploaded_file = request.files.get("photo")

        try:
            if webcam_image:
                image_filename = save_webcam_capture(webcam_image)
            elif uploaded_file and uploaded_file.filename:
                image_filename = save_uploaded_file(uploaded_file)
            else:
                raise ValueError("Please upload an image or take one with the webcam.")

            image_path = f"uploads/{image_filename}"

            if client.api_key is None:
                raise RuntimeError("Set OPENAI_API_KEY or OPEN_AI_KEY before using the scanner.")

            response_text = analyze_supplement(
                image_filename=image_filename,
                conditions=form_values["conditions"],
                goals=form_values["goals"],
            )
            response_html = render_analysis_html(response_text)
            infographic_path = generate_infographic(
                analysis_text=response_text,
                conditions=form_values["conditions"],
                goals=form_values["goals"],
            )
        except Exception as exc:
            error_message = str(exc)

    return render_template(
        "index.html",
        response=response_text,
        response_html=response_html,
        error=error_message,
        image_path=image_path,
        infographic_path=infographic_path,
        form_values=form_values,
    )


if __name__ == "__main__":
    app.run(debug=True)
