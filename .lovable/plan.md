## Problem

Resources > Analytics shows all zeros (Pipeline Value ₹0, Active Deals 0, Hot Leads 0, Avg Deal Size ₹0, "No state data") even though the database has 195 pipeline orders (94 active) and active enquiries.

## Root cause

In `src/components/sales/SalesAnalyticsDashboard.tsx` the role gate is:

```ts
const isManager = role === 'admin' || role === 'supply_chain';
```

The signed-in user's role is `sales_manager`. That role is not recognized as a manager, so the component falls through to the per-user filter:

```ts
return pipelineOrders.filter(p => p.sales_person_id === user?.id);
return enquiries.filter(e => e.sales_person_id === user?.id);
```

Verified: this user owns 0 pipeline rows and 0 enquiries, so every metric collapses to 0 / empty.

`sales_manager` is a legitimate org-wide viewer (and `finance` typically is too for pipeline value visibility) but neither is in the allowlist.

## Fix

Update the `isManager` allowlist in `SalesAnalyticsDashboard.tsx` to include all roles that should see org-wide analytics:

```ts
const isManager = ['admin', 'supply_chain', 'sales_manager', 'finance'].includes(role ?? '');
```

That's the only code change. Behavior after fix:
- `admin`, `supply_chain`, `sales_manager`, `finance` → see all pipeline + enquiries (org-wide totals populate the cards and charts).
- `sales` and other roles → unchanged, still scoped to their own `sales_person_id`.

## Verification

1. Reload Resources > Analytics as the current `sales_manager` user.
2. Pipeline Value, Active Deals, Hot Leads, Avg Deal Size should be non-zero.
3. "Pipeline by State" and other charts should render.
4. Sign in as a `sales` user and confirm they still see only their own pipeline (no regression).

## Out of scope

- No DB / RLS / hook changes — `usePipelineOrders` and `useEnquiries` already return what the user is permitted to read via RLS; this is purely a client-side role-gate bug.
- No changes to which roles can see the Analytics tab itself (routing/visibility unchanged).

Confirm the role list (`admin`, `supply_chain`, `sales_manager`, `finance`) is correct, or tell me to use a different set, and I'll implement.
