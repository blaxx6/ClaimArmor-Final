"""ClaimArmor AI — Production API Server.

Production upgrades:
- API v1 prefix with versioning
- CORS configuration for frontend origins
- Structured JSON logging via structlog
- Tenant context middleware
- Async investigation via Celery queue
- Refresh token endpoint
- Admin endpoints for user/tenant management
- Request size limits
- Enhanced security headers
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

from app.config import get_settings, load_local_env

load_local_env()

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

try:
    from prometheus_client import (
        CONTENT_TYPE_LATEST,
        Counter,
        Histogram,
        generate_latest,
        CollectorRegistry,
        multiprocess,
    )
except ImportError:
    CONTENT_TYPE_LATEST = "text/plain; version=0.0.4"

    class _NoopMetric:
        def labels(self, *_args):
            return self

        def inc(self):
            return None

        def observe(self, _value):
            return None

    def Counter(*_args, **_kwargs):
        return _NoopMetric()

    def Histogram(*_args, **_kwargs):
        return _NoopMetric()

    def generate_latest():
        return b"# ClaimArmor metrics require the optional prometheus-client package.\nclaimarmor_up 1\n"


from app import db
from app.routers import admin, analytics, auth, claims, investigations

# ── Logging setup ─────────────────────────────────────────────────────
settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
)
logger = logging.getLogger("claimarmor")


# ── App lifecycle ─────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(_: FastAPI):
    from app.auth import seed_users
    from app.schemas import ClaimInput
    from app.seed import COVERAGES, DEMO_CLAIMS, MEMBERS
    db.init_db()
    seed_users()
    if not settings.is_production:
        for raw_member in MEMBERS:
            if not db.get_member(raw_member["member_id"]):
                db.put_member(raw_member)
        for raw_coverage in COVERAGES:
            db.put_coverage(raw_coverage)

    for raw_claim in DEMO_CLAIMS:
        claim = ClaimInput.model_validate(raw_claim).model_dump(mode="json")
        if not db.get_claim(claim["claim_id"]):
            db.put_claim(claim)
            db.append_audit(
                claim["claim_id"],
                "CLAIM_INGESTED",
                {"source": "synthetic_seed"},
            )
    yield
    db.dispose_engine()


tags_metadata = [
    {
        "name": "Health",
        "description": "System health checks and Prometheus metrics.",
    },
    {
        "name": "Auth",
        "description": "Authentication — login, token refresh, and user profile.",
    },
    {
        "name": "Claims",
        "description": "Claim ingestion via API, CSV, or synthetic EDI. Includes CRUD and detail retrieval.",
    },
    {
        "name": "Investigations",
        "description": "Run AI-powered COB investigations (sync, async, or streamed). Manage the review queue and replay past investigations.",
    },
    {
        "name": "Analytics",
        "description": "Metrics, model evaluation, retrieval quality, ROI simulation, and ops diagnostics.",
    },
    {
        "name": "Admin",
        "description": "User management, policy corpus management, and LLM usage tracking. Requires ADMIN role.",
    },
]

app = FastAPI(
    title="ClaimArmor AI",
    version=settings.app_version,
    description=(
        "Pre-payment Coordination of Benefits (COB) audit system with an "
        "AI-powered multi-agent investigation pipeline. Supports identity resolution, "
        "coverage verification, policy research, primacy reasoning, and automated "
        "decision routing."
    ),
    openapi_tags=tags_metadata,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static files ──────────────────────────────────────────────────────
react_dist = Path(__file__).parent / "static" / "react"
if react_dist.exists():
    app.mount(
        "/react", StaticFiles(directory=react_dist, html=True), name="react-dashboard"
    )

# ── OpenTelemetry (optional) ──────────────────────────────────────────
try:
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

    FastAPIInstrumentor.instrument_app(app)
except ImportError:
    pass

# ── Metrics ───────────────────────────────────────────────────────────
REQUESTS = Counter(
    "claimarmor_http_requests_total", "HTTP requests", ["method", "path", "status"]
)
LATENCY = Histogram(
    "claimarmor_http_request_duration_seconds",
    "HTTP request duration",
    ["method", "path"],
)
INVESTIGATIONS = Counter(
    "claimarmor_investigations_total", "Investigations", ["route", "mode"]
)


# ── Middleware ────────────────────────────────────────────────────────


@app.middleware("http")
async def operational_middleware(request: Request, call_next):
    # Enforce Request Body Size Limit (50MB)
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > 50 * 1024 * 1024:
        return Response(content="Payload Too Large", status_code=413)

    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))[:80]
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started) * 1000, 2)

    REQUESTS.labels(request.method, request.url.path, str(response.status_code)).inc()
    LATENCY.labels(request.method, request.url.path).observe(duration_ms / 1000)

    # Security headers
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    if request.url.path.startswith("/docs") or request.url.path.startswith("/redoc"):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self'; img-src 'self' data: https://fastapi.tiangolo.com"
        )
    else:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:"
        )

    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"

    logger.info(
        "method=%s path=%s status=%s duration_ms=%s request_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request_id,
    )
    return response


# ═══════════════════════════════════════════════════════════════════════
# HEALTH & METRICS
# ═══════════════════════════════════════════════════════════════════════


@app.get("/metrics", include_in_schema=False)
def prometheus_metrics() -> Response:
    import os
    if "PROMETHEUS_MULTIPROC_DIR" in os.environ:
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry)
        data = generate_latest(registry)
    else:
        data = generate_latest()
    return Response(data, media_type=CONTENT_TYPE_LATEST)


@app.get("/", include_in_schema=False)
def dashboard() -> FileResponse:
    return FileResponse(Path(__file__).parent / "static" / "index.html")


@app.get("/api/health", tags=["Health"], summary="System health check")
@app.get("/api/v1/health", tags=["Health"], summary="System health check (v1)")
def health() -> dict:
    """Returns system health status, version, environment, and storage info.
    This endpoint does not require authentication."""
    return {
        "status": "healthy",
        "version": settings.app_version,
        "environment": settings.environment,
        "data_classification": "SYNTHETIC_ONLY",
        "storage": db.storage_info(),
    }


# ═══════════════════════════════════════════════════════════════════════
# ROUTERS
# ═══════════════════════════════════════════════════════════════════════

app.include_router(auth.router)
app.include_router(claims.router)
app.include_router(investigations.router)
app.include_router(analytics.router)
app.include_router(admin.router)
