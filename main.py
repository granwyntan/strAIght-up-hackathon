from flask import Flask, request, render_template
from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()
app = Flask(__name__)
client = OpenAI(api_key=os.getenv("OPEN_AI_KEY"))

# Gets prompt
with open("prompt.txt", "r") as file:
    prompt = file.readline()

# TODO: prompt user for underlying conditions and store it
# underlying conditions for now
underlying_conditions = ["High blood pressure", "Type 2 Diabetes", "Joint Pain"]

@app.route("/", methods=["GET", "POST"])
def main():
    """Processes a chat message, prompts chatGPT, and returns the result"""
    # GET
    if request.method == "GET":
        return render_template("index.html")
    
    # POST
    # gets the message
    msg = request.form.get("msg")
    
    response = client.responses.create(
        model="gpt-4.1-mini",
        input = [{"role": "user", "content": [{"type": "input_text", "text" :prompt.format(", ".join(underlying_conditions),msg)}]}]
    )

    return render_template("index.html", response=response.output_text)

if __name__ == "__main__":
    app.run()