# ClaimArmor AI — Presentation Script

> **3 presenters · 2 content slides each · Core = 5:00 sharp**

Replace "Presenter 1/2/3" with your actual names before rehearsal. Each slide has a **core script** (the tight 5-minute run) and an **optional add-on** (extra detail if you have closer to 6–7 minutes or a judge's question primes the topic).

| Presenter | Slides | Core only | Core + add-ons |
|---|---|---|---|
| 1 | Title (open) → Problem & Business Context → Solution Overview | ~1:50 | ~2:40 |
| 2 | Architecture & Tech Stack → Solution in Action | ~1:30 | ~2:10 |
| 3 | Outputs & Evidence → Business Value & Scale-up Path → Thank You (close) | ~1:40 | ~2:25 |
| **Total** | | **~5:00** | **~7:15** |

> [!TIP]
> **Pacing:** ~140 words/min is natural. Pause half a beat before big stats ($200–300M, 93.3%, $3.0M) so they land. Don't rush the numbers.

---

## PRESENTER 1

### Opening (Title slide) — ~15 sec

"Good [morning/afternoon], we're [Name], [Name], and [Name], and we built **ClaimArmor AI** — a pre-payment Coordination of Benefits audit system that catches overpayment leakage *before* claims are paid, with a human always in the loop. Let's walk you through it."

---

### Slide 2 — Problem & Business Context

**Core (~45 sec):**

"In U.S. healthcare, Coordination of Benefits — or COB — decides which payer pays first when a member has overlapping coverage, like employer insurance plus Medicare, or auto liability. Today, most payers only catch these billing errors *after* paying — a slow, costly 'pay and chase' recovery process.

Industry estimates put COB leakage at **2 to 3 percent of claim volume** — billions of dollars a year across the industry. For a payer processing $10 billion in claims, that's **$200 to $300 million** at risk. And the current fix isn't efficient either — rules-only screening flags nearly **47 percent of claims** for manual review, at about $35 per review, plus $75 in delay cost for every false positive."

**Optional add-on (~25 sec):**

"This isn't a rare edge case — it happens on every claim with overlapping coverage: Medicare-plus-employer combos, accident and auto liability claims, even secondary plans that are technically inactive but still on file. Because recovery happens *after* the money is already out the door, it's often slow and unsuccessful. That's exactly why the leak has to be caught before payment, not chased afterward."

---

### Slide 3 — Solution Overview

**Core (~50 sec):**

"That's the problem ClaimArmor AI solves. It resolves member identity across systems using probabilistic record linkage, builds a coverage timeline, and scores overpayment risk using a calibrated XGBoost model combined with deterministic COB rules. It then retrieves CMS policy evidence and runs a **seven-stage agent workflow** — built with LangGraph — that reasons through each case and explains its findings.

Every claim gets routed to one of four outcomes — **Clear, Hold, Human Review, or Undetermined** — before payment ever goes out.

And our core safety principle: **the LLM proposes, deterministic code decides, and humans review.** The LLM can never release or deny a payment."

**Optional add-on (~25 sec):**

"In practice, three roles interact with the system: analysts ingest and investigate claims, reviewers approve and write back the final decision, and auditors get read-only access to verify the evidence chain. It sits directly in the adjudication flow as a pre-payment audit gate — starting with a raw claim and ending with a routed, explained decision, a financial-impact estimate, and a tamper-evident audit trail."

**Handoff:**

"I'll pass it to [Name] to show you how we actually built this."

---

## PRESENTER 2

### Slide 4 — Architecture & Tech Stack

**Core (~45 sec):**

"The pipeline runs in five layers. First, users work through a role-based console. Claims are ingested via FastAPI. A hybrid analysis layer handles identity resolution using Splink's Fellegi-Sunter model and risk scoring with calibrated XGBoost. Then an agent investigation layer — seven LangGraph nodes — retrieves CMS policy evidence and reasons through the case. Finally, a safety gate applies deterministic rules. Again — the LLM cannot authorize payment.

Under the hood: FastAPI, Pydantic, and SQLAlchemy for the backend; XGBoost and scikit-learn for ML; LangGraph for orchestration; and Prometheus and Grafana for observability. Every decision is logged in a **SHA-256 hash-linked audit chain** — like a simplified blockchain — so nothing can be altered after the fact."

**Optional add-on (~30 sec):**

"A few design decisions worth highlighting: it's seven *observable* stages, not one black-box LLM call — so every decision is fully traceable. The entire system runs fully offline if needed, since LLM providers like Gemini or OpenAI are optional enhancements, not dependencies. Our risk model outputs calibrated probabilities via CalibratedClassifierCV, which is what makes the routing thresholds at 0.35 and 0.70 statistically meaningful rather than arbitrary cutoffs. And on the data side, we support both SQLite for zero-setup demos and PostgreSQL with pgvector for production — one environment variable switches between them."

---

### Slide 5 — Solution in Action

**Core (~45 sec):**

"Here's the solution actually running — real screenshots from our live app, not mockups. This is the entry point: role-based login for analysts, reviewers, auditors, and admins, clearly marked as synthetic data only.

And here's a real case moving through the system — claim CLM-HOLD-001, a $20,000 accident claim with a deliberate identity typo and missing member ID. The system investigates it, flags **98% risk**, and routes it to **Hold** at 93% confidence, estimating **$19,540 at risk**. It explains exactly why: the auto insurer may be responsible first, citing the specific COB rule and CMS evidence that triggered the decision."

**Optional add-on (~10 sec):**

"That risk score isn't a black box — it's built from concrete features like claim amount, active coverage count, and whether auto or employer coverage is on file."

**Handoff:**

"Now [Name] will walk you through the results and what this means for the business."

---

## PRESENTER 3

### Slide 6 — Outputs & Evidence

**Core (~45 sec):**

"So what did we actually measure? We trained and tested on 3,000 synthetic claims with a 660-claim held-out test set. Our XGBoost model hits **82.7% precision** and **77% recall**. But the real story is the hybrid approach: combining rules, ML, and a human review gate catches **93.3% of overpayment value** — more than either approach alone — while sending only **42.4% of claims** to manual review, down from 46.8% with rules only.

We also stress-tested edge cases — like that deliberate identity typo with a missing member ID — and the system correctly held it for review. The reviewer writes back their decision, and the SHA-256 audit chain verifies the full evidence trail end-to-end."

**Optional add-on (~20 sec):**

"To put the three approaches side by side: rules-only gets 97% recall but only 72% precision with a 46.8% review rate. ML-only is more precise at 82.7% but drops to 83.7% value recall. The hybrid is the sweet spot — 93.3% value recall at a lower review rate than rules alone. On top of that, our policy retrieval scored 100% Hit@4 and 80% mean reciprocal rank on five benchmark queries."

---

### Slide 7 — Business Value & Scale-up Path

**Core (~45 sec):**

"In business terms: our hybrid system catches **93.3% of overpayment value** before payment, with fewer manual reviews than rules alone. Using our in-app ROI simulator — modeling 100,000 claims a year at a $2,500 average and a 2.5% leakage rate — we estimate a **$3 million annual net benefit**, a **400.8% ROI**.

To be clear: both numbers come from synthetic data and user-controlled assumptions, not real payer outcomes. This demonstrates the model works — it is not a guaranteed dollar figure.

Looking ahead, scaling to production means enterprise SSO, a complete CMS policy corpus with vector embeddings, async processing with Celery, drift and fairness monitoring, and certified claims-adjudication integration under a HIPAA and SOC 2 program."

**Optional add-on (~25 sec):**

"Breaking that $3 million down: we modeled $250 million in processed claim value, $6.25 million in gross leakage, and $5.23 million prevented — minus $875K in review costs, $600K in false-positive delay costs, and $750K in platform costs. Every one of those inputs is editable through the API, which is exactly why we present this as a scenario, not a forecast."

---

### Closing (Thank You slide) — ~10 sec

"That's ClaimArmor AI — **prevention over pay-and-chase**, with a human always in the loop. Thank you — we're happy to take your questions."

---

## Quick Q&A Cheat Sheet

| Likely Question | Key Point |
|---|---|
| "Why not let the LLM decide?" | Safety — LLM proposes, deterministic code decides, humans review. Prevents hallucination-driven payment errors. |
| "What if the LLM is unavailable?" | Every LLM call has a deterministic offline fallback. System works fully offline. |
| "Why not just use rules?" | Rules alone flag 46.8% for review. Hybrid catches more value (93.3%) at a lower review rate (42.4%). |
| "Is this HIPAA compliant?" | No — all data is synthetic. Production would require encryption, BAAs, access logging, and formal certification. |
| "Where does the $3M come from?" | ROI simulator with editable defaults: 100K claims, $2,500 avg, 2.5% leakage. Conservative ML-only detection rate (83.7%), not best-case hybrid. |
| "What's your source for 2-3% leakage?" | Planning assumptions to frame the business case, not from a single named study. Industry reports (CAQH, Withum) support similar ranges. |
| "Could this work in India?" | Yes — swap CMS rules for IRDAI guidelines, retrain ML on Indian claims data. The 7-stage architecture is jurisdiction-agnostic. |
| "How do you prevent tampering?" | SHA-256 hash-linked audit chain from GENESIS. Modifying any event breaks all subsequent hashes. |

> [!IMPORTANT]
> **If a judge cross-references the ROI slide ($3M) with the evaluation slide (93.3%):** The ROI simulator uses a more conservative ML-only detection rate (83.7%) and an independent review-rate input (25%), not the best-case hybrid numbers. Say: *"The ROI simulator ships with conservative default assumptions, not the best-case hybrid numbers — every input is user-editable, which is exactly why we don't present $3.0M as a guaranteed figure."*

> [!TIP]
> **If you don't know an answer:** Say *"That's a production requirement we've documented in our limitations — here's what we'd do..."* and describe the enterprise path. Never claim the demo is production-ready.
