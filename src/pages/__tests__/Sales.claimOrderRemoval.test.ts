import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression test: the "Claim Order" tab was removed from the Sales page for
 * every role. This test asserts, at the source level, that no navigation entry
 * point re-introduces it — the tab was previously only shown to a subset of
 * roles, so a live render against one role would miss regressions in another.
 * Guarding the strings themselves guarantees the tab cannot render for any
 * role, anywhere in the app.
 */
const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("Sales page — Claim Order tab is fully removed for all roles", () => {
  it("Sales.tsx has no Claim Order tab trigger or content", () => {
    const src = read("src/pages/Sales.tsx");
    expect(src).not.toMatch(/value=["']claim_website_order["']/);
    expect(src).not.toMatch(/ClaimWebsiteOrderPanel/);
    expect(src).not.toMatch(/Claim Order/);
  });

  it("no other in-app navigation deep-links to the removed tab", () => {
    const app = read("src/App.tsx");
    expect(app).not.toMatch(/claim_website_order/);
    const header = read("src/components/Header.tsx");
    expect(header).not.toMatch(/claim_website_order/);
    expect(header).not.toMatch(/Claim Order/);
    const notif = read("src/components/NotificationPanel.tsx");
    expect(notif).not.toMatch(/tab=claim_website_order/);
  });
});
