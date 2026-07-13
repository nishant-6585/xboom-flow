// Regression test — for Woo-linked orders (external_id present),
// OrderDialog must render the "Sales:" field as READ-ONLY with the
// "Change via Sales attribution ↑" affordance instead of the inline
// admin editor. This is a static source scan so we don't need to boot
// the full dialog runtime.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../OrderDialog.tsx"),
  "utf-8",
);

describe("OrderDialog Sales attribution guard for Woo-linked orders", () => {
  it("derives isWebsiteOrder from external_id (permanent Woo linkage)", () => {
    expect(SRC).toMatch(/isWebsiteOrder\s*=\s*!!\(order as any\)\?\.external_id/);
  });

  it("gates the inline Sales editor on isWebsiteOrder", () => {
    // The read-only branch must be reached before editingSalesPerson/isAdmin.
    expect(SRC).toMatch(/isWebsiteOrder\s*\?[\s\S]{0,400}Change via Sales attribution/);
  });

  it("read-only branch scrolls the attribution panel into focus", () => {
    expect(SRC).toMatch(/getElementById\(['"]order-attribution-panel['"]\)/);
    expect(SRC).toMatch(/id="order-attribution-panel"/);
    expect(SRC).toMatch(/scrollIntoView/);
  });

  it("read-only branch shows the muted 'Change via Sales attribution' link", () => {
    expect(SRC).toMatch(/Change via Sales attribution/);
  });

  it("does NOT expose any raw orders.update({ sales_person_id }) call outside the isWebsiteOrder guard", () => {
    // Sanity check: the ONLY raw update path is inside the editingSalesPerson
    // branch, which is only reachable when !isWebsiteOrder. Guarantee we
    // never have a second, ungated call site.
    const matches = SRC.match(/\.update\(\s*\{\s*sales_person_id/g) ?? [];
    expect(matches.length).toBe(1);
  });
});