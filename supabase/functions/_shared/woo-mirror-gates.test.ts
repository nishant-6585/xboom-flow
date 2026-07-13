import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideWooMirrorAction } from "./woo-mirror-gates.ts";

const base = {
  requires_confirmation: false as boolean | null,
  confirmation_status: "not_required" as string | null,
  customer_email: "buyer@example.com" as string | null,
};

Deno.test("drone-flagged new order → send_confirmation", () => {
  assertEquals(
    decideWooMirrorAction({
      order: { ...base, requires_confirmation: true, confirmation_status: "pending" },
      wooStatus: "processing",
      isNew: true,
    }),
    "send_confirmation",
  );
});

Deno.test("drone-flagged existing order status update → still send_confirmation", () => {
  assertEquals(
    decideWooMirrorAction({
      order: { ...base, requires_confirmation: true, confirmation_status: "pending" },
      wooStatus: "processing",
      isNew: false,
    }),
    "send_confirmation",
  );
});

Deno.test("non-drone new order → send_portal_welcome (not send_confirmation)", () => {
  assertEquals(
    decideWooMirrorAction({
      order: { ...base, requires_confirmation: false, confirmation_status: "not_required" },
      wooStatus: "processing",
      isNew: true,
    }),
    "send_portal_welcome",
  );
});

Deno.test("non-drone existing order status update → skip_existing", () => {
  assertEquals(
    decideWooMirrorAction({
      order: { ...base, requires_confirmation: false, confirmation_status: "not_required" },
      wooStatus: "completed",
      isNew: false,
    }),
    "skip_existing",
  );
});

Deno.test("cancelled Woo order never emails", () => {
  for (const isNew of [true, false]) {
    assertEquals(
      decideWooMirrorAction({
        order: { ...base, requires_confirmation: true, confirmation_status: "pending" },
        wooStatus: "cancelled",
        isNew,
      }),
      "skip_cancelled",
      `isNew=${isNew}`,
    );
  }
});

Deno.test("already-confirmed drone order does not re-ask the customer", () => {
  assertEquals(
    decideWooMirrorAction({
      order: { ...base, requires_confirmation: true, confirmation_status: "confirmed" },
      wooStatus: "processing",
      isNew: true,
    }),
    "skip_confirmed",
  );
});

Deno.test("missing customer_email short-circuits any email flow", () => {
  for (const requires of [true, false] as const) {
    assertEquals(
      decideWooMirrorAction({
        order: { ...base, requires_confirmation: requires, customer_email: null },
        wooStatus: "processing",
        isNew: true,
      }),
      "skip_no_email",
      `requires_confirmation=${requires}`,
    );
  }
});

Deno.test("null requires_confirmation is treated as non-drone", () => {
  assertEquals(
    decideWooMirrorAction({
      order: { ...base, requires_confirmation: null, confirmation_status: null },
      wooStatus: "processing",
      isNew: true,
    }),
    "send_portal_welcome",
  );
});