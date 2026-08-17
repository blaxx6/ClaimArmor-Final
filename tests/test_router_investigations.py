"""Tests for the Investigations router — sync, async, stream, review, replay."""

from __future__ import annotations

import json


class TestSyncInvestigation:
    def test_investigate_returns_valid_route(self, client, analyst_headers):
        resp = client.post(
            "/api/v1/claims/CLM-SAFE-001/investigate", headers=analyst_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["route"] in ("CLEAR", "HOLD", "HUMAN_REVIEW", "UNDETERMINED")
        assert "confidence" in data
        assert "risk" in data
        assert "evidence" in data

    def test_investigate_not_found(self, client, analyst_headers):
        resp = client.post(
            "/api/v1/claims/NONEXISTENT/investigate", headers=analyst_headers
        )
        assert resp.status_code == 404


class TestAsyncInvestigation:
    def test_async_investigate_returns_task_id(self, client, analyst_headers):
        resp = client.post(
            "/api/v1/claims/CLM-SAFE-001/investigate-async", headers=analyst_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "task_id" in data
        assert data["claim_id"] == "CLM-SAFE-001"
        assert data["status"] == "QUEUED"

    def test_task_status_polling(self, client, analyst_headers):
        # First create a task
        create_resp = client.post(
            "/api/v1/claims/CLM-SAFE-001/investigate-async", headers=analyst_headers
        )
        task_id = create_resp.json()["task_id"]

        # Poll the task (should be COMPLETE since Celery falls back to sync)
        resp = client.get(f"/api/v1/tasks/{task_id}", headers=analyst_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["task_id"] == task_id
        assert data["status"] in ("QUEUED", "IN_PROGRESS", "COMPLETE")

    def test_task_status_not_found(self, client, analyst_headers):
        resp = client.get(
            "/api/v1/tasks/00000000-0000-0000-0000-000000000000",
            headers=analyst_headers,
        )
        assert resp.status_code == 404


class TestStreamInvestigation:
    def test_stream_returns_ndjson_events(self, client, analyst_headers):
        with client.stream(
            "POST",
            "/api/v1/claims/CLM-HOLD-001/investigate-stream",
            headers=analyst_headers,
        ) as resp:
            assert resp.status_code == 200
            events = [json.loads(line) for line in resp.iter_lines() if line]

        # Verify event structure
        assert len(events) > 0
        agent_events = [e for e in events if e["type"] == "agent"]
        assert len(agent_events) >= 5  # At least 5 agents in pipeline
        assert events[-1]["type"] == "complete"

    def test_stream_not_found(self, client, analyst_headers):
        resp = client.post(
            "/api/v1/claims/NONEXISTENT/investigate-stream", headers=analyst_headers
        )
        assert resp.status_code == 404


class TestReviewWorkflow:
    def test_investigation_list(self, client, analyst_headers):
        # Run an investigation first to populate the list
        client.post("/api/v1/claims/CLM-SAFE-001/investigate", headers=analyst_headers)
        resp = client.get("/api/v1/investigations", headers=analyst_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_review_queue(self, client, analyst_headers, reviewer_headers):
        # Investigate a HOLD claim to populate the review queue
        client.post("/api/v1/claims/CLM-HOLD-001/investigate", headers=analyst_headers)
        resp = client.get("/api/v1/review-queue", headers=reviewer_headers)
        assert resp.status_code == 200
        queue = resp.json()
        assert isinstance(queue, list)

    def test_review_approve(self, client, analyst_headers, reviewer_headers):
        # Investigate a claim then approve it
        client.post("/api/v1/claims/CLM-HOLD-001/investigate", headers=analyst_headers)
        resp = client.post(
            "/api/v1/investigations/CLM-HOLD-001/review",
            headers=reviewer_headers,
            json={
                "action": "APPROVE",
                "reason": "Verified via test",
                "final_route": "HOLD",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["review"]["action"] == "APPROVE"
        assert data["writeback"] is not None
        assert data["writeback"]["reviewer"] == "reviewer"

    def test_review_not_found(self, client, reviewer_headers):
        resp = client.post(
            "/api/v1/investigations/NONEXISTENT/review",
            headers=reviewer_headers,
            json={"action": "APPROVE", "reason": "test"},
        )
        assert resp.status_code == 404


class TestReplay:
    def test_replay_claim(self, client, analyst_headers, reviewer_headers):
        # Investigate first
        client.post("/api/v1/claims/CLM-SAFE-001/investigate", headers=analyst_headers)
        # Replay
        resp = client.post(
            "/api/v1/claims/CLM-SAFE-001/replay", headers=reviewer_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "before" in data
        assert "after" in data
        assert "comparison" in data

    def test_replay_not_found(self, client, reviewer_headers):
        resp = client.post(
            "/api/v1/claims/NONEXISTENT/replay", headers=reviewer_headers
        )
        assert resp.status_code == 404


class TestAudit:
    def test_audit_trail(self, client, analyst_headers):
        resp = client.get("/api/v1/audit/CLM-SAFE-001", headers=analyst_headers)
        assert resp.status_code == 200
        trail = resp.json()
        assert isinstance(trail, list)
        assert len(trail) >= 1  # At least the CLAIM_INGESTED event

    def test_audit_verify(self, client, analyst_headers):
        resp = client.get("/api/v1/audit/CLM-SAFE-001/verify", headers=analyst_headers)
        assert resp.status_code == 200

    def test_audit_not_found(self, client, analyst_headers):
        resp = client.get("/api/v1/audit/NONEXISTENT", headers=analyst_headers)
        assert resp.status_code == 404
