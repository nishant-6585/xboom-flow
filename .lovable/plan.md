## Goal

1. Rename **Orders** tab → **All Orders**, **Xboom Website** → **Website Orders**.
2. **All Orders** shows manual + website orders interleaved (newest first) with a **Source** filter (All / Manual / Website).
3. **Website Orders** still lists Woo orders (default = `processing`, plus a status filter that exposes every Woo status — `pending`, `processing`, `on-hold`, `completed`, `delivered`, `cancelled`, `refunded`, `failed`, `return-*`).
4. Status, tracking info, and customer note can be edited from **either** tab for a website order, and the change is pushed to WooCommerce (PUT `/wp-json/wc/v3/orders/{id}`). On success, the local `woocommerce_orders` row is updated so both tabs reflect immediately.
5. Reverse direction: Woo webhook keeps updating us live (already in place); we additionally refetch when the user focuses the Orders page or switches tabs.

## What changes

### Frontend — `src/pages/Orders.tsx`
- Rename tab triggers: `list` → label "All Orders", `website` → label "Website Orders". (Keep internal `value=` strings to avoid breaking deep links; old `?tab=list` still works.)
- In the All Orders tab:
  - Add a **Source** `Select` (All / Manual / Website).
  - Build a unified array `unifiedOrders` that merges `filteredOrders` (manual) and the website subset of `wooOrders`, projected into a common card-friendly shape (`id`, `orderNumber`, `customer`, `amount`, `status`, `date`, `source`, plus the raw row).
  - Sort by `order_date || woo_created_at || created_at` desc.
  - Re-use `OrderCard` for manual rows and `WooOrderCard` for website rows inside the same paginated list (50/page).
  - Existing manual filters (status, payment, sales person, etc.) only apply when source = Manual or All-with-manual-included; for Website rows we honor a small additional `wooStatusFilter` exposed in the same filter row.
- In the Website Orders tab (`value="website"`):
  - Default `wooStatusFilter = 'processing'`.
  - Replace the current status select options with the full Woo status list (`pending, processing, on-hold, completed, delivered, cancelled, refunded, failed`).
  - Drop the existing `WEBSITE_ORDER_CUTOFF_MS` / `isWooOrderStatus` filter for this tab — show every status the user can pick.
- Refetch hook into `window` `focus` and tab change → call `refetchWooOrders()` + `refetch()` (manual).
- Open `WooOrderDetailDialog` from clicks in both tabs.

### `src/components/orders/WooOrderDetailDialog.tsx`
- Add an **Update** section visible to admin / supply_chain / sales_manager / finance:
  - Status `Select` (Woo status list, same as above).
  - Tracking carrier (free text) + tracking number inputs.
  - Customer note textarea (optional).
  - "Save & push to Woo" button → calls edge function `update-woo-order-status` with new payload `{ woo_order_id, new_status?, tracking_carrier?, tracking_number?, customer_note?, allow_reopen? }`. Shows toast on success/error. On success, calls `onUpdated()` to refetch.
- Reuses existing transition guardrails (terminal-state lock, allow_reopen for privileged roles).

### `src/lib/wooOrderStatuses.ts`
- Export `ALL_WOO_STATUSES = ['pending','processing','on-hold','completed','delivered','cancelled','refunded','failed']` for the selects. Keep `WOO_ORDER_STATUSES` as-is for the legacy lead/order routing.

### Edge function — `supabase/functions/update-woo-order-status/index.ts`
- Accept optional `tracking_carrier`, `tracking_number`, `customer_note` alongside `new_status`.
- Build the Woo PUT body conditionally:
  - `status` only when provided & changed.
  - `customer_note` → sent as `customer_note` (Woo customer-visible).
  - Tracking → sent via `meta_data: [{ key:'_xboom_tracking_carrier', value:… }, { key:'_xboom_tracking_number', value:… }]` (Woo core has no native tracking field; meta is the safe contract).
- Allow updating tracking/note without a status change (skip transition validation in that case).
- On Woo success, update local row: `tracking_status`, `tracking_number` (existing columns) and append note to `woo_sync_logs`.
- Log everything in `woocommerce_order_status_logs` as today.

### Database
- No schema migration needed — `woocommerce_orders.tracking_number` and `tracking_status` already exist.

## Out of scope

- Cron-based safety poll (deferred — webhook + on-focus refetch is what you picked).
- Restructuring `useOrders` / `useWooCommerceOrders` into one query (kept independent; merge happens in the page).
- Pushing manual (non-website) order edits to Woo — only website orders sync.

## Risks / notes

- `WooOrderCard` and `OrderCard` have different visual heights — the interleaved view will look slightly heterogeneous. I'll add a small `Source` chip on each row so users can tell them apart at a glance.
- Tracking via Woo meta is read by most shipping plugins (AfterShip, etc.) but not displayed in Woo admin by default. If you use a specific tracking plugin (e.g. AST), tell me the meta keys it expects and I'll switch to those.
- Status whitelist on the edge function already covers everything you can pick.
