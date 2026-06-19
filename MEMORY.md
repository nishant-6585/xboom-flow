# XBoom Flow — Work Log & Migration Tracker

> Living record of work done with Claude Code and the in-progress migration off Lovable.
> Update this file as tasks complete. Newest entries at the top of each section.
> Status legend: ✅ done · 🟡 in progress · ⏳ pending / not started · ❗ blocker

Last updated: 2026-06-19

---

## 🟡 Proforma audit/reconciliation polish — A/B/C done, #4 deferred

- **A ✅** (2026-06-19): "Review now" CTA on `proforma_stale` notifications → `/proforma-reconciliation?order_id=…` (page resolves order_id→order_number); line-level before→after diff in the audit trail.
- **B ✅** (commit `bf03eb5a`): global audit page `ProformaAudit.tsx`; `rules_version` promoted to a real column (migration `20260619120353`).
- **C ✅** (commit `f2a9b99b`): `ProformaBatchValidate` surfaces per-order FAILED + error + retry.
- **#4 ⏳ DEFERRED:** per-user notification preferences (in-app vs email/Slack) for stale alerts — heavy, overlaps migration. Cheap interim if needed: mirror `proforma_stale` to the supply-chain Slack channel.

---

## 🟡 Invite-on-order-creation (KYC portal onboarding) — retest pending

