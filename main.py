import base64
import hashlib
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
from pydantic import BaseModel
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
INFOGRAPHIC_DIR = STATIC_DIR / "infographics"
PROMPT_PATH = BASE_DIR / "prompt.txt"
IMAGE_PROMPT_PATH = BASE_DIR / "image_prompt.txt"

UPLOAD_DIR.mkdir(exist_ok=True)
INFOGRAPHIC_DIR.mkdir(exist_ok=True)

API_KEY = os.environ.get("OPENAI_API_KEY") or os.environ.get("OPEN_AI_KEY")

app = FastAPI()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=str(TEMPLATE_DIR))
client = OpenAI(api_key=API_KEY)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

DEFAULT_CONDITIONS = "NIL"
DEFAULT_GOALS = "Reduce belly fat, Improve cognitive power"
CHAT_UNDERLYING_CONDITIONS = ["High blood pressure", "Type 2 Diabetes", "Joint Pain"]

TEXT_PROMPT = " ".join(line.strip() for line in PROMPT_PATH.read_text().splitlines())
IMAGE_PROMPT = " ".join(line.strip() for line in IMAGE_PROMPT_PATH.read_text().splitlines())

analysis_cache: dict[str, str] = {}
infographic_cache: dict[str, str] = {}
chat_cache: dict[str, str] = {}
scan_cache: dict[str, str] = {}


class Message(BaseModel):
    msg: str


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


async def save_uploaded_file(uploaded_file: UploadFile) -> str:
    filename = secure_filename(uploaded_file.filename or "")
    if not filename or not allowed_file(filename):
        raise ValueError("Please upload a PNG, JPG, JPEG, or WEBP image.")

    extension = filename.rsplit(".", 1)[1].lower()
    stored_name = f"{uuid.uuid4().hex}.{extension}"
    destination = UPLOAD_DIR / stored_name
    destination.write_bytes(await uploaded_file.read())
    return stored_name


async def read_uploaded_file(uploaded_file: UploadFile) -> tuple[bytes, str]:
    filename = secure_filename(uploaded_file.filename or "")
    if not filename or not allowed_file(filename):
        raise ValueError("Please upload a PNG, JPG, JPEG, or WEBP image.")

    image_bytes = await uploaded_file.read()
    if not image_bytes:
        raise ValueError("The uploaded image was empty. Please choose another file.")

    extension = filename.rsplit(".", 1)[1].lower()
    return image_bytes, extension


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


def decode_webcam_capture(data_url: str) -> tuple[bytes, str]:
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

    return image_bytes, extension


def store_image_bytes(image_bytes: bytes, extension: str) -> str:
    stored_name = f"{uuid.uuid4().hex}.{extension}"
    destination = UPLOAD_DIR / stored_name
    destination.write_bytes(image_bytes)
    return stored_name


def build_analysis_cache_key(image_bytes: bytes, conditions: str, goals: str) -> str:
    digest = hashlib.sha256(image_bytes).hexdigest()
    return f"{digest}|{conditions.strip()}|{goals.strip()}"


def build_infographic_cache_key(analysis_text: str, conditions: str, goals: str) -> str:
    payload = f"{analysis_text}|{conditions.strip()}|{goals.strip()}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def analyze_supplement(image_bytes: bytes, extension: str, conditions: str, goals: str) -> str:
    mime_type = f"image/{extension.lower()}".replace("jpg", "jpeg")
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


def build_index_context() -> dict[str, object]:
    return {
        "response": None,
        "response_html": None,
        "error": None,
        "image_path": None,
        "infographic_path": None,
        "form_values": {
            "conditions": DEFAULT_CONDITIONS,
            "goals": DEFAULT_GOALS,
        },
    }


def ensure_api_key() -> None:
    if API_KEY is None:
        raise RuntimeError("Set OPENAI_API_KEY or OPEN_AI_KEY before using the scanner.")


def get_cached_analysis(image_bytes: bytes, extension: str, conditions: str, goals: str) -> str:
    cache_key = build_analysis_cache_key(image_bytes, conditions, goals)
    cached_response = analysis_cache.get(cache_key)
    if cached_response is not None:
        return cached_response

    response_text = analyze_supplement(
        image_bytes=image_bytes,
        extension=extension,
        conditions=conditions,
        goals=goals,
    )
    analysis_cache[cache_key] = response_text
    return response_text


def get_cached_infographic(analysis_text: str, conditions: str, goals: str) -> str:
    cache_key = build_infographic_cache_key(analysis_text, conditions, goals)
    cached_path = infographic_cache.get(cache_key)
    if cached_path is not None:
        return cached_path

    infographic_path = generate_infographic(analysis_text, conditions, goals)
    infographic_cache[cache_key] = infographic_path
    return infographic_path


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    context = build_index_context()
    context["request"] = request
    return templates.TemplateResponse(request, "index.html", context)


@app.post("/", response_class=HTMLResponse)
async def analyze_index(
    request: Request,
    conditions: str = Form(DEFAULT_CONDITIONS),
    goals: str = Form(DEFAULT_GOALS),
    webcam_image: str = Form(""),
    photo: UploadFile | None = File(default=None),
):
    context = build_index_context()
    context["request"] = request
    context["form_values"] = {
        "conditions": conditions,
        "goals": goals,
    }

    try:
        ensure_api_key()

        if webcam_image.strip():
            image_bytes, extension = decode_webcam_capture(webcam_image.strip())
        elif photo and photo.filename:
            image_bytes, extension = await read_uploaded_file(photo)
        else:
            raise ValueError("Please upload an image or take one with the webcam.")

        image_filename = store_image_bytes(image_bytes, extension)
        context["image_path"] = f"uploads/{image_filename}"
        response_text = get_cached_analysis(
            image_bytes=image_bytes,
            extension=extension,
            conditions=conditions,
            goals=goals,
        )
        context["response"] = response_text
        context["response_html"] = render_analysis_html(response_text)
        context["infographic_path"] = get_cached_infographic(
            analysis_text=response_text,
            conditions=conditions,
            goals=goals,
        )
    except Exception as exc:
        context["error"] = str(exc)

    return templates.TemplateResponse(request, "index.html", context)


@app.post("/chat")
def chat(message: Message):
    ensure_api_key()
    cache_key = message.msg.strip()
    cached_response = chat_cache.get(cache_key)
    if cached_response is not None:
        return {"response": cached_response}

    response = client.responses.create(
        model="gpt-4.1-mini",
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": TEXT_PROMPT.format(", ".join(CHAT_UNDERLYING_CONDITIONS), message.msg),
                    }
                ],
            }
        ],
    )
    chat_cache[cache_key] = response.output_text
    return {"response": response.output_text}


@app.post("/scan_meds")
def scan_meds(image: Message):
    ensure_api_key()
    cache_key = image.msg.strip()
    cached_response = scan_cache.get(cache_key)
    if cached_response is not None:
        return {"response": cached_response}

    response = client.responses.create(
        model="gpt-4.1-mini",
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": IMAGE_PROMPT.format(", ".join(CHAT_UNDERLYING_CONDITIONS)),
                    },
                    {
                        "type": "input_image",
                        "image_url": f"data:image/png;base64,{image.msg}",
                    },
                ],
            }
        ],
    )
    scan_cache[cache_key] = response.output_text
    return {"response": response.output_text}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
