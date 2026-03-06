# XBoom Workflow — Payroll Module

> Complete documentation of the payroll system from salary sheet creation to bank reconciliation.

---

## Table of Contents

1. [Overview](#overview)
2. [Payroll Components](#payroll-components)
3. [Payroll Lifecycle](#payroll-lifecycle)
4. [Salary Sheets](#salary-sheets)
5. [Salary Sheet Entries](#salary-sheet-entries)
6. [Attendance-Based Deduction](#attendance-based-deduction)
7. [Approval Workflow](#approval-workflow)
8. [Payslip Generation](#payslip-generation)
9. [Bank Transfer File Generation](#bank-transfer-file-generation)
10. [Payroll Reconciliation](#payroll-reconciliation)
11. [Salary History](#salary-history)
12. [Database Tables](#database-tables)
13. [Security & Access Control](#security--access-control)
14. [Audit Events](#audit-events)

---

## Overview

The payroll module manages the complete salary disbursement lifecycle — from attendance data collection through bank reconciliation. It integrates with HR attendance records, employee profiles, and salary history to automate calculations and generate bank-ready transfer files.

---

## Payroll Components

| Component | Purpose |
|-----------|---------|
| **Salary Sheets** | Monthly payroll container — groups all employee entries for a given month/year |
| **Salary Sheet Entries** | Individual employee row with earnings, deductions, and net pay |
| **Payslip Generator** | PDF generation per employee with detailed breakdown |
| **Bank Transfer File Generator** | Produces NEFT-format CSV for bulk bank upload |
| **Payroll Reconciliation Dashboard** | Tracks payment status (Pending/Paid/Failed) after bank processing |

---

## Payroll Lifecycle

```
┌─────────────────────────────────┐
│  1. Attendance Data Collection  │
│     Daily check-in / check-out  │
│     Leave tracking              │
└──────────────┬──────────────────┘
               ↓
┌─────────────────────────────────┐
│  2. Salary Sheet Creation       │
│     Auto-populated from:        │
│     - Employee profiles         │
│     - Salary history            │
│     - Attendance records        │
└──────────────┬──────────────────┘
               ↓
┌─────────────────────────────────┐
│  3. HR Review & Approval        │
│     HR reviews entries          │
│     Adjusts overrides if needed │
│     Submits for finance review  │
└──────────────┬──────────────────┘
               ↓
┌─────────────────────────────────┐
│  4. Finance Approval            │
│     Finance verifies totals     │
│     Approves for disbursement   │
└──────────────┬──────────────────┘
               ↓
┌─────────────────────────────────┐
│  5. Sheet Locked                │
│     No further edits allowed    │
│     Finalized for payment       │
└──────────────┬──────────────────┘
               ↓
┌─────────────────────────────────┐
│  6. Payslip Generation          │
│     PDF per employee            │
│     Uploaded to storage bucket  │
└──────────────┬──────────────────┘
               ↓
┌─────────────────────────────────┐
│  7. Bank Transfer File          │
│     NEFT-format CSV generated   │
│     Payment status records      │
│     created automatically       │
└──────────────┬──────────────────┘
               ↓
┌─────────────────────────────────┐
│  8. Upload to Bank Portal       │
│     (Manual — outside system)   │
└──────────────┬──────────────────┘
               ↓
┌─────────────────────────────────┐
│  9. Payroll Reconciliation      │
│     Import bank statement       │
│     Auto-match by account +     │
│     amount                      │
│     Mark Paid / Failed          │
│     Generate retry file for     │
│     failed payments             │
└─────────────────────────────────┘
```

---

## Salary Sheets

A salary sheet is a monthly payroll container for a specific month and year.

### Fields

| Field | Description |
|-------|-------------|
| `month` | Payroll month (1–12) |
| `year` | Payroll year |
| `status` | Draft → HR Approved → Finance Approved → Locked |
| `created_by` / `created_by_name` | Creator audit trail |
| `approved_by_hr` / `approved_by_finance` | Approver names |
| `total_employees` | Count of entries |
| `total_net_pay` | Sum of all net pay amounts |

### Status Transitions

```
Draft ──→ HR Approved ──→ Finance Approved ──→ Locked
  ↑           │                  │
  └───────────┘                  │
  (HR can revert to draft)       │
                                 └──→ (No reversal from Locked)
```

---

## Salary Sheet Entries

Each entry represents one employee's salary for the month.

### Earnings

| Field | Description |
|-------|-------------|
| `basic_salary` | Base monthly salary |
| `hra` | House Rent Allowance |
| `conveyance_allowance` | Travel allowance |
| `medical_allowance` | Medical benefit |
| `special_allowance` | Special/other allowance |
| `overtime_pay` | Overtime compensation |
| `bonus` | Monthly bonus |
| `other_earnings` | Miscellaneous earnings |

### Deductions

| Field | Description |
|-------|-------------|
| `pf_deduction` | Provident Fund |
| `esi_deduction` | Employee State Insurance |
| `professional_tax` | Professional tax |
| `tds` | Tax Deducted at Source |
| `attendance_deduction` | Calculated from absent days |
| `loan_deduction` | Loan EMI deduction |
| `other_deductions` | Miscellaneous deductions |

### Calculated Fields

- **Total Earnings** = Sum of all earning fields
- **Total Deductions** = Sum of all deduction fields
- **Net Pay** = Total Earnings − Total Deductions

### Validation (before locking)

- Bank account must be present
- Net pay must be non-negative
- Employee must be active

---

## Attendance-Based Deduction

The system calculates attendance deductions based on working days vs. present days:

1. Fetches attendance logs for the salary month
2. Counts total working days (excluding holidays and weekends)
3. Counts days present (from attendance records)
4. Absent days = Working days − Present days
5. Per-day salary = Monthly salary ÷ Working days
6. **Attendance deduction** = Absent days × Per-day salary

HR can override the calculated deduction via manual adjustment.

---

## Approval Workflow

### Stage 1: Draft
- HR creates salary sheet and populates entries
- HR can edit all fields
- HR can add/remove employees

### Stage 2: HR Approved
- HR submits the sheet after review
- Entries become read-only for non-HR users
- HR can revert to Draft if changes are needed

### Stage 3: Finance Approved
- Finance reviews and approves
- Validates totals and bank details
- Cannot revert — must be escalated

### Stage 4: Locked
- **Irreversible** — no further edits
- Payslips can now be generated
- Bank transfer file can be generated
- Sheet is archived for records

---

## Payslip Generation

After a sheet is locked, payslips can be generated as PDF documents.

### Payslip Contents

- Employee name and ID
- Month and year
- Earnings breakdown (all components)
- Deductions breakdown (all components)
- Net pay
- Bank account details (masked)
- Organization details

### Storage

- PDFs are uploaded to the `payslips` storage bucket
- Path format: `{salary_sheet_id}/{employee_id}/{timestamp}_payslip.pdf`
- Records stored in `employee_payslips` table
- Employees can view and download their own payslips

---

## Bank Transfer File Generation

Generates a CSV file in NEFT-compatible format for bulk bank upload.

### File Format

| Column | Description |
|--------|-------------|
| Employee Name | Full name |
| Bank Account | Account number |
| IFSC Code | Bank IFSC |
| Amount | Net pay |
| Narration | `Salary {Month} {Year}` |

### Automatic Payment Record Creation

When a transfer file is generated, the system automatically creates `payroll_payment_status` records for each employee with:
- Status: `pending`
- Amount: Net pay
- Bank account: From salary sheet entry

### File Storage

Files are stored in the `payroll_transfers` bucket and logged in `payroll_transfer_files`.

---

## Payroll Reconciliation

### Dashboard (Finance → Payroll Reconciliation)

After the bank processes payments, Finance uses the reconciliation dashboard to track payment outcomes.

### Summary Cards

| Metric | Description |
|--------|-------------|
| Total Employees | Count of payment records |
| Total Payroll | Sum of all amounts |
| Paid Amount | Sum where status = Paid |
| Pending Amount | Sum where status = Pending |
| Failed Amount | Sum where status = Failed |

### Status Indicators

| Status | Color | Meaning |
|--------|-------|---------|
| Pending | Gray | Awaiting bank processing |
| Paid | Green | Successfully disbursed |
| Failed | Red | Bank rejected the payment |

### Manual Status Update

Finance can update individual payment statuses:
- **Mark as Paid** — add bank reference number
- **Mark as Failed** — add failure reason

### Bulk Import (Bank Statement)

Finance can upload a CSV/Excel bank confirmation file to auto-reconcile:

| Expected Column | Purpose |
|-----------------|---------|
| Account Number | Match to employee |
| Amount | Verify amount |
| Status | Paid/Failed |
| Bank Reference | Transaction reference |

The system auto-matches employees using `account number + amount` and updates statuses.

### Retry Transfer File

For failed payments, Finance can:
1. Fix employee bank details if needed
2. Generate a retry transfer file containing only failed employees
3. Re-upload to bank portal

---

## Salary History

Employee salary changes are tracked in the `salary_history` table:

| Field | Description |
|-------|-------------|
| `employee_id` | Employee reference |
| `effective_date` | When the salary takes effect |
| `basic_salary` | Base salary amount |
| `hra`, `conveyance`, etc. | Individual components |
| `total_ctc` | Cost to company |

Salary history is used to auto-populate salary sheet entries for the applicable period.

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `salary_sheets` | Monthly payroll containers with approval status |
| `salary_sheet_entries` | Individual employee salary rows |
| `employee_payslips` | Generated payslip PDF references |
| `payroll_transfer_files` | Bank transfer file records |
| `payroll_payment_status` | Payment tracking per employee per sheet |
| `salary_history` | Historical salary records |

---

## Security & Access Control

| Role | Permissions |
|------|------------|
| **HR** | Create/edit salary sheets, approve (HR stage), generate payslips |
| **Finance** | Approve (Finance stage), generate bank transfer files, reconcile payments |
| **Admin** | Full access to all payroll operations |
| **Employee** | View own payslips, view own salary history |

### RLS Policies

- Salary sheets: HR + Finance + Admin can read; HR + Admin can write
- Payment status: Finance + Admin can update; HR can view only
- Employee payslips: Employees can view their own; HR + Admin can view all

---

## Audit Events

| Event | When |
|-------|------|
| `SALARY_SHEET_CREATED` | New sheet created |
| `SALARY_SHEET_LOCKED` | Sheet finalized |
| `PAYSLIP_GENERATED` | Payslip PDF created |
| `BANK_TRANSFER_FILE_GENERATED` | NEFT file downloaded |
| `PAYROLL_PAYMENT_MARKED_PAID` | Status changed to Paid |
| `PAYROLL_PAYMENT_MARKED_FAILED` | Status changed to Failed |
| `PAYROLL_RECONCILIATION_FILE_IMPORTED` | Bank statement uploaded |

---

*Last updated: 2026-03-06*
