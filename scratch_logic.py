import os
import sys
import json
import time
sys.path.append(os.path.abspath('.'))

from app import db
from app.services.pipeline import investigate
from app.schemas import ReviewRequest
from sqlalchemy import select, func, cast, JSON

db.init_db()

claim = {
    "claim_id": "test_claim_new",
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

# create a review to simulate existing review
db.put_review("test_claim_new", {"action": "HOLD"})

# run investigate again to make it newer!
time.sleep(1)
result2 = investigate(claim)

engine = db._engine()
with engine.connect() as conn:
    route_expr = cast(db.investigations_table.c.result, JSON)["route"].as_string()
    
    latest_reviews = select(
        db.reviews_table.c.claim_id,
        func.max(db.reviews_table.c.created_at).label("last_reviewed")
    ).group_by(db.reviews_table.c.claim_id).alias("lr")
    
    query = select(db.investigations_table.c.result).outerjoin(
        latest_reviews, db.investigations_table.c.claim_id == latest_reviews.c.claim_id
    ).where(
        route_expr.in_(["HOLD", "HUMAN_REVIEW", "UNDETERMINED"]),
        (latest_reviews.c.claim_id.is_(None)) | (db.investigations_table.c.updated_at > latest_reviews.c.last_reviewed)
    ).order_by(db.investigations_table.c.updated_at.desc())
    
    rows = conn.execute(query).all()
    print("Pending reviews count with new logic:", len(rows))
    if rows:
        print(json.loads(rows[0].result).get('claim_id'))
