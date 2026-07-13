// Integration test: mirrorIntoInternalOrders must persist orders.payment_terms
// as sanitized plain text when a WooCommerce payment plugin injects HTML
// into payment_method_title. Exercises both the INSERT (new order) and
// UPDATE (existing order) code paths through a minimal chainable stub.
import {
  assert,
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { mirrorIntoInternalOrders, WINDOW_START_ISO } from "../woo-mirror.ts";

// ---------------------------------------------------------------------------
// Minimal chainable Supabase stub — captures every insert/update payload
// grouped by table, and returns null-ish reads so no downstream branches
// (order_items, confirmations, portal welcome, kyc onboard) fire.
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
type AnyRec = Record<string, any>;

interface Capture {
  inserts: Record<string, AnyRec[]>;
  updates: Record<string, AnyRec[]>;
}

function makeStub(opts: { existing?: AnyRec | null } = {}) {
  const capture: Capture = { inserts: {}, updates: {} };
  const existing = opts.existing ?? null;
  let insertedId = existing?.id ?? "00000000-0000-0000-0000-0000000000aa";

  function chain(table: string) {
    const state: AnyRec = { table };
    const api: AnyRec = {
      select: (_cols?: string) => api,
      eq: (_c: string, _v: unknown) => api,
      in: (_c: string, _v: unknown[]) => api,
      order: (_c: string, _o?: unknown) => api,
      limit: (_n: number) => api,
      maybeSingle: async () => {
        if (table === "orders") return { data: existing, error: null };
        // freshOrder lookup (post-insert) — return null so no confirmation dispatch
        return { data: null, error: null };
      },
      single: async () => {
        if (state.op === "insert" && table === "orders") {
          return { data: { id: insertedId }, error: null };
        }
        return { data: null, error: null };
      },
      insert: (rows: AnyRec | AnyRec[]) => {
        state.op = "insert";
        const arr = Array.isArray(rows) ? rows : [rows];
        (capture.inserts[table] ||= []).push(...arr);
        return api;
      },
      update: (row: AnyRec) => {
        state.op = "update";
        (capture.updates[table] ||= []).push(row);
        return api;
      },
      delete: () => api,
      upsert: (rows: AnyRec | AnyRec[]) => {
        state.op = "insert";
        const arr = Array.isArray(rows) ? rows : [rows];
        (capture.inserts[table] ||= []).push(...arr);
        return api;
      },
      then: undefined,
    };
    return api;
  }

  const client: AnyRec = {
    from: (table: string) => chain(table),
    functions: { invoke: async () => ({ data: null, error: null }) },
  };
  return { client, capture };
}

// One-day-past-window date so `inWindow` gate passes.
const IN_WINDOW_DATE = (() => {
  const d = new Date(`${WINDOW_START_ISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString();
})();

const SNAPMINT_TITLE =
  `<span class="emi-title">0% EMI on UPI</span> <span class="pay-via-text">Pay via</span><img src="https://assets.snapmint.com/logo.png" alt="Snapmint" />`;

function basePayload(): AnyRec {
  return {
    number: "TEST-1",
    status: "processing",
    date_created: IN_WINDOW_DATE,
    total: "1000",
    billing: { first_name: "Test", last_name: "User", email: "t@example.com", phone: "9999999999" },
    shipping: {},
    line_items: [],
    shipping_lines: [],
    payment_method: "snapmint",
    payment_method_title: SNAPMINT_TITLE,
  };
}

Deno.test("mirrorIntoInternalOrders INSERT: sanitizes HTML payment_method_title into payment_terms", async () => {
  const { client, capture } = makeStub({ existing: null });
  await mirrorIntoInternalOrders(client, basePayload(), "12345", "webhook_in");

  const orderInserts = capture.inserts["orders"] ?? [];
  assertEquals(orderInserts.length, 1, "one orders insert expected");
  const row = orderInserts[0];
  assertEquals(row.payment_terms, "0% EMI on UPI Pay via Snapmint");
  // No angle brackets or entity fragments should ever be persisted.
  assert(typeof row.payment_terms === "string");
  assertMatch(row.payment_terms, /^[^<>]+$/);
  // Sanity: the raw HTML source was NOT copied verbatim.
  assert(row.payment_terms !== SNAPMINT_TITLE);
});

Deno.test("mirrorIntoInternalOrders UPDATE: replaces stale HTML payment_terms on an existing order", async () => {
  const existing = {
    id: "11111111-2222-3333-4444-555555555555",
    status: "po_received",
    source: "website",
    sales_attribution_locked: false,
    manual_overrides: null,
    procurement_edited: false,
  };
  const { client, capture } = makeStub({ existing });
  await mirrorIntoInternalOrders(client, basePayload(), "12345", "order.updated");

  const orderUpdates = capture.updates["orders"] ?? [];
  assertEquals(orderUpdates.length, 1, "one orders update expected");
  const row = orderUpdates[0];
  assertEquals(row.payment_terms, "0% EMI on UPI Pay via Snapmint");
  assertMatch(row.payment_terms, /^[^<>]+$/);
});

Deno.test("mirrorIntoInternalOrders INSERT: plain-text payment_method_title is preserved verbatim", async () => {
  const { client, capture } = makeStub({ existing: null });
  const payload = basePayload();
  payload.payment_method_title = "Cash on delivery";
  payload.payment_method = "cod";
  await mirrorIntoInternalOrders(client, payload, "12346", "webhook_in");

  const row = (capture.inserts["orders"] ?? [])[0];
  assertEquals(row.payment_terms, "Cash on delivery");
});

Deno.test("mirrorIntoInternalOrders INSERT: empty payment_method_title falls back to payment_method", async () => {
  const { client, capture } = makeStub({ existing: null });
  const payload = basePayload();
  payload.payment_method_title = "";
  payload.payment_method = "razorpay";
  await mirrorIntoInternalOrders(client, payload, "12347", "webhook_in");

  const row = (capture.inserts["orders"] ?? [])[0];
  assertEquals(row.payment_terms, "razorpay");
});