import { describe, it, expect } from "vitest";
import { stripHtmlLabel } from "../stripHtml";

describe("stripHtmlLabel (OrderDialog display defence)", () => {
  it("strips a Snapmint-style HTML blob to plain text", () => {
    const raw =
      `<span class="emi-title">0% EMI on UPI</span> <span class="pay-via-text">Pay via</span><img src="https://assets.snapmint.com/logo.png" alt="Snapmint" />`;
    const out = stripHtmlLabel(raw);
    expect(out).not.toMatch(/</);
    expect(out).not.toMatch(/>/);
    expect(out).toContain("0% EMI on UPI");
    expect(out).toContain("Pay via");
  });

  it("passes plain text through unchanged", () => {
    expect(stripHtmlLabel("Cash on delivery")).toBe("Cash on delivery");
  });

  it("removes <script>/<style> content entirely, not just tags", () => {
    const raw = `Prepaid<script>alert('x')</script>`;
    const out = stripHtmlLabel(raw);
    expect(out).not.toMatch(/alert/);
    expect(out).not.toMatch(/</);
  });

  it("decodes common entities", () => {
    expect(stripHtmlLabel("Pay&nbsp;now &amp; save")).toBe("Pay now & save");
  });

  it("returns empty string for non-strings", () => {
    expect(stripHtmlLabel(null)).toBe("");
    expect(stripHtmlLabel(undefined)).toBe("");
    expect(stripHtmlLabel(42 as unknown)).toBe("");
  });
});