"""Centralised, type-safe application settings.

All configuration is loaded from environment variables (with `.env` fallback)
using Pydantic Settings.  This replaces the previous ``load_local_env`` helper
with a validated, documented, secrets-aware settings object.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """ClaimArmor AI — unified application settings.

    Environment variables are read with the ``CLAIMARMOR_`` prefix stripped
    (case-insensitive).  A ``.env`` file in the working directory is loaded
    automatically when present.
    """

    # ── Core ──────────────────────────────────────────────────────────
    app_name: str = "ClaimArmor AI"
    app_version: str = "1.0.0"
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False
    log_level: str = "INFO"
    log_format: Literal["json", "text"] = "json"

    # ── Database ──────────────────────────────────────────────────────
    database_url: str = "sqlite:///claimarmor.db"
    db_pool_size: int = Field(default=10, ge=1, le=100)
    db_max_overflow: int = Field(default=20, ge=0, le=200)
    db_pool_timeout: int = Field(default=30, ge=5)
    db_echo: bool = False

    # ── Authentication & Security ─────────────────────────────────────
    auth_secret: SecretStr = SecretStr("claimarmor-local-demo-secret")
    auth_token_lifetime_seconds: int = Field(default=28_800, ge=300)
    auth_refresh_token_lifetime_seconds: int = Field(default=604_800, ge=3600)

    # OIDC / SSO (optional — falls back to local auth when unset)
    oidc_issuer_url: str | None = None
    oidc_client_id: str | None = None
    oidc_client_secret: SecretStr | None = None
    oidc_audience: str | None = None

    # Field-level encryption for PII columns
    encryption_key: SecretStr | None = None  # Fernet key — generate via cryptography.fernet.Fernet.generate_key()

    # ── Multi-tenancy ─────────────────────────────────────────────────
    tenant_id: str = "default"
    multi_tenancy_enabled: bool = False

    # ── Redis / Celery ────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str | None = None  # defaults to redis_url
    celery_result_backend: str | None = None  # defaults to redis_url
    celery_task_default_queue: str = "claimarmor"

    # ── ML / Model Registry ───────────────────────────────────────────
    model_path: str = "artifacts/risk_model.joblib"
    model_metrics_path: str = "artifacts/model_metrics.json"
    mlflow_tracking_uri: str | None = None
    mlflow_experiment_name: str = "claimarmor-risk-model"
    drift_psi_threshold: float = Field(default=0.2, ge=0.0, le=1.0)

    # ── LLM Providers ─────────────────────────────────────────────────
    llm_mode: Literal["offline", "openai", "openrouter", "gemini", "groq"] = "offline"
    llm_model: str = "gpt-4o-mini"
    llm_max_tokens_per_investigation: int = Field(default=8000, ge=500)
    llm_cache_ttl_seconds: int = Field(default=86_400, ge=0)

    openai_api_key: SecretStr | None = None
    openrouter_api_key: SecretStr | None = None
    openrouter_model: str = "openai/gpt-4o-mini"

    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_structured_model: str = "gemini-3.5-flash-lite"
    gemini_explanation_model: str = "gemini-3.5-flash-lite"

    groq_api_key: SecretStr | None = None
    groq_model: str = "llama-3.3-70b-versatile"

    # ── Observability ─────────────────────────────────────────────────
    otel_exporter_otlp_endpoint: str | None = None
    prometheus_enabled: bool = True
    sentry_dsn: str | None = None

    # ── CORS ──────────────────────────────────────────────────────────
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # ── Rate Limiting ─────────────────────────────────────────────────
    rate_limit_requests_per_minute: int = Field(default=60, ge=1)
    rate_limit_login_per_minute: int = Field(default=10, ge=1)

    # ── API ───────────────────────────────────────────────────────────
    api_prefix: str = "/api/v1"
    max_request_body_bytes: int = Field(default=10_000_000, ge=1_000)
    max_csv_upload_rows: int = Field(default=500, ge=1)

    # ── Notifications ─────────────────────────────────────────────────
    slack_webhook_url: str | None = None
    alert_email_recipients: list[str] = []
    review_queue_alert_threshold: int = Field(default=50, ge=1)
    investigation_sla_seconds: float = Field(default=30.0, ge=1.0)

    @field_validator("database_url")
    @classmethod
    def _normalise_sqlite_url(cls, value: str) -> str:
        if value and not value.startswith(("sqlite", "postgresql")):
            return f"sqlite:///{value}"
        return value

    @property
    def effective_celery_broker(self) -> str:
        return self.celery_broker_url or self.redis_url

    @property
    def effective_celery_backend(self) -> str:
        return self.celery_result_backend or self.redis_url

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    model_config = {
        "env_prefix": "CLAIMARMOR_",
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
        "extra": "ignore",
    }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached, validated application settings singleton."""
    return Settings()


# ── Backward-compatible shim ──────────────────────────────────────────
# The old ``load_local_env`` was called at import time by ``main.py``.
# This shim preserves that call-site without functional change — Pydantic
# Settings already reads ``.env`` on construction.

def load_local_env(path: Path = Path(".env")) -> None:
    """No-op kept for backward compatibility; config is now via ``get_settings()``."""
    _ = get_settings()
