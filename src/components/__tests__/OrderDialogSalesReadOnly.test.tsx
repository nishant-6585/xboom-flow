// Regression guard — the "Sales:" field in the Customer Information section
// of OrderDialog MUST be READ-ONLY for every role. Reassignment must go
// through the Sales attribution panel so DB triggers stamp attributed_by /
// attributed_at and append to sales_attribution_log. This test scans the
// source of OrderDialog.tsx to prevent anyone from reintroducing:
//   1. A pencil (Pencil icon) affordance next to "Sales:"
//   2. An inline <Select> editor bound to salesPersonId
//   3. A direct supabase.from('orders').update({ sales_person_id ... }) call
//   4. The editingSalesPerson state toggle
// A static source scan is the right tool here — booting the full dialog
// requires a large mock surface and we specifically want to fail the build
// the moment the editor markup reappears in the file, regardless of the
// role or flag guarding it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../OrderDialog.tsx"),
  "utf-8",
);

// Narrow the scan to the Customer Information "Sales:" row so unrelated
// salesperson references (attribution panel, hooks, etc.) don't produce
// false negatives.
function extractSalesRow(src: string): string {
  const marker = 'className="text-muted-foreground">Sales:</span>';
  const start = src.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  // Grab ~2500 chars after the marker — enough to cover the whole row block.
  return src.slice(start, start + 2500);
}

describe("OrderDialog — Customer Information 'Sales:' field is read-only", () => {
  it("renders the salesperson name as a plain <span>, not an input", () => {
    const row = extractSalesRow(SRC);
    expect(row).toMatch(/<span className="font-medium">\s*\{salesPersonName/);
  });

  it("exposes the 'Change via Sales attribution ↑' affordance instead of an inline editor", () => {
    const row = extractSalesRow(SRC);
    expect(row).toMatch(/Change via Sales attribution/);
    expect(row).toMatch(/getElementById\(['"]order-attribution-panel['"]\)/);
  });

  it("does NOT render a Pencil edit icon inside the Sales row", () => {
    const row = extractSalesRow(SRC);
    expect(row).not.toMatch(/<Pencil\b/);
  });

  it("does NOT render an inline <Select> editor bound to salesPersonId in the Sales row", () => {
    const row = extractSalesRow(SRC);
    expect(row).not.toMatch(/<Select[\s\S]{0,400}salesPersonId/);
  });

  it("does NOT toggle editingSalesPerson from the Sales row", () => {
    const row = extractSalesRow(SRC);
    expect(row).not.toMatch(/setEditingSalesPerson\(true\)/);
  });

  it("exposes NO raw orders.update({ sales_person_id }) call anywhere in OrderDialog", () => {
    // The Customer Information Sales row is the only place this ever lived.
    // Reassignment now flows exclusively through the Sales attribution panel /
    // attribution RPC, so this call site must not exist in OrderDialog at all.
    const matches = SRC.match(/\.update\(\s*\{\s*sales_person_id/g) ?? [];
    expect(matches.length).toBe(0);
  });
});