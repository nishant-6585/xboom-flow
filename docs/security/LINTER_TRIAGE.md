# Supabase Linter Triage

Last reviewed: 2026-06-18
Scope: warnings returned by `supabase--linter` that are intentionally accepted
and will NOT be chased as security findings. Persisted findings across all
scanners (`agent_security`, `connector_security_scan` / Wiz / Aikido,
`supabase`, `supabase_lov`) are **0**. This document covers only the on-demand
linter noise.

## Summary of current linter output (439 warnings)

| Lint code | Title | Count | Status |
|---|---|---|---|
| `0014_extension_in_public` | Extension in Public (`pg_trgm`) | 1 | **Accepted** |
| `0024_permissive_rls_policy` | RLS Policy Always True | 18 | **Accepted** (service-role / public-write tables) |
| `0028_anon_security_definer_function_executable` | Anon can EXECUTE SECURITY DEFINER fn | ~250 | **Accepted** (auth helpers) |
| `0029_authenticated_security_definer_function_executable` | Authenticated can EXECUTE SECURITY DEFINER fn | ~170 | **Accepted** (auth helpers) |
| `0011_function_search_path_mutable` | Function with mutable `search_path` | 0 | n/a — all user functions already pin `search_path = public`. The 30 unpinned `public.*` functions are `pg_trgm` extension functions owned by `supabase_admin` and cannot be `ALTER`ed. |

## Why these are accepted

### `0014_extension_in_public` — `pg_trgm`
The trigram extension is installed in `public` (Supabase default location).
Moving it would break ~30 indexes and the global search infrastructure.
No security impact: extensions don't carry data and the trigram operators are
pure functions over caller-supplied text.

### `0024_permissive_rls_policy` — 18 `WITH CHECK (true)` / `USING (true)` policies
Each one is a deliberate pattern, falling into two buckets:

**Bucket A — service-role-only writes (16 policies).** Policies named
`Service role *` on:
`ticket_ai_suggestions`, `ticket_sla_alerts`, `ai_resolution_cache`,
`woocommerce_orders`, `campaign_spend`, `gmail_integrations`,
`gmail_sync_logs`, `form_lead_contact_us_counter`, `lead_assignment_counter`,
`rate_limit_buckets`, `woocommerce_sync_runs`, `woocommerce_sync_state`,
`woocommerce_order_status_logs`.

These tables are populated exclusively by edge functions running under the
service role. The Data API never grants write access — RLS is `true` because
the role check already happened at the JWT layer (verified webhook / cron
with `X-Cron-Secret` / admin JWT). Tightening to a role check inside RLS
would be redundant and would force these jobs to switch to `auth.uid()`
lookups against a fake user.

**Bucket B — public-form intake (2 policies).**
`form_views.Anyone can record form views` (INSERT) and
`drone_repair_enquiries.Anyone can submit drone repair enquiry` (INSERT) plus
`form_leads.Authenticated users can insert form leads` are intentionally open
for write so external visitors / wordpress callers can drop a row. Each table
has rate-limit + dedupe handling downstream; none expose other people's rows
via SELECT.

### `0028` / `0029` — SECURITY DEFINER functions executable by `anon` / `authenticated`
222 functions, all part of the auth / RLS plumbing:

- `has_role(uuid, app_role)` and its 7 specializations — required by EVERY
  RLS policy in the project. Removing `EXECUTE` would brick the app.
- `get_user_role(uuid)` / `current_user_role()` — used by ProtectedRoute and
  the role-aware UI hooks.
- `is_admin*`, `is_finance*`, `is_supply_chain*`, `is_*_or_admin` boolean
  helpers — same reason as above.
- ~190 small RPCs called by the frontend (e.g. `get_order_profits`,
  `resolve_agent_user`, `get_next_proforma_number`). Each function does its
  own role check at the top via `has_role(auth.uid(), …)` before returning
  data. SECURITY DEFINER is required because these read from tables whose
  RLS would otherwise block the caller (e.g. cross-employee payroll math).

The accepted invariant: every SECURITY DEFINER public function MUST start
with an explicit `has_role()` / `auth.uid()` check before touching data.
New functions that don't follow that contract are bugs and should be
rejected in review.

## What would flip these back to "open finding"

Reopen and fix immediately if any of the following becomes true:

1. A new `WITH CHECK (true)` policy is added on a table that is NOT
   exclusively service-role-written, OR on a public-write table whose SELECT
   is not also locked to the row owner.
2. A new SECURITY DEFINER function in `public` is added without an
   `auth.uid()` / `has_role()` gate in its body.
3. A user-owned function in `public` is created without
   `SET search_path = public` (the linter will catch this — keep the count at 0).
4. Any new `public` extension other than `pg_trgm`, `pgcrypto`, `pg_net`,
   `pg_cron` (the Supabase-blessed set).

## Aggregator status

Held until after the migration off Lovable
(`MEMORY.md` → "Migrate off Lovable" milestone). Rationale: the planned
aggregator pulls from (a) Supabase linter and (b) `agent_security` persisted
findings. (b) is Lovable-only and disappears post-migration, so building it
now wastes work. After cutover we'll ship a portable
`security-report-aggregator` edge function that snapshots only the linter
output into a `security_report_runs` table, on a daily cron.

Wiz and Aikido are out of scope by decision — they're workspace scanners
without portable project APIs, and we don't want to mint raw tenant keys.