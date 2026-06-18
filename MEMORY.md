# XBoom Flow — Work Log & Migration Tracker

> Living record of work done with Claude Code and the in-progress migration off Lovable.
> Update this file as tasks complete. Newest entries at the top of each section.
> Status legend: ✅ done · 🟡 in progress · ⏳ pending / not started · ❗ blocker

Last updated: 2026-06-18

---

## 🎯 MILESTONE — Migrate off Lovable → self-managed Supabase + Vercel

**Goal:** develop XBoom Flow in VS Code with Claude Code instead of the Lovable platform.
**Decisions locked:**
- Backend → **new Supabase Cloud project** (own account)
- AI → **OpenAI / OpenRouter** (OpenAI-compatible, near drop-in) replacing the Lovable AI Gateway
- Frontend → **Vercel**

**Status: ⏳ not started** (planning complete).

### Lovable-specific inventory to handle
- **12 edge functions** call the Lovable AI Gateway (`ai.gateway.lovable.dev` + `LOVABLE_API_KEY`, model `google/gemini-3-flash-preview`). → repoint to OpenAI/OpenRouter via a shared `_shared/ai.ts` helper (env: `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`).
- **2 pure Lovable-platform functions** → delete: `apply-lovable-resolution`, `fetch-code-context`.
- **Hardcoded project ref** `mxsotxddcvmeluqonuuj.supabase.co` in pg_cron `invoke_*` functions → must be replaced with the new ref (sed `schema.sql` before restore).
- Repo size: ~562 migrations, ~87 edge functions (standard Supabase `.env`).

