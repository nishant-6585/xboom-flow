# XBoom Flow — Work Log & Migration Tracker

> Living record of work done with Claude Code and the in-progress migration off Lovable.
> Update this file as tasks complete. Newest entries at the top of each section.
> Status legend: ✅ done · 🟡 in progress · ⏳ pending / not started · ❗ blocker

Last updated: 2026-07-03

---

## ⏳ PLANNED — Customer portal: confirmation, delivery proof, service requests (3 staged prompts)

Requirements reviewed against existing portal architecture (2026-07-03). Feasible. PortalTickets + `portal-sla-monitor` (SLA cron ✅ exists), `send-order-sms-msg91` + Resend (✅ exist).

**Key gaps found:**
1. No product weight stored anywhere (pricelist/order_items/Woo sync) — the >249g confirmation rule (DGCA threshold) has no data source. Stage 1 adds it.
2. **`portal_orders` ≠ `public.orders`** — portal_orders is a separate B2B pipeline (draft→quote→PO→dispatch, staff-created) with NO link to public.orders. Retail customers (KYC-onboarded from website/internal orders) have purchases only in public.orders → today's PortalOrders shows them nothing, and its tracking card reads portal_orders fields. **Pattern chosen (Lovable Option 3):** confirmation columns live ONLY on public.orders; all customer-facing reads go through email-matched SECURITY DEFINER RPCs (portal contact → portal_contacts.email → orders.customer_email): `get_my_confirmable_orders()`/`confirm_my_order()` (Stage 1), `get_my_purchases()` + new /portal/purchases "My Purchases" page (Stage 2), service-ticket order picker from get_my_purchases with plain-uuid `related_order_id` snapshot fields, no FK (Stage 3). SMS/email deep link → /portal/confirm (NOT /portal/orders/<id>, that's B2B). Never open orders SELECT to portal users; no orders→portal_orders mirror.

**Locked assumptions:** weight synced from Woo product weight (unit-converted to grams) into `pricelist.weight_grams`, copied to `order_items.weight_grams` at order time; rule = ANY line item >249g; email + SMS both sent (SMS only if phone); new `orders.delivery_mode` ('courier'|'office_pickup'), proof image mandatory only for office_pickup; 12h SLA for service_request tickets escalating to admin + sales_manager; tickets routed to supply_chain.

