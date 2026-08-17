import hashlib
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from app import db
from app.auth import create_user, require_roles
from app.schemas import CreateUserRequest, PolicyIngestRequest
from app.services.policy import extract_pdf_text, get_index, validate_policy_record

router = APIRouter(tags=["Admin"])

@router.get("/api/policies")
@router.get("/api/v1/policies")
def policies(
    _: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR")),
) -> list[dict]:
    return get_index().records


@router.post("/api/policies", status_code=201)
@router.post("/api/v1/policies", status_code=201)
def add_policy(
    request: PolicyIngestRequest, user: dict = Depends(require_roles("ADMIN"))
) -> dict:
    text = (
        request.content_text.strip()
        if request.content_text
        else extract_pdf_text(request.pdf_base64 or "")
    )
    record = {
        "policy_id": request.policy_id,
        "version": request.version,
        "title": request.title,
        "section": request.section,
        "source_url": request.source_url,
        "authority": request.authority,
        "jurisdiction": request.jurisdiction,
        "effective_date": request.effective_date.isoformat(),
        "last_verified": date.today().isoformat(),
        "topics": [topic.strip()[:80] for topic in request.topics],
        "text": text,
        "status": "ACTIVE",
    }
    try:
        validate_policy_record(record)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    record["content_hash"] = hashlib.sha256(text.encode()).hexdigest()
    db.put_policy_record(record)
    get_index.cache_clear()
    db.append_audit(
        "POLICY-CORPUS",
        "POLICY_VERSION_ADDED",
        {
            "policy_id": request.policy_id,
            "version": request.version,
            "actor": user["username"],
            "content_hash": record["content_hash"],
        },
    )
    return record


@router.post("/api/policies/{policy_id}/{version}/retire")
@router.post("/api/v1/policies/{policy_id}/{version}/retire")
def retire_policy(
    policy_id: str, version: str, user: dict = Depends(require_roles("ADMIN"))
) -> dict:
    if not db.set_policy_status(policy_id, version, "RETIRED"):
        raise HTTPException(404, "Policy version not found")
    get_index.cache_clear()
    db.append_audit(
        "POLICY-CORPUS",
        "POLICY_VERSION_RETIRED",
        {"policy_id": policy_id, "version": version, "actor": user["username"]},
    )
    return {"policy_id": policy_id, "version": version, "status": "RETIRED"}


@router.post("/api/v1/admin/users", status_code=201)
def admin_create_user(
    request: CreateUserRequest,
    user: dict = Depends(require_roles("ADMIN")),
) -> dict:
    """Create a new user (Admin only)."""
    try:
        new_user = create_user(
            username=request.username,
            password=request.password,
            role=request.role,
            display_name=request.display_name,
            tenant_id=request.tenant_id,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    db.append_audit(
        "ADMIN",
        "USER_CREATED",
        {"username": request.username, "role": request.role, "actor": user["username"]},
    )
    return new_user


@router.get("/api/v1/admin/users")
def admin_list_users(
    user: dict = Depends(require_roles("ADMIN")),
    tenant_id: str | None = Query(default=None),
) -> list[dict]:
    """List all users, optionally filtered by tenant."""
    return db.list_users(tenant_id=tenant_id)


@router.post("/api/v1/admin/users/{username}/deactivate")
def admin_deactivate_user(
    username: str,
    user: dict = Depends(require_roles("ADMIN")),
) -> dict:
    """Deactivate a user account."""
    if username == user["username"]:
        raise HTTPException(400, "Cannot deactivate your own account")
    if not db.deactivate_user(username):
        raise HTTPException(404, "User not found")
    db.append_audit(
        "ADMIN",
        "USER_DEACTIVATED",
        {"username": username, "actor": user["username"]},
    )
    return {"username": username, "active": False}


@router.get("/api/v1/admin/llm-usage")
def admin_llm_usage(
    _: dict = Depends(require_roles("ADMIN")),
    tenant_id: str | None = Query(default=None),
) -> dict:
    """Get LLM usage summary for billing."""
    return db.get_llm_usage_summary(tenant_id=tenant_id)
