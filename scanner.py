from openai import OpenAI
import cv2 as cv
import base64
import tkinter as tk
from PIL import Image, ImageTk

root = tk.Tk()
root.title("Conclusion")
root.geometry("450x600")


underlying_conditions = ["Type 2 Diabetes"]

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

client = OpenAI(api_key="")

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
                { "type": "input_text", "text": "What is the supplement in this image? What is the brand, type of supplement, what are the medical benefits and possible negative side effects when consuming this supplement? You are acting as a pharmacist, do you recommend that the user takes this supplement based on his medical history? His medical history is {}.".format(underlying_conditions[0])},
                { "type": "input_image", "image_url": f"data:image/png;base64,{base64_image}"
                },
            ],
        }
    ],
)

print(response.output_text)

img = Image.open("assets/photo.png")
img = img.resize((288,180))
photo = ImageTk.PhotoImage(img)
label = tk.Label(root, image=photo)

text_area = tk.Text(root, width=50)

text_area.insert(tk.END, response.output_text)

label.pack(pady=20)
text_area.pack(pady=20)

root.mainloop()