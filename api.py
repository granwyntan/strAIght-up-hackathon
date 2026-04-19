from fastapi import FastAPI, HTTPException
from openai import OpenAI
from dotenv import load_dotenv
from pydantic import BaseModel
import os, uvicorn

load_dotenv()
app = FastAPI()
client = OpenAI(api_key=os.getenv("OPEN_AI_KEY"))

# Gets prompt
with open("prompt.txt", "r") as file:
    text_prompt = file.readline()

with open("image_prompt.txt", "r") as file:
    image_prompt = file.readline()

class Message(BaseModel):
    msg: str

# TODO: prompt user for underlying conditions and store it

# underlying conditions for now
underlying_conditions = ["High blood pressure", "Type 2 Diabetes", "Joint Pain"]

@app.post("/chat")
def chat(message:Message):
    """Processes a chat message, prompts chatGPT, and returns the result"""
    # prompts ai
    response = client.responses.create(
        model="gpt-4.1-mini",
        input = [{"role": "user", "content": [{"type": "input_text", "text" :text_prompt.format(", ".join(underlying_conditions),message.msg)}]}]
    )
    return {"response" : response.output_text}

# TODO: take base64 string of image, and prompt chatgpt with it
@app.post("/scan_meds")
def scan_meds(image:Message):
    """Receives a Base64 encoded image, prompts chatGPT, and returns the result"""
    response = client.responses.create(
        model="gpt-4.1-mini",
        input = [{"role": "user", "content": [{"type": "input_text", "text" :image_prompt.format(", ".join(underlying_conditions))},{"type": "input_image", "image_url": f"data:image/png;base64,{image.msg}"}]}]
    )
    return {"response" : response.output_text}

if __name__ == "__main__":
    uvicorn.run(app)