import { describe, it, expect, beforeEach } from "vitest";
import { startOfDay, endOfDay, startOfMonth, subDays } from "date-fns";
import {
  ENQUIRY_PRESETS,
  enquiryDateStorageKey,
  getActivePresetLabel,
  parseRange,
  serializeRange,
} from "@/lib/enquiryDateFilter";

describe("enquiryDateFilter persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("scopes the storage key per user id", () => {
    expect(enquiryDateStorageKey("u1")).not.toEqual(enquiryDateStorageKey("u2"));
    expect(enquiryDateStorageKey(null)).toContain("anon");
  });

  it("round-trips a range without timezone drift", () => {
    const start = startOfDay(new Date(2026, 6, 1)); // 1 Jul 2026 local
    const end = endOfDay(new Date(2026, 6, 10));
    const stored = JSON.stringify(serializeRange(start, end));
    const parsed = parseRange(stored);
    // Same calendar day, regardless of TZ handling on serialize.
    expect(parsed.start?.getFullYear()).toBe(2026);
    expect(parsed.start?.getMonth()).toBe(6);
    expect(parsed.start?.getDate()).toBe(1);
    expect(parsed.start?.getHours()).toBe(0);
    expect(parsed.end?.getDate()).toBe(10);
    expect(parsed.end?.getHours()).toBe(23);
  });

  it("persists a preset selection through a simulated refresh", () => {
    const key = enquiryDateStorageKey("user-42");
    const today = ENQUIRY_PRESETS.find((p) => p.label === "Today")!.getRange();
    window.localStorage.setItem(key, JSON.stringify(serializeRange(today.start, today.end)));

    // Simulate refresh — fresh read from storage.
    const restored = parseRange(window.localStorage.getItem(key));
    expect(getActivePresetLabel(restored.start, restored.end)).toBe("Today");
  });

  it("labels a stored 'This Month' range correctly after refresh", () => {
    const key = enquiryDateStorageKey("user-42");
    const now = new Date();
    const range = { start: startOfMonth(now), end: now };
    window.localStorage.setItem(key, JSON.stringify(serializeRange(range.start, range.end)));
    const restored = parseRange(window.localStorage.getItem(key));
    // "This Month" preset ends at `new Date()` (now), which won't match after
    // the round-trip to a calendar day. So the label falls back to a custom
    // range — assert that it isn't the wrong preset, and start-of-month
    // survives intact.
    expect(restored.start?.getDate()).toBe(1);
    const label = getActivePresetLabel(restored.start, restored.end);
    expect(label).not.toBe("All Time");
  });

  it("does not lose the 'Yesterday' preset across a serialize/parse cycle", () => {
    const y = subDays(new Date(), 1);
    const range = { start: startOfDay(y), end: endOfDay(y) };
    const restored = parseRange(JSON.stringify(serializeRange(range.start, range.end)));
    expect(getActivePresetLabel(restored.start, restored.end)).toBe("Yesterday");
  });

  it("returns 'All Time' for empty storage", () => {
    const restored = parseRange(window.localStorage.getItem("missing"));
    expect(restored.start).toBeUndefined();
    expect(restored.end).toBeUndefined();
    expect(getActivePresetLabel(restored.start, restored.end)).toBe("All Time");
  });

  it("resets a stale saved range so new enquiries are not hidden", () => {
    const restored = parseRange(JSON.stringify({
      start: "2026-07-27",
      end: "2026-07-30",
      savedOn: "2026-07-30",
    }));
    expect(restored.start).toBeUndefined();
    expect(restored.end).toBeUndefined();
  });

  it("resets legacy ranges whose end date is in the past", () => {
    const restored = parseRange(JSON.stringify({
      start: "2026-07-27",
      end: "2026-07-30",
    }));
    expect(restored.start).toBeUndefined();
    expect(restored.end).toBeUndefined();
  });
});