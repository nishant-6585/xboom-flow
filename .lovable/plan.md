## Goal

When a WooCommerce website order is attributed to a salesperson, flip it into a manual order everywhere (counts, analytics, dashboards) while keeping `external_id` + `lead_source='website'` as provenance so Woo sync and the "From website" chip still work. Scope is Woo only; Shopify is untouched.

**Invariant:** `external_id IS NOT NULL` = Woo-linked (permanent). `source='website'` = unattributed Woo feed row (mutable, flipped by attribution).

---

## 1. DB migration

Extend `public._attribute_website_order_core(...)`:
- In the main UPDATE, add: `source = 'manual'`, `lead_source = COALESCE(lead_source, 'website')`.
- Do NOT touch `external_id`, attribution log inserts, sales_points logic, or the `woocommerce_orders.assigned_to` mirror.

One-shot backfill in the same migration:
```sql
UPDATE public.orders
SET source = 'manual', lead_source = COALESCE(lead_source, 'website')
WHERE source = 'website' AND sales_attribution_locked = true;
```

Verify (no change expected):
- `guard_orders_duplicate_creation` – skips only on INSERT for `source='website' OR external_id NOT NULL`; attribution is UPDATE → safe.
- `find_duplicate_orders` – no source filter → still matches transferred orders so a rep can't re-create one manually.

## 2. Landmine A — `supabase/functions/_shared/woo-mirror.ts`

In the existing-order UPDATE branch (after the `.eq("external_id", orderId)` lookup returns a row):
- Before applying the update, `delete orderRow.source; delete orderRow.lead_source;` so subsequent Woo webhooks never revert the flip.
- INSERT branch keeps `source: "website"`, `lead_source: "website"` (feed rows still start unattributed).

## 3. Landmine B — reverse-sync + peer Woo edge functions

`supabase/functions/woocommerce-reverse-sync/index.ts`: change the orders query from `.eq("source","website").not("external_id","is",null)` to just `.not("external_id","is",null)` (drop `source` filter). Safe because `external_id` in `public.orders` is exclusively the Woo id.

Audited peer functions (`get-order-status`, `send-order-sms-msg91`, `update-woo-order-status`, `get-woo-order-notes`, `woo-mirror.ts`): grepped — none filter `orders` by `source='website'`. Only `external_id` lookups. No change needed.

## 4. Frontend reclassification

Add shared helper `src/lib/orderSource.ts`:
```ts
export const isWooLinked = (o: { external_id?: string | null }) => !!o?.external_id;
export const isUnattributedWebsiteFeed = (o) => o?.source === 'website';
```

### Category (a) — "Woo-linked" → switch to `isWooLinked(o)` (uses `external_id`)
- `src/components/OrderDialog.tsx` – lines 244, 704, 722 (`isWebsiteOrder`)
- `src/components/procurement/ProcurementOrderDialog.tsx` – lines 138, 247
- `src/components/orders/GenerateProformaDialog.tsx` – lines 137, 324
- `src/hooks/useCanMarkWebsitePayment.ts` – gate on Woo-linked, not source
- `src/hooks/useOrders.ts:462` – `isIntegration` (already ORs `external_id`, simplify to `isWooLinked`)
- `src/pages/Orders.tsx:237` – matching internal row to a Woo order: match on `external_id === woo_order_id` only (drop the `source==='website'` clause so attributed rows still resolve)

### Category (b) — "Unattributed website feed" → KEEP `source==='website'` (no code change; flipping source auto-removes attributed rows)
- `src/hooks/useOrders.ts:413` – feed-row hiding for po_received/cancelled
- `src/hooks/useOrdersFiltering.ts` – `isWebsiteMirror` (49), `sourceCounts`/filters (103, 153, 156, 216) and the `'website_auto'` filter label — leaves attributed orders in the "manual" bucket
- `src/hooks/useAttributionRequests.ts` – `.eq('source','website')` claimable list (attributed drop out — correct)
- `src/components/orders/ClaimWebsiteOrderPanel.tsx`
- `src/pages/Orders.tsx:75` + `OrdersTabsList.tsx` + `OrdersListTab.tsx` (tab plumbing for `'website_auto'`)
- `OrdersDashboardStats.tsx:88` `p_include_website` toggle
- Analytics exclusions: KeyMetricsDashboard, KeyMetricsTrendChart, PipelineStatusDashboard, LeadSourcePerformanceDashboard, TallyDashboard
- `src/lib/duplicateOrderGuard.ts` lines 92/110 (server-side match hint, feed-side)
- `src/components/orders/DuplicateOrderGuardModal.tsx:32` (`isWebsite` badge on the duplicate candidate — the candidate being displayed is the pre-existing row; if it's still `source='website'` it means unattributed → keep as-is)

`'shopify'` occurrences are out of scope — untouched.

## 5. Provenance UI — "From website" chip

Show a small muted chip `From website` (Tailwind `text-xs text-muted-foreground border rounded px-1.5`) when `external_id && source !== 'website'`, alongside existing `LeadSourceBadge`:
- `src/components/orders/OrderTable.tsx` row
- `src/components/orders/OrderCard.tsx`
- `src/components/OrderDialog.tsx` header

Dedicated Website (Auto) tab continues to filter `source='website'` only.

## 6. Tests / verification

New pgTAP file `supabase/tests/rls/orders_attribution_source_flip.sql`:
1. Seed an `orders` row with `source='website'`, `external_id='WOO-1'`, `lead_source=null`.
2. Call `_attribute_website_order_core(...)` as admin → assert `source='manual'`, `lead_source='website'`, `external_id='WOO-1'`, `sales_attribution_locked=true`, and `sales_points` rows exist for the rep.
3. Simulate the woo-mirror UPDATE path by manually running the same UPDATE the function issues with `orderRow.source`/`lead_source` deleted → assert `source` stays `'manual'` and tracking fields still update.
4. Log the backfill count via `SELECT count(*) FROM public.orders WHERE source='manual' AND external_id IS NOT NULL AND sales_attribution_locked=true;` in the reply.

Manual smoke: attribute one live website order in preview, confirm it disappears from Website (Auto) tab, appears in the rep's manual list with a "From website" chip, and a follow-up Woo webhook doesn't revert it.

## Out of scope

- `shopify_*` tables, functions, and UI tabs.
- `external_id`, attribution log, points, or `woocommerce_orders.assigned_to` mirror.
- Duplicate-guard trigger/RPC logic (verify only).
