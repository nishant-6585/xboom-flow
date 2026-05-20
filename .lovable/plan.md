## Spare Parts Inventory Module — Implementation Plan

A new module under Supply Chain to track spare parts, stock levels, profit margins, vendors, and movement history with full RBAC, audit logging, and dashboard widgets.

### 1. Database (single migration)

**Tables**
- `spare_parts_inventory` — part_name, part_code (auto: SP-XXXXXX), category, quantity, minimum_stock_threshold, cost_price, selling_price, vendor_name, vendor_id (FK suppliers, nullable), stock_status (enum), last_purchase_date, remarks, created_by, timestamps
  - Generated columns: `profit_per_unit`, `profit_margin_percent`
  - Trigger: auto-compute `stock_status` on insert/update (SOLD_OUT / LOW_STOCK / IN_STOCK)
  - Trigger: validation (quantity ≥ 0, selling ≥ cost, prices ≥ 0)
  - Trigger: auto-generate `part_code` if null
- `spare_parts_transactions` — part_id (FK), change_type (add/remove), quantity_change, reason (purchase/sale/damage/manual), created_by, created_at
  - Trigger: applying a transaction updates `spare_parts_inventory.quantity`
- ENUM types: `spare_part_stock_status`, `spare_part_change_type`, `spare_part_change_reason`

**RLS Policies** (using existing `has_role` / `app_role`)
- Admin: full CRUD
- Supply Chain: full CRUD
- Finance: SELECT only
- Sales: SELECT (stock + part info; pricing/profit hidden at app layer via column projection)
- Employee: no access

**Audit/Notifications**
- Trigger writes to `security_audit_log` (or existing `audit_logs`) for CREATE/UPDATE/DELETE/STOCK_ADJUSTED
- Trigger inserts `notifications` row for Admin + Supply Chain when stock crosses into LOW_STOCK / SOLD_OUT

### 2. Frontend

**New files**
- `src/hooks/useSpareParts.ts` — list/create/update/delete + filters + react-query
- `src/hooks/useSparePartTransactions.ts` — list + adjust quantity
- `src/pages/SpareParts.tsx` — page with table, filters, search, sort, export
- `src/components/spare-parts/SparePartFormDialog.tsx` — Add/Edit with live profit preview
- `src/components/spare-parts/AdjustQuantityDialog.tsx` — +/- with reason
- `src/components/spare-parts/SparePartViewDialog.tsx` — read-only details + transaction history
- `src/components/spare-parts/SparePartsFilters.tsx` — status pills, category, vendor, sort
- `src/components/spare-parts/SparePartsKpiCards.tsx` — Total / Low Stock / Sold Out / Potential Profit
- `src/components/spare-parts/LowStockAlertsWidget.tsx` — for dashboard
- `src/lib/sparePartsExport.ts` — CSV + XLSX export

**Wiring**
- Add route `/spare-parts` in `src/App.tsx` (guarded by RBAC: admin/supply_chain/finance/sales)
- Add sidebar item under Supply Chain group in `AppSidebar`
- Mount `SparePartsKpiCards` + `LowStockAlertsWidget` on the existing Supply Chain dashboard area (or Index for admin/supply_chain)

### 3. UI behavior

- Pricing/Profit columns hidden for Sales role (view-only stock)
- Stock status badge: green IN_STOCK / amber LOW_STOCK / red SOLD_OUT (semantic tokens)
- Live profit preview in form as user types
- Vendor field: combobox of existing `suppliers` + free-text fallback
- Mobile-responsive table (horizontal scroll + condensed columns < md)

### 4. Out of scope
- Editing the suppliers table
- Per-vendor PO generation (existing procurement module handles that)
- Modifying current inventory module

### Technical notes
- Use semantic Tailwind tokens only (no raw colors)
- Strict TS, react-query for data, existing toast + audit log patterns
- Stock-status + audit + notification logic lives in DB triggers (thin-frontend rule)
- Export uses existing xlsx-style util pattern if present, else lightweight CSV + SheetJS

Ready to proceed on approval.
