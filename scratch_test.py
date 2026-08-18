import os
import sys
sys.path.append(os.path.abspath('.'))

from app import db
from app.services.pipeline import investigate
from app.schemas import ReviewRequest
import json

db.init_db()

claim = {
    "claim_id": "test_claim_1",
    "tenant_id": "default",
    "member_id": "test_member",
    "service_date": "2024-01-01",
    "diagnosis_codes": ["A00"],
    "procedure_codes": ["B00"],
    "billed_amount": 100.0,
    "provider_id": "P1"
}
db.put_claim(claim)

result = investigate(claim)
print(f"Investigation Result Route: {result.route}")

invs = db.list_investigations()
print(f"Total investigations: {len(invs)}")
print(f"First investigation route: {invs[0].get('route')}")

pending = db.list_pending_reviews()
print(f"Pending reviews count: {len(pending)}")

review_req = ReviewRequest(action="REINVESTIGATE", notes="Test")
user = {"username": "test_user", "tenant_id": "default"}
from app.routers.investigations import review
try:
    rev_result = review("test_claim_1", review_req, user)
    print("Reinvestigate successful")
except Exception as e:
    print(f"Reinvestigate error: {e}")

pending2 = db.list_pending_reviews()
print(f"Pending reviews count after REINVESTIGATE: {len(pending2)}")
