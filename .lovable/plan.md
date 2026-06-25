## Diagnosis (no code changes)

### 1. Does the order exist in `orders`?

Yes. Direct DB query confirms a single row:

```
order_number     : 143055
id               : b196ab49-994e-4991-aee6-c379bc2931bb
source           : website
status           : in_transit
payment_status   : pending
total_sales_amount: 139,280.00
amount_paid      : 0.00
deleted_at       : null
order_date       : 2026-06-22
external_id      : 143055
procurement_edited: true
sales_person_id  : a8050cc3-... (Vinay Rawat's rep)
```

So it is in the main `orders` table — not a separate Woo-only table.

### 2. WooCommerce sync — separate table?

There are two surfaces:
- `woocommerce_orders` — raw live feed from the Woo API (`useWooCommerceOrders`). Used for the "Website" tab and for live rows that haven't been mirrored yet.
- `orders` with `source = 'website'` — the mirror written by `woo-mirror` edge function. Used everywhere else (Procurement, Orders → All Orders, Sales, analytics).

143055 has been mirrored (row exists in `orders`), so it should flow through the unified path.

### 3. Where it gets filtered out

Two layers:

**Layer A — `useOrders.ts` (passes 143055 through):**
```ts
const WEBSITE_ORDER_CUTOFF = new Date('2026-04-30T00:00:00Z').getTime();
const orders = rawOrders.filter((o) => {
  if (o?.deleted_at) return false;                       // OK — null
  if ((o?.source || 'manual') !== 'website') return true;
  const status = (o?.status || '').toLowerCase();
  if (status === 'po_received' || status === 'cancelled') return false; // not our status
  const refDate = o.order_date || o.created_at;
  return new Date(refDate).getTime() >= WEBSITE_ORDER_CUTOFF; // 2026-06-22 ≥ 2026-04-30 OK
});
```
143055 survives this layer. So Procurement (which consumes this list) sees it.

**Layer B — `useOrdersFiltering.ts` (drops 143055). This is the root cause.**

```ts
const isWebsiteMirrorPaid = (o) =>
  o.payment_status === 'full' || (total > 0 && paid >= total);

const filteredOrders = a.orders.filter(o => {
  ...
  if (a.sourceFilter === 'manual')        return !isWebsite;
  if (a.sourceFilter === 'website_auto')  return isWebsite && isWebsiteMirrorPaid(o);
  return !isWebsite || isWebsiteMirrorPaid(o);   // 'all' branch
});
```

For website-source rows, **All Orders and Website (Auto) both require `isWebsiteMirrorPaid` to be true.**

143055 has `payment_status = 'pending'` and `amount_paid = 0`, so `isWebsiteMirrorPaid` returns `false`. The row is dropped from `filteredOrders` and from `unifiedRows`, and never reaches the table. Searching "143055" returns 0 results because the search runs against `filteredOrders`, not the unfiltered list.

The live-Woo fallback branch in the same hook cannot rescue it either:
- The Woo row's `woo_order_id = 143055` is in `mirroredWooIds` (because the mirror exists), so it is explicitly skipped to avoid duplicates.
- Even if it weren't, that branch also requires `payment_status === 'paid'`, which the Woo row isn't.

### 4. Why Procurement still shows it

Procurement reads orders by a different path (joined via `inventory_procurements` / `order_procurement_links`) without going through `useOrdersFiltering`, so the paid-only gate doesn't apply there.

### 5. Why Sales also hides it

`src/pages/Sales.tsx` does not run its own website-source filter; it consumes the same orders surface as Orders. Once `useOrdersFiltering` drops the row from `filteredOrders` / `unifiedRows`, downstream Sales views inherit the omission.

### Root cause (one line)

`useOrdersFiltering.ts` requires website-mirror orders to be fully paid before showing them. 143055 is `in_transit` but still `payment_status = pending`, so the Orders and Sales lists silently exclude it; Procurement uses a different query and is unaffected.

No code changes are made in this plan — diagnosis only, per the request.
