"""Initial production schema — add tenant_id, task_status, llm_usage tables.

Revision ID: 001_initial_production
Revises: None
Create Date: 2026-08-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001_initial_production"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Add tenant_id to existing tables ──────────────────────────────
    for table_name in ["claims", "investigations", "reviews", "writebacks", "audit_events", "users", "policies"]:
        try:
            op.add_column(table_name, sa.Column("tenant_id", sa.String(80), nullable=True, server_default="default"))
            op.create_index(f"ix_{table_name}_tenant_id", table_name, ["tenant_id"])
        except Exception:
            pass  # Column may already exist

    # ── Create task_status table ──────────────────────────────────────
    op.create_table(
        "task_status",
        sa.Column("task_id", sa.String(80), primary_key=True),
        sa.Column("claim_id", sa.String(80), nullable=False),
        sa.Column("tenant_id", sa.String(80), nullable=False, server_default="default"),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
    )
    op.create_index("ix_task_status_claim_id", "task_status", ["claim_id"])
    op.create_index("ix_task_status_tenant_id", "task_status", ["tenant_id"])

    # ── Create llm_usage table ────────────────────────────────────────
    op.create_table(
        "llm_usage",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.String(80), nullable=False),
        sa.Column("claim_id", sa.String(80), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Float(), nullable=True),
        sa.Column("created_at", sa.String(40), nullable=False),
    )
    op.create_index("ix_llm_usage_tenant_id", "llm_usage", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("llm_usage")
    op.drop_table("task_status")
    for table_name in ["claims", "investigations", "reviews", "writebacks", "audit_events", "users", "policies"]:
        try:
            op.drop_index(f"ix_{table_name}_tenant_id", table_name)
            op.drop_column(table_name, "tenant_id")
        except Exception:
            pass
