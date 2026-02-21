# Phase 2A-2 — Cashflow Projection (Validated Risk Layer)

Status: ⬚ BLOCKED (waiting on Phase 2A-1 shadow mode validation)

> **Entry Criteria**: Payment Risk Scoring AUC > 0.7 and False Positive Rate < 25% sustained for 2+ weeks.

---

## 1. Cashflow Prediction Widget

**Objective**: 30-day forward-looking cashflow projection using validated payment risk scores.

### Requirements:
- Inputs:
  - `expected_payments` (scheduled inflows)
  - `payment_risk_scores` (probability-adjusted — only if validated)
  - Recurring expenses (from `expenses` patterns)
  - Pending procurement payments
- Compute daily projected balance for next 30 days
- Highlight potential cash crunches (projected balance < configurable threshold)
- SQL view: `cashflow_forecast_view`
- Store snapshots in: `cashflow_forecast_snapshots` for accuracy tracking

### Accuracy Tracking:
- Compare 7-day-old projections against actual bank position
- **Target metric**: Projection error < 15% at 7-day horizon

### UI:
- Finance dashboard chart:
  - Projected inflows (green)
  - Projected outflows (red)
  - Net balance line
  - Warning zones (configurable threshold)
- Model Performance: projection accuracy trend

---

## Acceptance Criteria
- [ ] Cashflow projection chart live on Finance dashboard
- [ ] Projections use validated risk scores (not raw amounts)
- [ ] Accuracy tracking operational
- [ ] No automation — informational only
