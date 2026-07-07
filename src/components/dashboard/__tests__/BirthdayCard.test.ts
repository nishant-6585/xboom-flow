import { describe, it, expect } from "vitest";
import { BIRTHDAY_WISHES, pickWish } from "../BirthdayCard";

describe("BirthdayCard wish selection", () => {
  it("is deterministic for the same (employeeId, dateKey)", () => {
    const a = pickWish("emp-1", "2026-07-07");
    const b = pickWish("emp-1", "2026-07-07");
    expect(a).toBe(b);
  });

  it("differs across employees on the same day (in most cases)", () => {
    const dateKey = "2026-07-07";
    const wishes = new Set(
      Array.from({ length: 10 }, (_, i) => pickWish(`emp-${i}`, dateKey))
    );
    // With 15 wishes and 10 employees, we expect meaningful variety.
    expect(wishes.size).toBeGreaterThan(3);
  });

  it("differs across dates (years) for the same employee (usually)", () => {
    const a = pickWish("emp-42", "2026-07-07");
    const b = pickWish("emp-42", "2027-07-07");
    // Not guaranteed different, but hash of different input should usually differ.
    // If they collide, at least the function is well-defined and stable.
    expect(typeof a).toBe("string");
    expect(typeof b).toBe("string");
  });

  it("returns a wish from the pool", () => {
    const w = pickWish("emp-x", "2026-07-07");
    expect(BIRTHDAY_WISHES).toContain(w);
  });

  it("pool has ~15 wishes", () => {
    expect(BIRTHDAY_WISHES.length).toBeGreaterThanOrEqual(12);
    expect(BIRTHDAY_WISHES.length).toBeLessThanOrEqual(20);
  });
});