"""Production-grade database layer with connection pooling, multi-tenancy, and field-level encryption.

Upgrades from hackathon:
- Connection pooling via SQLAlchemy QueuePool (no per-request engine creation)
- Tenant-aware tables with tenant_id column
- Field-level PII encryption (Fernet) for member_name, member_dob
- Task status tracking table for async Celery jobs
- Alembic migration readiness
- SHA-256 hash-linked audit chain (preserved from original)
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    cast,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    delete,
    func,
    insert,
    select,
    type_coerce,
)
from sqlalchemy.pool import QueuePool, StaticPool

from app.config import get_settings

metadata = MetaData()

# ── Table definitions ─────────────────────────────────────────────────
# All tables include tenant_id for multi-tenancy support.

members_table = Table(
    "members",
    metadata,
    Column("member_id", String(80), primary_key=True),
    Column("tenant_id", String(80), nullable=False, default="default", index=True),
    Column("payload", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

coverages_table = Table(
    "coverages",
    metadata,
    Column("coverage_id", String(80), primary_key=True),
    Column("tenant_id", String(80), nullable=False, default="default", index=True),
    Column("member_id", String(80), nullable=False, index=True),
    Column("payload", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

claims_table = Table(
    "claims",
    metadata,
    Column("claim_id", String(80), primary_key=True),
    Column("tenant_id", String(80), nullable=False, default="default", index=True),
    Column("payload", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

investigations_table = Table(
    "investigations",
    metadata,
    Column("claim_id", String(80), primary_key=True),
    Column("tenant_id", String(80), nullable=False, default="default", index=True),
    Column("result", Text, nullable=False),
    Column("updated_at", DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False),
)

reviews_table = Table(
    "reviews",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("claim_id", String(80), nullable=False, index=True),
    Column("tenant_id", String(80), nullable=False, default="default", index=True),
    Column("payload", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

writebacks_table = Table(
    "writebacks",
    metadata,
    Column("claim_id", String(80), primary_key=True),
    Column("tenant_id", String(80), nullable=False, default="default", index=True),
    Column("payload", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

audit_table = Table(
    "audit_events",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("claim_id", String(80), nullable=False, index=True),
    Column("tenant_id", String(80), nullable=False, default="default", index=True),
    Column("event_type", String(80), nullable=False),
    Column("payload", Text, nullable=False),
    Column("previous_hash", String(64), nullable=False),
    Column("event_hash", String(64), nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

users_table = Table(
    "users",
    metadata,
    Column("username", String(80), primary_key=True),
    Column("password_hash", String(256), nullable=False),
    Column("salt", String(64), nullable=False),
    Column("role", String(40), nullable=False),
    Column("display_name", String(120), nullable=False),
    Column("tenant_id", String(80), nullable=False, default="default", index=True),
    Column("active", Integer, nullable=False, default=1),
)

policies_table = Table(
    "policies",
    metadata,
    Column("record_key", String(130), primary_key=True),
    Column("policy_id", String(80), nullable=False, index=True),
    Column("version", String(40), nullable=False),
    Column("status", String(20), nullable=False),
    Column("tenant_id", String(80), nullable=False, default="default", index=True),
    Column("payload", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

# ── Async task tracking (Celery integration) ──────────────────────────
tasks_table = Table(
    "task_status",
    metadata,
    Column("task_id", String(80), primary_key=True),
    Column("claim_id", String(80), nullable=False, index=True),
    Column("tenant_id", String(80), nullable=False, default="default", index=True),
    Column(
        "status", String(40), nullable=False
    ),  # QUEUED, IN_PROGRESS, COMPLETE, FAILED
    Column("result", Text, nullable=True),
    Column("error", Text, nullable=True),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
    Column("updated_at", DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False),
)

# ── LLM usage tracking ───────────────────────────────────────────────
llm_usage_table = Table(
    "llm_usage",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("tenant_id", String(80), nullable=False, index=True),
    Column("claim_id", String(80), nullable=False),
    Column("provider", String(40), nullable=False),
    Column("model", String(80), nullable=False),
    Column("input_tokens", Integer, nullable=False, default=0),
    Column("output_tokens", Integer, nullable=False, default=0),
    Column("cost_usd", Float, nullable=True),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

Index("ix_claims_tenant_created", claims_table.c.tenant_id, claims_table.c.created_at)
Index("ix_investigations_tenant_updated", investigations_table.c.tenant_id, investigations_table.c.updated_at)
Index("ix_tasks_tenant_status", tasks_table.c.tenant_id, tasks_table.c.status)


# ── Database Initialization ────────────────────────────────────────────

_ENGINE = None


def _engine():
    """Return a singleton engine with proper connection pooling."""
    global _ENGINE
    if _ENGINE is not None:
        return _ENGINE

    settings = get_settings()
    url = settings.database_url

    if url.startswith("sqlite"):
        _ENGINE = create_engine(
            url,
            future=True,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    else:
        _ENGINE = create_engine(
            url,
            future=True,
            poolclass=QueuePool,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_timeout=settings.db_pool_timeout,
            pool_pre_ping=True,  # Test connections before use
            echo=settings.db_echo,
        )
    return _ENGINE


def database_url() -> str:
    return get_settings().database_url


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _tenant_id() -> str:
    return get_settings().tenant_id


def init_db() -> None:
    """Create all tables. Idempotent."""
    engine = _engine()
    metadata.create_all(engine)


def dispose_engine() -> None:
    """Dispose the connection pool (for testing/shutdown)."""
    global _ENGINE
    if _ENGINE is not None:
        _ENGINE.dispose()
        _ENGINE = None


def storage_info() -> dict:
    url = database_url()
    return {
        "backend": "postgresql" if url.startswith("postgresql") else "sqlite",
        "configured": not url.startswith("sqlite"),
        "pool_size": get_settings().db_pool_size if not url.startswith("sqlite") else 1,
    }


# ── Generic helpers ───────────────────────────────────────────────────


def _put_unique(table: Table, key_column, key: str, values: dict) -> None:
    engine = _engine()
    dialect = engine.dialect.name
    with engine.begin() as conn:
        if dialect == "sqlite":
            from sqlalchemy.dialects.sqlite import insert as sqlite_insert
            stmt = sqlite_insert(table).values(**values)
            stmt = stmt.on_conflict_do_update(
                index_elements=[key_column.name],
                set_=values
            )
            conn.execute(stmt)
        elif dialect == "postgresql":
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            stmt = pg_insert(table).values(**values)
            stmt = stmt.on_conflict_do_update(
                index_elements=[key_column.name],
                set_=values
            )
            conn.execute(stmt)
        else:
            conn.execute(delete(table).where(key_column == key))
            conn.execute(insert(table).values(**values))


def _fernet() -> Fernet | None:
    settings = get_settings()
    if not settings.encryption_key:
        if settings.is_production:
            raise ValueError("CLAIMARMOR_ENCRYPTION_KEY is required in production")
        return None
    return Fernet(settings.encryption_key.get_secret_value().encode())


def _encrypt_pii(payload: dict) -> dict:
    f = _fernet()
    if not f:
        return payload
    
    result = dict(payload)
    for field in ("member_name", "member_dob", "member_email", "member_phone", "member_address"):
        if field in result and isinstance(result[field], str):
            result[field] = f.encrypt(result[field].encode()).decode()
    return result


def _decrypt_pii(payload: dict) -> dict:
    f = _fernet()
    if not f:
        return payload
    
    result = dict(payload)
    for field in ("member_name", "member_dob", "member_email", "member_phone", "member_address"):
        if field in result and isinstance(result[field], str):
            try:
                result[field] = f.decrypt(result[field].encode()).decode()
            except Exception:
                pass
    return result


# ── Members & Coverages CRUD ──────────────────────────────────────────

def put_member(member: dict[str, Any]) -> None:
    _put_unique(
        members_table,
        members_table.c.member_id,
        member["member_id"],
        {
            "member_id": member["member_id"],
            "tenant_id": member.get("tenant_id", _tenant_id()),
            "payload": json.dumps(member, sort_keys=True, default=str),
            "created_at": _now(),
        },
    )

def get_member(member_id: str) -> dict[str, Any] | None:
    engine = _engine()
    with engine.connect() as conn:
        row = conn.execute(
            select(members_table.c.payload).where(members_table.c.member_id == member_id)
        ).first()
    return json.loads(row.payload) if row else None

def list_members(tenant_id: str | None = None) -> list[dict[str, Any]]:
    engine = _engine()
    with engine.connect() as conn:
        query = select(members_table.c.payload)
        if tenant_id:
            query = query.where(members_table.c.tenant_id == tenant_id)
        rows = conn.execute(query).all()
    return [json.loads(row.payload) for row in rows]

def put_coverage(coverage: dict[str, Any]) -> None:
    _put_unique(
        coverages_table,
        coverages_table.c.coverage_id,
        coverage["coverage_id"],
        {
            "coverage_id": coverage["coverage_id"],
            "tenant_id": coverage.get("tenant_id", _tenant_id()),
            "member_id": coverage["member_id"],
            "payload": json.dumps(coverage, sort_keys=True, default=str),
            "created_at": _now(),
        },
    )

def list_coverages(member_id: str) -> list[dict[str, Any]]:
    engine = _engine()
    with engine.connect() as conn:
        rows = conn.execute(
            select(coverages_table.c.payload).where(coverages_table.c.member_id == member_id)
        ).all()
    return [json.loads(row.payload) for row in rows]


# ── Claims CRUD ───────────────────────────────────────────────────────


def put_claim(claim: dict[str, Any]) -> None:
    encrypted_claim = _encrypt_pii(claim)
    _put_unique(
        claims_table,
        claims_table.c.claim_id,
        claim["claim_id"],
        {
            "claim_id": claim["claim_id"],
            "tenant_id": claim.get("tenant_id", _tenant_id()),
            "payload": json.dumps(encrypted_claim, sort_keys=True, default=str),
            "created_at": _now(),
        },
    )


def list_claims(tenant_id: str | None = None, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    engine = _engine()
    with engine.connect() as conn:
        query = select(claims_table.c.payload).order_by(claims_table.c.created_at)
        if tenant_id:
            query = query.where(claims_table.c.tenant_id == tenant_id)
        if limit is not None:
            query = query.limit(limit)
        if offset is not None:
            query = query.offset(offset)
        rows = conn.execute(query).all()
    return [_decrypt_pii(json.loads(row.payload)) for row in rows]


def get_claim(claim_id: str) -> dict[str, Any] | None:
    engine = _engine()
    with engine.connect() as conn:
        row = conn.execute(
            select(claims_table.c.payload).where(claims_table.c.claim_id == claim_id)
        ).first()
    return _decrypt_pii(json.loads(row.payload)) if row else None


# ── Investigations CRUD ───────────────────────────────────────────────


def put_investigation(claim_id: str, result: dict[str, Any]) -> None:
    _put_unique(
        investigations_table,
        investigations_table.c.claim_id,
        claim_id,
        {
            "claim_id": claim_id,
            "tenant_id": result.get("tenant_id", _tenant_id()),
            "result": json.dumps(result, sort_keys=True, default=str),
            "updated_at": _now(),
        },
    )


def get_investigation(claim_id: str) -> dict[str, Any] | None:
    engine = _engine()
    with engine.connect() as conn:
        row = conn.execute(
            select(investigations_table.c.result).where(
                investigations_table.c.claim_id == claim_id
            )
        ).first()
    return json.loads(row.result) if row else None


def list_investigations(tenant_id: str | None = None, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    engine = _engine()
    with engine.connect() as conn:
        query = select(investigations_table.c.claim_id, investigations_table.c.result).order_by(
            cast(investigations_table.c.updated_at, DateTime(timezone=True)).desc()
        )
        if tenant_id:
            query = query.where(investigations_table.c.tenant_id == tenant_id)
        if limit is not None:
            query = query.limit(limit)
        if offset is not None:
            query = query.offset(offset)
        rows = conn.execute(query).all()
    return [{"claim_id": row.claim_id, **json.loads(row.result)} for row in rows]


def _json_field(column, *path_parts):
    engine = _engine()
    if engine.dialect.name == "sqlite":
        json_path = "$." + ".".join(path_parts)
        return func.json_extract(column, json_path)
    else:
        expr = cast(column, JSON)
        for part in path_parts:
            expr = expr[part]
        return expr.as_string()


def list_pending_reviews(tenant_id: str | None = None, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    engine = _engine()
    with engine.connect() as conn:
        route_expr = _json_field(investigations_table.c.result, "route")
        
        latest_reviews = select(
            reviews_table.c.claim_id,
            func.max(reviews_table.c.created_at).label("last_reviewed")
        ).group_by(reviews_table.c.claim_id).alias("lr")
            
        query = select(investigations_table.c.claim_id, investigations_table.c.result).outerjoin(
            latest_reviews, investigations_table.c.claim_id == latest_reviews.c.claim_id
        ).where(
            route_expr.in_(["HOLD", "HUMAN_REVIEW", "UNDETERMINED"]),
            (latest_reviews.c.claim_id.is_(None)) | (cast(investigations_table.c.updated_at, DateTime(timezone=True)) > cast(latest_reviews.c.last_reviewed, DateTime(timezone=True)))
        ).order_by(cast(investigations_table.c.updated_at, DateTime(timezone=True)).desc())
        
        if tenant_id:
            query = query.where(investigations_table.c.tenant_id == tenant_id)
        if limit is not None:
            query = query.limit(limit)
        if offset is not None:
            query = query.offset(offset)
            
        rows = conn.execute(query).all()
    return [{"claim_id": row.claim_id, **json.loads(row.result)} for row in rows]


def list_completed_reviews(tenant_id: str | None = None, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    engine = _engine()
    with engine.connect() as conn:
        query = select(reviews_table.c.payload, investigations_table.c.result).join(
            investigations_table, reviews_table.c.claim_id == investigations_table.c.claim_id
        ).order_by(reviews_table.c.created_at.desc())
        
        if tenant_id:
            query = query.where(reviews_table.c.tenant_id == tenant_id)
        if limit is not None:
            query = query.limit(limit)
        if offset is not None:
            query = query.offset(offset)
            
        rows = conn.execute(query).all()
        
    return [
        {
            "investigation": json.loads(row.result),
            "review": json.loads(row.payload)
        }
        for row in rows
    ]


def get_metrics_summary(tenant_id: str | None = None) -> dict[str, Any]:
    engine = _engine()
    with engine.connect() as conn:
        # Claims ingested
        q_claims = select(func.count()).select_from(claims_table)
        if tenant_id:
            q_claims = q_claims.where(claims_table.c.tenant_id == tenant_id)
        claims_ingested = conn.execute(q_claims).scalar() or 0

        # Total investigations
        q_inv = select(func.count()).select_from(investigations_table)
        if tenant_id:
            q_inv = q_inv.where(investigations_table.c.tenant_id == tenant_id)
        claims_investigated = conn.execute(q_inv).scalar() or 0

        # Amount at risk
        amount_expr = cast(_json_field(investigations_table.c.result, "financial_impact", "amount_at_risk"), Float)
        q_amt = select(func.sum(amount_expr))
        if tenant_id:
            q_amt = q_amt.where(investigations_table.c.tenant_id == tenant_id)
        estimated_amount_at_risk = conn.execute(q_amt).scalar() or 0.0

        # Route counts
        route_expr = _json_field(investigations_table.c.result, "route")
        q_route = select(route_expr, func.count()).group_by(route_expr)
        if tenant_id:
            q_route = q_route.where(investigations_table.c.tenant_id == tenant_id)
        route_counts = {row[0]: row[1] for row in conn.execute(q_route).all() if row[0] is not None}
        
        # Ensure all standard routes are in the counts
        for route in ["CLEAR", "HOLD", "HUMAN_REVIEW", "UNDETERMINED"]:
            if route not in route_counts:
                route_counts[route] = 0

        # Pending reviews
        # Count investigations where route in HOLD/HUMAN_REVIEW/UNDETERMINED and claim_id NOT IN reviewed_claim_ids
        latest_reviews = select(
            reviews_table.c.claim_id,
            func.max(reviews_table.c.created_at).label("last_reviewed")
        ).group_by(reviews_table.c.claim_id).alias("lr")
        
        q_pending = select(func.count()).select_from(
            investigations_table.outerjoin(
                latest_reviews, investigations_table.c.claim_id == latest_reviews.c.claim_id
            )
        ).where(
            route_expr.in_(["HOLD", "HUMAN_REVIEW", "UNDETERMINED"]),
            (latest_reviews.c.claim_id.is_(None)) | (cast(investigations_table.c.updated_at, DateTime(timezone=True)) > cast(latest_reviews.c.last_reviewed, DateTime(timezone=True)))
        )
        if tenant_id:
            q_pending = q_pending.where(investigations_table.c.tenant_id == tenant_id)
        pending_reviews = conn.execute(q_pending).scalar() or 0

    return {
        "claims_ingested": claims_ingested,
        "claims_investigated": claims_investigated,
        "estimated_amount_at_risk": round(estimated_amount_at_risk, 2),
        "route_counts": route_counts,
        "pending_reviews": pending_reviews,
    }

# ── Reviews CRUD ──────────────────────────────────────────────────────


def put_review(claim_id: str, payload: dict[str, Any]) -> None:
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            insert(reviews_table).values(
                claim_id=claim_id,
                tenant_id=payload.get("tenant_id", _tenant_id()),
                payload=json.dumps(payload, sort_keys=True, default=str),
                created_at=_now(),
            )
        )


def reviewed_claim_ids(tenant_id: str | None = None) -> set[str]:
    engine = _engine()
    with engine.connect() as conn:
        query = select(reviews_table.c.claim_id).distinct()
        if tenant_id:
            query = query.where(reviews_table.c.tenant_id == tenant_id)
        return set(conn.execute(query).scalars().all())


# ── Writebacks CRUD ──────────────────────────────────────────────────


def put_writeback(claim_id: str, payload: dict[str, Any]) -> None:
    _put_unique(
        writebacks_table,
        writebacks_table.c.claim_id,
        claim_id,
        {
            "claim_id": claim_id,
            "tenant_id": payload.get("tenant_id", _tenant_id()),
            "payload": json.dumps(payload, sort_keys=True, default=str),
            "created_at": _now(),
        },
    )


# ── Audit chain (SHA-256 hash-linked) ────────────────────────────────


def append_audit(
    claim_id: str,
    event_type: str,
    payload: dict[str, Any],
    tenant_id: str | None = None,
) -> dict[str, Any]:
    encoded = json.dumps(payload, sort_keys=True, default=str)
    created_at = _now()
    effective_tenant = tenant_id or _tenant_id()
    engine = _engine()
    with engine.begin() as conn:
        # Lock the claim record to prevent race conditions during audit append
        if engine.dialect.name == "postgresql":
            conn.execute(
                select(claims_table.c.claim_id)
                .where(claims_table.c.claim_id == claim_id)
                .with_for_update()
            )
            
        previous_hash = (
            conn.execute(
                select(audit_table.c.event_hash)
                .where(audit_table.c.claim_id == claim_id)
                .order_by(audit_table.c.id.desc())
                .limit(1)
            ).scalar_one_or_none()
            or "GENESIS"
        )
        created_at_str = created_at.isoformat()
        event_hash = hashlib.sha256(
            f"{claim_id}|{event_type}|{encoded}|{previous_hash}|{created_at_str}".encode()
        ).hexdigest()
        conn.execute(
            insert(audit_table).values(
                claim_id=claim_id,
                tenant_id=effective_tenant,
                event_type=event_type,
                payload=encoded,
                previous_hash=previous_hash,
                event_hash=event_hash,
                created_at=created_at,
            )
        )
    return {
        "event_type": event_type,
        "event_hash": event_hash,
        "previous_hash": previous_hash,
        "created_at": created_at,
    }


def get_audit(claim_id: str) -> list[dict[str, Any]]:
    engine = _engine()
    with engine.connect() as conn:
        rows = (
            conn.execute(
                select(audit_table)
                .where(audit_table.c.claim_id == claim_id)
                .order_by(audit_table.c.id)
            )
            .mappings()
            .all()
        )
    return [{**dict(row), "payload": json.loads(row["payload"]), "raw_payload": row["payload"]} for row in rows]


def verify_audit_chain(claim_id: str) -> dict:
    events = get_audit(claim_id)
    expected_previous = "GENESIS"
    failures = []
    for event in events:
        encoded = event["raw_payload"]
        created_at = event['created_at']
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        if isinstance(created_at, datetime) and not created_at.tzinfo:
            created_at = created_at.replace(tzinfo=timezone.utc)
        
        # Format identical to how append_audit formats it:
        # isoformat() on a UTC timezone-aware datetime will append '+00:00'
        created_at_str = created_at.isoformat()
        
        # If the original string had a slightly different format (e.g. SQLite losing microseconds),
        # this might still mismatch. We do our best to reconstruct the original created_at_str.
        # SQLite drops +00:00 but SQLAlchemy reconstructs it naive, so adding tzinfo=utc matches it.
        # However, SQLite replaces T with a space when saving DateTime! SQLAlchemy might return it with space.
        if " " in created_at_str:
            created_at_str = created_at_str.replace(" ", "T")
        
        expected_hash = hashlib.sha256(
            f"{claim_id}|{event['event_type']}|{encoded}|{expected_previous}|{created_at_str}".encode()
        ).hexdigest()
        if event["previous_hash"] != expected_previous:
            failures.append(
                {"event_id": event["id"], "reason": "previous_hash_mismatch", "expected": expected_previous, "actual": event["previous_hash"]}
            )
        if event["event_hash"] != expected_hash:
            failures.append({"event_id": event["id"], "reason": "event_hash_mismatch", "expected": expected_hash, "actual": event["event_hash"]})
        expected_previous = event["event_hash"]
    return {
        "claim_id": claim_id,
        "valid": not failures,
        "events_checked": len(events),
        "failures": failures,
        "head_hash": expected_previous,
    }


# ── User management ──────────────────────────────────────────────────


def put_user(
    username: str,
    password_hash: str,
    salt: str,
    role: str,
    display_name: str,
    tenant_id: str | None = None,
) -> None:
    _put_unique(
        users_table,
        users_table.c.username,
        username,
        {
            "username": username,
            "password_hash": password_hash,
            "salt": salt,
            "role": role,
            "display_name": display_name,
            "tenant_id": tenant_id or _tenant_id(),
            "active": 1,
        },
    )


def get_user(username: str) -> dict | None:
    engine = _engine()
    with engine.connect() as conn:
        row = (
            conn.execute(select(users_table).where(users_table.c.username == username))
            .mappings()
            .first()
        )
    return dict(row) if row else None


def list_users(tenant_id: str | None = None) -> list[dict]:
    engine = _engine()
    with engine.connect() as conn:
        query = select(
            users_table.c.username,
            users_table.c.role,
            users_table.c.display_name,
            users_table.c.tenant_id,
            users_table.c.active,
        )
        if tenant_id:
            query = query.where(users_table.c.tenant_id == tenant_id)
        rows = conn.execute(query).mappings().all()
    return [dict(row) for row in rows]


def deactivate_user(username: str) -> bool:
    engine = _engine()
    with engine.begin() as conn:
        result = conn.execute(
            users_table.update()
            .where(users_table.c.username == username)
            .values(active=0)
        )
    return result.rowcount > 0


# ── Policy management ────────────────────────────────────────────────


def put_policy_record(record: dict[str, Any]) -> None:
    key = f"{record['policy_id']}:{record['version']}"
    _put_unique(
        policies_table,
        policies_table.c.record_key,
        key,
        {
            "record_key": key,
            "policy_id": record["policy_id"],
            "version": record["version"],
            "status": record.get("status", "ACTIVE"),
            "tenant_id": record.get("tenant_id", _tenant_id()),
            "payload": json.dumps(record, sort_keys=True, default=str),
            "created_at": _now(),
        },
    )


def list_policy_records(active_only: bool = False) -> list[dict[str, Any]]:
    engine = _engine()
    with engine.connect() as conn:
        query = select(policies_table)
        if active_only:
            query = query.where(policies_table.c.status == "ACTIVE")
        rows = (
            conn.execute(query.order_by(policies_table.c.created_at)).mappings().all()
        )
    return [{**json.loads(row["payload"]), "status": row["status"]} for row in rows]


def set_policy_status(policy_id: str, version: str, status: str) -> bool:
    engine = _engine()
    with engine.begin() as conn:
        row = (
            conn.execute(
                select(policies_table).where(
                    policies_table.c.policy_id == policy_id,
                    policies_table.c.version == version,
                )
            )
            .mappings()
            .first()
        )
        if not row:
            return False
        payload = json.loads(row["payload"])
        payload["status"] = status
        conn.execute(
            policies_table.update()
            .where(policies_table.c.record_key == row["record_key"])
            .values(
                status=status,
                payload=json.dumps(payload, sort_keys=True, default=str),
            )
        )
    return True


# ── Task status (Celery async tracking) ──────────────────────────────


def create_task(
    task_id: str,
    claim_id: str,
    tenant_id: str | None = None,
) -> None:
    now = _now()
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            insert(tasks_table).values(
                task_id=task_id,
                claim_id=claim_id,
                tenant_id=tenant_id or _tenant_id(),
                status="QUEUED",
                result=None,
                error=None,
                created_at=now,
                updated_at=now,
            )
        )


def update_task_status(
    task_id: str,
    status: str,
    result: dict | None = None,
    error: str | None = None,
) -> None:
    engine = _engine()
    with engine.begin() as conn:
        values: dict[str, Any] = {"status": status, "updated_at": _now()}
        if result is not None:
            values["result"] = json.dumps(result, sort_keys=True, default=str)
        if error is not None:
            values["error"] = error
        conn.execute(
            tasks_table.update()
            .where(tasks_table.c.task_id == task_id)
            .values(**values)
        )


def get_task(task_id: str) -> dict | None:
    engine = _engine()
    with engine.connect() as conn:
        row = (
            conn.execute(select(tasks_table).where(tasks_table.c.task_id == task_id))
            .mappings()
            .first()
        )
    if not row:
        return None
    result = dict(row)
    if result.get("result"):
        result["result"] = json.loads(result["result"])
    return result


# ── LLM Usage tracking ───────────────────────────────────────────────


def log_llm_usage(
    tenant_id: str,
    claim_id: str,
    provider: str,
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cost_usd: float | None = None,
) -> None:
    engine = _engine()
    with engine.begin() as conn:
        conn.execute(
            insert(llm_usage_table).values(
                tenant_id=tenant_id,
                claim_id=claim_id,
                provider=provider,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost_usd,
                created_at=_now(),
            )
        )


def get_llm_usage_summary(tenant_id: str | None = None) -> dict:
    engine = _engine()
    with engine.connect() as conn:
        query = select(
            func.count(llm_usage_table.c.id).label("total_calls"),
            func.sum(llm_usage_table.c.input_tokens).label("total_input_tokens"),
            func.sum(llm_usage_table.c.output_tokens).label("total_output_tokens"),
            func.sum(llm_usage_table.c.cost_usd).label("total_cost_usd"),
        )
        if tenant_id:
            query = query.where(llm_usage_table.c.tenant_id == tenant_id)
        row = conn.execute(query).mappings().first()
    return {
        "total_calls": row["total_calls"] or 0,
        "total_input_tokens": row["total_input_tokens"] or 0,
        "total_output_tokens": row["total_output_tokens"] or 0,
        "total_cost_usd": round(float(row["total_cost_usd"] or 0), 6),
    }
