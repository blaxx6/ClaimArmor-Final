from __future__ import annotations

import logging

from app import db
from app.schemas import InvestigationResult
from app.services.agents import run_agents, stream_agents
from app.services.matching import active_coverages, match_member
from app.services.risk import score_risk
from app.services.rules import evaluate_rules

logger = logging.getLogger("claimarmor.pipeline")


def send_email_notification(claim_id: str, status: str, route: str) -> None:
    """
    Stub for email notifications.
    TODO: Integrate actual SMTP backend. Currently acts as a No-Op.
    """
    logger.info("EMAIL NOTIFICATION: Claim %s completed with status %s, route: %s", claim_id, status, route)


def _finalize(
    claim: dict,
    match: dict,
    timeline: list[dict],
    risk: dict,
    rules: list[dict],
    agent_result: dict,
) -> InvestigationResult:
    limitations = [
        "All claim and member data are synthetic.",
        "The calibrated XGBoost model was trained and evaluated only on synthetic scenarios; real-payer calibration is still required.",
        "Policy snippets are a curated demonstration corpus and require authoritative validation for real use.",
    ]
    result = InvestigationResult(
        claim_id=claim["claim_id"],
        member_match=match,
        coverage_timeline=timeline,
        risk=risk,
        rules=rules,
        evidence=agent_result["evidence"],
        agent_trace=agent_result["trace"],
        recommended_primary_payer=agent_result["payer"],
        route=agent_result["route"],
        confidence=agent_result["confidence"],
        financial_impact=agent_result["financial"],
        explanation=agent_result["explanation"],
        limitations=limitations,
    )
    payload = result.model_dump(mode="json")
    db.put_investigation(claim["claim_id"], payload)
    db.append_audit(
        claim["claim_id"],
        "INVESTIGATION_COMPLETED",
        {
            "route": result.route.value,
            "confidence": result.confidence,
            "risk": result.risk["probability"],
        },
    )
    send_email_notification(claim["claim_id"], "INVESTIGATION_COMPLETED", result.route.value)
    return result


def investigate(claim: dict) -> InvestigationResult:
    members = db.list_members(claim.get("tenant_id"))
    match = match_member(claim, members)
    coverages = db.list_coverages(match["member_id"]) if match["member_id"] else []
    timeline = active_coverages(match["member_id"], claim["service_date"], coverages)
    risk = score_risk(claim, timeline, match["confidence"])
    rules = evaluate_rules(claim, timeline)
    return _finalize(
        claim,
        match,
        timeline,
        risk,
        rules,
        run_agents(claim, match, timeline, risk, rules),
    )


def investigate_events(claim: dict):
    members = db.list_members(claim.get("tenant_id"))
    match = match_member(claim, members)
    coverages = db.list_coverages(match["member_id"]) if match["member_id"] else []
    timeline = active_coverages(match["member_id"], claim["service_date"], coverages)
    risk = score_risk(claim, timeline, match["confidence"])
    rules = evaluate_rules(claim, timeline)
    for event in stream_agents(claim, match, timeline, risk, rules):
        if event["type"] == "agent":
            yield event
        else:
            result = _finalize(claim, match, timeline, risk, rules, event["data"])
            yield {"type": "complete", "data": result.model_dump(mode="json")}
