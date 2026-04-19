import requests, base64, os

image = os.path.join("uploads", "638177-1.png")

with open(image, "rb") as file:
    encoded = base64.b64encode(file.read())

encoded = str(encoded)


# r = requests.post("http://127.0.0.1:8000/scan_meds", json={"msg": encoded})
# print(r.json()["response"])