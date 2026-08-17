"""Edge case tests — JWT, security headers, body limits, health, CORS."""

from __future__ import annotations


class TestAuthentication:
    def test_unauthenticated_returns_401(self, client):
        resp = client.get("/api/v1/claims")
        assert resp.status_code == 401

    def test_malformed_jwt_returns_401(self, client):
        resp = client.get(
            "/api/v1/claims",
            headers={"Authorization": "Bearer this.is.not.a.valid.jwt"},
        )
        assert resp.status_code == 401

    def test_empty_bearer_returns_401(self, client):
        resp = client.get(
            "/api/v1/claims", headers={"Authorization": "Bearer "}
        )
        assert resp.status_code == 401

    def test_wrong_password_returns_401(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"username": "analyst", "password": "WrongPassword!"},
        )
        assert resp.status_code == 401

    def test_nonexistent_user_returns_401(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"username": "nobody", "password": "NoBody123!"},
        )
        assert resp.status_code == 401


class TestSecurityHeaders:
    def test_security_headers_on_api_response(self, client, analyst_headers):
        resp = client.get("/api/v1/claims", headers=analyst_headers)
        assert resp.headers["x-content-type-options"] == "nosniff"
        assert resp.headers["x-frame-options"] == "DENY"
        assert resp.headers["referrer-policy"] == "no-referrer"
        assert "strict-transport-security" in resp.headers
        assert "permissions-policy" in resp.headers
        assert "x-request-id" in resp.headers

    def test_cache_control_on_api(self, client, analyst_headers):
        resp = client.get("/api/v1/claims", headers=analyst_headers)
        assert resp.headers.get("cache-control") == "no-store"

    def test_csp_on_api_response(self, client, analyst_headers):
        resp = client.get("/api/v1/claims", headers=analyst_headers)
        assert "content-security-policy" in resp.headers


class TestHealthEndpoint:
    def test_health_is_unauthenticated(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "version" in data

    def test_health_v1(self, client):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"


class TestTokenRefresh:
    def test_refresh_token_flow(self, client):
        # Login to get tokens
        login_resp = client.post(
            "/api/auth/login",
            json={"username": "analyst", "password": "Analyst123!"},
        )
        assert login_resp.status_code == 200
        tokens = login_resp.json()
        assert "refresh_token" in tokens

        # Use refresh token
        refresh_resp = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": tokens["refresh_token"]},
        )
        assert refresh_resp.status_code == 200
        new_tokens = refresh_resp.json()
        assert "access_token" in new_tokens

    def test_invalid_refresh_token(self, client):
        resp = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "invalid-token"},
        )
        assert resp.status_code in (401, 403)


class TestMeEndpoint:
    def test_me_returns_user_info(self, client, analyst_headers):
        resp = client.get("/api/v1/auth/me", headers=analyst_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "analyst"
        assert data["role"] == "ANALYST"
