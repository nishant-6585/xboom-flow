import { describe, it, expect } from "vitest";
import { validateManualInput } from "./manualValidators";

const ok = (r: any) => { expect("ok" in r).toBe(true); return r.value; };
const err = (r: any) => { expect("error" in r).toBe(true); return r.error; };

describe("validateManualInput — Aadhaar", () => {
  it("accepts a 12-digit Aadhaar and stores it in aadhaarFull only", () => {
    const v = ok(validateManualInput("aadhaar", "1234 5678 9012"));
    expect(v.aadhaarFull).toBe("123456789012");
    expect(v.documentReference).toBeNull();
  });
  it("rejects short/non-numeric Aadhaar", () => {
    expect(err(validateManualInput("aadhaar", "1234"))).toMatch(/12 digits/);
    expect(err(validateManualInput("aadhaar", "ABCD5678 9012"))).toMatch(/12 digits/);
  });
});

describe("validateManualInput — PAN", () => {
  it("accepts a valid PAN, uppercased, into documentReference", () => {
    const v = ok(validateManualInput("pan", "abcde1234f"));
    expect(v.aadhaarFull).toBeNull();
    expect(v.documentReference).toBe("ABCDE1234F");
  });
  it("rejects malformed PAN", () => {
    expect(err(validateManualInput("pan", "ABCDE12345"))).toMatch(/PAN/);
    expect(err(validateManualInput("pan", "12345ABCDE"))).toMatch(/PAN/);
  });
});

describe("validateManualInput — Driving Licence & Passport", () => {
  it("accepts a reasonable Driving Licence", () => {
    const v = ok(validateManualInput("driving_license", "KA01 20230001234"));
    expect(v.documentReference).toBe("KA01 20230001234");
  });
  it("accepts a well-formed Passport", () => {
    const v = ok(validateManualInput("passport", "m1234567"));
    expect(v.documentReference).toBe("M1234567");
  });
  it("rejects a bad Passport", () => {
    expect(err(validateManualInput("passport", "1234567"))).toMatch(/Passport/);
  });
});

describe("validateManualInput — optional-number types", () => {
  it("rental_agreement accepts empty reference", () => {
    const v = ok(validateManualInput("rental_agreement", ""));
    expect(v.aadhaarFull).toBeNull();
    expect(v.documentReference).toBeNull();
  });
  it("other_gov_id trims and stores whatever the user types", () => {
    const v = ok(validateManualInput("other_gov_id", "Some ref #42"));
    expect(v.documentReference).toBe("Some ref #42");
  });
});

describe("validateManualInput — unknown type", () => {
  it("rejects an unknown document_type", () => {
    expect(err(validateManualInput("passport_scan", "M1234567"))).toMatch(/Invalid/);
  });
});
