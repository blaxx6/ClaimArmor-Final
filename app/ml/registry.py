"""MLflow model registry integration for production model management.

Capabilities:
- Register trained models with versioned artifacts
- Load production-tagged models at inference time
- Model promotion workflow (staging → production)
- Comparison reports between model versions
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("claimarmor.ml.registry")


def _get_client():
    """Return an MLflow client if configured."""
    from app.config import get_settings

    settings = get_settings()
    if not settings.mlflow_tracking_uri:
        raise RuntimeError("CLAIMARMOR_MLFLOW_TRACKING_URI not configured")

    import mlflow

    mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
    mlflow.set_experiment(settings.mlflow_experiment_name)
    return mlflow


def register_model(
    model_path: Path,
    metrics: dict[str, Any],
    model_name: str = "claimarmor-risk-model",
) -> dict[str, Any]:
    """Register a trained model artifact in MLflow with metrics and tags."""
    mlflow = _get_client()

    with mlflow.start_run(
        run_name=f"train-{metrics.get('model_version', 'unknown')}"
    ) as run:
        # Log parameters
        mlflow.log_params(
            {
                "model_type": metrics.get("model_type", "unknown"),
                "model_version": metrics.get("model_version", "unknown"),
                "dataset_rows": metrics.get("dataset_rows", 0),
                "training_rows": metrics.get("training_rows", 0),
                "test_rows": metrics.get("test_rows", 0),
                "threshold": metrics.get("threshold", 0.5),
                "calibration": metrics.get("calibration", "none"),
            }
        )

        # Log metrics
        for key in [
            "accuracy",
            "precision",
            "recall",
            "f1",
            "roc_auc",
            "pr_auc",
            "brier_score",
            "value_weighted_recall",
            "positive_rate",
        ]:
            if key in metrics:
                mlflow.log_metric(key, metrics[key])

        # Log confusion matrix
        if "confusion_matrix" in metrics:
            cm = metrics["confusion_matrix"]
            for cm_key, cm_val in cm.items():
                mlflow.log_metric(f"cm_{cm_key}", cm_val)

        # Log artifacts
        mlflow.log_artifact(str(model_path))
        mlflow.log_dict(metrics, "model_metrics.json")

        # Register model
        model_uri = f"runs:/{run.info.run_id}/{model_path.name}"
        result = mlflow.register_model(model_uri, model_name)

        logger.info(
            "Model registered name=%s version=%s run_id=%s",
            model_name,
            result.version,
            run.info.run_id,
        )

        return {
            "run_id": run.info.run_id,
            "model_name": model_name,
            "model_version": result.version,
            "metrics": metrics,
        }


def load_production_model(
    model_name: str = "claimarmor-risk-model",
) -> Any | None:
    """Load the 'Production'-tagged model from the registry."""
    try:
        mlflow = _get_client()
        from mlflow.tracking import MlflowClient

        client = MlflowClient()

        # Get latest production version
        versions = client.get_latest_versions(model_name, stages=["Production"])
        if not versions:
            logger.info("No production model found in registry for %s", model_name)
            return None

        version = versions[0]
        model_uri = f"models:/{model_name}/{version.version}"
        logger.info(
            "Loading production model name=%s version=%s",
            model_name,
            version.version,
        )

        import joblib

        artifacts = mlflow.artifacts.download_artifacts(
            run_id=version.run_id,
            artifact_path="risk_model.joblib",
        )
        return joblib.load(artifacts)

    except Exception as exc:
        logger.warning("Registry load failed, falling back to local: %s", exc)
        return None


def promote_model(
    model_name: str = "claimarmor-risk-model",
    version: int | str | None = None,
    stage: str = "Production",
) -> dict[str, Any]:
    """Promote a model version to a given stage (Staging/Production)."""
    mlflow = _get_client()
    from mlflow.tracking import MlflowClient

    client = MlflowClient()

    if version is None:
        # Promote latest
        versions = client.get_latest_versions(model_name, stages=["None", "Staging"])
        if not versions:
            raise ValueError(f"No model versions found for {model_name}")
        version = versions[-1].version

    client.transition_model_version_stage(
        name=model_name,
        version=str(version),
        stage=stage,
    )

    logger.info(
        "Model promoted name=%s version=%s stage=%s",
        model_name,
        version,
        stage,
    )

    return {
        "model_name": model_name,
        "version": str(version),
        "stage": stage,
    }


def compare_models(
    model_name: str = "claimarmor-risk-model",
) -> dict[str, Any]:
    """Compare production vs staging model metrics."""
    try:
        mlflow = _get_client()
        from mlflow.tracking import MlflowClient

        client = MlflowClient()

        result = {"model_name": model_name}

        for stage in ["Production", "Staging"]:
            versions = client.get_latest_versions(model_name, stages=[stage])
            if versions:
                v = versions[0]
                run = client.get_run(v.run_id)
                result[stage.lower()] = {
                    "version": v.version,
                    "run_id": v.run_id,
                    "metrics": run.data.metrics,
                    "params": run.data.params,
                }
            else:
                result[stage.lower()] = None

        return result

    except Exception as exc:
        return {"error": str(exc), "model_name": model_name}
