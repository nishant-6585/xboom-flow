import { describe, it, expect } from "vitest";
import { validateEmail, validatePhone } from "../contactValidation";

describe("validateEmail", () => {
  it.each([
    ["name@example.com"],
    ["a.b+tag@sub.domain.co.in"],
    ["USER@Example.COM"],
  ])("accepts %s", (v) => {
    const r = validateEmail(v);
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.normalized).toBe(v.toLowerCase());
  });

  it.each([
    ["not-an-email"],
    ["missing@tld"],
    ["@nolocal.com"],
    ["spaces in@name.com"],
    ["double@@dot.com"],
  ])("rejects %s", (v) => {
    expect(validateEmail(v).valid).toBe(false);
  });

  it("treats empty as optional by default", () => {
    expect(validateEmail("").valid).toBe(true);
    expect(validateEmail(null).valid).toBe(true);
  });

  it("empty fails when required", () => {
    expect(validateEmail("", { required: true }).valid).toBe(false);
  });
});

describe("validatePhone", () => {
  it.each([
    ["9812345678", "+919812345678"],
    ["09812345678", "+919812345678"],
    ["919812345678", "+919812345678"],
    ["+91 98123-45678", "+919812345678"],
    ["+91 (98) 12345678", "+919812345678"],
    ["+14155552671", "+14155552671"],
    ["+44 20 7183 8750", "+442071838750"],
  ])("accepts %s -> %s", (input, normalized) => {
    const r = validatePhone(input);
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.normalized).toBe(normalized);
  });

  it.each([
    ["1234567890"], // Indian 10-digit but starts with 1
    ["5812345678"], // starts with 5
    ["98123"], // too short
    ["+123"], // too short international
    ["+91123"], // Indian shape but too short
    ["abcd1234"], // illegal chars
    ["4155552671"], // ambiguous foreign no +
    ["+0123456789"], // country code starts with 0
  ])("rejects %s", (v) => {
    expect(validatePhone(v).valid).toBe(false);
  });

  it("empty is optional by default", () => {
    expect(validatePhone("").valid).toBe(true);
  });

  it("empty required fails", () => {
    expect(validatePhone("", { required: true }).valid).toBe(false);
  });
});