Flag: edge-function secret **`KYC_CUSTOMER_EMAILS_ENABLED`** (defaults `"false"`). `kyc-handler` `onboardOrder` (called from `useOrders.ts:644` after order create) sends the portal invite + KYC email only when this is `"true"`. Invite link is built like the working manual invite (`generateLink` recovery → `https://xboomflow.com/portal/set-password?token_hash=…&type=recovery`, verified by `portal-set-password`).
- **Retest gotcha:** while the flag was OFF, `onboardOrder` STILL created `portal_account` + auth user + `portal_contact` + `b2b_customer` role (only the *email* was gated). So re-testing with a previously-used customer email short-circuits at `existingContact.auth_user_id` → `portal_account_exists`, sends nothing. Retest with a FRESH email, or delete that email's portal_contacts/portal_accounts/auth.users first.
- **Likely past "link issue":** one-time recovery token consumed by email scanner/link preview, or recovery-link expiry (~1h), or the stale-account short-circuit above.
- **Hardening Part 1 ✅** (commit `2f551263`): `onboardOrder()` now returns `{skipped, reason:"feature_disabled"}` before creating any portal_account/auth user/contact/role when flag ≠ "true" (no more orphan accounts). Idempotent `portal_account_exists` check preserved for flag-on.
- **KYC enhancement (A+C) ✅** (2026-06-19, migration `20260619130213`): DB-backed `feature_flags` (`kyc_customer_emails_enabled`, admin toggle + last-changed via `FeatureFlagsPanel`); `kyc-handler` reads flag from DB (env fallback), validates email, idempotent (skips if a 'sent' row exists), retries Resend on 429/5xx/network (1s/3s/9s), logs every attempt to `kyc_email_log`, new `resend_invite` action; `KycInviteBadge` (Sent/Failed/Skipped/Pending) + Resend button in OrderDialog. ⚠️ Feature now toggled from Admin → Feature Flags (env secret is fallback only).
- **Hardening Part 2 ✅** (2026-06-19, migration `20260619131843`): non-consuming invite link — `portal_invite_tokens` table + `/portal/activate?invite=…` page (`PortalActivate.tsx`) + `portal-activate` edge fn (validates token, sets password, marks used, signs in). Used by onboarding + manual invite; survives email-scanner previews. Old `/portal/set-password` preserved for in-flight links.
- **KYC follow-ups (#2/#3/#4) ✅** (2026-06-19, migration `20260619134214`): admin page `/admin/kyc-emails` (`KycEmailLogs.tsx`, filter by order/email/status/date, admin/sales/sales_manager); pure helpers in `kyc-handler/helpers.ts` (`shouldRetry`, `sendWithRetry`, `isDuplicate`, `isValidEmail`) + `helpers.test.ts` 13 vitest cases (verified passing locally; vitest include now covers `supabase/functions/**/*.test.ts`); RLS tightened — `feature_flags` SELECT now admin-only.
- **KYC status in order UI ✅** (2026-06-19): new `order_kyc_status` kyc-handler action (admin/sales/sales_manager; resolves email→portal_contacts→portal_accounts via service role). `KycInviteBadge` full mode shows KYC-status badge (Approved/Pending/Rejected/Resubmit/Not Submitted/Not invited) + email-log badge w/ tooltip + context-aware "Send KYC invite" (primary when not approved, subtle "Resend anyway" when approved). Compact badge: tooltip + inline resend (no dialog). KycEmailLogs page + AdminTabsNav now include finance (matches RLS). Typecheck clean (qrcode dep was a stale-local false alarm).
- **KYC invite feature: COMPLETE.** Remaining = user's live retest (flag ON via Admin → Feature Flags, fresh email, click activate link → portal; badge → Sent). Optional not-built: Orders-list "KYC pending" filter/column.

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

## 🟡 Order invoicing (self-generated Proforma + Zoho automation)

Goal: remove the finance team's dependency on Zoho for the invoice PDF. Decisions: **Proforma** (XBoom self-gen is a labelled proforma; Zoho stays the official tax invoice), **phased**, **GST default 5% / HSN 88062200 with override**. Sample reference: `docs/XI-Jun26-0088.pdf`.

- **Phase 2 (⏳ parked):** `zoho-invoice-webhook` + Zoho Books API auto-fetch of the official tax-invoice PDF (`source='zoho'`), matched by order #; needs Zoho OAuth creds (client id/secret, refresh token, org id).
- **Open / prereqs:** customer state for Place of Supply (orders store address as a string — dialog lets finance confirm; consider a `state` column later); signature image in `signatures` bucket; confirm seller GSTIN/bank/T&C from sample are current.
- **Website orders:** ✅ now wired by Lovable — `GenerateProformaDialog` accepts a `wooOrder` prop; `WooOrderDetailDialog`/`ShopifyOrderDetailDialog` have Generate buttons; new `InvoiceListCard`. Also added: buyer GSTIN field, regenerate-existing-proforma (keeps number).

## ✅ Completed work

### 2026-06-19 — Email invoice to customer (proforma + Zoho) ✅ (by Lovable)
Auto-emails the customer when a proforma is generated or a Zoho invoice is uploaded; reuses the existing **Resend** integration (`RESEND_API_KEY`, verified domain `xboom.in`, sender `invoices@xboom.in`).
- `send-invoice-email` edge fn: pulls PDF from `invoices` bucket, base64-attaches, document-aware subject/body (Proforma vs Tax Invoice; tax invoice notes it supersedes the proforma). Auto-mode idempotent (skips if a 'sent' row exists for that invoice id); manual re-send always allowed. `verify_jwt=false`.
- `invoice_email_log` table (migration `20260619070111`): order_id, invoice_id, doc_type, to_email, status sent/failed/skipped, bypass_reason, error, sent_by, attempted_at.
- `InvoiceEmailControl` component: "Email invoice to customer" checkbox (default ON → email required+validated); OFF path (pickup/no-email) needs a bypass reason and is locked to **admin/finance** (`canBypassEmail`).
- Wired into `GenerateProformaDialog` (validates + updates `customer_email` before generate) and `OrderDialog` Zoho upload. `InvoiceListCard` shows Sent/Failed/Skipped badge + Mail re-send button. Email failure never blocks the invoice save.
- Best practices applied: both documents sent (distinct, labelled); per-document idempotency; accountable logged bypass.


### 2026-06-18 — Order invoicing Phase 1: self-generated Proforma ✅ (by Lovable)
Finance can generate an XBoom Proforma instantly for `payment_status='full'` orders; Zoho upload + AI extraction untouched.
- Migration: `order_invoices` extended with `source`/`document_type` + tax snapshot; `proforma_number_seq` + `get_next_proforma_number()` RPC (series `XPF-YYMM-NNNN`).
- `src/lib/invoiceGst.ts`: GST-inclusive splitter, Karnataka(29) IGST-vs-CGST+SGST logic, INR amount-in-words, state-code guesser.
- `src/lib/invoicePdfGenerator.ts`: jsPDF "PROFORMA INVOICE" (seller / Bill-To / items / totals / words / bank details / signature / T&C).
- `useOrderInvoices.uploadProformaInvoice()`: stores PDF in `invoices` bucket, inserts row tagged `source='xboom'`, `document_type='proforma'` (no AI extraction).
- `GenerateProformaDialog.tsx`: prefilled Bill-To, POS dropdown, editable lines from `order_items`, treatment hint, live totals → RPC number → PDF → upload.
- `OrderDialog.tsx`: role-gated "Generate Proforma" button (admin/finance, only when `payment_status='full'`); invoice rows badged XBoom/Zoho + Proforma/Tax Invoice; refetch after generation.
- Not wired: Website Orders tab (see note above).
- **Fix `bd19f905` (2026-06-18):** HSN/SAC now defaults to `88062200` (was showing SKU/product_code); GST rate falls back to 5% when stored value is 0/blank (`||` not `??`); line Amount column shows taxable (ex-GST) not the inclusive gross. Verify with a real 5% order.
- **Access (2026-06-18):** Generate Proforma button now visible to admin/finance/**supply_chain** (`OrderDialog.tsx:156`). RLS already permitted supply_chain for `order_invoices` INSERT + `invoices` bucket upload — no migration needed.
- **To verify (live app):** generate a proforma on a real **5% GST** order — confirm HSN=88062200, GST shows 5%, line Amount = taxable (ex-GST), Sub Total + IGST = Total = Payment Made, Balance 0; and for a Karnataka customer that CGST+SGST columns appear.

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
