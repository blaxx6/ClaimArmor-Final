"""Tests for the Admin router — user management, policy CRUD, LLM usage."""

from __future__ import annotations


class TestUserManagement:
    def test_admin_create_user(self, client, admin_headers):
        resp = client.post(
            "/api/v1/admin/users",
            headers=admin_headers,
            json={
                "username": "test_new_user",
                "password": "TestPass123!",
                "role": "ANALYST",
                "display_name": "Test New User",
            },
        )
        assert resp.status_code == 201
        assert resp.json()["username"] == "test_new_user"

    def test_admin_create_duplicate_user(self, client, admin_headers):
        resp = client.post(
            "/api/v1/admin/users",
            headers=admin_headers,
            json={
                "username": "analyst",  # Already seeded
                "password": "TestPass123!",
                "role": "ANALYST",
                "display_name": "Duplicate",
            },
        )
        assert resp.status_code == 409

    def test_admin_list_users(self, client, admin_headers):
        resp = client.get("/api/v1/admin/users", headers=admin_headers)
        assert resp.status_code == 200
        users = resp.json()
        assert isinstance(users, list)
        assert len(users) >= 4  # analyst, reviewer, auditor, admin

    def test_admin_deactivate_user(self, client, admin_headers):
        # Create a user first, then deactivate
        client.post(
            "/api/v1/admin/users",
            headers=admin_headers,
            json={
                "username": "to_deactivate",
                "password": "Deactivate123!",
                "role": "ANALYST",
                "display_name": "Deactivate Me",
            },
        )
        resp = client.post(
            "/api/v1/admin/users/to_deactivate/deactivate", headers=admin_headers
        )
        assert resp.status_code == 200
        assert resp.json()["active"] is False

    def test_admin_cannot_deactivate_self(self, client, admin_headers):
        resp = client.post(
            "/api/v1/admin/users/admin/deactivate", headers=admin_headers
        )
        assert resp.status_code == 400

    def test_non_admin_forbidden(self, client, analyst_headers):
        resp = client.get("/api/v1/admin/users", headers=analyst_headers)
        assert resp.status_code == 403

    def test_llm_usage(self, client, admin_headers):
        resp = client.get("/api/v1/admin/llm-usage", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), dict)


class TestPolicyManagement:
    def test_list_policies(self, client, analyst_headers):
        resp = client.get("/api/v1/policies", headers=analyst_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_policy(self, client, admin_headers):
        resp = client.post(
            "/api/v1/policies",
            headers=admin_headers,
            json={
                "policy_id": "TEST-POLICY-001",
                "version": "1.0",
                "title": "Test Policy",
                "section": "Test Section",
                "source_url": "https://example.com/policy",
                "authority": "CMS",
                "jurisdiction": "Federal",
                "effective_date": "2026-01-01",
                "topics": ["test", "policy"],
                "content_text": "This is a test policy document with enough content to pass validation checks for minimum length requirements.",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["policy_id"] == "TEST-POLICY-001"
        assert data["status"] == "ACTIVE"

    def test_retire_policy(self, client, admin_headers):
        # Create a policy first
        client.post(
            "/api/v1/policies",
            headers=admin_headers,
            json={
                "policy_id": "RETIRE-ME",
                "version": "1.0",
                "title": "Retire Me",
                "section": "Section",
                "source_url": "https://example.com",
                "authority": "CMS",
                "jurisdiction": "Federal",
                "effective_date": "2026-01-01",
                "topics": ["retire"],
                "content_text": "This policy is meant to be retired as part of automated testing for the ClaimArmor AI system.",
            },
        )
        resp = client.post(
            "/api/v1/policies/RETIRE-ME/1.0/retire", headers=admin_headers
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "RETIRED"

    def test_retire_policy_not_found(self, client, admin_headers):
        resp = client.post(
            "/api/v1/policies/NONEXISTENT/9.9/retire", headers=admin_headers
        )
        assert resp.status_code == 404
