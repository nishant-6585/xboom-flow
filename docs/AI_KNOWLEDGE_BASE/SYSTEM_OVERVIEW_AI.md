# XBoom Workflow — System Overview (AI Context)

> For AI coding agents: This is the entry point for understanding the XBoom system.

## What Is XBoom Workflow?

XBoom Workflow is an internal operations platform that integrates Sales CRM, Inventory, Procurement, Finance, HR, Payroll, Recruitment, Meetings, Tickets, and Shopify integration into a single system. It is built for a drone/UAV business and manages the full employee and sales lifecycle.

## Architecture

### Frontend

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS + Shadcn UI |
| State | React Query (TanStack) |
| Routing | React Router v6 |
| Charts | Recharts |
| PDF | jsPDF + jspdf-autotable |
| Drag & Drop | @dnd-kit |

### Backend

| Layer | Technology |
|-------|-----------|
| Database | PostgreSQL 15+ (via Supabase) |
| Auth | Supabase Auth (email + MFA) |
| API | Supabase PostgREST (auto-generated) |
| Edge Functions | Deno runtime (17 deployed functions) |
| Storage | Supabase Storage (payslips, transfers, avatars) |
| Realtime | Supabase Realtime (selected tables) |
| Cron | pg_cron (auto-checkout, attendance nudge, Shopify processor) |

### Security Model (6 Layers)

1. **Network** — HTTPS/TLS 1.2+, no public DB endpoints
2. **Authentication** — Supabase Auth, MFA for admins, session tracking
3. **Authorization** — RBAC via `user_roles` table, `has_role()` security-definer function
4. **API/Backend** — JWT verification, input validation, parameterized queries
5. **Data Protection** — RLS on all tables, AES-256 at rest, encrypted secrets
6. **Monitoring** — `security_audit_log`, `edit_history`, `domain_events`

## Module Index

| Module | Page | Primary Hook | Docs |
|--------|------|-------------|------|
| Sales | `/sales` | `useEnquiries` | `Features/phase1.md` |
| Orders | `/orders` | `useOrders` | `Features/phase1.md` |
| Inventory | `/inventory` | `useInventory` | `Features/phase2a.md` |
| Procurement | `/procurement` | `useInventoryProcurements` | `Features/phase2a-1.md` |
| Finance | `/finance` | `useExpenses` | `Features/phase2b.md` |
| HR | `/hr` | `useHR` | `Features/HR_OPERATIONS.md` |
| Payroll | `/hr` (tab) | `useSalarySheets` | `Features/PAYROLL_MODULE.md` |
| Recruitment | `/candidates` | `useCandidates` | `Features/phase2c.md` |
| Tickets | `/tickets` | `useTickets` | — |
| Meetings | `/meetings` | `useMeetings` | — |
| Billing | `/billing` | `useInvoices`, `useQuotes` | `Features/phase2b.md` |
| Shopify | Widget | `useShopifyOrders` | `SHOPIFY_WEBHOOK_SETUP.md` |
| Forms | `/forms` | `useForms` | — |
| Tasks | `/tasks` | `useTasks` | — |
| Attendance | Widget + `/hr` | `useAttendanceWidget` | `Features/HR_OPERATIONS.md` |
| Buyback | `/buyback` | `useBuybackDrones` | — |
| Repairs | `/repairs` | `useRepairs` | — |

## Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | All routes and protected route wrappers |
| `src/hooks/useAuth.tsx` | Auth context, role checks, session management |
| `src/components/ProtectedRoute.tsx` | Route guard with role enforcement |
| `src/integrations/supabase/client.ts` | Supabase client (auto-generated, never edit) |
| `src/integrations/supabase/types.ts` | DB types (auto-generated, never edit) |
| `src/lib/auditLog.ts` | Audit logging utility |
| `supabase/config.toml` | Edge function JWT settings (auto-generated, never edit) |

## Related Documentation

- `Features/DATABASE_SCHEMA.md` — Table overview by domain
- `Features/SECURITY_ARCHITECTURE.md` — Full security model
- `Features/IDENTITY_AND_ACCESS_MANAGEMENT.md` — RBAC details
- `Features/EDGE_FUNCTIONS.md` — All 17 edge functions
- `Features/PAYROLL_MODULE.md` — Payroll lifecycle
- `Features/HR_OPERATIONS.md` — HR operational guide
- `SHOPIFY_SECURITY.md` — Shopify credential management
- `SHOPIFY_WEBHOOK_SETUP.md` — Webhook pipeline

*Last updated: 2026-03-06*
