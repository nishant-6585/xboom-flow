
# Phase 2A-1: Predictive Foundation (Shadow Mode) — Execution Plan

## Status: ✅ IMPLEMENTED

## What Was Built

### Database Tables
- `demand_forecasts` — per-product daily demand predictions with confidence levels
- `forecast_accuracy_log` — MAPE tracking for forecast validation
- `payment_risk_scores` — per-invoice risk scores with factor breakdown
- `payment_risk_accuracy_log` — prediction vs actual payment tracking

### Edge Functions
- `demand-forecast` — Rolling 30-day mean baseline model (v1-rolling-mean)
  - Computes per-product avg consumption at 30/60/90d windows
  - Days-to-stockout calculation
  - Reorder quantity recommendations
  - Accuracy logging against 7-day-old forecasts
  - Graceful failure: errors logged, never blocks UI
  
- `payment-risk-scoring` — Heuristic payment risk model (v1-heuristic)
  - 4-factor scoring: historical patterns (35%), aging bucket (30%), amount ratio (15%), variance (20%)
  - Accuracy logging on invoice payment
  - Graceful failure: errors logged, continues to next invoice

### Cron Jobs
- `weekly-demand-forecast` — Mondays 3 AM UTC
- `weekly-payment-risk-scoring` — Mondays 4 AM UTC

### UI Widgets
- **Inventory → Demand Forecast tab**: Stockout risk chart, all forecasts table, model performance panel
- **Finance → Payment Risk tab**: Risk distribution pie, high-risk accounts table, model accuracy panel
- Both widgets clearly labeled "Shadow Mode — Predicted · Not yet validated"

## Shadow Mode Rules
- ✅ No automation triggered by any prediction
- ✅ No decision enforcement
- ✅ Informational dashboards only
- ✅ Manual "Run" buttons for on-demand execution
- ✅ Confidence = 'low' when < 60 days of historical data

## Exit Criteria (Track Weekly)
| Model | Metric | Target | Current |
|-------|--------|--------|---------|
| Demand Forecast | MAPE | < 30% | Pending data |
| Payment Risk | AUC | > 0.7 | Pending data |
| Payment Risk | False Positive Rate | < 25% | Pending data |
