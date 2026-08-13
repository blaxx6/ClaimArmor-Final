# ClaimArmor AI — Production Architecture

## System Overview

```mermaid
flowchart TB
    subgraph Clients
        UI["Next.js Dashboard"]
        CLI["API Client / CI"]
    end

    subgraph Ingress
        LB["Load Balancer / Ingress"]
        TLS["TLS Termination"]
    end

    subgraph API["FastAPI API Server (3 replicas, HPA)"]
        AUTH["OAuth2/OIDC + RBAC"]
        MW["Tenant Middleware + Security Headers"]
        V1["API v1 Routes"]
        SSE["SSE Stream Endpoint"]
    end

    subgraph Workers["Celery Workers (HPA)"]
        WH["High Priority Worker"]
        WB["Bulk Worker"]
        BEAT["Beat Scheduler"]
    end

    subgraph Pipeline["Investigation Pipeline"]
        MATCH["Identity Resolution (Splink/Fellegi-Sunter)"]
        COVER["Coverage Timeline Builder"]
        RISK["XGBoost Risk Scorer (Calibrated)"]
        RULES["COB Deterministic Rules"]
        AGENTS["7-Stage LangGraph Agent Workflow"]
        GATE["Confidence Gate (LLM proposes, code decides)"]
    end

    subgraph Agents["Agent Nodes"]
        A1["Identity Investigator"]
        A2["Coverage Investigator"]
        A3["Policy Researcher"]
        A4["Primacy Reasoner"]
        A5["Verification Critic"]
        A6["Financial Impact"]
        A7["Explanation Generator"]
    end

    subgraph Data
        PG["PostgreSQL 16 + pgvector"]
        REDIS["Redis (Broker + Cache)"]
        MLFLOW["MLflow Model Registry"]
    end

    subgraph Observability
        PROM["Prometheus"]
        GRAF["Grafana Dashboards"]
        ALERTS["Alert Rules → Slack/Email"]
        OTEL["OpenTelemetry Traces"]
    end

    UI & CLI --> LB --> TLS --> API
    AUTH --> MW --> V1
    V1 -->|sync| Pipeline
    V1 -->|async| REDIS -->|task| Workers --> Pipeline

    Pipeline --> MATCH --> COVER --> RISK --> RULES --> AGENTS --> GATE
    AGENTS --> A1 & A2 & A3 & A4 & A5 & A6 & A7
    A3 -->|pgvector search| PG

    Pipeline --> PG
    API --> PG
    Workers --> PG
    RISK -->|model load| MLFLOW
    BEAT -->|drift check| MLFLOW

    API --> PROM --> GRAF --> ALERTS
    API --> OTEL
```

## Key Architecture Decisions

| Decision | Rationale |
|---|---|
| **LLM proposes, deterministic code decides** | Regulatorily defensible — no black-box AI payment decisions |
| **SHA-256 hash-linked audit chain** | Tamper-evident trail meets CMS audit requirements |
| **Celery + Redis async** | Decouple API latency from investigation time; enables bulk processing |
| **pgvector semantic search** | Scales to 100K+ policy documents; better recall than TF-IDF |
| **Multi-tenant via RLS** | Data isolation without separate databases per customer |
| **MLflow model registry** | Versioned model governance with drift detection |
| **HPA on CPU + queue depth** | Auto-scales API and workers independently |

## Production Stack

| Layer | Technology |
|---|---|
| API Server | FastAPI + Uvicorn (4 workers) |
| Database | PostgreSQL 16 + pgvector |
| Cache / Broker | Redis 7 |
| Async Workers | Celery 5.4 |
| ML Pipeline | XGBoost + scikit-learn (calibrated) |
| Entity Resolution | Splink / Fellegi-Sunter |
| Agent Orchestration | LangGraph |
| LLM Providers | Gemini / OpenAI / OpenRouter (optional, offline fallback) |
| Model Registry | MLflow |
| Observability | Prometheus + Grafana + OpenTelemetry |
| Container | Docker (multi-stage, non-root) |
| Orchestration | Kubernetes (Helm chart) |
| CI/CD | GitHub Actions |
| TLS | cert-manager + Let's Encrypt |

## Data Flow

```mermaid
sequenceDiagram
    participant Client
    participant API as FastAPI
    participant Queue as Redis Queue
    participant Worker as Celery Worker
    participant DB as PostgreSQL
    participant LLM as LLM Provider

    Client->>API: POST /api/v1/claims/{id}/investigate-async
    API->>DB: Create task_status(QUEUED)
    API->>Queue: Submit investigation task
    API-->>Client: {task_id, status: QUEUED}

    Queue->>Worker: Dequeue task
    Worker->>DB: Update task_status(IN_PROGRESS)
    Worker->>Worker: Identity resolution (Splink)
    Worker->>Worker: Coverage timeline
    Worker->>Worker: XGBoost risk scoring
    Worker->>Worker: COB rules evaluation
    Worker->>DB: pgvector policy search
    Worker->>LLM: Policy analysis (optional)
    Worker->>LLM: Primacy reasoning (optional)
    Worker->>LLM: Verification critique (optional)
    Worker->>Worker: Deterministic confidence gate
    Worker->>DB: Store investigation result
    Worker->>DB: Append audit chain events
    Worker->>DB: Update task_status(COMPLETE)

    Client->>API: GET /api/v1/tasks/{task_id}
    API->>DB: Read task_status
    API-->>Client: {status: COMPLETE, result: {...}}
```

## Security Architecture

- **Authentication**: OAuth2 PKCE + OIDC token introspection (local JWT fallback)
- **Authorization**: Role-based (ANALYST, REVIEWER, AUDITOR, ADMIN) with tenant isolation
- **Transport**: TLS 1.3 mandatory via ingress
- **Headers**: HSTS, CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **Data at rest**: Field-level Fernet encryption for PII (member_name, member_dob)
- **Audit**: SHA-256 hash-linked chain from GENESIS (tamper-evident)
- **Rate limiting**: Sliding window per client IP (Redis-backed in production)
- **Secrets**: Kubernetes Secrets / environment variables (never in code)
