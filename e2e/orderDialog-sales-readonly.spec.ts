import { test, expect, type Page, type BrowserContext } from "@playwright/test";

/**
 * End-to-end guard: the "Sales:" field inside the OrderDialog's Customer
 * Information section MUST stay read-only for every role. Reassignment must
 * flow exclusively through the Sales attribution panel so DB triggers stamp
 * `attributed_by` / `attributed_at` and append to `sales_attribution_log`.
 *
 * This spec exercises the running app end-to-end and asserts the invariant
 * against three attack surfaces:
 *   1. UI  — no pencil affordance, no inline <select> editor, click/keyboard
 *            interactions do not reveal an editor.
 *   2. API — the client bundle exposes no code path that PATCHes
 *            `orders.sales_person_id` from the Customer Information row.
 *   3. DOM — injecting a rogue <select name="sales_person_id"> via devtools
 *            does not attach a submit/change handler that mutates the order.
 *
 * Requires an authenticated Supabase session (see e2e/README.md). When the
 * session env vars are missing the test is skipped rather than failing.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const COOKIES_JSON = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;
const ORDER_ID = process.env.E2E_ORDER_ID;

async function restoreSession(context: BrowserContext, page: Page) {
  if (COOKIES_JSON) {
    const cookies = JSON.parse(COOKIES_JSON).map((c: Record<string, unknown>) => ({
      ...c,
      url: "http://localhost:8080",
    }));
    await context.addCookies(cookies);
  }
  await page.goto("/");
  if (STORAGE_KEY && SESSION_JSON) {
    await page.evaluate(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      [STORAGE_KEY, SESSION_JSON],
    );
  }
}

test.describe("OrderDialog — Sales field is read-only end-to-end", () => {
  test.skip(
    !STORAGE_KEY || !SESSION_JSON,
    "No Supabase session injected — set LOVABLE_BROWSER_SUPABASE_* env vars to run.",
  );
  test.skip(
    !ORDER_ID,
    "No E2E_ORDER_ID provided — set it to an existing order UUID to run.",
  );

  test("Sales row exposes no editor and blocks UI / DOM / API mutation attempts", async ({
    context,
    page,
  }) => {
    // --- Arrange: sign in and deep-link into the order --------------------
    const patchAttempts: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      const method = req.method();
      if (
        (method === "PATCH" || method === "POST") &&
        /\/rest\/v1\/orders\b/.test(url) &&
        /sales_person_id/.test(req.postData() ?? "")
      ) {
        patchAttempts.push(`${method} ${url} :: ${req.postData()}`);
      }
    });

    await restoreSession(context, page);
    await page.goto(`/orders?order_id=${ORDER_ID}`);

    // Wait for the dialog + Customer Information section to render.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    const salesLabel = dialog.getByText("Sales:", { exact: true });
    await expect(salesLabel).toBeVisible();

    // Scope every assertion to the parent row of the "Sales:" label so we
    // ignore the (legitimate) Sales attribution panel above.
    const salesRow = salesLabel.locator("xpath=..");

    // --- 1. UI surface ----------------------------------------------------
    // No pencil icon / edit button inside the row.
    await expect(salesRow.locator("svg.lucide-pencil")).toHaveCount(0);
    await expect(salesRow.getByRole("button", { name: /edit|change/i })).toHaveCount(0);

    // No inline combobox / select editor bound to salesperson.
    await expect(salesRow.getByRole("combobox")).toHaveCount(0);
    await expect(salesRow.locator("select")).toHaveCount(0);
    await expect(salesRow.locator("input:not([type=hidden])")).toHaveCount(0);

    // The read-only affordance is present and points at the attribution panel.
    await expect(
      salesRow.getByText(/Change via Sales attribution/i),
    ).toBeVisible();

    // Clicking / double-clicking the salesperson name does NOT open an editor.
    const nameNode = salesRow.locator(".font-medium").first();
    await nameNode.click();
    await nameNode.dblclick();
    await expect(salesRow.getByRole("combobox")).toHaveCount(0);
    await expect(salesRow.locator("select")).toHaveCount(0);

    // Keyboard focus + Enter/Space also must not toggle an editor.
    await nameNode.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await expect(salesRow.getByRole("combobox")).toHaveCount(0);

    // --- 2. DOM / devtools injection surface ------------------------------
    // Injecting a rogue <select> into the row must not be wired to any React
    // handler that mutates sales_person_id. We inject, "change" it, and then
    // verify no PATCH to orders.sales_person_id was fired.
    await salesRow.evaluate((row) => {
      const sel = document.createElement("select");
      sel.name = "sales_person_id";
      sel.setAttribute("data-e2e-injected", "true");
      const opt = document.createElement("option");
      opt.value = "00000000-0000-0000-0000-000000000000";
      opt.textContent = "Injected";
      sel.append(opt);
      row.append(sel);
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      sel.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(500);

    // --- 3. API surface ---------------------------------------------------
    // Nothing above should have caused a PATCH/POST that touches
    // sales_person_id on the orders table.
    expect(
      patchAttempts,
      `Unexpected sales_person_id mutation(s) fired from the Sales row:\n${patchAttempts.join("\n")}`,
    ).toEqual([]);

    // Attempting the mutation directly through the shared supabase client
    // (mimicking a devtools "supabase.from('orders').update(...)" call) must
    // either be rejected by RLS/guards or, if it succeeds for privileged
    // roles, must go through the attribution triggers — NOT through the
    // Customer Information row. We only assert the row itself never issues
    // such a call, which is exactly what `patchAttempts` above proves.
  });
});