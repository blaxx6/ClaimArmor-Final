"""Production API schemas with async task tracking and tenant awareness.

Upgrades:
- AsyncTaskResponse for Celery job tracking
- TaskStatusResponse for polling
- Tenant-aware base model
- Pagination schemas
- Enhanced validation
"""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


class DecisionRoute(str, Enum):
    CLEAR = "CLEAR"
    HOLD = "HOLD"
    HUMAN_REVIEW = "HUMAN_REVIEW"
    UNDETERMINED = "UNDETERMINED"


class TaskStatus(str, Enum):
    QUEUED = "QUEUED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"
    RETRYING = "RETRYING"


# ── Claim schemas ─────────────────────────────────────────────────────


class ClaimInput(BaseModel):
    claim_id: str = Field(min_length=3, max_length=80)
    member_name: str = Field(min_length=2, max_length=120)
    member_dob: date
    member_id: str | None = None
    member_email: str | None = None
    member_phone: str | None = None
    member_address: str | None = None
    service_date: date
    amount: float = Field(gt=0, le=10_000_000)
    submitted_payer: str = Field(min_length=2, max_length=80)
    claim_type: str = "MEDICAL"
    accident_related: bool = False
    diagnosis_group: str = "GENERAL"
    provider_id: str | None = None
    employer_id: str | None = None
    employment_active: bool | None = None
    employer_size: int | None = Field(default=None, ge=0, le=1_000_000)
    disability: bool = False
    relationship: str = "SELF"

    @field_validator("claim_id", "member_name", "submitted_payer", "claim_type")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()


# ── Review schemas ────────────────────────────────────────────────────


class ReviewRequest(BaseModel):
    reviewer: str = Field(min_length=2, max_length=80)
    action: str
    reason: str = Field(min_length=3, max_length=500)
    final_route: DecisionRoute | None = None

    @field_validator("action")
    @classmethod
    def validate_action(cls, value: str) -> str:
        value = value.upper().strip()
        if value not in {
            "APPROVE",
            "REJECT",
            "OVERRIDE",
            "REQUEST_INFORMATION",
            "REINVESTIGATE",
        }:
            raise ValueError("unsupported review action")
        return value


# ── Auth schemas ──────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=6, max_length=200)


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict[str, Any]


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=10)


# ── Upload schemas ────────────────────────────────────────────────────


class CsvUploadRequest(BaseModel):
    csv_text: str = Field(min_length=10, max_length=2_000_000)


class EdiUploadRequest(BaseModel):
    edi_text: str = Field(min_length=20, max_length=2_000_000)


class StreamSimulationRequest(BaseModel):
    claim_ids: list[str] = Field(min_length=1, max_length=100)


# ── ROI schemas ───────────────────────────────────────────────────────


class RoiAssumptions(BaseModel):
    annual_claims: int = Field(default=100_000, ge=1, le=1_000_000_000)
    average_claim_amount: float = Field(default=2500, gt=0, le=10_000_000)
    leakage_rate: float = Field(default=0.025, ge=0, le=1)
    value_detection_rate: float = Field(default=0.837, ge=0, le=1)
    review_rate: float = Field(default=0.25, ge=0, le=1)
    review_cost: float = Field(default=35, ge=0, le=100_000)
    false_positive_rate: float = Field(default=0.08, ge=0, le=1)
    false_positive_cost: float = Field(default=75, ge=0, le=100_000)
    annual_platform_cost: float = Field(default=750_000, gt=0, le=1_000_000_000)


# ── Policy schemas ────────────────────────────────────────────────────


class PolicyIngestRequest(BaseModel):
    policy_id: str = Field(pattern=r"^[A-Z0-9_-]{3,80}$")
    version: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=3, max_length=200)
    section: str = Field(min_length=1, max_length=200)
    source_url: str = Field(pattern=r"^https://")
    authority: str = Field(min_length=2, max_length=160)
    jurisdiction: str = Field(min_length=2, max_length=120)
    effective_date: date
    topics: list[str] = Field(min_length=1, max_length=30)
    content_text: str | None = Field(default=None, max_length=1_000_000)
    pdf_base64: str | None = Field(default=None, max_length=8_000_000)

    @model_validator(mode="after")
    def require_one_content_source(self):
        if bool(self.content_text) == bool(self.pdf_base64):
            raise ValueError("Provide exactly one of content_text or pdf_base64")
        return self


# ── Async task schemas ────────────────────────────────────────────────


class AsyncTaskResponse(BaseModel):
    """Returned when an investigation is submitted to the async queue."""

    task_id: str
    claim_id: str
    status: TaskStatus = TaskStatus.QUEUED
    message: str = "Investigation queued for processing"


class TaskStatusResponse(BaseModel):
    """Returned when polling for task completion."""

    task_id: str
    claim_id: str
    status: TaskStatus
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


# ── Investigation result ──────────────────────────────────────────────


class InvestigationResult(BaseModel):
    claim_id: str
    member_match: dict[str, Any]
    coverage_timeline: list[dict[str, Any]]
    risk: dict[str, Any]
    rules: list[dict[str, Any]]
    evidence: list[dict[str, Any]]
    agent_trace: list[dict[str, Any]]
    recommended_primary_payer: str | None
    route: DecisionRoute
    confidence: float
    financial_impact: dict[str, Any]
    explanation: str
    limitations: list[str]


# ── Pagination ────────────────────────────────────────────────────────


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=500)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class PaginatedResponse(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int
    total_pages: int


# ── Admin schemas ─────────────────────────────────────────────────────


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=8, max_length=200)
    role: str = Field(pattern=r"^(ANALYST|REVIEWER|AUDITOR|ADMIN)$")
    display_name: str = Field(min_length=2, max_length=120)
    tenant_id: str | None = None


class TenantConfig(BaseModel):
    tenant_id: str = Field(min_length=3, max_length=80)
    display_name: str = Field(min_length=2, max_length=200)
    jurisdiction: str = Field(default="US", max_length=10)
    llm_provider: str | None = None
    risk_threshold_hold: float = Field(default=0.70, ge=0, le=1)
    risk_threshold_review: float = Field(default=0.35, ge=0, le=1)
    max_daily_claims: int = Field(default=10_000, ge=1)
