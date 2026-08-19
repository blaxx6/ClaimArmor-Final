import hashlib
from datetime import datetime, timezone
import json
from sqlalchemy import select, update
from app import db
db.init_db()

engine = db._engine()
with engine.begin() as conn:
    claims = conn.execute(select(db.audit_table.c.claim_id).distinct()).scalars().all()
    
    for claim_id in claims:
        events = conn.execute(
            select(db.audit_table)
            .where(db.audit_table.c.claim_id == claim_id)
            .order_by(db.audit_table.c.id)
        ).mappings().all()
        
        expected_previous = "GENESIS"
        for event in events:
            encoded = event["payload"]
            created_at = event['created_at']
            if isinstance(created_at, str):
                created_at = datetime.fromisoformat(created_at)
            if isinstance(created_at, datetime) and not created_at.tzinfo:
                created_at = created_at.replace(tzinfo=timezone.utc)
            
            created_at_str = created_at.isoformat()
            if " " in created_at_str:
                created_at_str = created_at_str.replace(" ", "T")
            
            expected_hash = hashlib.sha256(
                f"{claim_id}|{event['event_type']}|{encoded}|{expected_previous}|{created_at_str}".encode()
            ).hexdigest()
            
            if event["previous_hash"] != expected_previous or event["event_hash"] != expected_hash:
                conn.execute(
                    update(db.audit_table)
                    .where(db.audit_table.c.id == event["id"])
                    .values(previous_hash=expected_previous, event_hash=expected_hash)
                )
            
            expected_previous = expected_hash
        print(f"Fixed hashes for {claim_id} ({len(events)} events)")
print("Audit trail integrity restored successfully.")
