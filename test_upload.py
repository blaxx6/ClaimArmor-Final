from app.main import app
from fastapi.testclient import TestClient
from app.auth import issue_token_pair

client = TestClient(app)
tokens = issue_token_pair({"username": "admin", "role": "ADMIN", "tenant_id": "default", "sub": "admin"})

with open("/app/sample_bulk_claims.csv", "w") as f:
    f.write("""claim_id,member_name,member_dob,service_date,amount,submitted_payer,accident_related,diagnosis_code,procedure_code
CLM-BULK-001,John Doe,1980-05-15,2026-08-01,1500.00,AUTO_INSURER,true,S12.000A,99284
CLM-BULK-002,Jane Smith,1992-11-23,2026-08-02,450.00,MEDICARE,false,J01.90,99213
CLM-BULK-003,Alice Johnson,1975-03-08,2026-08-03,8900.50,WORKERS_COMP,true,S82.401A,27758
CLM-BULK-004,Bob Williams,1960-07-30,2026-08-04,120.00,COMMERCIAL,false,I10,99214
CLM-BULK-005,Charlie Brown,2001-12-12,2026-08-05,3200.00,MEDICAID,false,E11.9,82947""")

with open("/app/sample_bulk_claims.csv", "r") as f:
    text = f.read()

res = client.post(
    "/api/v1/claims/upload-csv",
    headers={"Authorization": f"Bearer {tokens['access_token']}"},
    json={"csv_text": text}
)
print("Status:", res.status_code)
print("Response:", res.text)
