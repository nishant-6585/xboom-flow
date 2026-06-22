## Website Order Sales Attribution

Adds a way to credit website orders to a salesperson — managers/admins assign directly, sales reps can request to claim their own orders. Credit lives on the internal `orders` row, survives webhook re-syncs, and feeds the sales leaderboard.

### 1. Database (one migration)

**Alter `public.orders`** — add:
- `sales_attribution_locked boolean not null default false`
- `sales_attribution_reason text`
- `sales_attribution_reason_custom text`
- `attributed_by uuid`, `attributed_by_name text`, `attributed_at timestamptz`

**New table `public.sales_attribution_log`** (audit trail)
- `order_id`, `from_sales_person_id`, `to_sales_person_id`, `to_sales_person_name`, `reason`, `reason_custom`, `changed_by`, `changed_by_name`, `source text check in ('direct','approved_request')`
- RLS: admin/sales_manager full access; all staff SELECT
- GRANT SELECT, INSERT, UPDATE, DELETE to authenticated; ALL to service_role

**New table `public.sales_attribution_requests`** (approval queue)
- `order_id`, `requested_by`, `requested_by_name`, `requested_for_sales_person_id`, `requested_for_name`, `reason`, `reason_custom`
- `status text default 'pending' check in ('pending','approved','rejected')`
- `decided_by`, `decided_by_name`, `decided_at`, `decision_note`
- RLS:
  - sales rep: INSERT own; SELECT own
  - admin/sales_manager: SELECT all + UPDATE (decide)
  - status flips only via the decide RPC (no client UPDATE on `status`)
- Same GRANTs as above

### 2. RPCs (all SECURITY DEFINER, search_path = public)

**`attribute_website_order(p_order_id, p_sales_person_id, p_reason, p_reason_custom)`**
- Caller must have `admin` or `sales_manager` role
- Updates `orders`: `sales_person_id`, `sales_person_name`, `sales_attribution_locked=true`, reason fields, `attributed_by/_name/_at`
- Inserts `sales_attribution_log` row with `source='direct'`
- Awards standard sales points to the rep idempotently on `reference_id = order_id`; deletes any prior SYSTEM_USER points for the same `reference_id` so totals don't double-count
- Best-effort updates `woocommerce_orders.assigned_to/_name`

**`request_website_order_attribution(p_order_id, p_reason, p_reason_custom)`**
- Caller must be `sales`, `sales_manager`, or `admin`
- Always creates the request for the CALLER as `requested_for_sales_person_id`
- Rejects if order is locked or a pending request already exists for it
- Inserts a `notifications` row of type `attribution_request` for every admin + sales_manager, deep-link to the order

**`decide_attribution_request(p_request_id, p_approve boolean, p_note text)`**
- admin/sales_manager only
- On approve → run the same attribution logic as `attribute_website_order` with `source='approved_request'`
- Sets `status`, `decided_by/_name/_at`, `decision_note`
- Inserts a `notifications` row of type `attribution_decision` to the requester

### 3. Webhook sync protection — `supabase/functions/_shared/woo-mirror.ts`

When the helper UPDATES an existing internal order, look up `sales_attribution_locked`. If true, exclude `sales_person_id` and `sales_person_name` from the update payload. New inserts continue to assign the SYSTEM_USER as today.

### 4. Leaderboard — `get_sales_leaderboard`

Update the RPC so an order with `sales_attribution_locked = true` counts toward its `sales_person_id` even when `p_include_website = false` filters out the website source. Plain wording: locked website orders escape the website exclusion.

### 5. UI

**Website Orders tab (`OrdersWebsiteTab`) + order detail dialog**
- Show a "Credited to {rep} · {reason}" badge on attributed rows (hover shows who/when)
- Action button is role-aware:
  - admin / sales_manager → "Assign to salesperson" opens a dialog with rep picker, Reason dropdown (Remote customer — paid via website / Customer preferred to order online / Field/phone sale completed online by rep / Other), required custom text on "Other". Calls `attribute_website_order`.
  - sales rep → "Request to claim this order" opens a dialog with the same Reason dropdown. Calls `request_website_order_attribution` (for themselves). Shows their request status badge (Pending / Approved / Rejected) on the order.
- Enabled only when the website order has a mirrored internal order in paid/processing+ state; disabled rows show a hint tooltip.
- Re-assignment by admin/sales_manager is allowed and logged.

**Manager/admin approvals queue**
- New "Attribution Requests" tab on Orders (or panel) with a count badge of pending requests
- Lists pending requests with order context (number, customer, value), requested rep, reason
- Approve / Reject buttons (reject requires a note) call `decide_attribution_request`
- Notifications are surfaced through the existing notifications system; deep-link to the order

### Out of scope

- Lead-assignment (`assigned_to`, `assign_woo_lead`) is untouched
- Reps cannot directly assign — they can only request their own attribution
- Sales points are not double-counted: SYSTEM_USER's points for the order are removed when a rep is credited

### Technical notes

- RPCs use `auth.uid()` + `public.has_role(...)` for authorization
- Reason enum is enforced in app code (dropdown); DB stores free text + custom field for flexibility
- `attribute_website_order` is the single shared mutator; `decide_attribution_request` calls into the same SQL block via a private helper to avoid drift
- Webhook protection is purely additive — no new columns read in inserts
- Leaderboard RPC change: extend the website-exclusion predicate to `(source <> 'website' OR sales_attribution_locked = true)`

### Files / objects touched

- 1 migration: alter `orders`, create 2 tables + RLS + GRANTs, 3 RPCs, replace `get_sales_leaderboard`
- `supabase/functions/_shared/woo-mirror.ts`: skip sales-person fields on locked updates
- `src/components/orders/tabs/OrdersWebsiteTab.tsx`: badge + role-aware action button
- new `src/components/orders/AttributeOrderDialog.tsx` and `RequestAttributionDialog.tsx`
- new `src/components/orders/AttributionRequestsQueue.tsx` + tab wiring in `src/pages/Orders.tsx`
- new hook `src/hooks/useAttributionRequests.ts`