### Phase checklist
- [ ] ❗ **Phase 0 — confirm DB access from Lovable** (Supabase dashboard / connection string / service_role key). Gate for everything.
- [ ] Phase 0 — tooling: Supabase CLI + Docker; create new Supabase project; collect all secrets.
- [ ] Phase 1 — DB: `supabase db dump` (schema + data) from old → **sed project ref in schema.sql** → restore into new.
- [ ] Phase 2 — Auth: dump/restore `auth` schema (preserves password hashes); test a login.
- [ ] Phase 2b — Vault: re-add `CRON_SECRET` (and any Vault secrets) on new project — these do NOT transfer.
- [ ] Phase 3 — Storage: recreate buckets + copy files (payslips, invoices, signatures, hr-documents, candidate-documents, avatars, …).
- [ ] Phase 4 — Functions: `supabase link` new ref; delete the 2 Lovable-only fns; `supabase functions deploy`; `supabase secrets set …`; recreate pg_cron jobs with new URLs.
- [ ] Phase 5 — AI swap: `_shared/ai.ts` + repoint the 12 functions to OpenAI/OpenRouter; set `OPENAI_API_KEY`.
- [ ] Phase 6 — Frontend on Vercel: env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`); add `vercel.json` SPA rewrite; connect GitHub → deploy.
- [ ] Phase 7 — Re-point external webhooks/callbacks to new function URLs: WooCommerce (orders + products), Shopify, Google Ads, Gmail OAuth redirect, MyOperator, Interakt, Slack.
- [ ] Phase 8 — Verify: auth/RLS, website order webhook, an AI function, payroll, storage download, cron firing.

### Code-side prep that can be done before the new project exists
- [ ] Refactor the 12 AI functions to `_shared/ai.ts` (Phase 5).
- [ ] Delete `apply-lovable-resolution` + `fetch-code-context`.
- [ ] Add `vercel.json` (SPA rewrite).
- [ ] Add a one-shot dump/restore script + storage-copy script.

### Gotchas (don't skip)
1. No Lovable DB access = no clean data migration — confirm first.
2. `CRON_SECRET` in Vault won't dump — re-add manually.
3. sed the hardcoded project ref in `schema.sql` before restore, or cron calls the old project.
4. Test auth login after restoring `auth.sql`.
5. The 12 AI functions stay broken until `OPENAI_API_KEY` + URL/model swap are set.

---

## ✅ Completed work

### 2026-06-18 — WooCommerce Order / Shipping / Tracking / Delivered sync (Item 2) — by Lovable
On `main`. Makes shipping/tracking + the Delivered status sync into both **All Orders** (`orders`) and **Website Orders** (`woocommerce_orders`).
- `_shared/woo-mirror.ts`: `extractTrackingFromWoo` now also reads AST top-level REST fields (`wc_shipment_tracking_items`, `shipment_tracking_items`, `shipment_tracking`, `ast_tracking_items`, `tracking_items`) + alt meta keys (`_ast_shipment_tracking_items`, `_shipment_tracking_items`, `ast_tracking_link`). Existing-order branch now **always overwrites** `tracking_number`/`tracking_url`/`courier_name` when Woo has a number (clear/revert logic untouched).
- New `upsertWoocommerceOrder` helper = single source of truth for `woocommerce_orders` (always writes latest `tracking_number`, `courier`, `tracking_status`, `expected_delivery`; `shipped`/`delivered` → paid + fulfilled). `woocommerce-webhook` now delegates to it.
- New edge fn **`woocommerce-orders-reconcile`** (auth: `X-Cron-Secret` OR admin/finance/supply_chain JWT): pulls `wc/v3/orders?status=processing,on-hold,shipped,completed,delivered,cancelled,refunded&modified_after=…` (days=7, cap 30, `WINDOW_START_ISO` floor), up to 1500 orders; runs `upsertWoocommerceOrder` + `mirrorIntoInternalOrders`; logs `event_type='orders_reconcile'`.
- pg_cron: `woocommerce-orders-reconcile` every 30 min via `invoke_woocommerce_orders_reconcile()` (Vault `CRON_SECRET` + `net.http_post`), jobid 86. `config.toml`: `verify_jwt = false`.
- Frontend: `OrdersWebsiteTab` "Sync from Website" button (admin/finance/supply_chain); status filter exposes Shipped/Delivered/Completed; badges for delivered (emerald) / shipped (indigo); `WooOrderCard` palette extended.
- Verified: Woo sends status string `delivered` (3,223 events in `woo_sync_logs`); mapped in `mapWooStatusToInternal` (→ `delivery_done`) + `upsertWoocommerceOrder`.
- **Action when deploy finishes:** click "Sync from Website" on Website Orders; expect "Refreshed N orders" + `event_type='orders_reconcile'` rows in `woo_sync_logs`.

### 2026-06-18 — WooCommerce "Delivered" order status (WordPress side) ✅
Custom `wc-delivered` status confirmed present in the WooCommerce Status dropdown. REST/webhook sends `delivered`. AST free can't add it to the "Mark order as" panel (AST PRO only) — Delivered is set via the Status dropdown, which is enough for the sync.

### 2026-06-17 — WooCommerce Product → Pricelist sync (Item 1) ✅
Merged to `main` (commit `2c03ad1a`, merge `e8e0f7c5`); Lovable has since extended it (added `woo_stock_status`, `sales` role can sync).
- Migration: `pricelist` gains `woo_product_id` (unique), `woo_sku`, `sync_source`, `website_synced_at` (+ `woo_stock_status` via Lovable); `pricelist_public` view extended; daily pg_cron reconcile.
- Edge fns: `woocommerce-product-webhook` (HMAC, product.created/updated/deleted) + `woocommerce-products-backfill` (REST pull, manual button + cron).
- Shared `_shared/woo-product-map.ts` (Woo-ID-then-name match, parent-only for variable products; never overwrites cost/dealer/unit) + `_shared/woo-hmac.ts`.
- UI: "Sync from Website" button + "Website" badge on synced rows.
- Doc: `WOOCOMMERCE_PRODUCT_SYNC.md`.
- **Pending manual steps:** register Woo **product** webhooks (product.created/updated/deleted → `/functions/v1/woocommerce-product-webhook`, same `WOOCOMMERCE_WEBHOOK_SECRET`); run initial "Sync from Website".

---

## ⏳ Pending / follow-ups
- [ ] Register WooCommerce **product** webhooks + run initial product Sync from Website (Item 1).
- [ ] After deploy, run "Sync from Website" on Website Orders to confirm reconcile (Item 2).
- [ ] WordPress: remove the duplicate "Shipped" status entry in the order Status dropdown.
- [ ] Start the migration milestone (gate: confirm Lovable DB access).
