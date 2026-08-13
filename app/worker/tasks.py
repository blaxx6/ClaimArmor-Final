"""Celery task definitions for async claim investigation.

Tasks:
- investigate_claim_async: Single claim investigation with retry + DLQ
- batch_investigate: Batch investigation for CSV/EDI uploads
- retrain_model: Scheduled model retraining with MLflow logging
- check_model_drift: Periodic drift detection via PSI
- cleanup_expired_tasks: Housekeeping for old task records
"""

from __future__ import annotations

import logging
import time
from typing import Any

from app.worker import celery_app

logger = logging.getLogger("claimarmor.worker")


@celery_app.task(
    bind=True,
    name="app.worker.tasks.investigate_claim_async",
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
    queue="claimarmor.high",
)
def investigate_claim_async(
    self,
    claim_id: str,
    tenant_id: str = "default",
) -> dict[str, Any]:
    """Investigate a single claim asynchronously.

    Updates task_status table at each stage for real-time progress.
    On failure, retries with exponential backoff then routes to DLQ.
    """
    from app import db
    from app.services.pipeline import investigate

    task_id = self.request.id or f"local-{claim_id}"

    try:
        # Mark as in-progress
        db.update_task_status(task_id, "IN_PROGRESS")
        logger.info("Starting investigation claim_id=%s task_id=%s", claim_id, task_id)

        claim = db.get_claim(claim_id)
        if not claim:
            db.update_task_status(task_id, "FAILED", error="Claim not found")
            return {"status": "FAILED", "error": "Claim not found"}

        started = time.perf_counter()
        result = investigate(claim).model_dump(mode="json")
        duration_ms = round((time.perf_counter() - started) * 1000, 2)

        db.update_task_status(task_id, "COMPLETE", result=result)
        logger.info(
            "Investigation complete claim_id=%s route=%s duration_ms=%s",
            claim_id,
            result.get("route"),
            duration_ms,
        )

        return {
            "status": "COMPLETE",
            "claim_id": claim_id,
            "route": result.get("route"),
            "confidence": result.get("confidence"),
            "duration_ms": duration_ms,
        }

    except Exception as exc:
        logger.exception("Investigation failed claim_id=%s", claim_id)
        try:
            db.update_task_status(
                task_id,
                "RETRYING" if self.request.retries < self.max_retries else "FAILED",
                error=f"{type(exc).__name__}: {str(exc)[:500]}",
            )
        except Exception:
            pass
        raise self.retry(
            exc=exc,
            countdown=30 * (2 ** self.request.retries),  # Exponential backoff
        )


@celery_app.task(
    bind=True,
    name="app.worker.tasks.batch_investigate",
    max_retries=1,
    queue="claimarmor.bulk",
)
def batch_investigate(
    self,
    claim_ids: list[str],
    tenant_id: str = "default",
) -> dict[str, Any]:
    """Batch investigate multiple claims (for CSV/EDI uploads)."""
    from app import db

    results = {"processed": 0, "failed": 0, "claim_results": []}

    for claim_id in claim_ids:
        try:
            result = investigate_claim_async.apply(
                args=[claim_id, tenant_id],
            ).get(timeout=120)
            results["claim_results"].append(result)
            results["processed"] += 1
        except Exception as exc:
            logger.warning("Batch item failed claim_id=%s: %s", claim_id, exc)
            results["claim_results"].append({
                "status": "FAILED",
                "claim_id": claim_id,
                "error": str(exc)[:200],
            })
            results["failed"] += 1

    return results


@celery_app.task(
    name="app.worker.tasks.retrain_model",
    queue="claimarmor.bulk",
)
def retrain_model(
    rows: int = 3000,
    seed: int = 42,
) -> dict[str, Any]:
    """Retrain the risk model and log to MLflow if configured."""
    from pathlib import Path
    from app.ml.train import train
    from app.ml.generate import write_dataset

    dataset_path = Path("artifacts/synthetic_claims.csv")
    model_path = Path("artifacts/risk_model.joblib")
    metrics_path = Path("artifacts/model_metrics.json")

    write_dataset(dataset_path, rows, seed)
    metrics = train(dataset_path, model_path, metrics_path, seed)

    # Try MLflow registration
    try:
        from app.ml.registry import register_model
        register_model(model_path, metrics)
        metrics["mlflow_registered"] = True
    except Exception as exc:
        logger.warning("MLflow registration skipped: %s", exc)
        metrics["mlflow_registered"] = False

    return metrics


@celery_app.task(
    name="app.worker.tasks.check_model_drift",
    queue="claimarmor",
)
def check_model_drift() -> dict[str, Any]:
    """Check for feature distribution drift using PSI."""
    try:
        from app.ml.drift import compute_drift_report
        report = compute_drift_report()
        if report.get("drift_detected"):
            logger.warning("Model drift detected: %s", report)
            from app.services.notifications import alert_model_drift
            alert_model_drift(report)
        return report
    except Exception as exc:
        logger.info("Drift check skipped: %s", exc)
        return {"status": "SKIPPED", "reason": str(exc)[:200]}


@celery_app.task(
    name="app.worker.tasks.cleanup_expired_tasks",
    queue="claimarmor",
)
def cleanup_expired_tasks() -> dict[str, int]:
    """Remove task records older than 7 days."""
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import delete as sql_delete

    from app import db as db_module

    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    engine = db_module._engine()
    with engine.begin() as conn:
        result = conn.execute(
            sql_delete(db_module.tasks_table).where(
                db_module.tasks_table.c.created_at < cutoff
            )
        )
    return {"deleted": result.rowcount}
