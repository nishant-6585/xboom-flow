# XBoom Workflow — Database Map (AI Context)

> Simplified knowledge graph of 90+ tables grouped by domain. For full schema details see `src/integrations/supabase/types.ts`.

---

## Auth & Identity

| Table | Purpose |
|-------|---------|
| `profiles` | User profile data (name, avatar, role cache) |
| `user_roles` | RBAC role assignments (`admin`, `hr`, `finance`, `sales`, `supply_chain`, `employee`) |
| `user_sessions` | Active session tracking |
| `user_settings` | Per-user preferences (theme, notifications) |
| `login_history` | Login event audit trail |
| `admin_whitelist` | Pre-approved admin email addresses |
| `admin_signatures` | Uploaded admin signature images for invoices |

**Relationships:** `user_roles.user_id` → `auth.users.id`; `profiles.id` → `auth.users.id`

---

## Sales & CRM

| Table | Purpose |
|-------|---------|
| `enquiries` | Sales leads/enquiries with AI scoring fields |
| `enquiry_items` | Line items per enquiry (product, qty, price) |
| `enquiry_tags` | Tags applied to enquiries |
| `lead_tags` | Tag definitions |
| `duplicate_alerts` | Detected duplicate enquiry pairs |
| `ai_scoring_logs` | AI lead scoring results history |
| `pipeline_orders` | Sales pipeline stage tracking |
| `customer_testimonials` | Customer feedback records |
| `sales_daily_activities` | Sales team daily activity logs |
| `sales_targets` | Monthly/quarterly sales targets |
| `sales_faqs` | Product FAQ knowledge base |
| `sales_rules` | Sales process rules |
| `sales_suggestions` | Suggestion box entries |
| `outbound_leads` | Outbound sales lead tracking |

**Key relationships:**
- `enquiry_items.enquiry_id` → `enquiries.id`
- `pipeline_orders` links to `enquiries` and `orders`
- `ai_scoring_logs.enquiry_id` → `enquiries.id`

---

## Orders & Payments

| Table | Purpose |
|-------|---------|
| `orders` | Customer orders |
| `order_items` | Line items per order |
| `payment_records` | Payment tracking per order |

**Relationships:** `order_items.order_id` → `orders.id`; `payment_records.order_id` → `orders.id`

---

## Billing

| Table | Purpose |
|-------|---------|
| `quotes` | Sales quotations |
| `quote_items` | Quote line items |
| `invoices` | Tax invoices |
| `invoice_items` | Invoice line items |

**Constraint:** Signed invoices (`signature_url IS NOT NULL`) cannot be modified.

---

## Inventory

| Table | Purpose |
|-------|---------|
| `inventory` | Product stock levels, reorder points |
| `demand_forecasts` | AI-generated demand predictions |
| `forecast_accuracy_log` | Forecast vs actual comparison |

---

## Procurement

| Table | Purpose |
|-------|---------|
| `inventory_procurements` | Purchase orders to suppliers |
| `inventory_procurement_payments` | Payment records for procurements |
| `procurement_payment_requests` | Payment approval requests |
| `supplier_quotations` | Quotes received from suppliers |
| `supplier_ratings` | Supplier performance ratings |
| `suppliers` | Supplier master data |

**Relationships:** Procurements link to `inventory` and `suppliers`.

---

## Finance

| Table | Purpose |
|-------|---------|
| `expenses` | Company expenses with approval workflow |
| `expense_order_links` | Links expenses to orders |
| `expense_procurement_links` | Links expenses to procurements |
| `expected_payments` | Upcoming receivables tracker |
| `petty_cash_transactions` | Petty cash in/out records |

---

## HR & Employee

| Table | Purpose |
|-------|---------|
| `employees` | Employee master (department, designation, salary, bank details) |
| `employee_assets` | IT/company assets assigned to employees |
| `employee_kpis` | KPI definitions per employee |
| `employee_kpi_progress` | KPI achievement updates |
| `employee_roles_responsibilities` | Role descriptions per employee |
| `hr_documents` | Uploaded HR documents |
| `hr_document_sharing` | Document access sharing |
| `employee_bank_update_requests` | Bank detail change requests with approval |

