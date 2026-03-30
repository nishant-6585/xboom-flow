# XBoom OS

> **The operating system for a robotics & drone company** — not just an ERP, but a decision system that connects every department into a single revenue-aware, people-aware platform.

---

## 🚀 TL;DR

XBoom OS is an internal operations platform that:

- **Tracks leads → orders → revenue** (with Google Ads attribution and AI scoring)
- **Manages employees → attendance → payroll** (fully automated salary lifecycle)
- **Controls inventory → procurement → suppliers** (trigger-based real-time stock)
- **Automates finance → invoices → payments → reconciliation** (cashflow visibility)
- **Provides AI insights** for sales decisions, demand forecasting, and risk scoring

**Core Value:** Single source of truth for entire business operations — from the first ad click to the last payment reconciliation.

**Tech:** React 18 + PostgreSQL (150+ tables, 30+ triggers, 18 edge functions) + AI integrations

**Users:** 7 roles (Admin, Sales, Sales Manager, Supply Chain, Finance, HR, IT, Marketing) with strict RBAC and MFA enforcement.

---

## Table of Contents

1. [End-to-End Data Flow](#end-to-end-data-flow)
2. [System Boundaries](#system-boundaries)
3. [Core Modules](#core-modules)
4. [Key Features](#key-features)
5. [Architecture](#architecture)
6. [Tech Stack](#tech-stack)
7. [External Integration Contracts](#external-integration-contracts)
8. [Security Model](#security-model)
9. [Access Control Overview](#access-control-overview)
10. [Observability](#observability)
11. [Failure Handling](#failure-handling)
12. [Database Overview](#database-overview)
13. [Edge Functions](#edge-functions)
14. [Automation & Triggers](#automation--triggers)
15. [Storage Buckets](#storage-buckets)
16. [Payroll Lifecycle](#payroll-lifecycle)
17. [Business Impact](#business-impact)
18. [Local Development](#local-development)
19. [Related Documentation](#related-documentation)
20. [Future Roadmap](#future-roadmap)
21. [Contribution Guidelines](#contribution-guidelines)

---

## End-to-End Data Flow

This is the heartbeat of the system — how a lead becomes revenue:

```
┌──────────────────────────────────────────────────────────┐
│                    LEAD CAPTURE                          │
│  Google Ads · Interakt · MyOperator · Forms · Email      │
└────────────────────────┬─────────────────────────────────┘
                         ▼
              ┌─────────────────────┐
              │  enquiries table    │  ← AI Lead Scoring (1–10)
              │  + campaign_id      │  ← Lead Temperature (Hot/Warm/Cold)
              │  + lead_source      │  ← Duplicate Detection
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │  Sales Follow-up    │  ← Auto-created tasks
              │  Pipeline Tracking  │  ← Stage-based workflow
              │  Meetings & Calls   │  ← Activity logging
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │  Order Created      │  ← enquiry_id linked (attribution)
              │  orders table       │  ← campaign_id propagated
              └──────────┬──────────┘
                    ┌────┴────┐
                    ▼         ▼
          ┌──────────┐  ┌────────────────┐
          │ Inventory │  │ Procurement    │  ← Auto-created via trigger
          │ Checked   │  │ Triggered      │
          └──────────┘  └────────────────┘
                    ▼
          ┌──────────────────┐
          │ Invoice Generated │  ← Sequential numbering
          │ Payment Tracked   │  ← Status: pending → partial → full
          └──────────┬───────┘
                     ▼
          ┌──────────────────┐
          │ Revenue Attributed│  ← conversion_value → campaign ROAS
          │ Finance Reconciled│  ← Bank statement import & matching
          └──────────────────┘
```

**Key principle:** Every order traces back to a lead, every lead traces back to a source. No orphaned revenue.

---

## System Boundaries

XBoom OS is designed for **internal operations** and does NOT handle:

| Out of Scope | Handled By |
|---|---|
| Public e-commerce storefront | Shopify (synced via webhooks) |
| External customer authentication | Not applicable (internal-only users) |
| Real-time IoT / drone telemetry | External systems |
| Accounting-grade compliance (GST filing, statutory returns) | External accounting software |
| Email marketing / drip campaigns | External tools (planned integration) |
| WhatsApp lead capture | Planned (Phase 2) |

**Philosophy:** Integrate with external systems instead of replacing them. Own the data, not the interface.

---

## Core Modules

### Sales & CRM
Lead management with multi-source ingestion (Interakt, MyOperator, Email, Google Ads, Custom Forms), multi-item enquiries, AI-powered lead scoring (1–10 scale), lead temperature tracking (Hot/Warm/Cold), mega deal flagging, pipeline management with stage tracking, sales leaderboard with points gamification, daily activity logging, and customer testimonials.

### Google Ads Integration
Full revenue intelligence system for Google Ads campaigns. Lead Form Extension sync via API v23 with heuristic field parsing for unknown column names. CEO-level dashboard with Spend, Revenue, Profit, and ROAS metrics. Campaign Decision Engine with automated recommendations (SCALE, OPTIMIZE, PAUSE, CRITICAL). Sales performance analytics per salesperson. Lead aging detection and time-to-conversion tracking. Revenue leakage alerts and budget optimization insights. Conversion tracking via database triggers linking orders back to campaigns.

### Inventory Management
Real-time stock tracking via database triggers on inventory transactions. Supports procurement-in, order-fulfilled, customer-return, and adjustment transaction types. Product catalog with pricing (internal + public pricelist). Demand forecasting widget.

### Procurement
Auto-created from orders via database trigger. Sequential numbering (`PROC` + YY + 5-digit). Multi-product procurement forms, supplier quotation comparison, payment status tracking, and expense linking. Supplier rating system with multi-dimensional scoring.

### Finance
Invoice generation with sequential numbering and digital signature support. Expense management with approval workflow and petty cash tracking. Expected payment scheduling, payment risk scoring, cashflow charts, credit/debit overview, and invoice aging dashboard.

### HR Management
Employee profiles with department/designation tracking. Salary history, bank detail management with update-approval workflow. HR document management with folder structure and granular sharing. Employee asset tracking (laptops, phones, SIMs). KPI management with RAG status indicators and progress tracking. Roles & responsibilities documentation.

### Payroll
Complete payroll lifecycle — salary sheets with attendance-based deduction calculation, mid-month pro-ration for salary changes, 4-stage approval workflow (Draft → HR Approved → Finance Approved → Locked), payslip PDF generation, bank transfer file generation (NEFT format), and payroll reconciliation dashboard. See [PAYROLL_MODULE.md](Features/PAYROLL_MODULE.md) for details.

### Attendance
Check-in/check-out with break tracking. Provisional checkout with correction request workflow. Auto-checkout after configurable hours. Attendance nudge notifications. Team attendance dashboard for managers. Calendar view with daily/weekly/monthly breakdown. Attendance policy settings (grace period, work start time, break limits).

### Recruitment
Full candidate lifecycle management — application, screening, interview stages, offer, joining. Candidate database with skills, experience, CTC tracking. Interview record logging. Document uploads per candidate. Application source and employment type tracking.

### IT Tickets
Internal ticket system with priority-based SLA. Sequential numbering. Ticket comments, status tracking, edit history. Performance dashboard with resolution metrics. Email notifications on ticket events.

### Meetings & Calendar
Meeting scheduling with team calendar (day/week/month views). Auto-created reminder tasks for participants. Lead-linked meetings panel.

### Tasks
Auto-generated from enquiries, meetings, and hot leads. Kanban and table views. Stage-based workflow. Time tracking with timer. Task performance reports.

### Notices
Company-wide notice board with publish/unpublish controls. Dashboard widget for recent notices. Read tracking per user.

### Custom Forms
Drag-and-drop form builder with field types (text, select, file upload, etc.). Embeddable public forms. QR code generation. Submission analytics. Per-user form permissions. Auto-push to leads table for sales forms.

### Shopify Integration
Server-side-only architecture for e-commerce order ingestion. Webhook-based with HMAC-SHA256 verification. Background processing via pg_cron (every 2 minutes). Cursored backfill for historical orders. Health monitoring dashboard. Shopify orders kept separate from internal orders. See [SHOPIFY_WEBHOOK_SETUP.md](SHOPIFY_WEBHOOK_SETUP.md) and [SHOPIFY_SECURITY.md](SHOPIFY_SECURITY.md).

### Buyback & Resale
Used drone buyback tracking with condition assessment, pricing, and resale management. Profit/loss calculation per unit.

### Repairs
Drone repair tracking with sequential numbering. Public-facing repair enquiry form. Internal repair management with status workflow.

### Trainings
Training program management with sequential numbering and certificate generation.

---

## Key Features

| Feature | Description |
|---------|-------------|
| AI Lead Scoring | Gemini-powered 1–10 scoring with key factors, risk analysis, and suggested approach |
| AI Sales Assistant | Conversational chatbot for product/pricing queries (cost-price gated by role) |
| AI Decision Engine | Automated campaign recommendations — SCALE, OPTIMIZE, PAUSE, CRITICAL based on ROAS |
| Google Ads ROI | End-to-end attribution: Ad Spend → Leads → Conversions → Revenue → ROAS per campaign |
| Revenue Leakage Detection | Alerts when leads are generated but not converting into revenue |
| Lead Priority System | Auto-classifies leads as High Value 🔥, Hot ⚡, Warm, Cold based on form responses |
| Sales Performance Analytics | Per-salesperson conversion rate, revenue attribution, and ranking |
| Sales Pipeline | Stage-based deal tracking with weighted forecast |
| Inventory Tracking | Trigger-based real-time stock updates |
| Payroll Automation | Attendance → salary sheet → approval → payslip → bank file → reconciliation |
| Mid-Month Pro-Ration | Automatically calculates weighted salary when revision happens mid-month |
| Payslip Generation | PDF payslips with earnings/deductions breakdown |
| Bank Transfer Files | NEFT-format CSV for bulk salary disbursement |
| Payroll Reconciliation | Bank statement import, auto-matching, retry file generation |
| Attendance System | Check-in/out with breaks, corrections, auto-checkout, nudges |
| Candidate Lifecycle | Application → screening → interview → offer → joining |
| Document Management | HR documents with folder structure, sharing, and viewer |
| Invoice Signing | Digital signatures with immutability enforcement (DB triggers) |
| Custom Forms | Embeddable public forms with file upload support |
| Task Automation | DB triggers auto-create tasks from enquiries, meetings, hot leads |
| Gamification | Sales leaderboard with points for orders, deliveries, testimonials |
| Slack Integration | Automated daily/weekly sales reports, hot lead alerts, escalations |
| Audit Logging | Field-level change tracking, security event logging, session tracking |
| MFA Enforcement | TOTP-based MFA mandatory for all users (AAL2 required) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Lovable Cloud                            │
│                                                                 │
│  ┌────────────┐         ┌────────────────────────────────────┐  │
│  │  Frontend   │         │  Backend                           │  │
│  │  React SPA  │────────▶│                                    │  │
│  │  CDN-hosted │         │  ┌──────────────────────────────┐  │  │
│  │             │         │  │  PostgreSQL 15+               │  │  │
│  │  State: UI  │         │  │  • 150+ tables                │  │  │
│  │  only, thin │         │  │  • RLS on every table         │  │  │
│  │  client     │         │  │  • 30+ triggers               │  │  │
│  └────────────┘         │  │  • pg_cron scheduled jobs     │  │  │
│                          │  │  • Business logic lives HERE  │  │  │
│                          │  └──────────────────────────────┘  │  │
│                          │                                    │  │
│                          │  ┌──────────────────────────────┐  │  │
│                          │  │  Edge Functions (18)          │  │  │
│                          │  │  • Async processing           │  │  │
│                          │  │  • External API calls         │  │  │
│                          │  │  • AI inference gateway       │  │  │
│                          │  │  • Webhook receivers          │  │  │
│                          │  └──────────────────────────────┘  │  │
│                          │                                    │  │
│                          │  ┌──────────────────────────────┐  │  │
│                          │  │  Storage (private + RLS)      │  │  │
│                          │  │  • Payslips, invoices, CVs    │  │  │
│                          │  └──────────────────────────────┘  │  │
│                          └────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  External Integrations                                    │   │
│  │  • Google Ads API v23 (lead sync + ROI attribution)      │   │
│  │  • Shopify Admin API (webhook + cursored backfill)       │   │
│  │  • Slack (OAuth connector — notifications + reports)     │   │
│  │  • Lovable AI Gateway (Gemini — scoring, assistant)      │   │
│  │  • MyOperator (call log sync)                            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Business logic in PostgreSQL** (triggers, functions, RLS) | Guarantees data integrity regardless of client. No way to bypass rules from the frontend. |
| **Edge Functions for async + integrations** | Keeps the database focused on data. AI calls, webhooks, and notifications happen outside the transaction path. |
| **Frontend is thin** (state + UI only) | No business logic in React. All authorization enforced server-side via RLS. Client is untrusted. |
| **AI processing is stateless** | AI calls go through a gateway. No model state stored. Responses are logged but not depended on for data integrity. |
| **Event-driven patterns** (`domain_events` table) | Critical state changes are recorded as events for audit, automation, and future replay capability. |
| **Sequential numbering via DB locks** | Order numbers, invoice numbers, etc. use `SHARE ROW EXCLUSIVE MODE` locks to prevent race conditions. |

---

## Tech Stack

### Frontend

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | React (SPA) | 18.3.x |
| Build Tool | Vite | Latest |
| Language | TypeScript | Strict mode |
| Styling | Tailwind CSS + shadcn/ui | Latest |
| State Management | TanStack React Query | 5.x |
| Routing | React Router DOM | 6.x |
| Charts | Recharts | 2.x |
| PDF Generation | jsPDF + jspdf-autotable | 4.x / 5.x |
| Drag & Drop | @dnd-kit | 6.x |
| Spreadsheet Export | xlsx (SheetJS) | 0.18.x |
| QR Code | qrcode.react | 4.x |

### Backend / Infrastructure

| Component | Technology |
|-----------|------------|
| Platform | Lovable Cloud |
| Database | PostgreSQL 15+ |
| Auth | Email/password with JWT, MFA (TOTP) |
| Edge Functions | Deno (TypeScript) — auto-deployed |
| File Storage | Private buckets with RLS |
| Realtime | PostgreSQL Change Data Capture |
| Scheduled Jobs | pg_cron |
| HTTP from DB | pg_net extension |

---

## External Integration Contracts

| System | Type | Direction | Auth Method | Notes |
|--------|------|-----------|-------------|-------|
| **Google Ads** | REST API v23 | Inbound (pull) | OAuth2 (connector) | Lead Form Extension sync, campaign spend data |
| **Shopify** | Webhook + REST | Inbound (push + pull) | HMAC-SHA256 + Admin API key | Order sync, cursored backfill, health monitoring |
| **Slack** | OAuth + API | Outbound (push) | OAuth connector | Daily/weekly sales reports, hot lead alerts, escalations |
| **Lovable AI** | Gateway API | Both | Platform-managed | Lead scoring (Gemini), sales assistant, demand forecasting |
| **MyOperator** | REST API | Inbound (pull) | API token + secret | Call log sync, recording fetch, agent auto-assignment |
| **Interakt** | Webhook | Inbound (push) | Webhook secret | WhatsApp lead ingestion |

---

## Security Model

XBoom OS follows a **6-layer security architecture** (Network → Authentication → Authorization → API → Data Protection → Monitoring).

### Key Security Features

- **RBAC**: 8 roles stored in `user_roles` table, checked via `has_role()` security definer function
- **MFA**: Universal TOTP enforcement — all users must complete AAL2 verification
- **Session Policy**: 12-hour idle timeout, 5-day absolute timeout, device fingerprinting
- **RLS**: Row-Level Security on all tables with `is_user_approved()` checks
- **Sensitive Data Isolation**: Employee financial data (salary, PAN, bank) restricted to HR/Admin via scoped RLS policies
- **Admin Controls**: Whitelist-based registration, max 5 admin cap, re-auth for sensitive operations
- **Webhook HMAC**: Timing-safe HMAC-SHA256 verification for Shopify webhooks
- **Immutable Records**: Signed invoices protected by database triggers
- **Private Storage**: All file buckets are private with role-based RLS policies
- **AI Data Masking**: PII hard-blocked for non-admins, partial masking for cross-module queries

### Related Security Documents

- [SECURITY_ARCHITECTURE.md](Features/SECURITY_ARCHITECTURE.md) — 6-layer security model, shared responsibility, audit findings
- [IDENTITY_AND_ACCESS_MANAGEMENT.md](Features/IDENTITY_AND_ACCESS_MANAGEMENT.md) — Authentication, RBAC, session policy, MFA, access control matrix
- [SHOPIFY_SECURITY.md](SHOPIFY_SECURITY.md) — Shopify credential management, HMAC verification
- [SHOPIFY_WEBHOOK_SETUP.md](SHOPIFY_WEBHOOK_SETUP.md) — Webhook registration, testing, security notes

---

## Access Control Overview

| Module | Admin | HR | Finance | Supply Chain | Sales | Sales Mgr | IT | Marketing |
|--------|:-----:|:--:|:-------:|:------------:|:-----:|:---------:|:--:|:---------:|
| **Leads & Enquiries** | ✅ | ❌ | ❌ | ❌ | ✅ (own) | ✅ (all) | ❌ | ❌ |
| **Orders** | ✅ | ❌ | ✅ (view) | ✅ | ✅ (own) | ✅ (all) | ❌ | ❌ |
| **Inventory** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Procurement** | ✅ | ❌ | ✅ (view) | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Invoices** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Payroll** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Employee Data (sensitive)** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Attendance** | ✅ | ✅ | ❌ | ❌ | own | own | own | own |
| **Recruitment** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **IT Tickets** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Pricelist (cost prices)** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Forms (create/edit)** | ✅ | per-perm | per-perm | per-perm | per-perm | per-perm | per-perm | per-perm |
| **Google Ads Dashboard** | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |

> All access enforced server-side via RLS + `has_role()`. UI hides elements for UX, but the database is the authority.

---

## Observability

| Area | Implementation | Status |
|------|---------------|--------|
| **Audit Logs** | `security_audit_log` — role changes, admin actions, payroll events, MFA changes | ✅ Active |
| **Edit History** | `edit_history` — field-level change tracking on sensitive tables | ✅ Active |
| **Session Tracking** | `user_activity_logs` — login/logout, idle timeouts, device info | ✅ Active |
| **AI Access Logs** | `ai_access_logs` — every AI query logged with role, masking, and access type | ✅ Active |
| **Integration Health** | Shopify monitor dashboard — sync status, failure counts, processing lag | ✅ Active |
| **Edge Function Logs** | Deno runtime logs — available via platform | ✅ Active |
| **Slack Alerts** | Hot leads, mega deals, failed integrations → Slack channel | ✅ Active |
| **Campaign Metrics** | Google Ads ROAS, CPL, conversion rates — real-time dashboard | ✅ Active |
| **Application Metrics** | User engagement, module usage analytics | 🔜 Planned |

### Key Audited Events

| Event | Trigger |
|-------|---------|
| `SALARY_SHEET_CREATED` / `LOCKED` | Payroll lifecycle |
| `PAYSLIP_GENERATED` | Payslip PDF created |
| `BANK_TRANSFER_FILE_GENERATED` | NEFT file downloaded |
| `BANK_UPDATE_REQUEST_CREATED` / `APPROVED` | Employee bank detail changes |
| `ROLE_ASSIGNED` / `ROLE_REMOVED` | User role changes |
| `USER_APPROVED` | New user approved by admin |
| `MFA_ENABLED` / `MFA_DISABLED` | MFA status changes |
| `SESSION_IDLE_TIMEOUT` / `SESSION_ABSOLUTE_TIMEOUT` | Session expirations |
| `INVOICE_SIGNED` | Invoice digitally signed |

---

## Failure Handling

| Scenario | Handling |
|----------|---------|
| **Failed Shopify webhooks** | Raw payload stored in `shopify_orders_raw` with `retry_count`. pg_cron retries every 2 minutes (max 5 retries). |
| **Duplicate orders** | Idempotent processing — Shopify order IDs checked before insert. Duplicate alerts table for enquiries. |
| **Failed AI scoring** | Graceful degradation — error logged in `ai_scoring_logs`, lead remains unscored. System continues without AI. |
| **Edge function failures** | Error captured in response. Critical failures trigger Slack alerts. No silent failures. |
| **Partial payroll** | Sheet locked only after full approval chain. Individual entry errors don't block sheet. Reconciliation handles mismatches. |
| **Google Ads sync failures** | Edge function returns error status. Manual retry available. Sync state tracked per execution. |
| **MyOperator API failures** | Call logs stored with raw payload. Failed recording fetches retried. Status tracked per call. |
| **Concurrent number generation** | `SHARE ROW EXCLUSIVE MODE` table locks prevent duplicate sequential numbers (orders, invoices, procurements). |
| **RLS policy violations** | Rejected at database level with error. Frontend shows user-friendly message. Never fails silently. |

---

## Database Overview

**150+ tables** organized by domain. See [DATABASE_SCHEMA.md](Features/DATABASE_SCHEMA.md) for full overview.

| Domain | Key Tables | Purpose |
|--------|------------|---------|
| **Auth & Users** | `profiles`, `user_roles`, `user_invitations`, `admin_whitelist`, `user_sessions`, `login_history` | User identity, roles, sessions |
| **Sales** | `enquiries`, `enquiry_items`, `pipeline_orders`, `lead_tags`, `campaign_spend` | Lead management, pipeline, Google Ads attribution |
| **Orders** | `orders`, `order_items`, `order_procurement_links` | Order lifecycle |
| **Procurement** | `inventory_procurements`, `procurement_payment_requests`, `supplier_quotations` | Purchase management |
| **Inventory** | `inventory`, `inventory_transactions` | Stock tracking |
| **Suppliers** | `suppliers`, `supplier_ratings`, `supplier_payments` | Supplier management |
| **Billing** | `quotes`, `invoices`, `invoice_items`, `invoice_payments` | Quotations and invoicing |
| **Finance** | `expenses`, `expected_payments`, `petty_cash_transactions`, `payment_records` | Financial tracking |
| **HR** | `employees`, `employees_directory` (safe view), `attendance_logs`, `leave_requests`, `employee_kpis`, `employee_assets` | Employee management |
| **Payroll** | `salary_sheets`, `salary_sheet_entries`, `employee_payslips`, `payroll_payment_status` | Payroll lifecycle |
| **Recruitment** | `candidates`, `candidate_documents`, `interview_records` | Hiring pipeline |
| **Tasks** | `tasks` | Task management |
| **Meetings** | `meetings` | Calendar and scheduling |
| **Tickets** | `tickets`, `ticket_comments` | IT support |
| **Forms** | `forms`, `form_fields`, `form_submissions` | Custom form builder |
| **Shopify** | `shopify_orders`, `shopify_orders_raw` | E-commerce sync |
| **AI** | `ai_chats`, `ai_messages`, `ai_access_logs`, `ai_scoring_logs`, `ai_policies` | AI assistant and governance |
| **Audit** | `security_audit_log`, `edit_history`, `user_activity_logs`, `domain_events` | Compliance logging |

---

## Edge Functions

18 deployed edge functions. See [EDGE_FUNCTIONS.md](Features/EDGE_FUNCTIONS.md) for detailed documentation.

| Function | Purpose | Auth |
|----------|---------|------|
| `ai-lead-scoring` | AI-powered lead analysis (score 1–10, talking points, risk factors) | JWT |
| `ai-sales-assistant` | Conversational AI for product/pricing queries | JWT |
| `ai-sales-report` | Automated daily/weekly sales reports to Slack | Cron secret |
| `approve-invitation` | Transactional user invitation approval | JWT |
| `attendance-nudge` | Scheduled attendance reminders | Cron secret |
| `auto-checkout` | Automatic checkout after configurable hours | Cron secret |
| `demand-forecast` | Inventory demand forecasting | JWT |
| `low-stock-alerts` | Low stock level notifications | Cron secret |
| `payment-risk-scoring` | Customer payment risk analysis | JWT |
| `send-order-notification` | Email notifications for order events | JWT |
| `send-slack-notification` | Slack channel notifications | JWT |
| `send-ticket-email` | Email notifications for IT tickets | JWT |
| `shopify-config` | Shopify credential validation and health check | JWT |
| `shopify-monitor` | Shopify integration health monitoring | JWT |
| `shopify-order-backfill` | Cursor-based historical order backfill | JWT |
| `shopify-order-processor` | Batch processes raw Shopify orders | Cron secret |
| `shopify-webhook` | Receives HMAC-verified Shopify order webhooks | HMAC |
| `google-ads-sync` | Syncs Google Ads Lead Form submissions, parses fields, attributes to campaigns | JWT |

---

## Automation & Triggers

### Database Triggers (30+)

| Category | Examples |
|----------|----------|
| **Auto-numbering** | Orders (`ORD`), repairs, procurements, quotes, invoices, tickets, trainings |
| **Task creation** | Sales follow-up on enquiry, supplier validation on response, hot lead priority tasks, meeting reminders |
| **Stock management** | Auto-adjust inventory on transaction insert/delete |
| **Procurement** | Auto-create procurement record when order is created |
| **Gamification** | Award points on order creation, delivery, pipeline entry, testimonial |
| **Notifications** | In-app alerts for hot leads, lead temperature upgrades |
| **Conversion tracking** | Mark enquiry as converted when linked order is created, propagate campaign_id |
| **Invoice security** | Prevent edit/delete of signed invoices, log signing events |
| **Validation** | Form submission validation against field schema |
| **HR automation** | Calculate working hours, create employee on profile approval, calculate ticket SLA |
| **Payment sync** | Auto-update order payment status when payment records change |

### Scheduled Jobs (pg_cron)

| Job | Schedule | Purpose |
|-----|----------|---------|
| Shopify order processor | Every 2 minutes | Processes raw webhook data into structured orders |
| Auto-checkout | Configurable | Checks out employees after max hours |
| Attendance nudge | Configurable | Reminds employees about missing check-in/checkout |
| Daily sales report | 9:00 PM IST daily | AI-generated sales insights to Slack |
| Weekly sales report | 9:00 PM IST Sunday | Weekly performance summary to Slack |

---

## Storage Buckets

| Bucket | Purpose | Access |
|--------|---------|--------|
| `payslips` | Generated employee payslip PDFs | HR + Admin |
| `payroll_transfers` | Bank transfer files | Finance + Admin |
| `invoices` | Invoice PDFs and attachments | Finance + Admin |
| `signatures` | Admin digital signatures | Admin only |
| `payment-screenshots` | Payment proof uploads | Finance + Admin |
| `avatars` | Employee profile photos | User's own |
| `training-pictures` | Training documentation | HR + Admin |
| `ticket-attachments` | IT ticket file attachments | Assigned + IT + Admin |
| `form-attachments` | Custom form file uploads | Authenticated users |
| `hr-documents` | HR document storage | Per-share permissions |
| `candidate-documents` | Recruitment documents | HR + Admin |

All buckets are **private by default**. Access enforced via RLS policies. File validation includes MIME type whitelists, size limits (2–20MB), and path traversal protection.

---

## Payroll Lifecycle

```
Attendance Data (daily check-in/out)
       ↓
Leave Calculation (deductions computed)
       ↓
Salary Sheet Creation (auto-populated from employee data)
  ↳ Mid-month pro-ration if salary changed mid-month
       ↓
HR Approval (HR reviews and submits)
       ↓
Finance Approval (Finance verifies)
       ↓
Sheet Locked (finalized, no further edits)
       ↓
Payslip Generation (PDF per employee)
       ↓
Bank Transfer File Generation (NEFT CSV)
       ↓
Upload to Bank Portal (manual)
       ↓
Payroll Reconciliation (bank statement import, status tracking)
```

See [PAYROLL_MODULE.md](Features/PAYROLL_MODULE.md) for detailed documentation.

---

## Business Impact

| Area | Impact |
|------|--------|
| **Lead Attribution** | Every Google Ads rupee traced to revenue — ROAS calculated per campaign, per salesperson |
| **Revenue Leakage** | Automated detection of high-spend / zero-conversion campaigns. AI recommends pause/scale actions. |
| **Payroll Automation** | Entire salary lifecycle from attendance to bank file — eliminates manual calculation errors |
| **Operational Visibility** | Single dashboard replaces spreadsheets across Sales, HR, Finance, and Supply Chain |
| **Data Integrity** | Database triggers + RLS ensure no bypassing of business rules, regardless of how data is accessed |
| **Audit Trail** | Every sensitive action logged — role changes, salary modifications, invoice signing, payment approvals |
| **Tool Consolidation** | Replaces separate CRM, HRMS, inventory tracker, invoicing tool, and ticketing system |

---

## Local Development

### Prerequisites

- Node.js 18+
- npm or bun

### Setup

```bash
# Clone repository
git clone <repo-url>
cd xboom-workflow

# Install dependencies
npm install

# Run development server
npm run dev
```

### Environment Variables

The following are auto-configured by Lovable Cloud:

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Backend API URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client-side API key |
| `VITE_SUPABASE_PROJECT_ID` | Project identifier |

See [LOCAL_SETUP.md](Features/LOCAL_SETUP.md) for detailed instructions.

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [PAYROLL_MODULE.md](Features/PAYROLL_MODULE.md) | Complete payroll system documentation |
| [HR_OPERATIONS.md](Features/HR_OPERATIONS.md) | HR operations guide |
| [EDGE_FUNCTIONS.md](Features/EDGE_FUNCTIONS.md) | Edge function reference |
| [DATABASE_SCHEMA.md](Features/DATABASE_SCHEMA.md) | Database schema overview |
| [LOCAL_SETUP.md](Features/LOCAL_SETUP.md) | Local development setup |
| [SECURITY_ARCHITECTURE.md](Features/SECURITY_ARCHITECTURE.md) | Security architecture |
| [IDENTITY_AND_ACCESS_MANAGEMENT.md](Features/IDENTITY_AND_ACCESS_MANAGEMENT.md) | IAM documentation |
| [SHOPIFY_SECURITY.md](SHOPIFY_SECURITY.md) | Shopify credential security |
| [SHOPIFY_WEBHOOK_SETUP.md](SHOPIFY_WEBHOOK_SETUP.md) | Webhook setup guide |

---

## Future Roadmap

### Phase 1: Operational Excellence *(Current)*
- [x] Google Ads lead sync and ROI dashboard
- [x] AI-powered campaign decision engine
- [x] Conversion tracking with revenue attribution
- [x] Automated payroll with mid-month pro-ration
- [x] Slack sales reporting automation
- [ ] Company operations dashboard (executive overview)
- [ ] Payroll analytics and department cost reports

### Phase 2: Automation
- [ ] WhatsApp lead capture integration
- [ ] Automated follow-up sequences (email/WhatsApp)
- [ ] Bank feed integration for payment reconciliation
- [ ] Multi-warehouse inventory tracking
- [ ] Marketing campaign management

### Phase 3: Intelligence Layer
- [ ] Advanced demand forecasting with ML calibration
- [ ] Customer lifetime value modeling
- [ ] AI-driven revenue optimization recommendations
- [ ] Predictive cashflow analysis
- [ ] Customer self-service portal
- [ ] Multi-currency support

> Each phase is validated and stabilized before the next begins. See [Development Roadmap](Features/) for detailed sub-phase planning.

---

## Contribution Guidelines

### Code Style

- TypeScript strict mode — no `any` types without justification
- Tailwind CSS with semantic design tokens — no hardcoded colors
- shadcn/ui components with proper variants
- React Query for all server state
- Small, focused components (< 300 lines)

### Pull Requests

- Clear description of what changed and why
- Link related issues
- Include screenshots for UI changes
- Ensure all existing functionality still works

### Commit Messages

```
feat: add payroll reconciliation dashboard
fix: correct attendance deduction calculation
docs: update payroll module documentation
refactor: extract payment status component
```

Use conventional commit format: `type: description`

---

*Last updated: 2026-03-30 | Source: XBoom Workflow codebase*
