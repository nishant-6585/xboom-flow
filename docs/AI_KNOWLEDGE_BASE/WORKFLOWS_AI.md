# XBoom Workflow — Workflows (AI Context)

> Structured workflow definitions for all major business processes.

---

## 1. Lead-to-Cash Lifecycle

```
Lead Source (Website / Referral / Shopify / Outbound)
  → Enquiry Created (enquiries table)
  → AI Lead Scoring (ai-lead-scoring edge function)
  → Qualification (lead_temperature: cold/warm/hot)
  → Pipeline Stage (pipeline_orders table)
  → Quote Generated (quotes + quote_items)
  → Quote Accepted
  → Order Created (orders + order_items)
  → Invoice Generated (invoices + invoice_items)
  → Payment Received (payment_records)
  → Order Completed
```

**Key rules:**
- Enquiries with quantity ≥ 50 or value ≥ ₹10L auto-flagged as `is_mega_deal`
- AI scores range 1–10 with confidence level
- Signed invoices are immutable

---

## 2. Payroll Lifecycle

```
Attendance Data (attendance_logs)
  → Leave/Absence Calculation
  → Salary Sheet Created (salary_sheets, status: draft)
  → HR Reviews & Approves (status: hr_approved)
  → Finance Reviews & Approves (status: finance_approved)
  → Sheet Locked (status: locked) — no further edits
  → Payslips Generated (employee_payslips, PDF stored in storage)
  → Bank Transfer File Generated (payroll_transfer_files, CSV)
  → Upload to Bank Portal (manual, external)
  → Payroll Reconciliation (payroll_payment_status: pending → paid/failed)
  → Retry Failed Payments (regenerate transfer file for failed only)
```

**Key rules:**
- Locked sheets cannot be edited
- Bank transfer files only generated for locked sheets
- Reconciliation tracks per-employee payment status
- Payslip generation requires locked status

---

## 3. Attendance Lifecycle

```
Employee Check-in (attendance_logs, source: manual/mobile)
  → Break Start/End (attendance_breaks)
  → Employee Check-out
  → Working Hours Calculated (trigger)
  → If no checkout by policy limit → Auto-Checkout (auto-checkout edge function)
  → If discrepancy → Correction Request (attendance_correction_requests)
  → HR Reviews Correction → Approve/Reject
  → Audit Log Updated (attendance_audit_log)
```

**Automated triggers:**
- `attendance-nudge`: Reminds employees who haven't checked in/out
- `auto-checkout`: Applies after configurable max hours (attendance_policy_settings)

---

## 4. Candidate Lifecycle

```
Application Received
  → Status: APPLIED
  → Screening (screening_status: pending → passed/failed)
  → Status: SCREENING
  → Interview Rounds (interview_records)
  → Status: INTERVIEW (stages: technical → hr → cultural → final)
  → Offer Extended
  → Status: OFFERED
  → Offer Accepted → Status: JOINED (joining_date set)
  → OR Rejected → Status: REJECTED (rejection_reason recorded)
  → OR Dropped → Status: DROPPED
```

---

## 5. Expense Approval Workflow

```
Employee Submits Expense (expenses, status: pending)
  → Manager/Admin Reviews
  → Approved (status: approved, approved_by recorded)
  → OR Rejected (status: rejected)
  → Payment Processed (amount_paid updated)
  → Linked to Order/Procurement (expense_order_links / expense_procurement_links)
```

---

## 6. Bank Detail Update Workflow

```
Employee Requests Update (employee_bank_update_requests)
  → Status: pending
  → HR/Admin Reviews
  → Approved → Employee record updated (employees.bank_account, employees.ifsc_code)
  → OR Rejected (with reason)
  → Audit logged
```

---

## 7. Procurement Workflow

```
Requirement Identified
  → Supplier Selected (suppliers table, supplier_ratings considered)
  → Procurement Order Created (inventory_procurements)
  → Supplier Quotation Attached (supplier_quotations)
  → Payment Request Raised (procurement_payment_requests)
  → Payment Made (inventory_procurement_payments)
  → Goods Received → Inventory Updated
  → Linked to Orders (order_procurement_links)
```

---

## 8. Shopify Order Pipeline

```
Customer Places Order on Shopify
  → Shopify Webhook fires (orders/create)
  → shopify-webhook edge function receives payload
  → HMAC-SHA256 verified
  → Raw payload stored (shopify_orders_raw, status: pending)
  → shopify-order-processor runs (pg_cron, every 2 min)
  → Structured order created (shopify_orders)
  → Inventory adjusted
  → Status: processed
```

---

## 9. Invoice Lifecycle

```
Invoice Created (from order or manual)
  → Items Added (invoice_items)
  → Invoice Sent to Customer
  → Admin Signs Invoice (InvoiceSignatureDialog)
  → Signature Stored (admin_signatures)
  → Invoice Locked (signed invoices immutable)
  → Payment Tracked
```

---

## 10. IT Ticket Lifecycle

```
User Creates Ticket (tickets)
  → Priority Assigned (low/medium/high/critical)
  → Assigned to Agent
  → Comments Added (ticket_comments)
  → Status: open → in_progress → resolved → closed
  → Email Notification (send-ticket-email edge function)
  → SLA Tracking
```

---

## 11. Notice Board Workflow

```
Admin/HR Creates Notice (notices)
  → Target: all / department / role
  → Popup shown to targeted users (NoticePopup)
  → Read receipts tracked (notice_reads)
  → Dashboard widget shows unread count
```

---

## 12. Task Management

```
Task Created (tasks)
  → Stage: backlog → todo → in_progress → review → done
  → Assigned to user
  → Timer started (task_time_entries)
  → Time tracked per session
  → Task completed → time report available
```

*Last updated: 2026-03-06*
