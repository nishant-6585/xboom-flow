PROMPT FOR LOVABLE — XBOOM PHASE 1 (INTELLIGENCE FOUNDATION)

Implement Phase 1 — Stability + Intelligence Foundation for Xboom Workflow.

This phase must be designed with future Phase 2–4 scalability in mind (predictive engines, background jobs, domain events, etc.). Do NOT introduce architectural shortcuts that will block those expansions.

Maintain existing RLS, audit logs, immutability, and role-based access patterns.

1️⃣ Duplicate Lead Detection (Fuzzy Matching Engine)
Objective:

Prevent duplicate enquiries and improve data quality for future ML models.

Requirements:

On enquiry creation:

Check for possible duplicates using:

Phone number (exact match)

Email (exact match)

GST number (exact match)

Company name (fuzzy match using trigram similarity or ILIKE threshold)

Use PostgreSQL pg_trgm extension for fuzzy matching.

If similarity > configurable threshold:

Do NOT block creation.

Show warning modal in frontend listing potential matches.

Log event in edit_history or new duplicate_alerts table.

Create new table:
duplicate_alerts

enquiry_id

matched_enquiry_id

similarity_score

created_at

Future-proof for deduplication automation in Phase 2.

2️⃣ Auto AI Lead Scoring on INSERT
Objective:

Remove manual AI scoring dependency.

Requirements:

Modify ai-lead-scoring edge function to support:

Trigger-based invocation on enquiry INSERT.

Batch mode support (future use).

Add new columns to enquiries:

ai_score (numeric 1–10)

probability_to_close (numeric 0–1)

ai_priority_level (enum: low, medium, high, critical)

ai_last_scored_at (timestamp)

ai_confidence (numeric 0–1)

On enquiry INSERT:

Trigger edge function.

Store structured JSON output.

Log scoring event in new table:
ai_scoring_logs

enquiry_id

raw_response

score

probability

created_at

Ensure scoring failures do NOT block enquiry creation.

3️⃣ Weighted Revenue Forecast Dashboard (Sales Intelligence)
Objective:

Move from stage-based forecasting to probability-weighted forecasting.

Requirements:

Compute:
weighted_revenue = probability_to_close \* estimated_deal_value

Add new Sales Dashboard widget:

Total Pipeline Value

Weighted Forecast Value

Conversion Rate (historical)

Deals at Risk (probability drop over time)

Create SQL view:
sales_weighted_forecast_view

Restrict to Sales, Admin roles.

Prepare structure for ML-based forecasting in Phase 2.

4️⃣ Margin Guardrail Engine (Quote Risk Analyzer)
Objective:

Prevent margin erosion.

Requirements:

Add cost_price field to pricelist if not already normalized.

On quote creation:

Compute per-item margin %

Compute overall margin %

Add configurable margin threshold table:
margin_thresholds

category

minimum_margin_percent

If margin < threshold:

Auto-flag quote

Force admin approval

Log event in quote_risk_flags

Show visual indicator in UI:

Green (safe)

Yellow (borderline)

Red (below threshold)

Do NOT auto-reject. Only enforce review.

Future: Phase 3 automated rule engine.

5️⃣ Shopify ↔ Inventory Synchronization
Objective:

Unify stock visibility.

Requirements:

When Shopify order processed:

Create corresponding inventory_transaction of type “Shopify Sale”.

Reduce internal stock.

On internal procurement:

Optionally sync stock quantity to Shopify (configurable).

Add setting:
inventory_sync_settings

enable_shopify_sync (boolean)

sync_direction (internal_to_shopify / bi-directional)

Add reconciliation report:

Detect stock mismatch between systems.

Ensure idempotency to avoid duplicate deductions.

6️⃣ Low-Stock Alert Engine
Objective:

Prevent stockouts before predictive model exists.

Requirements:

Add columns to inventory:

reorder_point

safety_stock

last_alert_sent_at

Scheduled pg_cron job:

Runs every 6 hours.

If current_stock <= reorder_point:

Create task for Supply Chain.

Send Slack notification.

Log alerts in:
inventory_alert_logs

This prepares ground for AI forecasting in Phase 2.

7️⃣ Invoice Aging Analysis (30/60/90 Buckets)
Objective:

Improve cash flow visibility.

Requirements:

Create SQL view:
invoice_aging_view

current

0–30

31–60

61–90

90+

Add Finance dashboard:

Total overdue

Aging distribution chart

High-risk accounts (over 60 days)

Prepare for Phase 2 payment risk scoring.

8️⃣ Command Palette (Productivity Multiplier)
Objective:

Reduce UI navigation friction.

Requirements:

Global keyboard shortcut:
Ctrl/Cmd + K

Search across:

Customers

Orders

Invoices

Enquiries

Suppliers

Inventory items

Debounced search with PostgREST.

Respect RLS.

9️⃣ Architectural Safeguards

To prepare for future phases:

Introduce new table:
domain_events

event_type

entity_id

payload (JSONB)

processed (boolean)

created_at

Use it minimally in Phase 1, but ensure new features publish events instead of chaining triggers excessively.

Keep edge functions stateless.

No hard-coded business thresholds.

All thresholds configurable via DB table.

Acceptance Criteria

Phase 1 is complete when:

Lead scoring is automatic.

Duplicate alerts visible.

Weighted forecast dashboard operational.

Margin guardrail flags active.

Shopify stock sync working.

Low-stock alerts firing.

Aging dashboard visible.

Command palette usable.

No breaking changes.
No regression in RLS.
No manual data migration required.

Important Constraints

Maintain single-tenant architecture.

Maintain performance under 100 concurrent users.

Avoid introducing heavy microservices unless absolutely necessary.

All new tables must include audit timestamps.

Implement Phase 1 as an incremental migration with proper SQL migrations and edge function updates.

This phase strengthens:

Data quality

Revenue visibility

Margin protection

Inventory awareness

User productivity

It does NOT yet introduce heavy ML models — those come in Phase 2.

When Phase 1 is deployed and stable, we will design Phase 2 predictive engines on top of this reinforced base.

You are not just adding features.

You are installing cognitive scaffolding into the operating system.

Execute Phase 1 cleanly.
