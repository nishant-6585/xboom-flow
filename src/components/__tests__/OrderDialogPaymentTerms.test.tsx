// Regression test — ensures OrderDialog renders any HTML lurking in
// orders.payment_terms as plain text and never mounts it via
// dangerouslySetInnerHTML. This is a static source-code check so we don't
// have to mock the (huge) OrderDialog runtime graph.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripHtmlLabel } from "@/lib/stripHtml";

const ORDER_DIALOG_SRC = readFileSync(
  resolve(__dirname, "../OrderDialog.tsx"),
  "utf-8",
);

describe("OrderDialog payment_terms rendering (regression)", () => {
  it("never uses dangerouslySetInnerHTML anywhere in OrderDialog", () => {
    expect(ORDER_DIALOG_SRC).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it("wraps payment_terms with the stripHtmlLabel display defence", () => {
    // Both the read path and the pre-fill path must funnel through
    // stripHtmlLabel so plugin HTML degrades to text.
    expect(ORDER_DIALOG_SRC).toMatch(/stripHtmlLabel\(\s*paymentTerms\s*\|\|\s*order\.payment_terms\s*\)/);
    expect(ORDER_DIALOG_SRC).toMatch(/setPaymentTerms\(\s*stripHtmlLabel\(\s*order\.payment_terms\s*\)/);
  });

  it("stripHtmlLabel produces text with no angle brackets for a Snapmint-style blob", () => {
    const raw =
      `<span class="emi-title">0% EMI on UPI</span> <span class="pay-via-text">Pay via</span><img src="https://assets.snapmint.com/logo.png" alt="Snapmint" />`;
    const rendered = stripHtmlLabel(raw);
    expect(rendered).not.toMatch(/[<>]/);
    expect(rendered).toContain("0% EMI on UPI");
  });
});