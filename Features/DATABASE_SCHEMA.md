# XBoom Workflow — Database Schema Overview

> High-level overview of 90+ database tables grouped by domain. This document explains purpose only — not full SQL schema.

---

## Table of Contents

1. [Auth & Users](#auth--users)
2. [Sales & Leads](#sales--leads)
3. [Orders](#orders)
4. [Inventory](#inventory)
5. [Procurement](#procurement)
6. [Suppliers](#suppliers)
7. [Billing](#billing)
8. [Finance](#finance)
9. [HR & Employees](#hr--employees)
10. [Payroll](#payroll)
11. [Attendance](#attendance)
12. [Recruitment](#recruitment)
13. [Tasks](#tasks)
14. [Meetings](#meetings)
15. [Tickets](#tickets)
16. [Forms](#forms)
17. [Notifications & Notices](#notifications--notices)
18. [Shopify](#shopify)
19. [Gamification](#gamification)
20. [Audit & Logging](#audit--logging)
21. [Configuration](#configuration)
22. [Miscellaneous](#miscellaneous)

---

## Auth & Users

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles linked to auth.users — name, avatar, team, approval status |
| `user_roles` | RBAC role assignments (one row per role per user) — uses `app_role` enum |
| `user_invitations` | Admin-created invitations with pre-assigned roles |
| `admin_whitelist` | Emails authorized to register as admin |
| `user_sessions` | Active session tracking with device fingerprint, IP, activity timestamps |
| `login_history` | Login attempt history for rate limiting and audit |
| `user_settings` | Per-user preferences (theme, notifications, compact mode) |

**Key functions**: `has_role()`, `is_user_approved()`, `is_hr_or_admin()`, `validate_admin_registration()`, `can_register_as_admin()`

---

## Sales & Leads

| Table | Purpose |
|-------|---------|
| `enquiries` | Lead/enquiry records — customer, product, quantity, urgency, temperature, AI score |
| `enquiry_items` | Multi-item support per enquiry with pricing and GST |
| `enquiry_tags` | Tags attached to enquiries for classification |
| `lead_tags` | Master tag definitions for lead classification |
| `pipeline_orders` | Sales pipeline deals with stage tracking |
| `pipeline_tags` | Tags for pipeline deals |
| `duplicate_alerts` | Detected duplicate enquiries with similarity score |
| `ai_scoring_logs` | AI lead scoring results and confidence levels |

---

## Orders

| Table | Purpose |
|-------|---------|
| `orders` | Customer orders with sequential numbering (`ORD` + YY + 5-digit) |
| `order_items` | Line items per order with pricing |
| `order_procurement_links` | Links orders to procurement records |

**Triggers**: Auto-numbering, auto-procurement creation, gamification points.

---

## Inventory

| Table | Purpose |
|-------|---------|
| `inventory` | Product catalog with current stock levels |
| `inventory_transactions` | Stock movements (procurement-in, order-fulfilled, return, adjustment) |
| `demand_forecasts` | AI-predicted demand per product |
| `forecast_accuracy_log` | Tracks forecast accuracy vs. actual demand |
| `pricelist` | Internal product pricing |
| `pricelist_public` | Public-facing product pricing |

**Triggers**: `update_inventory_stock` / `revert_inventory_stock` auto-adjust stock on transaction changes.

---

## Procurement

| Table | Purpose |
|-------|---------|
| `inventory_procurements` | Purchase records with sequential numbering (`PROC` + YY + 5-digit) |
| `procurement_payment_requests` | Payment request/approval workflow for procurements |
| `supplier_quotations` | Competitive quotes from multiple suppliers |
| `imports` | Import shipment tracking (BL number, container, ports, customs) |
| `import_items` | Line items per import shipment |

---

## Suppliers

| Table | Purpose |
|-------|---------|
| `suppliers` | Supplier master data (name, contact, GST, bank details) |
| `supplier_ratings` | Multi-dimensional supplier ratings (delivery, quality, pricing, communication) |
| `supplier_payments` | Payment records to suppliers |

**RPC**: `get_supplier_score` calculates weighted supplier score.

---

## Billing

| Table | Purpose |
|-------|---------|
| `quotes` | Sales quotations with sequential numbering |
| `quote_items` | Line items per quotation |
| `invoices` | Invoices with sequential numbering (`INV-YYMM-XXXX`), digital signature support |
| `invoice_items` | Line items per invoice |
| `invoice_payments` | Payment records against invoices |
| `invoice_audit_logs` | Signing and status change audit trail |
| `admin_signatures` | Admin digital signature images |

**Triggers**: Immutability enforcement for signed invoices.

---

## Finance

| Table | Purpose |
|-------|---------|
| `expenses` | Business expenses with approval workflow |
| `expense_order_links` | Links expenses to specific orders |
| `expense_procurement_links` | Links expenses to specific procurements |
| `expected_payments` | Scheduled incoming payments |
| `petty_cash_transactions` | Petty cash ledger |
| `payment_records` | General payment records with screenshot uploads |
| `payment_risk_scores` | Customer payment risk analysis |

---

## HR & Employees

| Table | Purpose |
|-------|---------|
| `employees` | Employee master data (name, department, salary, bank details, shift info) |
| `employee_kpis` | KPI assignments with targets, RAG thresholds, weightage |
| `employee_kpi_progress` | KPI progress updates with notes and attachments |
| `employee_roles_responsibilities` | Documented roles and responsibilities per employee |
| `employee_assets` | Company assets assigned to employees (laptops, phones, SIMs) |
| `leave_requests` | Employee leave applications with approval status |
| `hr_documents` | HR document storage |
| `hr_folders` | Document folder structure |
| `hr_document_shares` | Per-document sharing permissions |
| `hr_folder_shares` | Per-folder sharing permissions |
| `salary_history` | Historical salary records per employee |
| `employee_bank_update_requests` | Bank detail change requests with approval workflow |

---

## Payroll

| Table | Purpose |
|-------|---------|
| `salary_sheets` | Monthly payroll containers (Draft → HR Approved → Finance Approved → Locked) |
| `salary_sheet_entries` | Individual employee salary rows with earnings/deductions |
| `employee_payslips` | Generated payslip PDF references |
| `payroll_transfer_files` | Bank transfer file records |
| `payroll_payment_status` | Payment tracking per employee per sheet (Pending/Paid/Failed) |

See [PAYROLL_MODULE.md](PAYROLL_MODULE.md) for detailed documentation.

---

## Attendance

| Table | Purpose |
|-------|---------|
| `attendance_logs` | Daily check-in/out records with working hours calculation |
| `attendance_breaks` | Break tracking per attendance record |
| `attendance_correction_requests` | Employee correction requests with HR approval |
| `attendance_audit_log` | Audit trail for attendance modifications |
| `attendance_notifications_log` | Log of sent attendance notifications |
| `attendance_policy_settings` | Configurable attendance rules (grace period, auto-checkout, etc.) |

---

## Recruitment

| Table | Purpose |
|-------|---------|
| `candidates` | Candidate database with lifecycle status tracking |
| `candidate_documents` | Uploaded documents (resume, ID, offer letter) |
| `interview_records` | Interview round details with feedback and ratings |

**Enums**: `candidate_status`, `candidate_lifecycle_status`, `interview_stage`, `screening_status`, `final_status`, `application_source`, `employment_type`

---

## Tasks

| Table | Purpose |
|-------|---------|
| `tasks` | Task records with stage workflow, time tracking, assignment |

Tasks are auto-created from enquiries, meetings, and hot leads via database triggers. Support Kanban and table views with timer-based time tracking.

---

## Meetings

| Table | Purpose |
|-------|---------|
| `meetings` | Meeting records with participants, agenda, date/time, location |

**Triggers**: Auto-create reminder tasks for participants.

---

## Tickets

| Table | Purpose |
|-------|---------|
| `tickets` | IT support tickets with priority-based SLA, sequential numbering |
| `ticket_comments` | Thread of comments per ticket |

**Triggers**: Auto-calculate SLA due date based on priority.

---

## Forms

| Table | Purpose |
|-------|---------|
| `forms` | Custom form definitions (title, description, active status) |
| `form_fields` | Field definitions per form (type, order, required, options) |
| `form_submissions` | Submitted form data (JSONB) |
| `form_views` | View/visit tracking for analytics |
| `form_permissions` | Per-user granular permissions (view, create, edit, view/delete submissions) |

---

## Notifications & Notices

| Table | Purpose |
|-------|---------|
| `notifications` | In-app notification records per user |
| `notices` | Company-wide announcements |
| `notice_reads` | Read tracking per user per notice |

---

## Shopify

| Table | Purpose |
|-------|---------|
| `shopify_orders_raw` | Raw webhook payloads (staging table, processed by cron) |
| `shopify_orders` | Structured, processed Shopify orders |

Shopify orders are kept **completely separate** from internal orders. See [SHOPIFY_WEBHOOK_SETUP.md](../SHOPIFY_WEBHOOK_SETUP.md).

---

## Gamification

| Table | Purpose |
|-------|---------|
| `sales_points` | Points earned by sales team (auto-awarded via triggers) |
| `sales_targets` | Sales targets per user/team |
| `sales_daily_activities` | Daily activity logs from sales team |
| `sales_faqs` | Internal sales knowledge base |
| `sales_suggestions` | Suggestion box entries |
| `customer_testimonials` | Customer testimonials (submitted by sales, approved by admin) |

---

## Audit & Logging

| Table | Purpose |
|-------|---------|
| `security_audit_log` | Security-sensitive events (login, role changes, MFA, password changes) |
| `edit_history` | Field-level change tracking across all tables |
| `user_activity_logs` | Session-level user behavior tracking |
| `domain_events` | Event-driven state change records |
| `nudge_health_log` | Attendance nudge system health monitoring |

---

## Configuration

| Table | Purpose |
|-------|---------|
| `attendance_policy_settings` | Attendance rules (grace period, auto-checkout, alerts) |
| `slack_settings` | Slack integration configuration |
| `org_departments` | Organization department definitions |
| `org_roles` | Organization role/title definitions |
| `org_settings` | Organization-wide settings (name, logo, timezone, business hours) |

---

## Miscellaneous

| Table | Purpose |
|-------|---------|
| `repairs` | Drone repair tracking with sequential numbering |
| `drone_repair_enquiries` | Public-facing repair enquiry submissions |
| `buyback_drones` | Used drone buyback/resale tracking |
| `trainings` | Training programs with certificate generation |

---

*Last updated: 2026-03-06*
