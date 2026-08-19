from app.main import app
from fastapi.testclient import TestClient
from app.auth import issue_token_pair
import json

client = TestClient(app)
tokens = issue_token_pair({"username": "admin", "role": "ADMIN", "tenant_id": "default", "sub": "admin"})

res = client.get(
    "/api/v1/claims",
    headers={"Authorization": "Bearer " + tokens["access_token"]}
)
claims = res.json()
print("Total returned:", len(claims))
if claims:
    print("First claim:", claims[0]["claim_id"])
    print("Last claim:", claims[-1]["claim_id"])
