

## Auto Calculate Leave & Deduction from Attendance

### Summary
Enhance the Salary Sheet module to auto-populate WFH, Unpaid Leaves, EL, SL, and Deductions from existing `leave_requests` and `attendance_logs` tables when employees are added to a sheet, with manual override support and a refresh button.

### Data Mapping

Based on existing schema:
- **WFH**: Count from `leave_requests` where `leave_type = 'wfh'`, `status = 'approved'`, overlapping with sheet month
- **Unpaid Leaves**: Count from `leave_requests` where `leave_type = 'unpaid'`, `status = 'approved'`
- **EL (Earned Leave)**: Count from `leave_requests` where `leave_type = 'paid'`, `status = 'approved'` (the system uses `'paid'` not `'EL'`)
- **SL (Sick Leave)**: Count from `leave_requests` where `leave_type = 'sick'`, `status = 'approved'`
- **Deductions**: `(salary / 26) * unpaid_leaves`

Note: The leave system uses types `casual`, `sick`, `paid`, `unpaid`, `half_day`, `half_day_casual`, `half_day_sick`, `half_day_paid`, `half_day_unpaid`, `wfh`. We'll map `paid` → EL, `sick` → SL, `unpaid` → Unpaid Leaves, `wfh` → WFH.

### Database Changes

**Add columns to `salary_sheet_entries`** to track manual overrides:
```sql
ALTER TABLE salary_sheet_entries 
  ADD COLUMN wfh_days_override boolean DEFAULT false,
  ADD COLUMN unpaid_leaves_override boolean DEFAULT false,
  ADD COLUMN el_leaves_override boolean DEFAULT false,
  ADD COLUMN sl_leaves_override boolean DEFAULT false,
  ADD COLUMN deductions_override boolean DEFAULT false;
```

### Code Changes

#### 1. `src/hooks/useSalarySheets.ts` — Add attendance calculation helper

- New function `calculateAttendanceData(employeeId, month, year)` that queries `leave_requests` for the given month/year and returns `{ wfh_days, unpaid_leaves, el_leaves, sl_leaves }`.
- New function `calculateDeduction(salary, unpaidLeaves)` → `(salary / 26) * unpaidLeaves`.
- Update `addEmployeesToSheet` to call `calculateAttendanceData` for each employee and populate initial values + set override flags to `false`.
- New function `refreshAttendanceData(sheetId)` that recalculates leave data for all entries where override flags are `false`, updates the rows, recalculates totals, and logs an audit entry.

#### 2. `src/components/salary/SalarySheetView.tsx` — Add Refresh button

- Add a "Refresh Attendance Data" button (with `RefreshCw` icon) in the header next to "Add Employees" (only when sheet is not locked).
- Wire it to the new `refreshAttendanceData` hook function.

#### 3. `src/components/salary/SalaryEntryEditDialog.tsx` — Attendance Summary + Override labels

- Fetch and display an **Attendance Summary** section showing Working Days, WFH, EL, SL, Unpaid Leaves for the employee/month.
- For auto-calculated fields (WFH, Unpaid Leaves, EL, SL, Deductions), show a label: "Auto calculated from attendance" or "Manual override" based on the override flag.
- When HR edits any of these fields to a value different from the auto-calculated value, set the corresponding override flag to `true` on save.

#### 4. `src/hooks/useSalarySheets.ts` — Update `updateEntry` 

- Accept override flags in updates and pass them through to the database.
- Update `SalarySheetEntry` interface to include the 5 override boolean fields.

#### 5. Audit Logging

- When auto-calculation runs (on add or refresh), call `recordAuditLog` with action `SALARY_AUTO_CALCULATED` including employee_id, month, year, and calculated fields.

### Edge Cases Handled
- **Mid-month join/resign**: Leave requests already have date ranges; we count only days that fall within the sheet month.
- **Missing attendance**: We only count approved leave requests, not infer from missing attendance logs.
- **Half-day leaves**: `half_day_unpaid`, `half_day_sick`, `half_day_paid` counted as 0.5 days each.

### Files to Create/Modify
| File | Action |
|------|--------|
| `supabase/migrations/...` | Add 5 override columns to `salary_sheet_entries` |
| `src/hooks/useSalarySheets.ts` | Add attendance calc, refresh, update override flags |
| `src/components/salary/SalarySheetView.tsx` | Add Refresh button, pass month/year to edit dialog |
| `src/components/salary/SalaryEntryEditDialog.tsx` | Add attendance summary, override labels |
| `src/components/salary/SalaryAddEmployeesDialog.tsx` | Pass month/year for auto-calc on add |

