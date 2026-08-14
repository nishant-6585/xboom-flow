# Fix Sales Dashboard Numbers

Goal: every number on the Sales Arena page (KPI row, funnel card, Lead Distribution, Manager Dashboard) comes from one shared, server-side aggregate so they can never disagree — plus fix the clear display bugs.

## Confirmed defects

1. **Pie labels show 1980%** — the chart data already stores `percent` as a percentage string, and the label callback multiplies the recharts fraction by 100 again, reading the overridden field.
2. **Arjav chauhan appears twice** (313 and 97 leads) — Lead Distribution keys entries by `user:<id>` when an id exists and by `name:<lowercase>` when it doesn't, so the same person splits into two rows.
3. **Win Rate stuck at 0.0% with 135 orders won** — it is computed as won *enquiries* ÷ enquiries, which ignores orders entirely.
4. **Total Leads disagree (4,267 vs 4,796)** — the KPI row sums client-side lists from several hooks (some paged or capped at 2,000/5,000 rows), while Lead Distribution counts directly in the database.
5. **Funnel card shows 104 / 0 / 0** — it has its own private date picker ("Today") while the KPI row uses the page filter, so the two describe different periods.
6. **Manager Dashboard "Team Leads 45" vs 3,152 in the chart below it** — the leaderboard RPC's `leads_handled` uses a different definition from the distribution query.
7. **Hard-coded name mapping** — a fixed list of user IDs and nickname aliases in the distribution hook silently mislabels or drops people (anything containing "vishal" is dropped entirely).

## Decisions applied

- Win Rate = Orders Won ÷ Total Leads for the selected period.
- One shared server-side source of truth for lead / prospect / pipeline counts.
- Funnel card follows the page date filter; its private picker is removed.
- All counts respect the existing Include-website toggle.

## What will be built

### 1. One canonical aggregate (database)
A single function `get_sales_dashboard_metrics(start_date, end_date, sales_person_id, include_website)` returning, in one round trip:

- totals: leads, prospects, A-category, hot leads, pipeline count and value, orders won and revenue, avg deal, win rate
- per-source lead breakdown (enquiries, calls, forms, email, Interakt, Facebook, IndiaMART, ManyChat, website)
- per-salesperson rows: leads, prospects, pipeline count, pipeline value, orders won, revenue

Counting rules baked in once, server-side:
- de-duplicated per salesperson by `user_id`, falling back to a name match only when no id exists — never both
- leads exclude rows already converted to enquiries (no double counting)
- `include_website = false` excludes website/Woo and unattributed system-owned rows
- counted with `COUNT(*)` in SQL, so no row caps

### 2. Frontend rewiring
- New hook `useSalesDashboardMetrics` wrapping the function; keyed on date range + salesperson + website toggle.
- `SalesCommandCenter` KPI row, lead-source list and salesperson table read from it instead of summing hook arrays.
- `LeadDistributionChart` reads the per-salesperson rows from the same hook; the old ad-hoc multi-query hook and its hard-coded name map are removed.
- `ManagerDashboard` totals read from the same hook, so its cards match the chart underneath.
- Funnel card takes the page's date range as a prop; its own picker is removed.

### 3. Display fixes
- Pie labels use the precomputed percentage directly (no second ×100), and percentages are normalised to sum to 100%.
- Salesperson names resolved from `profiles`, so no nickname aliasing and nobody is silently dropped.
- Empty-period states show "—" instead of a misleading 0.

## Verification
- Compare the new function's totals against direct row counts per source for This Month, Last Month and a custom range.
- Confirm KPI Total Leads, the funnel's Total Leads, the Lead Distribution total and the Manager Dashboard's Team Leads all show the same figure for the same filter.
- Toggle Include-website on/off and confirm every card moves together.
- Check that no salesperson appears twice and that percentages sum to 100%.

## Notes
No data is modified — this is read-path and presentation only. Existing analytics scope behaviour (website exclusion by default) is preserved.
