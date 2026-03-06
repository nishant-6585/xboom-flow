# XBoom Workflow — AI Agent Context

> Read this first. This file helps AI coding agents reason correctly about the XBoom codebase.

---

## System Identity

XBoom Workflow is an internal operations platform for a **drone/UAV business**. It is NOT a public SaaS product. All users are employees. The system manages the full business lifecycle: sales → procurement → delivery → finance → HR → payroll.

---

## Critical Entity Relationships

```
Enquiry (sales lead)
  └── has many EnquiryItems
  └── can convert to PipelineOrder
  └── can generate Quote
        └── can convert to Order
              └── has many OrderItems
              └── has many PaymentRecords
              └── can generate Invoice
                    └── has many InvoiceItems
              └── linked to Procurements (via order_procurement_links)
              └── linked to Expenses (via expense_order_links)

Employee
  └── has one user_id → auth.users
  └── has many AttendanceLogs
  └── has many SalarySheetEntries (per month)
  └── has many EmployeeKPIs
  └── has many EmployeeAssets
  └── can have BankUpdateRequests
  └── has Payslips (via employee_payslips)
```

---

## Key Business Constraints

| Constraint | Enforcement |
|------------|-------------|
| Signed invoices are immutable | Frontend check + audit log |
| Locked salary sheets cannot be edited | RLS + frontend validation |
| Bank transfer files require locked sheet | Frontend validation |
| Payslips require locked sheet | Frontend validation |
| Admin users limited to whitelist | `admin_whitelist` table |
| Salary sheet approval: HR → Finance → Lock | Status state machine |
| Corrections need HR approval | `attendance_correction_requests.status` |
| Roles stored in `user_roles`, never on `profiles` | Architecture rule |
| One attendance log per employee per day | DB unique constraint |
| Reconciliation only for generated transfer files | `payroll_payment_status` linked to `salary_sheet_id` |

---

## Role Hierarchy

| Role | Access Level |
|------|-------------|
| `admin` | Full system access, user management, org settings |
| `hr` | Employee management, attendance, payroll (create/approve), recruitment |
| `finance` | Expenses, payroll (approve), reconciliation, billing |
| `sales` | Enquiries, pipeline, quotes, orders (own data) |
| `supply_chain` | Inventory, procurement, suppliers |
| `employee` | Self-service: attendance, payslips, profile, bank update requests |

Role check pattern:
```typescript
const { userRole } = useAuth();
const isAdmin = userRole === 'admin';
const isHR = userRole === 'hr' || isAdmin;
```

RLS check pattern:
```sql
public.has_role(auth.uid(), 'admin'::app_role)
```

---

## Common Patterns in Codebase

### Data Fetching
All data fetching uses React Query hooks in `src/hooks/`:
```typescript
const { data, isLoading, refetch } = useQuery({
  queryKey: ['table-name'],
  queryFn: async () => {
    const { data, error } = await supabase.from('table').select('*');
    if (error) throw error;
    return data;
  }
});
```

### Mutations with Audit
```typescript
const mutation = useMutation({
  mutationFn: async (values) => {
    const { error } = await supabase.from('table').update(values).eq('id', id);
    if (error) throw error;
    await logAuditEvent('EVENT_TYPE', { entity_id: id, ...details });
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['table-name'] });
    toast.success('Updated successfully');
  }
});
```

### Protected Routes
```tsx
<Route path="/admin" element={
  <ProtectedRoute allowedRoles={['admin']}>
    <Admin />
  </ProtectedRoute>
} />
```

---

## File Organization

```
src/
├── pages/          # Route-level components (one per route)
├── components/     # Shared and feature-specific components
│   ├── ui/         # Shadcn UI primitives (do not modify)
│   ├── admin/      # Admin panel components
│   ├── billing/    # Invoice & quote components
│   ├── hr/         # HR module components
│   ├── salary/     # Payroll components
│   ├── sales/      # Sales module components
│   ├── procurement/# Procurement components
│   ├── attendance/ # Attendance components
│   ├── candidates/ # Recruitment components
│   ├── tickets/    # IT ticket components
│   ├── tasks/      # Task management components
│   ├── forms/      # Form builder components
│   └── ...
├── hooks/          # React Query hooks (one per domain)
├── lib/            # Utilities (audit, PDF generation, exports)
├── integrations/   # Auto-generated Supabase client & types
└── types/          # Shared TypeScript types
```

---

## What NOT to Do

1. ❌ Don't edit `client.ts`, `types.ts`, `config.toml`, or `.env`
2. ❌ Don't store roles on `profiles` or `employees` tables
3. ❌ Don't use `USING (true)` RLS policies on sensitive tables
4. ❌ Don't create anonymous signup flows
5. ❌ Don't hardcode colors — use Tailwind semantic tokens
6. ❌ Don't reference `auth.users` in foreign keys from public schema
7. ❌ Don't use CHECK constraints for time-based validations
8. ❌ Don't modify Supabase-reserved schemas
9. ❌ Don't expose service role key in frontend
10. ❌ Don't skip audit logging for sensitive operations

---

## Quick Reference Links

| Document | Location |
|----------|----------|
| System Overview | `docs/AI_KNOWLEDGE_BASE/SYSTEM_OVERVIEW_AI.md` |
| Module Index | `docs/AI_KNOWLEDGE_BASE/MODULE_INDEX_AI.md` |
| Database Map | `docs/AI_KNOWLEDGE_BASE/DATABASE_MAP_AI.md` |
| Workflows | `docs/AI_KNOWLEDGE_BASE/WORKFLOWS_AI.md` |
| Edge Functions | `docs/AI_KNOWLEDGE_BASE/EDGE_FUNCTIONS_AI.md` |
| Coding Rules | `docs/AI_KNOWLEDGE_BASE/CODING_RULES_AI.md` |
| Security | `Features/SECURITY_ARCHITECTURE.md` |
| IAM | `Features/IDENTITY_AND_ACCESS_MANAGEMENT.md` |
| Payroll | `Features/PAYROLL_MODULE.md` |
| HR Ops | `Features/HR_OPERATIONS.md` |

*Last updated: 2026-03-06*
