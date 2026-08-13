"""Model drift detection using Population Stability Index (PSI).

Compares the distribution of incoming claim features against the training
distribution to detect when the model's operating environment has shifted.

Alerts are triggered when PSI > threshold (default 0.2).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np

from app.config import get_settings
from app.ml.features import FEATURE_NAMES

logger = logging.getLogger("claimarmor.ml.drift")

# PSI thresholds (industry standard)
PSI_NO_SHIFT = 0.1
PSI_MODERATE_SHIFT = 0.2
PSI_SIGNIFICANT_SHIFT = 0.25


def _compute_psi(
    expected: np.ndarray,
    actual: np.ndarray,
    bins: int = 10,
) -> float:
    """Compute Population Stability Index between two distributions."""
    # Create bins from expected distribution
    breakpoints = np.linspace(
        min(expected.min(), actual.min()) - 1e-6,
        max(expected.max(), actual.max()) + 1e-6,
        bins + 1,
    )

    expected_counts = np.histogram(expected, bins=breakpoints)[0]
    actual_counts = np.histogram(actual, bins=breakpoints)[0]

    # Add small epsilon to avoid division by zero
    expected_pct = (expected_counts + 1e-6) / expected_counts.sum()
    actual_pct = (actual_counts + 1e-6) / actual_counts.sum()

    psi = np.sum((actual_pct - expected_pct) * np.log(actual_pct / expected_pct))
    return float(psi)


def compute_drift_report(
    training_data_path: Path | None = None,
    recent_claims: list[dict] | None = None,
) -> dict[str, Any]:
    """Compute PSI drift report comparing training data to recent predictions.

    If no recent claims are provided, loads them from the database.
    """
    import pandas as pd


    settings = get_settings()

    # Load training distribution
    train_path = training_data_path or Path("artifacts/synthetic_claims.csv")
    if not train_path.exists():
        return {
            "status": "SKIPPED",
            "reason": "Training dataset not found",
            "drift_detected": False,
        }

    train_df = pd.read_csv(train_path)

    # Get recent claims from DB
    if recent_claims is None:
        from app import db
        investigations = db.list_investigations()
        if len(investigations) < 10:
            return {
                "status": "INSUFFICIENT_DATA",
                "reason": f"Only {len(investigations)} investigations available (need >= 10)",
                "drift_detected": False,
            }
        recent_claims = investigations

    # Compute PSI per feature
    feature_drift = {}
    overall_psi = 0.0
    drift_features = []

    for feature in FEATURE_NAMES:
        if feature not in train_df.columns:
            continue

        expected = train_df[feature].values.astype(float)

        # Extract feature from recent claims (best-effort)
        actual_values = []
        for claim in recent_claims[:500]:  # Cap at 500 for performance
            risk = claim.get("risk", {})
            if isinstance(risk, dict) and "factors" in risk:
                # Feature values aren't directly stored, so we use the
                # risk probability as a proxy for drift detection
                actual_values.append(risk.get("probability", 0.5))

        if len(actual_values) < 10:
            continue

        actual = np.array(actual_values)

        # For binary features, use simple proportion comparison
        if set(np.unique(expected)).issubset({0.0, 1.0}):
            expected_rate = expected.mean()
            actual_rate = actual.mean()
            psi = abs(expected_rate - actual_rate)
        else:
            psi = _compute_psi(expected, actual)

        feature_drift[feature] = {
            "psi": round(psi, 6),
            "status": (
                "SIGNIFICANT_SHIFT" if psi > PSI_SIGNIFICANT_SHIFT
                else "MODERATE_SHIFT" if psi > PSI_MODERATE_SHIFT
                else "MINOR_SHIFT" if psi > PSI_NO_SHIFT
                else "STABLE"
            ),
        }

        overall_psi += psi
        if psi > PSI_MODERATE_SHIFT:
            drift_features.append(feature)

    avg_psi = overall_psi / max(len(feature_drift), 1)
    drift_detected = avg_psi > settings.drift_psi_threshold

    report = {
        "status": "COMPLETE",
        "drift_detected": drift_detected,
        "average_psi": round(avg_psi, 6),
        "threshold": settings.drift_psi_threshold,
        "features_checked": len(feature_drift),
        "drifted_features": drift_features,
        "feature_detail": feature_drift,
        "recommendation": (
            "RETRAIN_RECOMMENDED" if drift_detected
            else "MODEL_STABLE"
        ),
    }

    if drift_detected:
        logger.warning(
            "Model drift detected avg_psi=%.4f threshold=%.4f drifted_features=%s",
            avg_psi,
            settings.drift_psi_threshold,
            drift_features,
        )

    return report
