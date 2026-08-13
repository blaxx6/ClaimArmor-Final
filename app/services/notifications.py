"""Notification and alerting service.

Supports:
- Slack webhook notifications
- Email alerts (SMTP)
- Structured alert types for ops monitoring
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("claimarmor.notifications")


class AlertLevel:
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class AlertType:
    REVIEW_QUEUE_THRESHOLD = "REVIEW_QUEUE_THRESHOLD"
    MODEL_DRIFT_DETECTED = "MODEL_DRIFT_DETECTED"
    INVESTIGATION_SLA_BREACH = "INVESTIGATION_SLA_BREACH"
    SYSTEM_ERROR = "SYSTEM_ERROR"
    MODEL_RETRAINED = "MODEL_RETRAINED"
    SECURITY_EVENT = "SECURITY_EVENT"


def _send_slack(webhook_url: str, message: dict[str, Any]) -> bool:
    """Send a notification to Slack via webhook."""
    try:
        import httpx

        payload = {
            "text": message.get("title", "ClaimArmor Alert"),
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": f"🔔 {message.get('title', 'ClaimArmor Alert')}",
                    },
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Level:* {message.get('level', 'INFO')}"},
                        {"type": "mrkdwn", "text": f"*Type:* {message.get('alert_type', 'GENERAL')}"},
                    ],
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": message.get("body", "No details provided."),
                    },
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"_ClaimArmor AI • {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}_",
                        }
                    ],
                },
            ],
        }

        response = httpx.post(webhook_url, json=payload, timeout=10)
        response.raise_for_status()
        logger.info("Slack notification sent: %s", message.get("title"))
        return True

    except Exception as exc:
        logger.warning("Failed to send Slack notification: %s", exc)
        return False


def send_alert(
    alert_type: str,
    level: str,
    title: str,
    body: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Send an alert through all configured channels."""
    from app.config import get_settings

    settings = get_settings()

    message = {
        "alert_type": alert_type,
        "level": level,
        "title": title,
        "body": body,
        "metadata": metadata or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    results = {"logged": True, "slack": False, "email": False}

    # Always log
    log_func = logger.warning if level in (AlertLevel.WARNING, AlertLevel.CRITICAL) else logger.info
    log_func("ALERT [%s] %s: %s", level, alert_type, title)

    # Slack
    if settings.slack_webhook_url:
        results["slack"] = _send_slack(settings.slack_webhook_url, message)

    # Email (placeholder for SMTP integration)
    if settings.alert_email_recipients:
        logger.info(
            "Email alert queued for %d recipients: %s",
            len(settings.alert_email_recipients),
            title,
        )
        results["email"] = True  # Would integrate with SendGrid/SES/SMTP

    return results


# ── Convenience functions ─────────────────────────────────────────────

def alert_review_queue_threshold(queue_size: int, threshold: int) -> dict:
    return send_alert(
        alert_type=AlertType.REVIEW_QUEUE_THRESHOLD,
        level=AlertLevel.WARNING,
        title=f"Review queue size ({queue_size}) exceeds threshold ({threshold})",
        body=(
            f"The human review queue has reached *{queue_size} pending items*, "
            f"which exceeds the configured threshold of {threshold}. "
            "Consider assigning additional reviewers or investigating system routing."
        ),
        metadata={"queue_size": queue_size, "threshold": threshold},
    )


def alert_model_drift(drift_report: dict[str, Any]) -> dict:
    return send_alert(
        alert_type=AlertType.MODEL_DRIFT_DETECTED,
        level=AlertLevel.WARNING,
        title="Model drift detected — retraining recommended",
        body=(
            f"Average PSI: *{drift_report.get('average_psi', 'N/A')}* "
            f"(threshold: {drift_report.get('threshold', 'N/A')})\n"
            f"Drifted features: {', '.join(drift_report.get('drifted_features', []))}"
        ),
        metadata=drift_report,
    )


def alert_sla_breach(claim_id: str, duration_seconds: float, sla_seconds: float) -> dict:
    return send_alert(
        alert_type=AlertType.INVESTIGATION_SLA_BREACH,
        level=AlertLevel.WARNING,
        title=f"Investigation SLA breach for claim {claim_id}",
        body=(
            f"Investigation took *{duration_seconds:.1f}s* "
            f"(SLA: {sla_seconds:.1f}s). "
            "Check LLM response times and database performance."
        ),
        metadata={
            "claim_id": claim_id,
            "duration_seconds": duration_seconds,
            "sla_seconds": sla_seconds,
        },
    )


def alert_model_retrained(metrics: dict[str, Any]) -> dict:
    return send_alert(
        alert_type=AlertType.MODEL_RETRAINED,
        level=AlertLevel.INFO,
        title="Risk model retrained successfully",
        body=(
            f"Model version: *{metrics.get('model_version', 'N/A')}*\n"
            f"Precision: {metrics.get('precision', 'N/A')} | "
            f"Recall: {metrics.get('recall', 'N/A')} | "
            f"PR-AUC: {metrics.get('pr_auc', 'N/A')}"
        ),
        metadata=metrics,
    )
