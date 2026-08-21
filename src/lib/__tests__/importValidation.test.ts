import { describe, it, expect } from "vitest";
import {
  sanitizeImportPayload,
  validateImportForm,
  firstErrorStep,
  mapImportServerError,
  isValidDate,
  isValidUuid,
} from "../importValidation";

const SUPPLIER = "3f1b8c4e-9d2a-4f1b-8c4e-9d2a4f1b8c4e";

const validForm = {
  supplier_id: SUPPLIER,
  currency: "USD",
  order_date: "2026-01-15",
  status: "ordered",
  payment_status: "pending",
  items: [{ product_name: "Drone Motor", quantity: 5, unit_price: 120 }],
};

describe("sanitizeImportPayload", () => {
  it("converts empty date/uuid strings to null", () => {
    const out = sanitizeImportPayload({
      supplier_id: "",
      order_date: "",
      expected_arrival: "   ",
      clearance_date: "",
      payment_date: "",
      product_name: "Motor",
    });
    expect(out.supplier_id).toBeNull();
    expect(out.order_date).toBeNull();
    expect(out.expected_arrival).toBeNull();
    expect(out.clearance_date).toBeNull();
    expect(out.payment_date).toBeNull();
    expect(out.product_name).toBe("Motor");
  });

  it("nulls stray empty *_date / *_id / *_arrival keys not in the list", () => {
    const out = sanitizeImportPayload({ custom_date: "", other_id: "", actual_arrival: "" });
    expect(out.custom_date).toBeNull();
    expect(out.other_id).toBeNull();
    expect(out.actual_arrival).toBeNull();
  });

  it("keeps valid values untouched and nulls NaN numerics", () => {
    const out = sanitizeImportPayload({
      supplier_id: SUPPLIER,
      order_date: "2026-01-15",
      payment_amount: Number.NaN,
      unit_price: 42,
    });
    expect(out.supplier_id).toBe(SUPPLIER);
    expect(out.order_date).toBe("2026-01-15");
    expect(out.payment_amount).toBeNull();
    expect(out.unit_price).toBe(42);
  });
});

describe("validateImportForm", () => {
  it("passes for a fully valid form", () => {
    expect(validateImportForm(validForm)).toEqual({});
  });

  it("never rejects valid input after sanitisation", () => {
    const sanitized = sanitizeImportPayload({ ...validForm, expected_arrival: "" });
    expect(validateImportForm({ ...sanitized, items: validForm.items })).toEqual({});
  });

  it("flags missing mandatory fields", () => {
    const errors = validateImportForm({ items: [] });
    expect(errors.items).toBeTruthy();
    expect(errors.supplier_id).toBeTruthy();
    expect(errors.order_date).toBeTruthy();
    expect(errors.currency).toBeTruthy();
    expect(errors.status).toBeTruthy();
    expect(errors.payment_status).toBeTruthy();
  });

  it("rejects a non-uuid supplier and a malformed order date", () => {
    const errors = validateImportForm({ ...validForm, supplier_id: "abc", order_date: "15/01/2026" });
    expect(errors.supplier_id).toMatch(/supplier/i);
    expect(errors.order_date).toMatch(/valid date/i);
  });

  it("flags per-item quantity and price problems", () => {
    const errors = validateImportForm({
      ...validForm,
      items: [{ product_name: "Motor", quantity: 0, unit_price: 0 }],
    });
    expect(errors["items.0.quantity"]).toBeTruthy();
    expect(errors["items.0.unit_price"]).toBeTruthy();
  });

  it("requires payment amount and date when payment status is paid/partial", () => {
    const errors = validateImportForm({ ...validForm, payment_status: "paid" });
    expect(errors.payment_amount).toBeTruthy();
    expect(errors.payment_date).toBeTruthy();

    const ok = validateImportForm({
      ...validForm,
      payment_status: "partial",
      payment_amount: 500,
      payment_date: "2026-01-20",
    });
    expect(ok).toEqual({});
  });

  it("ignores empty optional dates but rejects malformed ones", () => {
    expect(validateImportForm({ ...validForm, expected_arrival: "" })).toEqual({});
    expect(validateImportForm({ ...validForm, expected_arrival: "not-a-date" }).expected_arrival)
      .toMatch(/valid date/i);
  });
});

describe("firstErrorStep", () => {
  it("returns null when there are no errors", () => {
    expect(firstErrorStep({})).toBeNull();
  });

  it("returns the earliest step containing an error", () => {
    expect(firstErrorStep({ payment_amount: "x" })).toBe(5);
    expect(firstErrorStep({ supplier_id: "x", payment_amount: "y" })).toBe(2);
    expect(firstErrorStep({ "items.0.quantity": "x", supplier_id: "y" })).toBe(1);
  });
});

describe("mapImportServerError", () => {
  it("maps invalid date syntax to a field error", () => {
    const r = mapImportServerError({
      code: "22007",
      message: 'invalid input syntax for type date: ""',
    });
    expect(Object.keys(r.fieldErrors).length).toBeGreaterThan(0);
    expect(r.message).toBeTruthy();
  });

  it("returns a message for unknown errors", () => {
    const r = mapImportServerError({ code: "XXXXX", message: "boom" });
    expect(r.message).toContain("boom");
  });
});

describe("primitive validators", () => {
  it("validates uuids and dates", () => {
    expect(isValidUuid(SUPPLIER)).toBe(true);
    expect(isValidUuid("")).toBe(false);
    expect(isValidDate("2026-02-30")).toBe(true); // JS rolls over; format is what matters
    expect(isValidDate("2026-2-3")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });
});
