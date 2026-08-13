"""Celery application configuration for async claim investigation."""

from __future__ import annotations

from celery import Celery

from app.config import get_settings


def create_celery_app() -> Celery:
    """Create and configure the Celery application."""
    settings = get_settings()

    app = Celery(
        "claimarmor",
        broker=settings.effective_celery_broker,
        backend=settings.effective_celery_backend,
    )

    app.conf.update(
        # Serialization
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        # Timezone
        timezone="UTC",
        enable_utc=True,
        # Task routing
        task_default_queue=settings.celery_task_default_queue,
        task_queues={
            "claimarmor": {"exchange": "claimarmor", "routing_key": "default"},
            "claimarmor.high": {"exchange": "claimarmor", "routing_key": "high"},
            "claimarmor.bulk": {"exchange": "claimarmor", "routing_key": "bulk"},
        },
        # Reliability
        task_acks_late=True,
        worker_prefetch_multiplier=1,
        task_reject_on_worker_lost=True,
        # Result expiry
        result_expires=86400,  # 24 hours
        # Retry policy
        task_default_retry_delay=30,
        task_max_retries=3,
        # Worker
        worker_max_tasks_per_child=500,  # Prevent memory leaks
        worker_max_memory_per_child=512_000,  # 512 MB
        # Beat schedule (periodic tasks)
        beat_schedule={
            "drift-check-hourly": {
                "task": "app.worker.tasks.check_model_drift",
                "schedule": 3600.0,
            },
            "cleanup-expired-tasks": {
                "task": "app.worker.tasks.cleanup_expired_tasks",
                "schedule": 86400.0,
            },
        },
    )

    # Auto-discover tasks
    app.autodiscover_tasks(["app.worker"])

    return app


celery_app = create_celery_app()
