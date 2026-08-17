"""Shared pytest fixtures for ClaimArmor AI test suite."""

from __future__ import annotations

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture()
def tmp_db():
    """Create a temporary SQLite database, seed it, and tear it down after the test."""
    temp_dir = tempfile.TemporaryDirectory()
    db_path = Path(temp_dir.name) / "test.db"
    env_patcher = patch.dict(
        "os.environ",
        {
            "CLAIMARMOR_LLM_MODE": "offline",
            "CLAIMARMOR_DATABASE_URL": f"sqlite:///{db_path}",
        },
    )
    env_patcher.start()

    from app.auth import _login_attempts, seed_users
    from app.config import get_settings
    from app.schemas import ClaimInput
    from app.seed import COVERAGES, DEMO_CLAIMS, MEMBERS

    _login_attempts.clear()
    get_settings.cache_clear()
    db.dispose_engine()
    db.init_db()
    seed_users()

    # Seed members and coverages
    for member in MEMBERS:
        if not db.get_member(member["member_id"]):
            db.put_member(member)
    for coverage in COVERAGES:
        db.put_coverage(coverage)

    # Seed demo claims
    for raw_claim in DEMO_CLAIMS:
        claim = ClaimInput.model_validate(raw_claim).model_dump(mode="json")
        if not db.get_claim(claim["claim_id"]):
            db.put_claim(claim)
            db.append_audit(claim["claim_id"], "CLAIM_INGESTED", {"source": "test_seed"})

    yield db_path

    env_patcher.stop()
    db.dispose_engine()
    get_settings.cache_clear()
    temp_dir.cleanup()


@pytest.fixture()
def client(tmp_db):
    """Yield a TestClient bound to the app with a seeded temp database."""
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def analyst_headers(client):
    """Return Authorization headers for a logged-in analyst."""
    resp = client.post(
        "/api/auth/login", json={"username": "analyst", "password": "Analyst123!"}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture()
def reviewer_headers(client):
    """Return Authorization headers for a logged-in reviewer."""
    resp = client.post(
        "/api/auth/login", json={"username": "reviewer", "password": "Review123!"}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture()
def admin_headers(client):
    """Return Authorization headers for a logged-in admin."""
    resp = client.post(
        "/api/auth/login", json={"username": "admin", "password": "Admin123!"}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture()
def auditor_headers(client):
    """Return Authorization headers for a logged-in auditor."""
    resp = client.post(
        "/api/auth/login", json={"username": "auditor", "password": "Audit123!"}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}