**Key:** `employees.user_id` → `auth.users.id` (links employee to login)

---

## Attendance

| Table | Purpose |
|-------|---------|
| `attendance_logs` | Daily check-in/check-out records |
| `attendance_breaks` | Break periods within a workday |
| `attendance_correction_requests` | Employee requests to fix attendance |
| `attendance_audit_log` | Audit trail for attendance changes |
| `attendance_policy_settings` | Configurable policy (grace period, auto-checkout hours) |
| `attendance_notifications_log` | Nudge/alert delivery log |

**Relationships:** All link to `employees.id`

---

## Payroll

| Table | Purpose |
|-------|---------|
| `salary_sheets` | Monthly payroll sheets (status: draft → hr_approved → finance_approved → locked) |
| `salary_sheet_entries` | Per-employee salary breakdown within a sheet |
| `salary_history` | Historical salary records |
| `employee_payslips` | Generated payslip PDF references |
| `payroll_transfer_files` | Generated bank transfer CSV references |
| `payroll_payment_status` | Reconciliation status per employee per sheet (pending/paid/failed) |

**Lifecycle constraint:** Once `salary_sheets.status = 'locked'`, entries cannot be edited.

---

## Recruitment

| Table | Purpose |
|-------|---------|
| `candidates` | Candidate profiles with lifecycle status |
| `candidate_documents` | Uploaded resumes and documents |
| `interview_records` | Interview feedback and scores |

**Lifecycle:** `applied` → `screening` → `interview` → `offered` → `joined` / `rejected` / `dropped`

---

## Tickets

| Table | Purpose |
|-------|---------|
| `tickets` | Internal IT/support tickets |
| `ticket_comments` | Ticket conversation thread |

---

## Meetings

| Table | Purpose |
|-------|---------|
| `meetings` | Scheduled meetings |
| `meeting_attendees` | Meeting participants |

---

## Tasks

| Table | Purpose |
|-------|---------|
| `tasks` | Task board items (Kanban) |
| `task_time_entries` | Time tracking per task |

---

## Forms

| Table | Purpose |
|-------|---------|
| `custom_forms` | Form builder definitions |
| `form_fields` | Field definitions per form |
| `form_submissions` | Submitted form responses |
| `form_submission_values` | Individual field values per submission |
| `form_permissions` | Access control per form |

---

## Notices & Trainings

| Table | Purpose |
|-------|---------|
| `notices` | Company-wide announcements |
| `notice_reads` | Read receipts |
| `trainings` | Training modules |
| `training_completions` | Employee completion records |

---

## Shopify

| Table | Purpose |
|-------|---------|
| `shopify_orders_raw` | Raw webhook payloads (staging) |
| `shopify_orders` | Processed Shopify orders |

**Pipeline:** Webhook → `shopify_orders_raw` → processor (pg_cron every 2 min) → `shopify_orders` + inventory adjustment

---

## Buyback & Repairs

| Table | Purpose |
|-------|---------|
| `buyback_drones` | Second-hand drone buyback inventory |
| `drone_repair_enquiries` | Repair service requests (public-facing form) |

---

## Audit & Events

| Table | Purpose |
|-------|---------|
| `security_audit_log` | All auditable events (login, approval, status change) |
| `edit_history` | Field-level change tracking |
| `domain_events` | Event-driven state change log |
| `notifications` | In-app notification records |
| `user_activity_logs` | Page view / action tracking |

---

## Organization

| Table | Purpose |
|-------|---------|
| `org_settings` | Organization-level config (name, theme) |
| `org_departments` | Department definitions |
| `org_roles` | Role definitions |
| `holidays` | Company holiday calendar |
| `slack_settings` | Slack integration config |
| `pricelist` | Product pricing reference |
| `imports` | Bulk import job tracking |

*Last updated: 2026-03-06*
