import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app import db
from app.auth import require_roles
from app.schemas import AsyncTaskResponse, ReviewRequest, StreamSimulationRequest, TaskStatus, TaskStatusResponse
from app.services.pipeline import investigate, investigate_events

logger = logging.getLogger("claimarmor.api.investigations")
router = APIRouter(tags=["Investigations"])

@router.get("/api/claims/{claim_id}", summary="Get claim detail", tags=["Claims"])
@router.get("/api/v1/claims/{claim_id}", summary="Get claim detail (v1)", tags=["Claims"])
def claim_detail(
    claim_id: str, user: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR"))
) -> dict:
    claim = db.get_claim(claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")
    
    db.append_audit(
        claim_id, "PHI_ACCESSED", {"actor": user["username"]}
    )
    
    return {"claim": claim, "investigation": db.get_investigation(claim_id)}


@router.post("/api/claims/{claim_id}/investigate", summary="Investigate claim (sync)")
@router.post("/api/v1/claims/{claim_id}/investigate", summary="Investigate claim (sync, v1)")
def investigate_claim(
    claim_id: str, user: dict = Depends(require_roles("ANALYST", "REVIEWER"))
) -> dict:
    """Synchronous investigation (backward-compatible)."""
    claim = db.get_claim(claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")
    db.append_audit(
        claim_id, "INVESTIGATION_REQUESTED", {"actor": user["username"], "mode": "sync"}
    )
    result = investigate(claim).model_dump(mode="json")
    
    try:
        from app.main import INVESTIGATIONS
        INVESTIGATIONS.labels(result.get("route", "UNKNOWN"), "sync").inc()
    except Exception:
        pass
        
    return result


@router.post("/api/v1/claims/{claim_id}/investigate-async", summary="Investigate claim (async)")
def investigate_claim_async(
    claim_id: str,
    user: dict = Depends(require_roles("ANALYST", "REVIEWER")),
) -> dict:
    """Submit an investigation to the async Celery queue."""
    claim = db.get_claim(claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")

    task_id = str(uuid.uuid4())
    tenant_id = user.get("tenant_id", "default")

    # Create task tracking record
    db.create_task(task_id=task_id, claim_id=claim_id, tenant_id=tenant_id)
    db.append_audit(
        claim_id,
        "INVESTIGATION_REQUESTED",
        {"actor": user["username"], "mode": "async", "task_id": task_id},
    )

    # Submit to Celery
    try:
        from app.worker.tasks import investigate_claim_async as celery_task

        celery_task.apply_async(
            args=[claim_id, tenant_id],
            task_id=task_id,
            queue="claimarmor.high",
        )
    except Exception as exc:
        # Celery unavailable — fall back to sync
        logger.warning("Celery unavailable, falling back to sync: %s", exc)
        db.update_task_status(task_id, "IN_PROGRESS")
        try:
            result = investigate(claim).model_dump(mode="json")
            db.put_investigation(claim_id, result)
            db.append_audit(claim_id, "INVESTIGATION_COMPLETED", result)
            db.update_task_status(task_id, "COMPLETE", result=result)
        except Exception as inner_exc:
            db.update_task_status(task_id, "FAILED", error=str(inner_exc)[:500])

    return AsyncTaskResponse(
        task_id=task_id,
        claim_id=claim_id,
        status=TaskStatus.QUEUED,
    ).model_dump()


@router.get("/api/v1/tasks/{task_id}", summary="Poll async task status")
def get_task_status(
    task_id: str,
    _: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR")),
) -> dict:
    """Poll for async task completion."""
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return TaskStatusResponse(
        task_id=task["task_id"],
        claim_id=task["claim_id"],
        status=TaskStatus(task["status"]),
        result=task.get("result"),
        error=task.get("error"),
        created_at=str(task.get("created_at")) if task.get("created_at") else None,
        updated_at=str(task.get("updated_at")) if task.get("updated_at") else None,
    ).model_dump()


@router.post("/api/claims/{claim_id}/investigate-stream", summary="Investigate claim (streamed)")
@router.post("/api/v1/claims/{claim_id}/investigate-stream", summary="Investigate claim (streamed, v1)")
def investigate_claim_stream(
    claim_id: str, user: dict = Depends(require_roles("ANALYST", "REVIEWER"))
) -> StreamingResponse:
    claim = db.get_claim(claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")
    db.append_audit(
        claim_id,
        "INVESTIGATION_REQUESTED",
        {"actor": user["username"], "mode": "stream"},
    )

    def generate():
        try:
            for event in investigate_events(claim):
                if event.get("type") == "complete":
                    db.put_investigation(claim_id, event["data"])
                    db.append_audit(claim_id, "INVESTIGATION_COMPLETED", event["data"])
                yield json.dumps(event, default=str) + "\n"
        except Exception as exc:
            logger.exception("streamed investigation failed claim_id=%s", claim_id)
            yield json.dumps({"type": "error", "error": type(exc).__name__}) + "\n"

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-store"},
    )


@router.post("/api/stream/simulate", summary="Simulate batch stream")
@router.post("/api/v1/stream/simulate", summary="Simulate batch stream (v1)")
def simulate_claim_stream(
    request: StreamSimulationRequest, user: dict = Depends(require_roles("ANALYST"))
) -> dict:
    events = []
    for sequence, claim_id in enumerate(request.claim_ids, start=1):
        claim = db.get_claim(claim_id)
        if not claim:
            events.append(
                {"sequence": sequence, "claim_id": claim_id, "status": "NOT_FOUND"}
            )
            continue
        db.append_audit(
            claim_id,
            "STREAM_EVENT_RECEIVED",
            {"sequence": sequence, "actor": user["username"]},
        )
        result = investigate(claim).model_dump(mode="json")
        events.append(
            {
                "sequence": sequence,
                "claim_id": claim_id,
                "status": "PROCESSED",
                "route": result["route"],
                "confidence": result["confidence"],
            }
        )
    return {
        "stream_id": str(uuid.uuid4()),
        "events": events,
        "processed": sum(event["status"] == "PROCESSED" for event in events),
    }


@router.post("/api/claims/{claim_id}/replay", summary="Replay investigation")
@router.post("/api/v1/claims/{claim_id}/replay", summary="Replay investigation (v1)")
def replay_claim(
    claim_id: str, user: dict = Depends(require_roles("REVIEWER", "AUDITOR"))
) -> dict:
    claim = db.get_claim(claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")
    before = db.get_investigation(claim_id)
    after = investigate(claim).model_dump(mode="json")
    comparison = {
        "route_changed": bool(before and before["route"] != after["route"]),
        "confidence_delta": round(after["confidence"] - before["confidence"], 4)
        if before
        else None,
        "model_before": before["risk"]["model_version"] if before else None,
        "model_after": after["risk"]["model_version"],
        "evidence_before": [
            item["document_hash"] for item in before.get("evidence", [])
        ]
        if before
        else [],
        "evidence_after": [item["document_hash"] for item in after["evidence"]],
    }
    db.append_audit(
        claim_id, "INVESTIGATION_REPLAYED", {"actor": user["username"], **comparison}
    )
    return {
        "claim_id": claim_id,
        "before": before,
        "after": after,
        "comparison": comparison,
    }


@router.get("/api/investigations", summary="List investigations")
@router.get("/api/v1/investigations", summary="List investigations (v1)")
def investigations(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR")),
) -> list[dict]:
    return db.list_investigations(user.get("tenant_id"), limit=limit, offset=offset)


@router.get("/api/review-queue", summary="Get review queue")
@router.get("/api/v1/review-queue", summary="Get review queue (v1)")
def review_queue(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR")),
) -> list[dict]:
    return db.list_pending_reviews(user.get("tenant_id"), limit=limit, offset=offset)


@router.get("/api/reviews/completed", summary="Get completed reviews history")
@router.get("/api/v1/reviews/completed", summary="Get completed reviews history (v1)")
def completed_reviews(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR")),
) -> list[dict]:
    return db.list_completed_reviews(user.get("tenant_id"), limit=limit, offset=offset)


@router.post("/api/investigations/{claim_id}/review", summary="Submit review decision")
@router.post("/api/v1/investigations/{claim_id}/review", summary="Submit review decision (v1)")
def review(
    claim_id: str,
    request: ReviewRequest,
    user: dict = Depends(require_roles("REVIEWER")),
) -> dict:
    result = db.get_investigation(claim_id)
    if not result:
        raise HTTPException(404, "Investigation not found")
    review_payload = request.model_dump(mode="json")
    review_payload["reviewer"] = user["username"]
    if request.action == "REINVESTIGATE":
        db.put_review(claim_id, review_payload)
        db.append_audit(claim_id, "REINVESTIGATION_REQUESTED", review_payload)
        claim = db.get_claim(claim_id)
        refreshed = investigate(claim).model_dump(mode="json")
        db.put_investigation(claim_id, refreshed)
        db.append_audit(claim_id, "INVESTIGATION_COMPLETED", refreshed)
        return {"review": review_payload, "investigation": refreshed, "writeback": None}
    if request.action == "REQUEST_INFORMATION":
        review_payload["final_route"] = "HUMAN_REVIEW"
        db.put_review(claim_id, review_payload)
        db.append_audit(claim_id, "ADDITIONAL_INFORMATION_REQUESTED", review_payload)
        return {"review": review_payload, "writeback": None}
    final_route = request.final_route.value if request.final_route else result["route"]
    if request.action == "REJECT" and not request.final_route:
        final_route = "HUMAN_REVIEW"
    review_payload["final_route"] = final_route
    db.put_review(claim_id, review_payload)
    db.append_audit(claim_id, "HUMAN_REVIEW_COMPLETED", review_payload)
    writeback = {
        "claim_id": claim_id,
        "action": final_route,
        "recommended_primary_payer": result.get("recommended_primary_payer"),
        "review_status": request.action,
        "reviewer": user["username"],
        "destination": "SIMULATED_CORE_CLAIMS",
    }
    db.put_writeback(claim_id, writeback)
    db.append_audit(claim_id, "CLAIMS_WRITEBACK_COMPLETED", writeback)
    return {"review": review_payload, "writeback": writeback}


@router.get("/api/audit/{claim_id}", summary="Get audit trail")
@router.get("/api/v1/audit/{claim_id}", summary="Get audit trail (v1)")
def audit(
    claim_id: str, _: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR"))
) -> list[dict]:
    if not db.get_claim(claim_id):
        raise HTTPException(404, "Claim not found")
    return db.get_audit(claim_id)


@router.get("/api/audit/{claim_id}/verify", summary="Verify audit chain integrity")
@router.get("/api/v1/audit/{claim_id}/verify", summary="Verify audit chain integrity (v1)")
def verify_audit(
    claim_id: str, _: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR"))
) -> dict:
    if not db.get_claim(claim_id):
        raise HTTPException(404, "Claim not found")
    return db.verify_audit_chain(claim_id)
