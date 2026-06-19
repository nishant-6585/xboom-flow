## Goal
Fix proforma generation so totals match Zoho, and add tooling to detect/repair mismatches like ORD2600320.

## 1. SAC/HSN-based GST rules
Extend `inferGstRate` / `inferGstRateFromWooLine` in `src/components/orders/GenerateProformaDialog.tsx`:
- HSN/SAC starting `997` (services, e.g. DJI Terra subscription `997331`) → 18%.
- HSN starting `8806` (drones/UAV) → 5%, unless the description matches the accessory regex (propellers, batteries, chargers, gimbals, cases, cables, etc.) → 18%.
- All other accessories → 18%.
- Subscription keywords ("subscription", "care", "warranty", "terra", "enterprise plan") → 18% even without HSN.
- Order of precedence: explicit `sales_gst_percent` → Woo `subtotal_tax/subtotal` ratio → `tax_class` → HSN/SAC → keyword inference.

## 2. Treat rates as GST-exclusive (no double-tax)
- Standardise the `Line` model on `unit_price_excl` as the single source of truth.
- When importing from Woo / internal orders, detect if the provided price is GST-inclusive (Woo `prices_include_tax=true`, or Zoho-style "Rate" already inclusive) and back-derive `unit_price_excl = gross / (1 + rate/100)` once.
- All downstream totals computed as `taxable = unit_price_excl * qty`, `tax = taxable * rate/100`, `gross = taxable + tax`.
- Add a per-line "Rate is GST-inclusive" toggle (default off) so users can paste an inclusive figure without breaking math.

## 3. Line-item deduplication
- After lines are loaded, run a dedup pass: if a line description contains a known bundled component name (`terra`, `care refresh`, `enterprise shield`, etc.) AND another line exists that is *only* that component, flag it.
- Show an inline warning chip "Possible duplicate – Terra already bundled in line 1" with a one-click "Remove duplicate" action; do not auto-delete.
- Maintain a small `BUNDLE_COMPONENTS` map (`combo` → [`terra`, `care`, …]) that's easy to extend.

## 4. One-click "Regenerate & Validate" workflow
- Add a "Regenerate from order" button in the proforma dialog header that:
  1. Re-fetches order + Woo line items.
  2. Re-applies rules (1)+(2)+(3).
  3. Pulls the matching Zoho invoice total (via existing Zoho Books connector path) and the recorded `amount_paid`.
  4. Shows a "Validation" panel: Proforma total, Zoho total, Payment received, Balance. Green tick if `|proforma_total - zoho_total| <= ₹1`; red diff otherwise.
- Persist the regenerated proforma only after the user clicks "Save".

## 5. Reconciliation view
New page `src/pages/ProformaReconciliation.tsx` (linked from Orders → row action "Reconcile invoices"):
- Inputs: order number (prefilled, e.g. `ORD2600320`).
- Side-by-side table: Zoho line vs Proforma line, matched by description similarity + HSN.
- Columns: Item, HSN, Qty, Rate (excl), GST %, Tax, Line total, Δ.
- Footer summary: Subtotal Δ, Tax Δ, Total Δ, Balance Δ.
- "Rule attribution" panel listing which rule produced each delta:
  - `DOUBLE_TAX_ON_INCLUSIVE_RATE`
  - `WRONG_GST_RATE` (expected X%, got Y% from HSN `…`)
  - `DUPLICATE_BUNDLED_LINE`
  - `MISSING_LINE` / `EXTRA_LINE`
- "Apply fixes & regenerate" button → runs workflow (4).

## Technical notes
- All changes are frontend + one new edge function `zoho-invoice-fetch` (server-side, uses existing Zoho Books connector) to read invoice totals by order number; keep consumer keys server-side.
- New table not required; reconciliation is computed on-the-fly. Audit trail for regeneration lands in existing `proforma_audit_log`.
- Add unit tests for `inferGstRate` covering HSN `997331`, `88062200`, propeller accessories, and subscription keyword fallback.

## Out of scope
- Bulk re-reconciliation across all historic orders (can follow once single-order flow is validated).
- Editing Zoho invoices from this app — read-only comparison only.
