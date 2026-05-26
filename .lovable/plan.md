## Scope

Only **Processing** website orders get the new workflow. Other statuses (Pending/On Hold/Completed/Cancelled/Refunded/Failed/etc.) remain untouched in the UI — no status dropdown, no tracking form.

## 1. Tabs rename (Orders page)

`src/pages/Orders.tsx`
- "Manual Order" (current "Orders" / Xboom list) and "Website Order" (current Xboom Website) — only label changes. `useOrders` already excludes website rows, so list contents don't change. Website orders remain reachable through global search (`CommandPalette` queries `woocommerce_orders` directly — already works).

## 2. Status options for Processing → richer set

Add **Shipped** (new), keep **Delivered**, **Completed**, **On Hold**. (Pending stays internal — not a user-selectable target.)

Files:
- `src/components/orders/WooOrderStatusActions.tsx`
  - Add `{ value: 'shipped', label: 'Shipped' }` to `WOO_STATUS_OPTIONS`.
  - Gate the whole status-selector UI so it only renders when `normalized === 'processing'`. For any other status, show a read-only "Final/locked state" badge (existing terminal UI pattern). This implements the "only processing is updatable" rule.
- `supabase/functions/update-woo-order-status/index.ts`
  - Add `shipped` to `ALLOWED_STATUSES`.
  - Server-side guard: reject any transition where `previousStatus !== 'processing'` (except the existing reopen path) with `INVALID_TRANSITION`.
  - Add `shipped` to `NOTIFIABLE_STATUSES` + a WhatsApp template entry (`order_shipped_v1`).

## 3. Tracking entry + push to Woo

New dialog `AddTrackingDialog` opened from `WooOrderDetailDialog` (only when status is `processing`).

Fields (per user answers): Provider (Select w/ Custom Provider fallback), Tracking #, Tracking URL (optional), Date Shipped (defaults to today). On save: status auto-flips to `shipped`.

Provider list = the existing `COURIER_PARTNERS` from `src/lib/courierTracking.ts` (already covers Delhivery, Bluedart, DTDC, Xpressbees, Ecom, FedEx, DHL, India Post, etc.) plus an explicit "Custom Provider" option.

New edge function `push-woo-tracking`:
- Auth + role check identical to `update-woo-order-status` (admin / supply_chain / sales_manager / finance).
- Zod-validates body: `{ woo_order_id, provider, tracking_number, tracking_url?, date_shipped? }`.
- Maps `provider` → Woo Shipment Tracking format. If `provider` matches a WC-native carrier slug (small allowlist: dhl, fedex, ups, usps, royal-mail, dpd, tnt) use `tracking_provider`; otherwise send `custom_tracking_provider: provider` and `custom_tracking_link: tracking_url`.
- POST `/wp-json/wc-shipment-tracking/v3/orders/{id}/shipment-trackings` (falls back to adding an order note `Tracking: <provider> <number> <url>` if the plugin endpoint returns 404 — keeps push resilient when the plugin is not installed).
- Then PUT `/wp-json/wc/v3/orders/{id}` with `status: 'shipped'`.
- Updates `woocommerce_orders` row: `tracking_number`, `courier`, `tracking_status='shipped'`, `order_status='shipped'`. The existing `trg_woo_order_shipment_notify` trigger will queue the customer WhatsApp.
- Inserts an audit row into `woocommerce_order_status_logs`.

UI surfacing:
- `WooOrderDetailDialog` gets a new "Add Tracking" button + collapsible form (only when `order_status === 'processing'`).
- After save, refetch order + close the form.

## 4. No DB migration needed

`woocommerce_orders` already has `tracking_number`, `courier`, `tracking_status` columns. The new edge function writes to them.

## Out of scope (won't touch)

- Reorder/move historical website rows — they already live only in `woocommerce_orders` (separate table from `orders`); they're not in the Manual tab today.
- Non-processing statuses keep their existing dialog behaviour (read-only status timeline).
- Sales/marketing analytics — already exclude website per `AnalyticsScopeContext`.

## Files touched

1. `src/pages/Orders.tsx` — tab labels only
2. `src/components/orders/WooOrderStatusActions.tsx` — add Shipped, gate to processing
3. `src/components/orders/WooOrderDetailDialog.tsx` — mount tracking section for processing orders
4. `src/components/orders/AddTrackingDialog.tsx` — **new**
5. `supabase/functions/update-woo-order-status/index.ts` — allow `shipped`, restrict source to processing, notify
6. `supabase/functions/push-woo-tracking/index.ts` — **new**
7. `supabase/config.toml` — register new function with `verify_jwt = false`

Confirm and I'll build it.