import { describe, it, expect } from "vitest";
import {
  WOO_ORDER_STATUSES,
  isWooOrderStatus,
  isWooLeadStatus,
} from "./wooOrderStatuses";

/**
 * Routing contract for WooCommerce (Xboom website) rows:
 *   - processing / on-hold / completed / delivered  -> Orders page only
 *   - everything else (pending, failed, cancelled, refunded, …)
 *     -> Sales > Leads > Xboom Website only
 *
 * The two predicates MUST be mutually exclusive and collectively exhaustive
 * so a row can never appear in both views or be silently dropped.
 */

const ORDER_FIXTURES = ["pending", "processing", "on-hold", "completed", "delivered"];
const LEAD_FIXTURES = [
  "failed",
  "cancelled",
  "refunded",
  "trash",
  "auto-draft",
  "checkout-draft",
  "",
];

describe("wooOrderStatuses routing", () => {
  it("treats pending/processing/on-hold/completed/delivered as orders", () => {
    expect([...WOO_ORDER_STATUSES].sort()).toEqual(
      ["completed", "delivered", "on-hold", "pending", "processing"],
    );
  });

  it.each(ORDER_FIXTURES)("'%s' is an order, never a lead", (status) => {
    expect(isWooOrderStatus(status)).toBe(true);
    expect(isWooLeadStatus(status)).toBe(false);
  });

  it.each(LEAD_FIXTURES)("'%s' is a lead, never an order", (status) => {
    expect(isWooOrderStatus(status)).toBe(false);
    expect(isWooLeadStatus(status)).toBe(true);
  });

  it("is case-insensitive (Woo sometimes returns capitalised statuses)", () => {
    expect(isWooOrderStatus("PROCESSING")).toBe(true);
    expect(isWooOrderStatus("Completed")).toBe(true);
    expect(isWooOrderStatus("PENDING")).toBe(true);
    expect(isWooOrderStatus("On-Hold")).toBe(true);
  });

  it("treats null/undefined as a lead (safe default — never hide a row from sales)", () => {
    expect(isWooOrderStatus(null)).toBe(false);
    expect(isWooOrderStatus(undefined)).toBe(false);
    expect(isWooLeadStatus(null)).toBe(true);
    expect(isWooLeadStatus(undefined)).toBe(true);
  });

  it("predicates are mutually exclusive for every input", () => {
    for (const s of [...ORDER_FIXTURES, ...LEAD_FIXTURES, null, undefined]) {
      expect(isWooOrderStatus(s) && isWooLeadStatus(s)).toBe(false);
      expect(isWooOrderStatus(s) || isWooLeadStatus(s)).toBe(true);
    }
  });

  it("partitions a mixed batch correctly (integration-style)", () => {
    const rows = [
      { id: "1", order_status: "processing" },
      { id: "2", order_status: "completed" },
      { id: "3", order_status: "delivered" },
      { id: "4", order_status: "pending" },
      { id: "5", order_status: "on-hold" },
      { id: "6", order_status: "failed" },
      { id: "7", order_status: "cancelled" },
      { id: "8", order_status: "refunded" },
      { id: "9", order_status: null },
    ];
    const orders = rows.filter((r) => isWooOrderStatus(r.order_status));
    const leads = rows.filter((r) => isWooLeadStatus(r.order_status));

    expect(orders.map((o) => o.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(leads.map((l) => l.id)).toEqual(["6", "7", "8", "9"]);
    expect(orders.length + leads.length).toBe(rows.length);
  });
});