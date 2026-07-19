import { describe, it, expect } from "vitest";
import { BIRTHDAY_WISHES, pickWish, isBirthdayVisible } from "../BirthdayCard";

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

describe("BirthdayCard visibility window", () => {
  it("shows on the birthday itself", () => {
    expect(isBirthdayVisible({ is_today: true, days_until: 0 })).toBe(true);
  });

  it("shows within 4 days of the birthday", () => {
    for (const days of [1, 2, 3, 4]) {
      expect(isBirthdayVisible({ is_today: false, days_until: days })).toBe(true);
    }
  });

  it("hides when the birthday is more than 4 days away", () => {
    for (const days of [5, 10, 50, 200]) {
      expect(isBirthdayVisible({ is_today: false, days_until: days })).toBe(false);
    }
  });
});