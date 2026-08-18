import json
from app import db
from app.services.pipeline import investigate

claim = db.get_claim('CLM-REVIEW-001')
print(f"Claim found: {claim is not None}")

if claim:
    result = investigate(claim).model_dump(mode='json')
    print("Investigate result keys:", result.keys())
    db.put_investigation('CLM-REVIEW-001', result)
    print("Saved investigation!")
    
    saved = db.get_investigation('CLM-REVIEW-001')
    print("Retrieved saved investigation:", saved is not None)
