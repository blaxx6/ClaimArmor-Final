from fastapi import APIRouter, Depends, HTTPException, Request

from app import db
from app.auth import (
    _check_rate_limit,
    authenticate,
    current_user,
    issue_token_pair,
    refresh_access_token,
)
from app.schemas import LoginRequest, RefreshTokenRequest

router = APIRouter(tags=["Auth"])

@router.post("/api/auth/login", summary="Authenticate user")
@router.post("/api/v1/auth/login", summary="Authenticate user (v1)")
def login(request: LoginRequest, http_request: Request) -> dict:
    """Authenticate with username/password and receive an access + refresh token pair."""
    client = http_request.client.host if http_request.client else "unknown"
    _check_rate_limit(client)
    user = authenticate(request.username, request.password)
    if not user:
        raise HTTPException(401, "Invalid username or password")
    db.append_audit(
        "AUTH",
        "LOGIN_SUCCESS",
        {"username": user["username"], "client": client},
    )
    return issue_token_pair(user)


@router.post("/api/v1/auth/refresh", summary="Refresh access token")
def refresh_token(request: RefreshTokenRequest) -> dict:
    """Exchange a valid refresh token for a new access token."""
    return refresh_access_token(request.refresh_token)


@router.get("/api/auth/me", summary="Get current user profile")
@router.get("/api/v1/auth/me", summary="Get current user profile (v1)")
def me(user: dict = Depends(current_user)) -> dict:
    """Returns the authenticated user's profile (username, role, tenant)."""
    return user
