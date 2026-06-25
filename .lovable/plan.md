## Problem

Order **143055** is a mirrored WooCommerce order:
- `source = 'website'`, `status = 'in_transit'`, `payment_status = 'pending'`, `amount_paid = 0`, `total_sales_amount = 139,280`.

In `src/hooks/useOrdersFiltering.ts`, website-mirror orders are only shown in **All Orders** (and counted in the unified rows) when `isWebsiteMirrorPaid(o)` is true:

```ts
const isWebsiteMirrorPaid = (o) =>
  o.payment_status === 'full' || (total > 0 && paid >= total);
```

Because no payment has been recorded against 143055 yet, it is dropped from the Orders list and Sales views, even though procurement has already moved it to `in_transit`. Procurement reads orders without this paid-only gate, so it still appears there.

The mirrored Woo live-feed branch also can't rescue it: the row is in `mirroredWooIds` (so it's skipped to avoid duplicates), and the underlying Woo payment status is `pending`.

## Fix

In `src/hooks/useOrdersFiltering.ts`, broaden the inclusion rule for website-mirror orders so any row that has progressed past the initial "PO received" stage is treated as visible, regardless of payment status:

```ts
const POST_PROCUREMENT_STATUSES = new Set([
  'procurement_to_plan',
  'procurement_in_process',
  'procurement_done',
  'to_ship',
  'in_transit',
  'delivery_done',
]);

const isWebsiteMirrorVisible = (o: Order) =>
  isWebsiteMirrorPaid(o) || POST_PROCUREMENT_STATUSES.has((o.status || '').toLowerCase());
```

Replace the three call sites that currently use `isWebsiteMirrorPaid`:
1. `filteredOrders` filter (line ~87/88) — `website_auto` and `all` branches.
2. `websiteAutoCount` loop (line ~191) and the `websiteMirrorPaidIds` collection used to suppress duplicate Woo live rows.

Rationale: payment can lag fulfilment for website orders (manual reconciliation, partial captures). Once Procurement has taken action, the order is operationally a real order and must appear in **Orders → All Orders**, **Website (Auto)**, and any downstream views that consume `filteredOrders` / `unifiedRows`.

No DB change. No schema change. No change to Procurement (already correct). Sales page consumes the same `orders` collection, so this fix surfaces 143055 there too.

## Verification

- Open **Orders → All Orders**, search "143055" → row appears with status In Transit.
- Switch source filter to **Website (Auto)** → row still appears; counts in the source dropdown include it.
- Switch to **Manual** → row is hidden (correct).
- Record a payment on 143055 → still visible (paid path), no duplicate.
- Spot-check a website order still in `po_received` with no payment → remains hidden (unchanged behaviour, already lives in "Website Pending Payment" tab).
