import { describe, it, expect } from "vitest";
import {
  RESPONSE_NOTES_MAX_LENGTH,
  RESPONSE_NOTES_MIN_LENGTH,
  buildQuoteMirrorMessage,
  validateResponseNotes,
} from "@/lib/enquiryQuoteMirror";

describe("validateResponseNotes", () => {
  it("accepts empty and whitespace-only input (notes are optional)", () => {
    for (const value of ["", "   ", "\n\t ", null, undefined]) {
      const r = validateResponseNotes(value as string | null | undefined);
      expect(r.ok).toBe(true);
      expect(r.trimmed).toBe("");
      expect(r.error).toBe("");
    }
  });

  it("rejects non-empty input shorter than the minimum", () => {
    const r = validateResponseNotes("hi");
    expect(r.ok).toBe(false);
    expect(r.error).toContain(String(RESPONSE_NOTES_MIN_LENGTH));
  });

  it("accepts input exactly at the minimum length", () => {
    const r = validateResponseNotes("a".repeat(RESPONSE_NOTES_MIN_LENGTH));
    expect(r.ok).toBe(true);
  });

  it("rejects input over the maximum length", () => {
    const r = validateResponseNotes("a".repeat(RESPONSE_NOTES_MAX_LENGTH + 1));
    expect(r.ok).toBe(false);
    expect(r.error).toContain(String(RESPONSE_NOTES_MAX_LENGTH));
  });

  it("trims surrounding whitespace before validating and returning", () => {
    const r = validateResponseNotes("   In stock, shipping Monday.   ");
    expect(r.ok).toBe(true);
    expect(r.trimmed).toBe("In stock, shipping Monday.");
  });

  it("boundary — accepts exactly MAX_LENGTH characters", () => {
    const r = validateResponseNotes("x".repeat(RESPONSE_NOTES_MAX_LENGTH));
    expect(r.ok).toBe(true);
    expect(r.trimmed.length).toBe(RESPONSE_NOTES_MAX_LENGTH);
  });

  it("boundary — rejects MIN_LENGTH - 1", () => {
    const r = validateResponseNotes("x".repeat(RESPONSE_NOTES_MIN_LENGTH - 1));
    expect(r.ok).toBe(false);
  });

  it("boundary — rejects MAX_LENGTH + 1", () => {
    const r = validateResponseNotes("x".repeat(RESPONSE_NOTES_MAX_LENGTH + 1));
    expect(r.ok).toBe(false);
  });

  it("counts trimmed length, not raw length, when checking boundaries", () => {
    // Raw = MAX + 4 spaces, trimmed = MAX ⇒ valid.
    const r = validateResponseNotes("  " + "x".repeat(RESPONSE_NOTES_MAX_LENGTH) + "  ");
    expect(r.ok).toBe(true);
  });
});

describe("buildQuoteMirrorMessage", () => {
  const fullInput = {
    pricing: "₹4,500/unit",
    availability: "In stock",
    leadTime: "5-7 days",
    notes: "Ships from Bangalore warehouse.",
  };

  it("returns null for every status other than 'responded'", () => {
    for (const status of [
      "pending",
      "follow_up",
      "on_hold",
      "moved_to_pipeline",
      "order_won",
      "order_lost",
      "",
      "RESPONDED", // case-sensitive by design
    ]) {
      expect(buildQuoteMirrorMessage(fullInput, status)).toBeNull();
    }
  });

  it("returns a combined header + notes message when status is 'responded'", () => {
    const msg = buildQuoteMirrorMessage(fullInput, "responded");
    expect(msg).toBe(
      "Pricing: ₹4,500/unit · Availability: In stock · Lead time: 5-7 days\nShips from Bangalore warehouse.",
    );
  });

  it("drops whitespace-only fields from the header line", () => {
    const msg = buildQuoteMirrorMessage(
      { pricing: "  ", availability: "In stock", leadTime: "", notes: "" },
      "responded",
    );
    expect(msg).toBe("Availability: In stock");
  });

  it("returns notes on their own line when no header fields are present", () => {
    const msg = buildQuoteMirrorMessage(
      { pricing: "", availability: "", leadTime: "", notes: "  Need PO first.  " },
      "responded",
    );
    expect(msg).toBe("Need PO first.");
  });

  it("returns null when status is 'responded' but every field is empty/whitespace", () => {
    for (const input of [
      {},
      { pricing: "", availability: "", leadTime: "", notes: "" },
      { pricing: "   ", availability: "\t", leadTime: "\n", notes: "  " },
      { pricing: null, availability: null, leadTime: null, notes: null },
    ]) {
      expect(buildQuoteMirrorMessage(input, "responded")).toBeNull();
    }
  });

  it("never treats whitespace-only notes as a valid message body", () => {
    // Guard against regressions where trim() is skipped: a mirror must not
    // be created for pure-whitespace notes even if the header is also empty.
    expect(buildQuoteMirrorMessage({ notes: "     " }, "responded")).toBeNull();
  });

  it("preserves multi-line note formatting on the notes line", () => {
    const notes = "Line A\nLine B\n\nLine D";
    const msg = buildQuoteMirrorMessage(
      { pricing: "₹500", notes },
      "responded",
    );
    // Header ends with \n before notes; notes' own newlines are preserved.
    expect(msg).toBe(`Pricing: ₹500\n${notes}`);
  });

  it("trims outer whitespace on notes but keeps interior newlines", () => {
    const msg = buildQuoteMirrorMessage(
      { notes: "\n\n  Alpha\nBeta  \n" },
      "responded",
    );
    expect(msg).toBe("Alpha\nBeta");
  });

  it("header parts never appear when their field is only whitespace", () => {
    const msg = buildQuoteMirrorMessage(
      { pricing: "  ", availability: "  ", leadTime: "  ", notes: "Real note here." },
      "responded",
    );
    expect(msg).toBe("Real note here.");
  });
});