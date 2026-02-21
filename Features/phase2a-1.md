# Phase 2A-1 — Predictive Foundation (Shadow Mode)

Status: 🟡 PLANNED

> Phase 1.5 is stable. This phase introduces prediction models in **Shadow Mode only** — no automation, no decision enforcement, informational dashboards only.

---

## Principles

- **Shadow Mode**: All predictions are generated, stored, and displayed — but never trigger automated actions or block workflows.
- **Accuracy First**: Every model logs predictions vs. actuals for measurable validation before any automation is considered.
- **Isolated Validation**: Each model is independently testable. No model depends on another model's output in this phase.

---

## 1. Demand Forecasting Engine (Shadow Mode)

**Objective**: Predict future stock requirements based on historical sales velocity. Informational only.

### Why First:

- Clean numeric signals (quantities, dates)
- Measurable error (predicted vs. actual consumption)
- Direct business value (prevent stockouts)
- No behavioral complexity

### Requirements:

- Analyze `inventory_transactions` + `order_items` for trailing 30/60/90 day trends
- Compute per-product:
  - Average daily consumption rate
  - Days until stockout (at current velocity)
  - Recommended reorder quantity
- Store in: `demand_forecasts`
  - `product_id`, `product_name`, `forecast_date`, `predicted_daily_demand`, `days_to_stockout`, `recommended_reorder_qty`, `confidence`, `model_version`, `created_at`
- Edge function: `demand-forecast` (scheduled weekly via pg_cron)
- **No automation**: Does NOT auto-create tasks or trigger alerts (that remains Phase 1.5's job)

### Accuracy Tracking:

- Table: `forecast_accuracy_log`
  - `forecast_id`, `product_id`, `predicted_demand`, `actual_demand`, `measurement_period_days`, `mape_percent`, `logged_at`
- Weekly job compares past forecasts against actual transactions
- **Target metric**: MAPE (Mean Absolute Percentage Error) < 30% after 4 weeks

### UI:

- Inventory dashboard widget:
  - Products at risk of stockout (< 14 days projected)
  - Reorder recommendations (informational)
  - Demand trend sparklines
- Model Performance panel:
  - MAPE % trend chart
  - Per-category accuracy breakdown
  - Forecast vs. actual comparison table

---

## 2. Payment Risk Scoring (Shadow Mode)

**Objective**: Predict likelihood of late payment per invoice/customer. Informational only.

### Why Second:

- Depends on `invoice_aging_view` (stable since Phase 1)
- Historical payment patterns are structured and clean
- Low political sensitivity (finance, not sales)
- Clear validation metric (predicted delay vs. actual payment date)

### Requirements:

- Compute risk score (0–1) based on:
  - Historical payment patterns per customer (avg days to pay)
  - Current aging bucket
  - Invoice amount relative to customer average
  - Payment history consistency (variance)
- Store in: `payment_risk_scores`
  - `invoice_id`, `customer_company`, `risk_score`, `risk_level` (low/medium/high/critical), `factors` (JSONB), `model_version`, `scored_at`
- Edge function: `payment-risk-scoring`
  - Triggered on invoice creation + scheduled weekly re-scoring
- **No automation**: Does NOT send reminders, escalate, or block anything

### Accuracy Tracking:

- Table: `payment_risk_accuracy_log`
  - `score_id`, `invoice_id`, `predicted_risk_level`, `predicted_days_to_pay`, `actual_days_to_pay`, `was_late`, `logged_at`
- Scored when invoice is marked paid — compare prediction vs. reality
- **Target metrics**:
  - AUC > 0.7 after 30 days of data
  - False positive rate < 25%
  - Accuracy on "high risk" predictions > 60%

### UI:

- Risk badge on invoice list (color-coded, hover for factors)
- Finance dashboard widget:
  - High-risk accounts summary
  - Risk distribution chart
  - Predicted vs. actual payment timing scatter plot
- Model Performance panel:
  - AUC trend
  - Confusion matrix (predicted vs. actual late/on-time)
  - Per-customer accuracy

---

## Shadow Mode Exit Criteria

Models graduate from Shadow Mode to Active Mode (Phase 2A-2+) only when:

| Model           | Metric              | Threshold | Minimum Data         |
| --------------- | ------------------- | --------- | -------------------- |
| Demand Forecast | MAPE                | < 30%     | 4 weeks of forecasts |
| Payment Risk    | AUC                 | > 0.7     | 30+ scored invoices  |
| Payment Risk    | False Positive Rate | < 25%     | 30+ scored invoices  |

Until these thresholds are met, models remain informational only.

---

## Architecture Notes

- Edge functions are **idempotent** and **failure-tolerant** — scoring failures never block business operations
- All thresholds configurable via DB tables (no hard-coded values)
- `model_version` tracked in all prediction tables for future A/B testing
- Edge functions use Lovable AI supported models (Gemini/GPT) — no external API keys required
- `domain_events` used for event-driven triggers (not chained DB triggers)

---

## What Is NOT In This Phase

| Feature                                | Phase | Reason                                                       |
| -------------------------------------- | ----- | ------------------------------------------------------------ |
| Cashflow Projection                    | 2A-2  | Depends on validated payment risk scores                     |
| Dynamic Lead Re-Scoring                | 2B    | Behavioral signals need stable event tracking + dataset size |
| Smart Follow-Up Recommendations        | 2C    | Requires validated conversion model first                    |
| Any automated actions from predictions | 2A-2+ | Shadow Mode must prove accuracy first                        |

---

## Acceptance Criteria

Phase 2A-1 is complete when:

- [ ] Demand forecasts running weekly with per-product predictions stored
- [ ] Forecast accuracy logging operational (MAPE computed weekly)
- [ ] Payment risk scores computed on invoice creation and weekly refresh
- [ ] Risk accuracy logging operational (scored on payment receipt)
- [ ] Both model performance dashboards live with trend charts
- [ ] Shadow Mode clearly labeled in UI ("Predicted · Not yet validated")
- [ ] No automation triggered by any prediction
- [ ] No regression in Phase 1/1.5 functionality
