# Phase 2A — Predictive Intelligence Foundation

Status: 🟡 PLANNED

> **Prerequisite**: Phase 1.5 (Operational Hardening) must be stable for 1–2 weeks before starting.

---

## 1. AI-Powered Payment Risk Scoring

**Objective**: Predict likelihood of late payment per invoice/customer.

### Requirements:
- Build on `invoice_aging_view` from Phase 1
- Compute risk score (0–1) based on:
  - Historical payment patterns per customer
  - Current aging bucket
  - Invoice amount relative to customer average
  - Industry/category trends
- Store results in new table: `payment_risk_scores`
  - `invoice_id`, `customer_company`, `risk_score`, `risk_level` (low/medium/high/critical), `factors` (JSONB), `scored_at`
- Edge function: `payment-risk-scoring`
  - Triggered on invoice creation + scheduled weekly re-scoring
- UI: Risk badge on invoice list + Finance dashboard widget showing high-risk accounts

---

## 2. Demand Forecasting Engine (Inventory)

**Objective**: Predict future stock requirements based on historical sales velocity.

### Requirements:
- Analyze `inventory_transactions` + `order_items` for trailing 30/60/90 day trends
- Compute per-product:
  - Average daily consumption rate
  - Days until stockout (at current velocity)
  - Recommended reorder quantity
  - Seasonal adjustment factor (if sufficient data)
- Store in: `demand_forecasts`
  - `product_id`, `forecast_date`, `predicted_daily_demand`, `days_to_stockout`, `recommended_reorder_qty`, `confidence`, `model_version`
- Edge function: `demand-forecast` (scheduled weekly via pg_cron)
- UI: Inventory dashboard widget showing:
  - Products at risk of stockout (< 14 days)
  - Reorder recommendations
  - Demand trend sparklines
- Builds on Phase 1.5 low-stock alerts — forecasting prevents alerts rather than reacting to them

---

## 3. Lead Conversion Prediction (Enhanced AI Scoring)

**Objective**: Evolve AI lead scoring from static to dynamic — re-score leads based on engagement signals.

### Requirements:
- Track engagement events in `domain_events`:
  - Quote sent, follow-up logged, meeting scheduled, response received, price negotiation
- Re-score leads when engagement events are logged (debounced, max 1x per 6 hours)
- New scoring dimensions:
  - Engagement velocity (actions per day)
  - Time since last interaction (decay factor)
  - Deal size vs. historical win rate for similar deals
  - Sales person's historical conversion rate
- Update `enquiries.probability_to_close` with new prediction
- Log score changes in `ai_scoring_logs` for audit trail
- UI: "Probability Trend" mini-chart on enquiry detail view

---

## 4. Smart Follow-Up Recommendations

**Objective**: AI-suggested next actions for each active lead.

### Requirements:
- Edge function: `follow-up-recommendations`
- Inputs: lead data, engagement history, similar won/lost deals
- Outputs stored in: `follow_up_recommendations`
  - `enquiry_id`, `recommendation_type` (call/email/meeting/quote), `reasoning`, `priority`, `suggested_date`, `created_at`, `is_actioned`
- Triggered:
  - On lead score change
  - On staleness (no activity for 48+ hours on hot leads)
- UI: "Suggested Actions" card on lead detail + daily digest notification

---

## 5. Cashflow Prediction Widget

**Objective**: 30-day forward-looking cashflow projection.

### Requirements:
- Inputs:
  - `expected_payments` (scheduled inflows)
  - `payment_risk_scores` (probability-adjusted)
  - Recurring expenses (from `expenses` patterns)
  - Pending procurement payments
- Compute daily projected balance for next 30 days
- Highlight potential cash crunches (projected balance < threshold)
- SQL view: `cashflow_forecast_view`
- UI: Finance dashboard chart with:
  - Projected inflows (green)
  - Projected outflows (red)
  - Net balance line
  - Warning zones

---

## Architecture Notes

- All ML/prediction edge functions must be **idempotent** and **failure-tolerant**
- Use `domain_events` table for event-driven triggers (not chained DB triggers)
- All thresholds remain **configurable via DB tables** (no hard-coded values)
- Model versions tracked in forecast/score tables for future A/B testing
- Edge functions use Lovable AI supported models (Gemini/GPT) — no external API keys required

---

## Dependencies

| Feature | Depends On |
|---------|------------|
| Payment Risk Scoring | Phase 1 `invoice_aging_view` |
| Demand Forecasting | Phase 1.5 `inventory_sync` + `low-stock-alerts` |
| Lead Conversion Prediction | Phase 1 `ai-lead-scoring` + `domain_events` |
| Follow-Up Recommendations | Lead Conversion Prediction |
| Cashflow Prediction | Payment Risk Scoring + `expected_payments` |

---

## Acceptance Criteria

Phase 2A is complete when:
- [ ] Payment risk scores computed and visible on invoices
- [ ] Demand forecasts running weekly with stockout predictions
- [ ] Lead scores dynamically update based on engagement
- [ ] Follow-up recommendations surfacing for active leads
- [ ] Cashflow projection chart live on Finance dashboard
- [ ] No regression in Phase 1/1.5 functionality
- [ ] All predictions logged with confidence scores for validation
