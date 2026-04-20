import requests, base64, os

r = requests.post("http://127.0.0.1:8000/chat", json={"msg": "Should I buy a massage gun?"})
print(r.json()["response"])

# image = os.path.join("uploads", "638177-1.png")

# with open(image, "rb") as file:
#     encoded = base64.b64encode(file.read()).decode("utf-8")

# encoded = str(encoded)


# r = requests.post("http://127.0.0.1:8000/scan_meds", json={"msg": encoded})
# print(r.json()["response"])