# XBoom Workflow — Coding Rules (AI Context)

> Mandatory rules for any AI agent or developer modifying this codebase.

---

## Database Rules

1. **Always use RLS policies** on every new table
2. **Never use `USING (true)`** unless the table is genuinely public-facing (e.g., `drone_repair_enquiries`)
3. **Always include `public.has_role(auth.uid(), 'role')` or `auth.uid()` checks** in RLS policies
4. **Never reference `auth.users` directly** — use `profiles` table for user data
5. **Use validation triggers** instead of CHECK constraints for time-based validations
6. **Never modify reserved schemas**: `auth`, `storage`, `realtime`, `supabase_functions`, `vault`
7. **Use the migration tool** for all schema changes — never edit `types.ts` manually
8. **Roles must be in `user_roles` table** — never store roles on `profiles` or `employees`

---

## Security Rules

1. **Never expose the service role key** in frontend code
2. **Never store secrets in code** — use Cloud secrets / environment variables
3. **Never check admin status via localStorage** — always validate server-side
4. **All edge functions should validate JWT** unless cron-triggered or webhook
5. **HMAC verification required** for external webhooks (timing-safe comparison)
6. **Never use anonymous signups** — always require email verification
7. **Audit all sensitive operations** via `security_audit_log`

---

## Frontend Rules

1. **Never edit auto-generated files**:
   - `src/integrations/supabase/client.ts`
   - `src/integrations/supabase/types.ts`
   - `supabase/config.toml`
   - `.env`
2. **Use Supabase client from** `@/integrations/supabase/client`
3. **Use semantic Tailwind tokens** — never write raw color classes (`bg-blue-500`)
4. **Use HSL format** for all CSS variables in `index.css`
5. **Create small, focused components** — avoid monolithic page files
6. **Use React Query** for all data fetching (custom hooks in `src/hooks/`)
7. **Protected routes must use `ProtectedRoute` wrapper** with role checks

---

## Payroll Rules

1. **Salary sheet cannot be edited once `status = 'locked'`**
2. **Bank transfer files only generated for locked sheets**
3. **Payslips only generated for locked sheets**
4. **Net pay must be non-negative** before locking
5. **Bank details required** for all employees in a locked sheet
6. **Reconciliation status tracks per-employee**: `pending` → `paid` / `failed`
7. **Retry transfer files only include `failed` employees**

---

## Billing Rules

1. **Signed invoices cannot be modified** (signature_url is set)
2. **Margin guardrail warns** when invoice margin is below threshold
3. **Quote items transfer to invoice items** on conversion

---

## Attendance Rules

1. **One attendance log per employee per day** (unique constraint)
2. **Auto-checkout triggers after configurable max hours**
3. **Corrections require HR approval** before modifying logs
4. **All attendance changes logged** in `attendance_audit_log`

---

## Edge Function Rules

1. **Use Lovable AI Gateway** for AI features (no external API keys needed)
2. **Supported AI models**: Gemini family, GPT-5 family
3. **Always handle rate limits and credit errors** gracefully
4. **Shopify functions must use HMAC verification** for webhooks
5. **Cron-triggered functions set `verify_jwt = false`** in config.toml

---

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `SalarySheetView.tsx` |
| Hooks | camelCase with `use` prefix | `useSalarySheets.ts` |
| Pages | PascalCase | `PayrollReconciliation.tsx` |
| DB tables | snake_case | `salary_sheet_entries` |
| DB enums | snake_case | `candidate_lifecycle_status` |
| Edge functions | kebab-case | `ai-lead-scoring` |
| CSS variables | kebab-case with `--` prefix | `--primary-foreground` |

*Last updated: 2026-03-06*
