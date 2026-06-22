import { describe, it, expect } from "vitest";
import { validateCustomerPhone, mapOrderUpdateError } from "../orderPhone";

describe("validateCustomerPhone", () => {
  it("accepts empty input as valid (clears the field)", () => {
    expect(validateCustomerPhone("")).toEqual({ valid: true, normalized: null });
    expect(validateCustomerPhone(null)).toEqual({ valid: true, normalized: null });
    expect(validateCustomerPhone(undefined)).toEqual({ valid: true, normalized: null });
    expect(validateCustomerPhone("   ")).toEqual({ valid: true, normalized: null });
  });

  it("normalizes valid Indian 10-digit numbers", () => {
    expect(validateCustomerPhone("9035758716")).toEqual({
      valid: true,
      normalized: "9035758716",
    });
  });

  it("preserves leading + for international numbers and strips separators", () => {
    expect(validateCustomerPhone("+91 90357-58716")).toEqual({
      valid: true,
      normalized: "+919035758716",
    });
    expect(validateCustomerPhone("+1 (415) 555-0132")).toEqual({
      valid: true,
      normalized: "+14155550132",
    });
  });

  it("rejects numbers shorter than 7 digits", () => {
    const r = validateCustomerPhone("12345");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toMatch(/7 to 15 digits/);
  });

  it("rejects numbers longer than 15 digits", () => {
    const r = validateCustomerPhone("1234567890123456");
    expect(r.valid).toBe(false);
  });

  it("rejects numbers containing letters or other junk", () => {
    expect(validateCustomerPhone("abc12345").valid).toBe(false);
    expect(validateCustomerPhone("9035@758716").valid).toBe(false);
  });
});

describe("mapOrderUpdateError", () => {
  it("maps server-side phone validation errors (ERRCODE 22023) to a clean message", () => {
    const msg = mapOrderUpdateError(
      { code: "22023", message: "Invalid mobile number: must contain 7 to 15 digits (got 3)" },
      { touchedPhone: true },
    );
    expect(msg).toMatch(/^Mobile number/);
    expect(msg).toMatch(/7 to 15 digits/);
  });

  it("maps RLS permission errors (42501) to a retry-with-role hint", () => {
    const msg = mapOrderUpdateError(
      { code: "42501", message: "permission denied for table orders" },
      { touchedPhone: true },
    );
    expect(msg).toMatch(/permission/i);
    expect(msg).toMatch(/retry/i);
  });

  it("detects RLS violation message even without code", () => {
    const msg = mapOrderUpdateError(
      { message: "new row violates row-level security policy" },
      { touchedPhone: false },
    );
    expect(msg).toMatch(/permission/i);
  });

  it("handles silent zero-row updates differently for phone vs other edits", () => {
    const phoneMsg = mapOrderUpdateError(null, { touchedPhone: true });
    expect(phoneMsg).toMatch(/mobile number/i);
    expect(phoneMsg).toMatch(/admin/i);

    const otherMsg = mapOrderUpdateError(null, { touchedPhone: false });
    expect(otherMsg).toMatch(/No rows updated/);
  });

  it("falls back to the raw error message when nothing matches", () => {
    const msg = mapOrderUpdateError(
      { code: "23505", message: "duplicate key value" },
      { touchedPhone: false },
    );
    expect(msg).toBe("duplicate key value");
  });
});