from app.db import verify_audit_chain
from app import db
db.init_db()
print(verify_audit_chain("CLM-HOLD-001"))
