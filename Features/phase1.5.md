# Phase 1.5 — Operational Hardening

Status: ✅ COMPLETE

## 1. Margin Guardrail Enforcement (with Approval Workflow)

**Hook**: `src/hooks/useMarginGuardrail.ts`
**UI**: `src/components/billing/MarginRiskIndicator.tsx`
**Integration**: QuoteForm + useQuotes

### How it works:
- On quote creation, each item's margin is computed against `pricelist.cost_price`
- Category-specific thresholds in `margin_thresholds` table (pre-seeded for all categories)
- Three risk levels: **Safe** (green), **Warning** (yellow), **Danger** (red)
- If any item is below `minimum_margin_percent` → quote is **blocked** until Admin/Finance approves
- Risk flags auto-logged in `quote_risk_flags` table
- Admin/Finance can approve margin exceptions via `approveQuoteRisk()`
- GST is excluded from margin calculations for accuracy

---

## 2. Shopify ↔ Inventory Synchronization

**Modified**: `supabase/functions/shopify-order-processor/index.ts`
**Config**: `inventory_sync_settings` table (toggle: `enable_shopify_sync`)

### How it works:
- When `enable_shopify_sync = true`, every processed Shopify order automatically creates `inventory_transactions`
- Each line item matched by `product_name` (case-insensitive) against internal `inventory` table
- Idempotent: uses `reference_number = SHOPIFY-{orderId}-{lineItemId}` to prevent duplicate deductions
- Stock automatically decremented via existing DB trigger (`update_inventory_stock`)
- `last_sync_at` updated on each sync run
- Currently supports `internal_to_shopify` direction (configurable for future bi-directional)

**To enable**: Update `inventory_sync_settings` → set `enable_shopify_sync = true`

---

## 3. Low-Stock Alert Automation (Slack + Task Creation)

**Edge Function**: `supabase/functions/low-stock-alerts/index.ts`
**DB Function**: `get_low_stock_items()` — column-to-column comparison for `current_stock <= reorder_point`
**Cron**: Runs every 6 hours (`0 */6 * * *`)

### How it works:
- Scans `inventory` for items where `current_stock <= reorder_point` and `reorder_point > 0`
- Skips items alerted within last 6 hours (`last_alert_sent_at`)
- For each low-stock item:
  1. Logs to `inventory_alert_logs`
  2. Creates priority task for Supply Chain team (critical if at/below `safety_stock`)
  3. Creates in-app notification
  4. Updates `last_alert_sent_at`
- Sends aggregated Slack message to procurements channel (via webhook or bot token)
- Two severity levels: **⚠️ Warning** (below reorder) and **🚨 Critical** (below safety stock)

---

## Configuration Checklist

| Setting | Table | Current |
|---------|-------|---------|
| Margin thresholds | `margin_thresholds` | ✅ Pre-seeded (7 categories) |
| Shopify sync | `inventory_sync_settings` | ⚠️ Disabled (set `enable_shopify_sync = true` when ready) |
| Reorder points | `inventory.reorder_point` | Set per product |
| Safety stock | `inventory.safety_stock` | Set per product |
| Low-stock cron | pg_cron | ✅ Active (every 6 hours) |
