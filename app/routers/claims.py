import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query

from app import db
from app.auth import require_roles
from app.config import get_settings
from app.schemas import ClaimInput, CsvUploadRequest, EdiUploadRequest
from app.services.ingestion import parse_synthetic_837

settings = get_settings()
router = APIRouter(tags=["Claims"])

@router.get("/api/claims", summary="List all claims")
@router.get("/api/v1/claims", summary="List all claims (v1)")
def claims(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR")),
) -> list[dict]:
    """Return paginated claims for the authenticated user's tenant."""
    return db.list_claims(user.get("tenant_id"), limit=limit, offset=offset)


@router.post("/api/claims", status_code=201, summary="Create a new claim")
@router.post("/api/v1/claims", status_code=201, summary="Create a new claim (v1)")
def create_claim(
    claim: ClaimInput, user: dict = Depends(require_roles("ANALYST"))
) -> dict:
    """Ingest a single claim via JSON. Returns 409 if the claim_id already exists."""
    if db.get_claim(claim.claim_id):
        raise HTTPException(409, "A claim with this ID already exists")
    payload = claim.model_dump(mode="json")
    db.put_claim(payload)
    db.append_audit(
        claim.claim_id, "CLAIM_INGESTED", {"source": "api", "actor": user["username"]}
    )
    return payload


@router.post("/api/claims/upload-csv", summary="Bulk upload claims via CSV")
@router.post("/api/v1/claims/upload-csv", summary="Bulk upload claims via CSV (v1)")
def upload_claim_csv(
    request: CsvUploadRequest, user: dict = Depends(require_roles("ANALYST"))
) -> dict:
    """Parse a CSV text payload and ingest multiple claims. Skips duplicates."""
    reader = csv.DictReader(io.StringIO(request.csv_text))
    required = {
        "claim_id",
        "member_name",
        "member_dob",
        "service_date",
        "amount",
        "submitted_payer",
    }
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise HTTPException(422, f"CSV requires columns: {', '.join(sorted(required))}")
    created, duplicates, errors = [], [], []
    max_rows = settings.max_csv_upload_rows
    for row_number, row in enumerate(reader, start=2):
        if row_number > max_rows + 1:
            errors.append(
                {"row": row_number, "error": f"Maximum batch size is {max_rows} claims"}
            )
            break
        try:
            row["amount"] = float(row["amount"])
            row["accident_related"] = str(
                row.get("accident_related", "false")
            ).casefold() in {"true", "1", "yes"}
            for optional, default in {
                "member_id": None,
                "claim_type": "MEDICAL",
                "diagnosis_group": "GENERAL",
            }.items():
                row[optional] = row.get(optional) or default
            claim = ClaimInput.model_validate(row).model_dump(mode="json")
            if db.get_claim(claim["claim_id"]):
                duplicates.append(claim["claim_id"])
                continue
            db.put_claim(claim)
            db.append_audit(
                claim["claim_id"],
                "CLAIM_INGESTED",
                {"source": "csv", "actor": user["username"], "row": row_number},
            )
            created.append(claim["claim_id"])
        except Exception as exc:
            errors.append(
                {
                    "row": row_number,
                    "claim_id": row.get("claim_id"),
                    "error": str(exc)[:300],
                }
            )
    return {
        "created": created,
        "duplicates": duplicates,
        "errors": errors,
        "summary": {
            "created": len(created),
            "duplicates": len(duplicates),
            "errors": len(errors),
        },
    }


@router.post("/api/claims/upload-edi", summary="Upload synthetic EDI 837")
@router.post("/api/v1/claims/upload-edi", summary="Upload synthetic EDI 837 (v1)")
def upload_synthetic_edi(
    request: EdiUploadRequest, user: dict = Depends(require_roles("ANALYST"))
) -> dict:
    """Parse a synthetic EDI 837 text payload and ingest claims."""
    try:
        parsed = parse_synthetic_837(request.edi_text)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    created, duplicates = [], []
    for model in parsed:
        claim = model.model_dump(mode="json")
        if db.get_claim(claim["claim_id"]):
            duplicates.append(claim["claim_id"])
            continue
        db.put_claim(claim)
        db.append_audit(
            claim["claim_id"],
            "CLAIM_INGESTED",
            {"source": "synthetic_edi", "actor": user["username"]},
        )
        created.append(claim["claim_id"])
    return {
        "created": created,
        "duplicates": duplicates,
        "format": "CLAIMARMOR_EDI_LIKE_V1",
        "x12_certified": False,
    }
