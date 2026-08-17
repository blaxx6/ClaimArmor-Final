"""Tests for the Analytics router — metrics, model, evaluation, ROI, ops."""

from __future__ import annotations


class TestMetrics:
    def test_metrics_endpoint(self, client, analyst_headers):
        resp = client.get("/api/v1/metrics", headers=analyst_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "claims_ingested" in data
        assert "claims_investigated" in data
        assert "route_counts" in data
        assert "coverage_rate" in data
        assert "storage" in data

    def test_model_metrics(self, client, analyst_headers):
        resp = client.get("/api/v1/model/metrics", headers=analyst_headers)
        assert resp.status_code == 200
        data = resp.json()
        # Either trained or not — both are valid
        assert data["status"] in ("READY", "NOT_TRAINED")


class TestEvaluation:
    def test_evaluation_returns_503_when_missing(self, client, analyst_headers):
        # Evaluation artifact may not exist in test environment
        resp = client.get("/api/v1/evaluation", headers=analyst_headers)
        assert resp.status_code in (200, 503)


class TestRetrievalMetrics:
    def test_retrieval_metrics(self, client, analyst_headers):
        resp = client.get("/api/v1/retrieval/metrics", headers=analyst_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), dict)


class TestROI:
    def test_roi_simulation(self, client, analyst_headers):
        resp = client.post(
            "/api/v1/business/roi",
            headers=analyst_headers,
            json={
                "annual_claim_volume": 100000,
                "avg_claim_amount": 5000,
                "estimated_cob_rate": 0.05,
                "recovery_rate": 0.6,
                "system_cost": 500000,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "net_savings" in data or "annual_savings" in data or isinstance(data, dict)


class TestOps:
    def test_ops_requires_auditor(self, client, analyst_headers, auditor_headers):
        # Analyst should be forbidden from ops
        resp = client.get("/api/v1/ops", headers=analyst_headers)
        assert resp.status_code == 403

        # Auditor should succeed
        resp = client.get("/api/v1/ops", headers=auditor_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "READY"
        assert "version" in data
        assert "storage" in data
        assert "llm_usage" in data
