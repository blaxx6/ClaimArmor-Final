"""ClaimArmor AI — Locust load test suite.

Run with:
    locust -f tests/locustfile.py --host http://localhost:8000

Or headless:
    locust -f tests/locustfile.py --host http://localhost:8000 \
           --headless -u 20 -r 5 --run-time 60s
"""

from __future__ import annotations

import uuid

from locust import HttpUser, between, task


class ClaimArmorUser(HttpUser):
    """Simulates an analyst user interacting with the ClaimArmor API."""

    wait_time = between(0.5, 2.0)
    token: str | None = None

    def on_start(self):
        """Authenticate as analyst on start."""
        resp = self.client.post(
            "/api/v1/auth/login",
            json={"username": "analyst", "password": "Analyst123!"},
            name="/api/v1/auth/login",
        )
        if resp.status_code == 200:
            self.token = resp.json()["access_token"]
        else:
            self.token = None

    @property
    def auth_headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    @task(1)
    def health_check(self):
        """GET /api/health — lightweight warmup."""
        self.client.get("/api/v1/health", name="/api/v1/health")

    @task(3)
    def list_claims(self):
        """GET /api/v1/claims — paginated list."""
        self.client.get(
            "/api/v1/claims?limit=20&offset=0",
            headers=self.auth_headers,
            name="/api/v1/claims",
        )

    @task(2)
    def get_claim_detail(self):
        """GET /api/v1/claims/{id} — single claim with investigation."""
        self.client.get(
            "/api/v1/claims/CLM-SAFE-001",
            headers=self.auth_headers,
            name="/api/v1/claims/{claim_id}",
        )

    @task(5)
    def investigate_claim(self):
        """POST /api/v1/claims/{id}/investigate — full sync investigation."""
        self.client.post(
            "/api/v1/claims/CLM-SAFE-001/investigate",
            headers=self.auth_headers,
            name="/api/v1/claims/{claim_id}/investigate",
        )

    @task(2)
    def investigate_async(self):
        """POST /api/v1/claims/{id}/investigate-async — async investigation."""
        self.client.post(
            "/api/v1/claims/CLM-HOLD-001/investigate-async",
            headers=self.auth_headers,
            name="/api/v1/claims/{claim_id}/investigate-async",
        )

    @task(2)
    def get_metrics(self):
        """GET /api/v1/metrics — analytics dashboard."""
        self.client.get(
            "/api/v1/metrics",
            headers=self.auth_headers,
            name="/api/v1/metrics",
        )

    @task(1)
    def review_queue(self):
        """GET /api/v1/review-queue — check pending reviews."""
        self.client.get(
            "/api/v1/review-queue",
            headers=self.auth_headers,
            name="/api/v1/review-queue",
        )

    @task(1)
    def list_investigations(self):
        """GET /api/v1/investigations — list past investigations."""
        self.client.get(
            "/api/v1/investigations?limit=10&offset=0",
            headers=self.auth_headers,
            name="/api/v1/investigations",
        )

    @task(1)
    def create_and_investigate(self):
        """POST a new claim and immediately investigate it."""
        claim_id = f"CLM-LOAD-{uuid.uuid4().hex[:8].upper()}"
        create_resp = self.client.post(
            "/api/v1/claims",
            headers=self.auth_headers,
            json={
                "claim_id": claim_id,
                "member_name": "Load Test User",
                "member_dob": "1990-05-15",
                "member_id": "MBR-1002",
                "service_date": "2026-08-01",
                "amount": 3500,
                "submitted_payer": "EMPLOYER_PLAN",
                "claim_type": "MEDICAL",
                "accident_related": False,
                "diagnosis_group": "GENERAL",
            },
            name="/api/v1/claims [CREATE]",
        )
        if create_resp.status_code == 201:
            self.client.post(
                f"/api/v1/claims/{claim_id}/investigate",
                headers=self.auth_headers,
                name="/api/v1/claims/{claim_id}/investigate [NEW]",
            )
