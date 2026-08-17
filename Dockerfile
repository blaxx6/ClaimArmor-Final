# ── Stage 1: Builder ──────────────────────────────────────────────────
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt


# ── Stage 2: Runtime ─────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

ARG APP_VERSION=1.0.0
ARG BUILD_DATE
ARG GIT_COMMIT

LABEL maintainer="ClaimArmor Team" \
      version="${APP_VERSION}" \
      description="ClaimArmor AI — Pre-payment COB audit system" \
      build.date="${BUILD_DATE}" \
      git.commit="${GIT_COMMIT}"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CLAIMARMOR_APP_VERSION=${APP_VERSION} \
    CLAIMARMOR_ENVIRONMENT=production \
    CLAIMARMOR_LOG_FORMAT=json

# Install runtime dependencies only (no gcc)
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 curl && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r claimarmor && \
    useradd -r -g claimarmor -d /app -s /sbin/nologin claimarmor

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY app ./app
COPY data ./data
COPY monitoring ./monitoring
COPY artifacts ./artifacts
COPY alembic.ini .

# Create data directories
RUN mkdir -p /data /app/artifacts && \
    chown -R claimarmor:claimarmor /app /data

# Switch to non-root user
USER claimarmor

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Production server
CMD ["python", "-m", "uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--access-log", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*"]
