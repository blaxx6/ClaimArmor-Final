from __future__ import annotations

from typing import Callable, Any

class Rule:
    def __init__(self, rule_id: str, outcome: str, condition: Callable[[dict, list[dict]], bool], get_payer: Callable[[list[dict]], str | None], reason: str):
        self.rule_id = rule_id
        self.outcome = outcome
        self.condition = condition
        self.get_payer = get_payer
        self.reason = reason

RULES = [
    Rule(
        rule_id="COB-SINGLE-001",
        outcome="CLEAR",
        condition=lambda claim, live: len(live) == 1,
        get_payer=lambda live: live[0]["payer"] if live else None,
        reason="Only one coverage is active on the service date.",
    ),
    Rule(
        rule_id="COB-ACCIDENT-001",
        outcome="HOLD",
        condition=lambda claim, live: bool(claim.get("accident_related")) and any(item["kind"] == "AUTO" for item in live),
        get_payer=lambda live: next((item["payer"] for item in live if item["kind"] == "AUTO"), None),
        reason="Accident-related claim has active auto coverage; investigate auto payer primacy.",
    ),
    Rule(
        rule_id="MSP-DUAL-001",
        outcome="REVIEW",
        condition=lambda claim, live: any(item["kind"] == "MEDICARE" for item in live) and any(item["kind"] == "EMPLOYER" for item in live),
        get_payer=lambda live: None,
        reason="Employer and Medicare coverages overlap; employment and beneficiary facts are required.",
    ),
    Rule(
        rule_id="COB-NO-COVERAGE-001",
        outcome="UNDETERMINED",
        condition=lambda claim, live: not live,
        get_payer=lambda live: None,
        reason="No coverage is active on the service date.",
    )
]

def evaluate_rules(claim: dict, coverage_timeline: list[dict]) -> list[dict]:
    live = [
        coverage for coverage in coverage_timeline if coverage["active_on_service_date"]
    ]
    results = []
    print("DEBUG evaluate_rules claim:", claim)
    print("DEBUG evaluate_rules live:", live)
    
    for rule in RULES:
        if rule.condition(claim, live):
            results.append({
                "rule_id": rule.rule_id,
                "outcome": rule.outcome,
                "payer": rule.get_payer(live),
                "reason": rule.reason,
            })
            
    return results
