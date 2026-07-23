# End-to-end tests

These Playwright specs drive the running app at `http://localhost:8080` and
verify UI-level invariants that unit / static tests cannot fully cover.

## Running locally

```bash
# 1. Start the dev server in one terminal
bun run dev

# 2. In another terminal, run the e2e suite
bun run test:e2e
```

## Authenticated tests

Specs that need a signed-in Supabase user read the session from the injected
environment variables provided by the Lovable sandbox:

- `LOVABLE_BROWSER_SUPABASE_STORAGE_KEY`
- `LOVABLE_BROWSER_SUPABASE_SESSION_JSON`
- `LOVABLE_BROWSER_SUPABASE_COOKIES_JSON` (optional, for SSR cookie clients)

When these are not present, the auth-dependent tests are skipped with a
clear message. Set `E2E_ORDER_ID` to control which order the salesperson
read-only spec loads (defaults to a placeholder — override in CI).

## Specs

- `orderDialog-sales-readonly.spec.ts` — opens the OrderDialog for an
  existing order and asserts the "Sales:" field in the Customer
  Information section is strictly read-only: no pencil affordance, no
  inline `<select>` editor, keyboard/mouse cannot open an editor, and
  a devtools-style DOM injection attempt does not produce a working
  editor bound to `sales_person_id`.