- **Stage 1 ✅** (2026-07-03, migration `20260703061306`, verified): `weight_grams` on pricelist+order_items (Woo sync converts store weight unit→grams, skips when unit probe fails to protect manual values; editable in Pricelist UI); DB trigger on order_items flips order to `pending` when any item >249g (preserves `confirmed`); `_current_portal_contact()` + `get_my_confirmable_orders()`/`confirm_my_order()` RPCs (auth.uid→contact, lower-email match, pending-only); `send-customer-confirmation-request` edge fn (Resend email + MSG91 SMS queue, deep link `/portal/confirm`), invoked non-blocking from order create; `PortalConfirm.tsx` page + dashboard banner + `OrderConfirmationStatusBanner` staff badge/resend in OrderDialog. Typecheck clean. **To do live: run product Sync from Website once to populate weights, spot-check drone weights, then test an order >249g end-to-end.**
- **Weight audit UI ✅** (2026-07-03, verified): Pricelist "Weight (g)" sortable column + "Missing weight" toggle chip + analytics card (count → filtered list). Weight editable in the Add/Edit Product dialog (admin/supply_chain), "Weight (grams)" field.
- **Confirmation visibility ✅** (2026-07-03, migration `20260703103214`, verified): `get_order_confirmation_details` RPC (staff-only, resolves confirming portal contact); banner shows "Confirmed by <name> on <date>"; `OrderConfirmationChip` on OrderCard (amber/green, tooltip); timeline "Customer confirmed order" event; `order_confirmed_by_customer` notification → "Open order" deep link (`?order_id=` auto-opens OrderDialog).
- **Email consolidation ✅** (2026-07-03, migration `20260703103814`, verified): all confirmation emails from `notifications@xboom.in` (`orders@xboomflow.com` removed — was the unverified-domain root cause). New customers: ONE onboarding email with Set password → KYC → "Confirm my order" (`/portal/confirm`), logged `delivered_via: onboarding_email`; standalone confirm email only for existing portal users (new customers logged `sent_via_onboarding`). KYC gate: `/portal/confirm` banner + server-side in `confirm_my_order` (kyc_status must be pending_verification/approved — submitted is enough).
- **✅ FEATURE CLOSED (2026-07-03): full end-to-end confirmation flow verified live on ORD2600367** — email (notifications@xboom.in) + SMS (DLT/MSG91) both delivered; portal KYC gate blocked Confirm until Aadhaar submitted; confirm flipped order card/dialog to Confirmed and KYC approval surfaced in XBoom Flow. Remaining path untested in prod: consolidated onboarding email for a brand-new drone customer (next fresh drone order will exercise it).
- **Confirmation SMS 🟡 (2026-07-03):** DLT template `OrderConfirmationRequest` ✅ approved; CTA whitelisting for `https://xboomflow.com/portal/confirm` ✅ (STPL portal, Static URL — future portal URLs in SMS need their own CTA entries); MSG91 template **Verified by DLT** (MSG91 id `6a47a271153834b3210a9832`, DLT id `1707178307474428469`, sender XBOOMT, var1=name var2=order#). Lovable wired `notification_templates` — **likely a direct live-DB data update; NOT in the repo** (migration `20260703061306` still has the placeholder seed). Fresh SMS queued for ORD2600364; **delivery test pending** — if it fails, check the live notification_templates row value.
- **Drone detection hardened ✅** (2026-07-03, migrations `20260703125114..130404`, verified): real-world data broke the exact-3-names match (ORD2600367 had an EMPTY item category; its pricelist category was just "DJI"). Now: `is_drone_category(text)` (contains 'drone' minus accessory/part/service/etc tokens) + `is_drone_product(name, category)` (name fallback for known families: mavic, mini pro, phantom, matrice, avata, inspire, fpv, autel evo, skydio, parrot anafi, swellpro, tello, air N, agras, dji neo); trigger falls back to pricelist category by product name when item category empty; `mapCategory` canonicalizes drone-ish Woo cats → Consumer/Enterprise/Agriculture Drones on future syncs; backfill flipped non-confirmed drone orders to pending. **⚠️ Maintenance: the name-family keyword list needs updating when new drone product lines are stocked.**
- **⚠️ RULE CHANGED (2026-07-03, migration `20260703085926`, verified): confirmation gate is now CATEGORY-based, not weight.** Trigger fires when an order_item's category ∈ {Consumer/Enterprise/Agriculture Drones} (Drone Components/Accessories excluded). woo-mirror now resolves order_items.product_category from pricelist (SKU→name lookup; fallback 'Uncategorized' — fixed the hardcoded 'Consumer Drones' that would have false-triggered all website orders; order HEADER category still 'Consumer Drones', cosmetic only). Email copy now says "order includes a drone". One-time backfill reset non-drone pending → not_required. Weight infra kept (columns/sync/audit UI) but no longer gates confirmation. **Audit surface now = pricelist categories (from Woo cats) — miscategorized drones on the website silently skip confirmation.**
- **Stage 2 ✅** (2026-07-03, migrations `20260703135128`+`135243`, verified): "My Purchases" — `get_my_purchases()` (email-matched, minimal fields, NO proof internals) + `/portal/purchases` page + nav (retail customers finally see orders + courier/tracking/delivered from public.orders; Stage-1 confirm card reused). Delivery proof — `delivery_mode`/proof columns + validation trigger; `submit/approve/reject_delivery_proof` RPCs; private `delivery-proofs` bucket (staff upload, admin/sales_manager+uploader read); `DeliveryProofCard` in OrderDialog (JPEG/PNG/WebP ≤10MB, signed-URL view, approve/reject w/ reason); `delivery_done` blocked for office_pickup without proof; notifications to admin+sales_manager w/ deep link. **Live-verified ✅** (2026-07-03): purchases view + tracking, office-pickup block without photo, approval notification, reject-with-reason → re-upload, no proof internals in portal.
- **Stage 3 (⏳ prompt ready):** portal "Service Request" ticket type + own-order link, routed to supply_chain, 12h first-response+resolution SLA, `portal-sla-monitor` extended to escalate breaches to admin+sales_manager (keep portal_sla_alerts dedupe).
- **Stage 3 ✅** (2026-07-03, migration `20260703145220`, verified): service requests — `ticket_type`/`related_order_*` snapshots on portal_tickets (plain uuid, no FK), picker from get_my_purchases, 12h first-response+resolution SLA, routed to supply_chain, `portal-sla-monitor` escalates breaches to supply_chain+sales_manager (type `portal_service_request_sla`, dedupe kept), new `/admin/portal-tickets` (type filter, linked purchase, breach indicator). Plus UX: nav collapsed to single **"My Orders"** (B2B section only when portal_orders exist; /portal/orders → /portal/purchases redirect); **auto-confirm on KYC submission** — trigger on portal_accounts kyc_status→pending_verification transition confirms all the account contacts' email-matched pending orders (source `kyc_submission`, never downgrades confirmed); manual /portal/confirm kept for repeat KYC-approved customers. **Live verify pending:** service-request flow + SLA escalation (backdate a test ticket), auto-confirm on a fresh customer.
- **PORTAL FEATURE SET: all 3 stages shipped.** Remaining: Stage 3 live verification.

---

## ✅ DONE (2026-06-22) — Website-order salesperson attribution (+ request/approval)

Built by Lovable (migration `20260622111109`). Verified by inspection (local node/icu4c breakage blocked running tsc this time):
- Sync protection ✅ — `woo-mirror.ts` reads `sales_attribution_locked` and deletes both `sales_person_id` + `sales_person_name` from the update when locked (re-syncs won't wipe attribution).
- RPCs ✅ — `_attribute_website_order_core` (shared) + `attribute_website_order` (direct, admin/sales_manager), `request_website_order_attribution` (rep, own order), `decide_attribution_request` (approve/reject).
- Schema ✅ — `orders.sales_attribution_locked/reason/...`, `sales_attribution_log`, `sales_attribution_requests`.
- UI ✅ — `OrderAttributionPanel`, `AttributionRequestsQueue` tab, `useAttributionRequests`.
- (design details preserved below for reference)

### Design reference — Website-order salesperson attribution

Problem: website orders are mirrored into `orders` with `sales_person_id = SYSTEM_USER_ID` ("Website (Auto)"), so a rep who facilitated a remote/online sale gets no order credit. Prompt handed to Lovable.

- **Credit source:** `orders.sales_person_id` (drives `get_sales_leaderboard` + `sales_points`). `assigned_to`/`assign_woo_lead` on `woocommerce_orders` is lead follow-up, NOT credit — left untouched.
- **Direct path:** admin/sales_manager assign via `attribute_website_order` RPC → sets sales_person_id/name + `sales_attribution_locked` + reason (predefined+custom) + audit (`sales_attribution_log`); awards `sales_points` idempotently (no double-count).
- **Request→approval path:** sales rep `request_website_order_attribution` (own order only) → `sales_attribution_requests` pending → admin/sales_manager `decide_attribution_request` (approve runs the attribution). Notifications via `notifications` (`attribution_request` / `attribution_decision`).
- **⚠️ Sync protection (critical):** `woo-mirror.ts` `.update(orderRow)` currently forces `sales_person_id = SYSTEM_USER_ID` (lines ~299/347) → must NOT overwrite when `sales_attribution_locked = true`, else re-sync wipes the attribution.
- **Leaderboard:** attributed website orders (locked) count for the rep even when "exclude website" is on.
- **UI:** Website Orders tab + order dialog — managers "Assign to salesperson"; reps "Request to claim" with status badge; manager "Attribution Requests" approvals queue. Enable only for website orders with a mirrored internal order (paid+).
- **Decisions:** reps request OWN attribution only; approvers = admin + sales_manager; predefined reasons (remote/paid online, preferred online, field-phone sale, Other).
- Status: ⏳ prompt ready, not yet built.

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

- **Phase 2 ✅ SHIPPED (2026-07-05, verified; first real poll pending Zoho rate-limit reset):** `zoho-invoice-poller` (15-min pg_cron, cursor in `zoho_poller_state`, upserts `zoho_books_invoices`, matches reference_number→order_number else email+total±1 else unmatched, downloads PDF → `invoices` bucket `zoho/{order_id}/{invoice_id}.pdf`, upserts `order_invoices` on UNIQUE `zoho_invoice_id`, fires send-invoice-email auto-mode); `zoho-invoice-attach` + `attach_zoho_invoice_to_order` RPC (admin/finance) + UnmatchedZohoInvoicesPanel in Admin; send-invoice-email gained a FAIL-CLOSED cron-secret bypass (verified). ⚠️ Zoho org hit its 2,000-call/day API cap during setup — first real sync report comes after reset. NOTE: Lovable built-in email infra now exists anyway (`email_infra` migration, process-email-queue, auth-email-hook) — the earlier "declined" decision was partially overtaken; migration plan must account for unwinding platform email.
- (superseded) Phase 2 started: `zoho-invoice-webhook` edge fn shipped (shared-secret via `?token=`/`x-webhook-secret`, JSON+form-urlencoded, upserts `zoho_books_invoices` by invoice_id). Claude fixes `62f83005`: added missing `verify_jwt=false` (Zoho calls would have 401'd) + fail-closed secret check. ⚠️ Lovable also created a duplicate `zoho-books-webhook` fn — clarify/remove. **Remaining:** webhook only STAGES invoice metadata — PDF auto-fetch via Zoho API + match to order + attach to `order_invoices` (`source='zoho'`) still needed; requires Zoho OAuth creds (client id/secret, refresh token, org id from api-console.zoho.in). ZOHO_WEBHOOK_SECRET set (shared value in Lovable secret + Zoho webhook URL).
- **Open / prereqs:** customer state for Place of Supply (orders store address as a string — dialog lets finance confirm; consider a `state` column later); signature image in `signatures` bucket; confirm seller GSTIN/bank/T&C from sample are current.
- **Website orders:** ✅ now wired by Lovable — `GenerateProformaDialog` accepts a `wooOrder` prop; `WooOrderDetailDialog`/`ShopifyOrderDetailDialog` have Generate buttons; new `InvoiceListCard`. Also added: buyer GSTIN field, regenerate-existing-proforma (keeps number).

## ❗ OPEN — Resend daily quota exceeded (email infra at capacity)

2026-07-04: portal ticket-reply email to customer very likely FAILED — Resend returned `429 daily_quota_exceeded` (free tier ~100/day; ALL app email shares one key: confirmations, KYC, invoices, portal notify, SLA). **Action (user): upgrade Resend plan.** Also: `portal-notify` doesn't persist per-send outcomes (`portal_notifications_log` exists but is never written) and the resolved/closed status change never notifies customers (`updateStatus` calls ticket_message_added without message_id → 404). Consolidated fix prompt handed to Lovable (log + hourly retry cron + ticket_status_changed event + admin Notifications section). Portal thread delivery itself confirmed ✅ (reply is_internal=false).

---

## ⏳ PLANNED — DigiLocker KYC (blocked on vendor) · Portal Customers upgrade ✅ DONE

**DigiLocker KYC (customer portal)** — decisions: access via **licensed aggregator** (Surepass/Setu-class; direct MeitY partnership deferred — weeks of onboarding vs days; architecture is provider-agnostic so switching later is contained) and **auto-approve** DigiLocker-verified KYC (`kyc_status='approved'`, `source='digilocker'`). Plan: `digilocker-kyc-init` + `digilocker-kyc-callback` edge fns, `kyc_digilocker_sessions` table, portal `/portal/kyc` primary "Verify instantly with DigiLocker" button (manual upload stays as fallback), staff source badges, DPDP hygiene (store aadhaar_last4 + consent timestamp + txn id only; never full number/raw XML). **⚠️ Trigger interplay:** `auto_confirm_orders_on_kyc_submission` fires only on → pending_verification; must ALSO fire on → approved or DigiLocker customers' drone orders won't auto-confirm (in prompt). **Blocked on user: pick vendor + get API key**; prompt has provider placeholders.

**Portal Customers screen upgrade ✅** (2026-07-04, verified: B2B label gone, KYC/type/status badges, primary-contact join, stats filters, detail drawer w/ contacts+KYC docs+recent orders/tickets, resend invite, suspend/reactivate, guarded delete, CSV export; no RLS changes needed; typecheck clean). Original scope for reference — screen previously showed only company/industry/status/created; retail (KYC-onboarded) customers appear as "Companies" with empty Industry. Prompt ready (Tier 1+2): drop "B2B" label; Customer column (primary contact name/email/phone); account-type badge Business (gstin/company≠contact) vs Individual (replaces Industry); KYC + Last-login ("Never" = invited-not-activated) columns; search/filters (status, KYC, type, rep); clickable stats cards; account detail drawer (contacts w/ resend-invite + activate/deactivate, KYC docs, recent orders by email-match + tickets, rep selector); guarded delete; optional CSV export. Staff-only RPC if RLS blocks joins. DigiLocker "verified" badges will surface in this screen's KYC column once both ship.

---

## 🟡 DECISION REVERSED (2026-07-04): ALL outgoing email moving Resend → Lovable platform email

User deliberately chose platform email after verifying sender domain (xboomflow.com; notify subdomain delegated to ns3/ns4.lovable.cloud — Pending was caused by stale ns1/ns2 NS records in GoDaddy not serving the zone; deleted, verified). Rationale: no daily cap, built-in queue/retry, no Resend cost. Prompt handed to Lovable: single `_shared/email.ts` helper with EMAIL_PROVIDER switch (platform default, resend fallback — one-file swap for the future platform exit), refactor ~17 Resend call sites, replyTo support@xboom.in, ATTACHMENT check for send-invoice-email (stays on Resend if platform lacks attachments), smoke test per category. **Migration-off-Lovable impact: email is now a platform dependency to unwind — but the provider-switch helper makes that a config flip.** Watch: new-domain spam/warm-up for first days; then Resend plan can be downgraded (keep key as fallback).

---

## ✅ 2026-07-05 (evening): Email identity finalized + all Turn C gates cleared

DECISION: no xboom.in visible on any xboomflow email. All platform sends now "Xboom <no-reply@xboomflow.com>" (FROM_LOCAL=no-reply), Reply-To no-reply@xboomflow.com (intentionally NOT a mailbox — replies bounce by design; customer questions route via portal support tickets, wording in templates updated; support@xboom.in removed from all customer-visible copy; dlq-alert.tsx keeps support@xboom.in as internal ops recipient only). Verified in code + delivered inbox test (dbee6b60). No GoDaddy mailbox/forward needed (user cancelled — CEO Vishal holds GoDaddy access anyway).
GATES CLEARED: (1) unsubscribe test PASSED — TEST-STEP3 kyc-onboarding DELIVERED to inbox after footer-unsubscribe click → upstream suppression does not block transactional sends. (2) Reply-To + From display name ARE honored in delivered mail (earlier "platform strips headers" conclusion wrong — stale dispatcher window); support ticket item 1 moot, keep footer-opt-out/unsub-scope/quota questions. (3) Robin Thakur reconciled — invite delivered (13b9dcc8, ORD2600370 exists; Lovable's "doesn't exist" was a case-sensitivity query error + mis-quoted id). (4) 4 flood-DLQ'd customer invites re-sent, all sent 11:26Z. (5) NULL order_number: zero rows, template guard stays as defense.
RESEND OUTAGE DISARMED: notify.xboomflow.com NOT verified in Resend (403 confirmed); DEFAULT_FROM/invoice FROM reverted to notifications@/invoices@xboom.in; zero casualties (path was idle). Resend-path From still xboom.in — constraint until xboomflow.com verified in Resend dashboard. Dead constant FROM_ADDRESS in kyc-handler:52 — cleanup someday.
TURN C ✅ VERIFIED (commit 7e776921): send-ticket-email + portal-notify email branches on platform — 8 templates (ticket-assigned, ticket-status-update, portal-ticket-created/reply-to-customer/reply-to-staff, portal-rfq-submitted/assigned, portal-order-state) all transactional:true; WhatsApp branch + internal-note skip intact; From display name "Xboom" confirmed rendering (earlier bare-address was stale enqueue). Edge flagged to fix: status_update idempotency key suppresses re-entered statuses (resolved→reopened→resolved) — fix handed with Turn D go.
DRONE-DETECTION OVERHAUL ✅ VERIFIED 2026-07-05 (migrations 20260705125802/130955/131409 + supabase/tests/drone_detection.test.sql): false positive (143455 FPV MOTOR → KYC SMS + confirmation wrongly sent) led to full rework. Final rule: is_model_match (mavic/phantom/matrice/avata/autel evo/skydio/parrot anafi/swellpro/tello/agras/dji neo/lito) → drone UNCONDITIONALLY; generic keywords (fpv/inspire/air N/mini N) require brand token AND no component exclusion; order_has_drone() 3-tier (item category → pricelist fallback → name). DJI Lito 1 pricelist Camera→Consumer Drones (admin confirmed it IS a drone). 15 orders cleared in first pass, 8-9 re-flagged after weaker-test audit (re-flag is DATA-DRIVEN via order_has_drone over domain_events cleared set — multi-item orders like Terra+Mavic bundles explain both-lists confusion). Audit trail: order.confirmation_flag_cleared_false_positive / _reflagged_true_positive. KYC gating + trigger share one detection stack (kyc-handler:336 rpc order_has_drone). pgTAP in-migration + test file. LESSON: pricelist category data is the foundation — regex is fallback; periodic category audit for drone-adjacent products beats keyword tuning.
Zoho invoice badge: "Zoho + Proforma" conflation reverted to plain "Zoho Invoice" (user decision — tax invoice ≠ proforma).

TURN D ✅ VERIFIED (commit 490e9e54): send-customer-confirmation-request + portal-invite-customer on platform — customer-confirmation-request.tsx + portal-invite.tsx (dynamic is_existing_user variant), transactional:true; idempotency: confirmation = order_id+attemptIdx (re-clicks send fresh), invite = invite_token. Ticket status-cycle fix shipped: transitionMarker from tickets.updated_at epoch appended to status_update key.
TURN E ✅ VERIFIED: send-invite-email (hr-user-invite) + portal-invite-teammate on platform, transactional:true, idempotency from invitation_email_log.id / contactId+token-fingerprint. Definitive reflag ledger: 9 orders (143208, 143556, ORD2600069/0105/0133/0168/0172/0186/0320). LOOSE END CAUGHT: 3 FPs awaiting "clear" never approved (ORD2600050/0103 training services, ORD2600259 CADDX FPV camera) — approval sent with Turn F go.
TURN F ✅ VERIFIED: send-password-reset-email on platform (password-reset-admin template, transactional:true, generateLink recovery flow untouched, idempotency from password_reset_email_log.id). 3 stuck FP orders cleared (ORD2600050/0103/0259, migration 20260705134719), pending pool 509.
TURN G ✅ VERIFIED — 🏁 EMAIL PLATFORM MIGRATION COMPLETE (2026-07-05): seam multi-recipient (per-recipient enqueue + ${baseKey}:${recipient} keys, aggregated results, verified email.ts:121-174); 6 tail functions flipped (sla-alert/attention/sync-health/data-quality transactional:true; docs-digest/renewal-reminder transactional:FALSE — suppression+unsub footer honored per /unsubscribe promise); multi-recipient proven live (sync-health + data-quality each sent to 2 addresses). FINAL STATE: 16 app-email senders on platform queue; auth-email-hook direct pgmq (unchanged); PERMANENT Resend holdouts: send-invoice-email (PDF attachments, pinned :269) + process-email-queue DLQ alert (out-of-band by design, :209). Zero unexpected resend-branch callers. Dead code: kyc-handler raw-HTML sendEmail stubs (no call sites) — cleanup someday with FROM_ADDRESS constant.
PIPELINE TAB-SWITCH FIX ✅ VERIFIED (belatedly): usePipelineOrders.ts:121 now depends on [userId] not [user] — form-wipe-on-tab-switch bug closed.
🏁 ZOHO PHASE 2 LIVE (2026-07-06, verified with evidence): poller recovered post-quota-reset — 12+ clean 15-min runs, cursor moving, no errors. XI-Jul26-0171 matched to order 143800 via reference_number rule; FIRST PDF attached through rebuilt unique index (zoho/8b6d2747-.../5435336000004362090.pdf, pdf_hash recorded, FK back-link set). Steady state ~4 runs/hr ≈ 5 API calls/hr (hourly zoho-books-sync unscheduled, enrichment cap 50). Totals since reset: 3 ingested, 4 matched (2 ref-rule + 2 manual), 5 PDFs attached. GO-FORWARD: finance enters XBoom order number in Zoho "Order Number" field (= API reference_number; PDF shows it as P.O.#) → auto-attach within ~15 min. Historical 1,319 unmatched left for manual attach screen. Known cases: XI-Jun26-0143 NXTWAVE ₹10.8L paid with NO workflow order (Jan orders ORD2600030/28 cancelled, deal renegotiated — finance/Narasimha to reconcile; ₹11,42,400 approved payment on cancelled ORD2600030 needs refund/credit-note check); VOID invoices = re-issue chains (e.g. 0139→0167→0168 Aerial Intelligence) — guard prompt pending: exclude void from auto-match/picker + flag void-after-attach.
ZOHO PHASE 2 HISTORY 2026-07-05 ✅ diagnosed + partially fixed: 1,406 invoices ingested but 1 matched / 0 PDFs attached. Bug 1 FIXED (migration 20260705145336): partial unique index uq_order_invoices_zoho_invoice_id didn't satisfy upsert onConflict → every PDF write rejected since setup; rebuilt as full unique index. Bug 2 = quota starvation: hourly zoho-books-sync lists ALL invoices (not deltas) + 469-call enrichment pass burned the 2,000/day cap; poller rate-limited since Jul 4 23:00 UTC (77 blocked runs) — XI-Jul26-0171 (order 143800) never ingested. Bug 3 = match heuristic: reference_number rarely contains our order number (old invoices carry customer POs like PO-00663); go-forward convention needed. zoho-books-webhook DELETED (redundant). KYC card now shows email_send_log delivery status via idempotency_key (kyc_email_log.idempotency_key added). Dead code swept; EMAIL_PROVIDER default now 'platform'.
POST-MIGRATION OPEN ITEMS: (a) Lovable support ticket still worth raising: transactional footer opt-out + unsubscribe scope + quota ceilings (Reply-To item RESOLVED — headers honored); (b) Resend plan can downgrade to free tier (only invoices + DLQ alerts remain; keep API key); (c) domain warm-up watch for no-reply@xboomflow.com; (d) old pending turn: seam EMAIL_PROVIDER env default still 'resend' — harmless (every caller passes provider explicitly) but flip default to 'platform' someday for correctness. — multi-recipient seam fix (per-recipient enqueue + key suffix) then 6 tail functions. KEY NUANCE sent with go: portal-docs-digest + portal-renewal-monitor = transactional FALSE (suppression + unsub footer SHOULD apply — matches /unsubscribe page promise); sla/attention/sync-health/data-quality = true. Then final migration summary: platform everywhere except send-invoice-email (attachments) + DLQ alert (out-of-band) on Resend permanently. (portal-invite-teammate + send-invite-email/HR) → F (password reset) → multi-recipient seam fix → G (tail) (send-ticket-email + portal-notify templates). Then D–G per plan; before G: seam multi-recipient fix. Post-G: KYC card delivery-status fix, kyc-handler dead constant.

---

## 🟡 2026-07-05 (earlier): Platform email limitations confirmed + Turn C gate

CONFIRMED from delivered mail (post-fix sends f2b4c15b/55965ab0): Lovable delivery API STRIPS Reply-To header and From display name (client lib @lovable.dev/email-js@0.0.4 sends both correctly — platform-side bug). Also renders unsubscribe footer on ALL sends incl. transactional (mandates unsubscribe_token, 400 missing_unsubscribe otherwise; skip_unsubscribe_footer has no API effect). Mitigations: template copy now says "email us at support@xboom.in" (no more "reply to this email"); user raising Lovable support ticket (Reply-To strip, From name, transactional footer opt-out, unsubscribe scope, quota ceilings); GoDaddy email-forward notifications@/noreply@xboomflow.com → support@xboom.in as plan B (root has no MX; forwarding safe).
DLQ alert email now out-of-band via seam provider:'resend' (verified index.ts:208-209), DLQ_ALERT_TO env override, notifications row unchanged. Reason buckets normalized shared with DlqAlertCard.
Employee bank guard shipped+verified: trigger blocks sensitive cols for non-admin/HR, auth.uid() IS NULL bypass explicit, employee_bank_audit_log + single HR notification (both-cols=1), pgTAP suite, HR BankAuditHistoryPanel in EmployeeDetailDialog.
TURN C GATES: (1) upstream unsubscribe test — green-lit with nishant.gearup+unsubtest@gmail.com (send → user clicks footer → kyc-onboarding to same address → email_send_log verdict; dlq/suppressed = account-wide upstream suppression = escalate before customer-facing turns). (2) Robin Thakur re-send contradiction: Lovable claimed 50344383 sent (ORD2600370) then said order doesn't exist — reconciliation demanded. (3) 4 flood-DLQ'd customer invites re-send requested (nagarjunamadala, uditsiingh09, ptarchana02, mohabulskill). KYC onboarding order_number sometimes null in orders (loud warn added) — investigate data.

---

## ✅ VERIFIED 2026-07-04 (late): Webhook-loop email flood — root-caused, fixed, purged

Incident: ~1,270 msgs jammed pgmq.q_transactional_emails; platform provider 429'd (retry_after 17:30Z); KYC emails stuck. Root cause: self-echo loop — mirrorIntoInternalOrders re-stamped cancelled_at on EVERY repeat webhook → orders_woo_reverse_sync trigger saw IS DISTINCT FROM → PUT to Woo → Woo re-fired order.updated (orders 143256/143468, ~2s cadence, all status:success). website_orders_email_notify trigger re-fired cancelled branch each cycle. pgmq does NOT dedupe on idempotency_key at enqueue (dispatch-time dedup only, and nothing reached 'sent' behind the 429) — key learning.
Fixes verified in code: (1) woo-mirror.ts transition-only stamps; (2) migration 20260704170402 purges flood keys + trigger requires OLD.<field> IS NULL; (3) send-website-order-email dedup short-circuit vs email_send_log; send-transactional-email now writes metadata.idempotency_key. Queue 1,270→11; ~1,500 orphan pending log rows → suppressed (purged_webhook_loop_duplicate).
Open: (a) platform provider daily/per-sec quota NOT visible in-project — user to raise Lovable support ticket if capacity planning needs it; (b) 1 dlq row: 403 lovable_api_key_registry_lookup_failed (platform auth blip — watch for recurrence); (c) KYC test sends (kyc:onboarding/reminder:turnB-verify) pending until 17:30Z window cleared — confirm sent, re-send Robin Thakur ORD2600370 invite, then Turn C. (d) KYC card status bug: order card reads kyc_email_log.status (flips 'sent' on enqueue) not email_send_log delivery status — fix after migration.

---

## ✅ VERIFIED 2026-07-04: Email platform migration Turns A+B — commits 5eda60d5, eb7dc6e8

Turn A: order-notification + website-order templates live on platform queue (send-transactional-email + pgmq + process-email-queue); seam platform branch real (templateName/templateData/idempotencyKey; rejects raw HTML + attachments; NOTE: sends to FIRST recipient only — fix before Turn G admin-list functions). Turn B: KYC suite flipped (kyc-onboarding/kyc-reminder/kyc-status/kyc-salesperson-notify templates, transactional: true). Prereqs all verified in code: sender = "Xboom <notifications@xboomflow.com>" + Reply-To support@xboom.in; /unsubscribe page + route built; transactional flag bypasses suppression+unsub footer (non-transactional = fail-closed suppression check); kyc-handler logs platformRes.provider. Remaining turns: C (send-ticket-email + portal-notify) → D (confirmation-request + portal-invite-customer) → E (teammate/HR invites) → F (password reset) → G (tail + multi-recipient fix). Sender decision: keep noreply→notifications@xboomflow.com root-domain display, replies via support@xboom.in.

---

## ✅ VERIFIED 2026-07-04: Email seam refactor (Option C step 1) — commit 958fa8f8

`_shared/email.ts` created: sendEmail({to,subject,html,attachments,replyTo,from,provider,cc,bcc}); EMAIL_PROVIDER env (default resend); platform branch stubbed 501 until React Email templates land; DEFAULT_FROM "Xboom <notifications@notify.xboomflow.com>", DEFAULT_REPLY_TO support@xboom.in. All 18 functions migrated — grep confirms ZERO direct api.resend.com/resend-SDK calls remain outside the seam. send-invoice-email pinned provider:'resend' (platform lacks attachments) with FROM "Xboom Utilities <invoices@notify.xboomflow.com>". send-order-notification no longer uses sandbox onboarding@resend.dev. Spot-checked kyc-handler (retry wrapper intact; provider:'resend' at ~line 524 is only the order_notifications LOG value — flag to update when variant flips to platform) and send-order-notification (dynamic import, fine).

NEXT: template migration turns A–G (A: order+website-order notification → B: KYC family → C: ticket/portal-notify → D: confirmation-request + portal customer invite → E: teammate/HR invites → F: password reset → G: low-volume tail). Each turn: React Email template reproducing copy exactly, stable idempotencyKey from existing log identity, flip that function's provider, live test before next. Watch spam/warm-up on new domain.

---

## ✅ Completed work

### 2026-07-04 — Portal Customers refinements ✅ + email-provider decision (by Lovable / Claude-verified)
- Refinement pass verified: `displayCompany()` rule (company only for Business accounts — list/CSV/drawer/delete-confirm), drawer "Recent Orders" now reads public.orders by contact-email match (B2B section only when portal_orders exist), invite dialog Individual/Business toggle, WhatsApp capture (invite + drawer inline editor); onboardOrder sets primary_contact_name. Small fixes: confirmation chip whitespace-nowrap; KYC page got main Header/tab bar.
- **Decision: declined Lovable's built-in-email migration (notify.xboomflow.com)** — would add new platform lock-in counter to the migration-off-Lovable milestone. Standardizing on Resend (user to upgrade plan for quota) + the portable retry/logging work (portal_notifications_log + hourly retry cron + resolved/closed notify fix) — prompt handed to Lovable.
- **last_login fix + unified admin nav ✅** (2026-07-04, migration `20260704075253`, verified): `touch_portal_last_login()` SECURITY DEFINER RPC (own-row by auth.uid; replaces the RLS-blocked direct update that made everyone show "Never logged in") + one-time backfill from `auth.users.last_sign_in_at`; `adminTabsConfig.ts` ADMIN_TABS is now the single source for Admin.tsx + AdminTabsNav (Portal Tickets/Feature Flags/Dev Console/KYC Emails consistent, financeOk kept).
- Still pending: DigiLocker (awaits vendor pick); notification retry/logging build (Resend retained — Lovable platform-email declined).


### 2026-07-04 — Auth fix: email deep links logged users out of every tab ✅ (by Claude, commit `4bd9d3dd`)
Symptom: clicking "Open ticket" in portal notification emails opened the xboomflow.com login screen despite an active session, AND killed the existing session in other tabs. Root cause: a startup "corrupted token cleanup" IIFE in `useAuth.tsx` (added by Lovable commit `23a19ee3`, 2026-05-21) ran once per NEW tab (per-tab sessionStorage flag) and deleted the `sb-*-auth-token` localStorage key when the refresh token was <20 chars or the access token expired — but valid Supabase refresh tokens ARE short opaque (~12-char) strings, and expired access tokens are refreshable. Every new tab therefore purged the shared session; the storage removal broadcast SIGNED_OUT to all tabs. Fix: cleanup now only removes truly corrupted entries (unparseable JSON / missing refresh_token). ⚠️ Related residual risk (not changed): `isSessionExpired` purge on INITIAL_SESSION (useAuth ~line 424) can still force cross-tab logout if the SDK ever emits an expired session mid-refresh — revisit if random logouts persist.


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
