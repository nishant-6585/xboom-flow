## Phase 1A — UX Consistency Pass

Large scope (5 deliverables across ~10 pages + 2 tables). Plan below; will execute after approval.

### Deliverable 1 — Shared primitives (new files)
- `src/components/data-states/TableSkeleton.tsx` — n rows × n cols of Skeleton
- `src/components/data-states/EmptyState.tsx` — icon + title + desc + action
- `src/components/data-states/DataErrorState.tsx` — AlertCircle + message + retry
- `src/components/data-states/index.ts` — barrel export

### Deliverable 2 — Loading / empty / error states on 6 pages
Wrap list regions in: Orders, Sales, Leads, Finance, Inventory, Tickets.
Empty-state CTAs wired to existing dialogs/handlers per spec.

### Deliverable 3 — Pagination
- `Leads.tsx` — remove `limit(1000)`, add page-size selector (50/100/250) + shadcn `Pagination`
- `Inventory.tsx` transactions — 50/page default
- `Orders.tsx` — surface paginated controls per tab (manual/Shopify/Woo)

### Deliverable 4 — Export hook + buttons
- `src/hooks/useTableExport.ts` — `exportToExcel`, `exportToCsv`; date-fns formatting; `₹` for amount cols; column ordering via passed key order
- Add Export button to: Finance, Orders, HR, Buyback, Trainings (exports current view)

### Deliverable 5 — Bulk actions
- `OrderTable.tsx` — checkbox col, floating toolbar: Mark Paid (bulk update `payment_status='full'`), Export selected, Clear
- `LeaveApprovalCard.tsx` (+ parent list) — selection + bulk approve via existing `onApprove`

### Constraints respected
- shadcn-only, semantic tokens, React Query, components <300 lines, no new deps
- All bulk writes go through Supabase respecting RLS, toasts via sonner

### Reporting back
Will list files added/modified, any awkward pagination cases (e.g. cross-source merged queries in Orders), and confirm OrderTable bulk-paid flow.

### Risks / notes
- `Orders.tsx` mixes 3 sources — pagination already exists in hooks; will surface UI controls without changing query semantics.
- `Leads.tsx` filters happen client-side after the 1000-row fetch in places; will switch to server-side `range()` and keep filter UI working. If a filter requires full dataset (e.g. global count), will keep a separate `count` query.
- HR salary export depends on which tab is active; will export the currently-displayed salary sheet rows only.
