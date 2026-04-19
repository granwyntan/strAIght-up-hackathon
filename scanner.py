from openai import OpenAI
import cv2 as cv
import base64
import tkinter as tk
from PIL import Image, ImageTk

api_key_joe = ""

root = tk.Tk()
root.title("Conclusion")
root.geometry("450x600")


underlying_conditions = ["ADHD"]
problems = ""
if len(underlying_conditions) == 0:
    problems = "No prior illness or long term conditions."
if len(underlying_conditions) == 1:
    problems = underlying_conditions[0]
elif len(underlying_conditions) == 2:
    problems = f"{underlying_conditions[0]} and {underlying_conditions[1]}"
else: 
    for i in range(0, len(underlying_conditions)):
        if i == (len(underlying_conditions)-1):
            problems += " and "
            problems += underlying_conditions[i]
        else:
            problems += underlying_conditions[i]
            if i != (len(underlying_conditions)-2):
                problems += ", "

goals_arr = ["Reduce belly fat", "Improve cognitive power"]
goals = ""
if len(goals_arr) == 0:
    goals = "No prior illness or long term conditions."
if len(goals_arr) == 1:
    goals = goals_arr[0]
elif len(goals_arr) == 2:
    goals = f"{goals_arr[0]} and {goals_arr[1]}"
else: 
    for i in range(0, len(goals_arr)):
        if i == (len(goals_arr)-1):
            goals += " and "
            goals += goals_arr[i]
        else:
            goals += goals_arr[i]
            if i != (len(goals_arr)-2):
                goals += ", "
            

print("Taking Image Now")
stream = cv.VideoCapture(0)
if not stream.isOpened():
    print("No stream")
    exit()

while(True):
    ret, frame = stream.read()
    if not ret:
        print("Stream ended")
        break

    #frame = cv.resize(frame, (width, height))
    #output.write(frame)
    cv.imshow("Camera", frame)
    k = cv.waitKey(1)

    
    # if k%256 == 27:
    #     # ESC pressed
    #     print("Escape hit, closing...")
    #     break
    # elif k%256 == 32:
    #     img_name = "photo_{}.png".format(img_counter)
    #     cv.imwrite(img_name, frame)
    #     print("{} written!".format(img_name))
    #     img_counter += 1
    

    if k%256 == 32:
        img_name = "assets/photo.png"
        cv.imwrite(img_name, frame)
        print("{} written!".format(img_name))
        break

stream.release()
cv.destroyAllWindows()

client = OpenAI(api_key=api_key_joe)

def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")

image_path = "assets/photo.png"

base64_image = encode_image(image_path)

response = client.responses.create(
    model="gpt-4.1-mini",
    input=[
        {
            "role": "user",
            "content": [
                { "type": "input_text", "text": f"You are a pharmacist, deciding if this patient should consume this supplement. I want you to break up this conversation into 4 important sections. Firstly, identify the supplement in the image. Find out the brand of the supplement, what are the primary ingredients inside the supplement. Secondly, list out the benefits of consuming this supplement. Search from credible sources like research papers, medical blogs & reviews. List out what the key ingredients inside the supplement do to help the body after consumption of this supplement. Write down what vitamins, nutrients and how these help the supplement achieve the goal of helping the body. Note down the sources of these benefits. Thirdly, list out the potential negative side effects that will occur during consumption of this supplement. Look for reliable and credible sources like research papers and medical reviews. Fourth, analyse the patient's medical history and his objectives with the supplement. The patient wants to achieve a few goals with the supplement. They are {goals}. The patient's medical history is {problems}. Explain clearly what type of food & supplements this patient should avoid based on each of its illnesses. Evaluate if this supplement is suitable for his consumption and if it would lead to meaningful growth in the long run. If this supplement is not suitable, provide advice on alternative methods to build up vitamins and nutrients to suit the needs and condition of the patient. If this supplement is indeed suitable, recommend him a dosage and how often he should consume the medication and when he should stop when he has achieved his goals."},
                { "type": "input_image", "image_url": f"data:image/png;base64,{base64_image}"
                },
            ],
        }
    ],
)

print(response.output_text)

prompt = f"""
Here is the previous context. {response.output_text}. Help generate an informative infographic of size 576x360 pixels, showing the key health benefits and side effects and recommendations of this supplement.
"""

result = client.images.generate(
    model="gpt-image-1.5",
    prompt=prompt
)

image_base64 = result.data[0].b64_json
image_bytes = base64.b64decode(image_base64)

# Save the image to a file
with open("assets/result.png", "wb") as f:
    f.write(image_bytes)

img = Image.open("assets/photo.png")
img = img.resize((288,180))
photo = ImageTk.PhotoImage(img)
label = tk.Label(root, image=photo)

img2 = Image.open("assets/result.png")
img2 = img2.resize((288,180))
photo2 = ImageTk.PhotoImage(img2)
label2 = tk.Label(root, image=photo2)

text_area = tk.Text(root, width=50)

text_area.insert(tk.END, response.output_text)

label.pack(pady=20)
label2.pack(pady=20)
text_area.pack(pady=20)

root.mainloop()
