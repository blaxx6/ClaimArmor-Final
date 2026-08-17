from fastapi import APIRouter, Depends, HTTPException

from app import db
from app.auth import require_roles
from app.config import get_settings
from app.evaluation import load_evaluation
from app.ml.runtime import metrics as model_metrics
from app.schemas import RoiAssumptions
from app.services.business import simulate_roi
from app.services.policy import evaluate_retrieval, get_index

settings = get_settings()
router = APIRouter(tags=["Analytics"])

@router.get("/api/metrics")
@router.get("/api/v1/metrics")
def metrics_endpoint(
    user: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR")),
) -> dict:
    tenant_id = user.get("tenant_id")
    summary = db.get_metrics_summary(tenant_id)
    
    return {
        "claims_ingested": summary["claims_ingested"],
        "claims_investigated": summary["claims_investigated"],
        "route_counts": summary["route_counts"],
        "estimated_amount_at_risk": summary["estimated_amount_at_risk"],
        "coverage_rate": round(summary["claims_investigated"] / max(summary["claims_ingested"], 1), 4),
        "basis": "Measured from synthetic application runs; not a real recovery estimate.",
        "model_evaluation": model_metrics(),
        "pending_reviews": summary["pending_reviews"],
        "storage": db.storage_info(),
        "llm_usage": db.get_llm_usage_summary(tenant_id),
    }


@router.get("/api/model/metrics")
@router.get("/api/v1/model/metrics")
def get_model_metrics(
    _: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR")),
) -> dict:
    result = model_metrics()
    if result is None:
        return {
            "status": "NOT_TRAINED",
            "message": "Run: python -m app.ml.train --regenerate --rows 3000",
        }
    return {"status": "READY", **result}


@router.get("/api/evaluation")
@router.get("/api/v1/evaluation")
def system_evaluation(
    _: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR")),
) -> dict:
    result = load_evaluation()
    if result is None:
        raise HTTPException(
            503, "Evaluation artifact not found; run python -m app.evaluation"
        )
    return result


@router.get("/api/retrieval/metrics")
@router.get("/api/v1/retrieval/metrics")
def retrieval_metrics(
    _: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR")),
) -> dict:
    return evaluate_retrieval()


@router.post("/api/business/roi")
@router.post("/api/v1/business/roi")
def business_roi(
    assumptions: RoiAssumptions,
    _: dict = Depends(require_roles("ANALYST", "REVIEWER", "AUDITOR")),
) -> dict:
    return simulate_roi(assumptions.model_dump())


@router.get("/api/ops")
@router.get("/api/v1/ops")
def operations(_: dict = Depends(require_roles("AUDITOR"))) -> dict:
    evaluation = load_evaluation()
    return {
        "status": "READY",
        "version": settings.app_version,
        "environment": settings.environment,
        "storage": db.storage_info(),
        "model_ready": model_metrics() is not None,
        "evaluation_ready": evaluation is not None,
        "policy_records": len(get_index().records),
        "retrieval": evaluate_retrieval(),
        "llm_mode": settings.llm_mode,
        "llm_usage": db.get_llm_usage_summary(),
        "data_classification": "SYNTHETIC_ONLY",
    }
