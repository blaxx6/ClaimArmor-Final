"""Tests for the Claims router — CRUD, CSV upload, EDI upload, pagination."""

from __future__ import annotations


class TestClaimsCRUD:
    def test_list_claims(self, client, analyst_headers):
        resp = client.get("/api/v1/claims", headers=analyst_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        assert len(resp.json()) >= 3  # 3 seeded demo claims

    def test_list_claims_with_pagination(self, client, analyst_headers):
        resp = client.get("/api/v1/claims?limit=2&offset=0", headers=analyst_headers)
        assert resp.status_code == 200
        assert len(resp.json()) <= 2

    def test_create_claim(self, client, analyst_headers):
        payload = {
            "claim_id": "CLM-TEST-NEW-001",
            "member_name": "Test User",
            "member_dob": "1990-01-15",
            "service_date": "2026-07-01",
            "amount": 5000,
            "submitted_payer": "EMPLOYER_PLAN",
        }
        resp = client.post("/api/v1/claims", headers=analyst_headers, json=payload)
        assert resp.status_code == 201
        assert resp.json()["claim_id"] == "CLM-TEST-NEW-001"

    def test_create_claim_duplicate_returns_409(self, client, analyst_headers):
        payload = {
            "claim_id": "CLM-SAFE-001",  # Already seeded
            "member_name": "Rohan Kapoor",
            "member_dob": "1988-11-03",
            "service_date": "2025-06-12",
            "amount": 1250,
            "submitted_payer": "EMPLOYER_PLAN",
        }
        resp = client.post("/api/v1/claims", headers=analyst_headers, json=payload)
        assert resp.status_code == 409

    def test_claim_detail(self, client, analyst_headers):
        resp = client.get("/api/v1/claims/CLM-SAFE-001", headers=analyst_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "claim" in data
        assert "investigation" in data
        assert data["claim"]["claim_id"] == "CLM-SAFE-001"

    def test_claim_detail_not_found(self, client, analyst_headers):
        resp = client.get("/api/v1/claims/NONEXISTENT", headers=analyst_headers)
        assert resp.status_code == 404

    def test_create_claim_requires_analyst_role(self, client, reviewer_headers):
        payload = {
            "claim_id": "CLM-FORBIDDEN",
            "member_name": "Forbidden User",
            "member_dob": "1990-01-01",
            "service_date": "2026-01-01",
            "amount": 100,
            "submitted_payer": "PLAN",
        }
        resp = client.post("/api/v1/claims", headers=reviewer_headers, json=payload)
        assert resp.status_code == 403


class TestCSVUpload:
    def test_upload_csv_valid(self, client, analyst_headers):
        csv_text = (
            "claim_id,member_name,member_dob,member_id,service_date,amount,"
            "submitted_payer,claim_type,accident_related,diagnosis_group\n"
            "CLM-CSV-001,Test User,1990-01-15,MBR-1002,2026-07-01,5000,"
            "EMPLOYER_PLAN,MEDICAL,false,GENERAL\n"
        )
        resp = client.post(
            "/api/v1/claims/upload-csv",
            headers=analyst_headers,
            json={"csv_text": csv_text},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["summary"]["created"] == 1
        assert "CLM-CSV-001" in data["created"]

    def test_upload_csv_missing_columns(self, client, analyst_headers):
        csv_text = "claim_id,member_name\nCLM-BAD,Bad User\n"
        resp = client.post(
            "/api/v1/claims/upload-csv",
            headers=analyst_headers,
            json={"csv_text": csv_text},
        )
        assert resp.status_code == 422

    def test_upload_csv_duplicate_skipped(self, client, analyst_headers):
        csv_text = (
            "claim_id,member_name,member_dob,member_id,service_date,amount,"
            "submitted_payer\n"
            "CLM-SAFE-001,Rohan Kapoor,1988-11-03,MBR-1002,2025-06-12,1250,"
            "EMPLOYER_PLAN\n"
        )
        resp = client.post(
            "/api/v1/claims/upload-csv",
            headers=analyst_headers,
            json={"csv_text": csv_text},
        )
        assert resp.status_code == 200
        assert resp.json()["summary"]["duplicates"] == 1


class TestEDIUpload:
    def test_upload_edi_invalid(self, client, analyst_headers):
        resp = client.post(
            "/api/v1/claims/upload-edi",
            headers=analyst_headers,
            json={"edi_text": "not valid EDI"},
        )
        assert resp.status_code == 422
