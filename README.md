# XBoom Workflow (XBoom OS)

> **Internal operations platform for end-to-end business management** — Sales, Inventory, Procurement, Finance, HR, Payroll, Recruitment, Ticketing, and Shopify integration in a single system.

---

## Table of Contents

1. [Overview](#overview)
2. [Core Modules](#core-modules)
3. [Key Features](#key-features)
4. [System Architecture](#system-architecture)
5. [Tech Stack](#tech-stack)
6. [Deployment Overview](#deployment-overview)
7. [Database Overview](#database-overview)
8. [Edge Functions](#edge-functions)
9. [Security Model](#security-model)
10. [Automation & Triggers](#automation--triggers)
11. [Storage Buckets](#storage-buckets)
12. [Audit Logging](#audit-logging)
13. [Payroll Lifecycle](#payroll-lifecycle)
14. [Local Development](#local-development)
15. [Related Documentation](#related-documentation)
16. [Future Roadmap](#future-roadmap)
17. [Contribution Guidelines](#contribution-guidelines)

---

## Overview

XBoom Workflow (internally **XBoom OS**) is a custom-built internal operations platform for a B2B robotics and drone equipment company. It manages the full operational lifecycle from lead capture to payment reconciliation.

### Purpose

- **Manage employee lifecycle** — onboarding, attendance, KPIs, documents, payroll
- **Automate payroll** — attendance-based deductions, approval workflow, payslip generation, bank transfer files, reconciliation
- **Streamline sales operations** — CRM, pipeline, quotations, orders, AI-powered lead scoring
- **Control supply chain** — procurement, inventory tracking, supplier management, import logistics
- **Provide financial oversight** — invoicing, expenses, petty cash, payment tracking, cashflow analysis
- **Enable internal collaboration** — IT ticketing, meetings, tasks, notices, custom forms

### Core Business Model

- **Primary**: B2B sales of drones, robotics, safety devices, and related equipment
- **Secondary**: Buyback/resale of used drones, drone repair services (B2C public form)
- **Revenue streams**: Hardware sales, repair services, training programs, buyback-resale

### Users

| Role | Description | Limit |
|------|-------------|-------|
| **Admin** | Full system access, user management, org settings | Max 5 |
| **Sales** | Leads, enquiries, pipeline, quotations, meetings | Unlimited |
| **Supply Chain** | Procurement, suppliers, inventory, imports | Unlimited |
| **Finance** | Invoicing, expenses, payments, payroll reconciliation | Unlimited |
| **HR** | Attendance, leave, KPIs, documents, payroll, candidates | Unlimited |
| **IT** | Internal tickets, system support | Unlimited |
| **Marketing** | Campaign coordination, limited access | Unlimited |

Users can hold multiple roles simultaneously. A priority hierarchy (`Admin > HR > Finance > Supply Chain > IT > Marketing > Sales`) determines the primary role for UI rendering.

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
Complete payroll lifecycle — salary sheets with attendance-based deduction calculation, 4-stage approval workflow (Draft → HR Approved → Finance Approved → Locked), payslip PDF generation, bank transfer file generation (NEFT format), and payroll reconciliation dashboard. See [PAYROLL_MODULE.md](Features/PAYROLL_MODULE.md) for details.

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
Drag-and-drop form builder with field types (text, select, file upload, etc.). Embeddable public forms. QR code generation. Submission analytics. Per-user form permissions.

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
| Slack Integration | Automated notifications for hot leads, mega deals, escalations |
| Audit Logging | Field-level change tracking, security event logging, session tracking |
| MFA Enforcement | TOTP-based MFA mandatory for all users (AAL2 required) |

---

## System Architecture

```
┌─────────────────────────────────────────────┐
│              Lovable Cloud                  │
│                                             │
│  ┌──────────┐    ┌──────────────────────┐   │
│  │ Frontend  │    │  Backend             │   │
│  │ (Vite SPA)│───▶│                      │   │
│  │ CDN-hosted│    │  ┌─────────────────┐ │   │
│  └──────────┘    │  │ PostgreSQL 15+  │ │   │
│                   │  │ (90+ tables)    │ │   │
│                   │  │ RLS policies    │ │   │
│                   │  │ pg_cron jobs    │ │   │
│                   │  │ 30+ triggers    │ │   │
│                   │  └─────────────────┘ │   │
│                   │                      │   │
│                   │  ┌─────────────────┐ │   │
│                   │  │ Edge Functions  │ │   │
│                   │  │ (17 functions)  │ │   │
│                   │  └─────────────────┘ │   │
│                   │                      │   │
│                   │  ┌─────────────────┐ │   │
│                   │  │ Storage Buckets │ │   │
│                   │  │ (private + RLS) │ │   │
│                   │  └─────────────────┘ │   │
│                   └──────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │ External Integrations               │   │
│  │  • Google Ads (Lead Sync + ROI)     │   │
│  │  • Shopify (webhook + backfill)     │   │
│  │  • Slack (notifications)            │   │
│  │  • Lovable AI Gateway (LLM calls)   │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

For detailed security architecture, see [SECURITY_ARCHITECTURE.md](Features/SECURITY_ARCHITECTURE.md).

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

### Security

| Feature | Implementation |
|---------|---------------|
| RBAC | 7-role model via `user_roles` table + `has_role()` security definer |
| MFA | Universal TOTP enforcement (AAL2 required) |
| RLS | Enabled on all tables with role-based policies |
| Audit Logging | `security_audit_log`, `edit_history`, `user_activity_logs` |
| Session Policy | 12h idle timeout, 5-day absolute timeout |
| Webhook Security | HMAC-SHA256 with timing-safe comparison |

---

## Deployment Overview

| Layer | Details |
|-------|---------|
| **Frontend** | React SPA hosted on Lovable platform (CDN) |
| **Backend** | Lovable Cloud (PostgreSQL + Edge Functions + Storage) |
| **Database Migrations** | Stored in `supabase/migrations/` — applied automatically |
| **Edge Functions** | Deployed automatically from `supabase/functions/` |
| **Storage** | Private buckets for payslips, invoices, signatures, attachments |
| **External APIs** | Shopify Admin API, Google Ads API v23, Slack (OAuth connector), Lovable AI Gateway |

---

## Database Overview

**90+ tables** organized by domain. See [DATABASE_SCHEMA.md](Features/DATABASE_SCHEMA.md) for full overview.

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
| **HR** | `employees`, `attendance_logs`, `leave_requests`, `employee_kpis`, `employee_assets` | Employee management |
| **Payroll** | `salary_sheets`, `salary_sheet_entries`, `employee_payslips`, `payroll_payment_status` | Payroll lifecycle |
| **Recruitment** | `candidates`, `candidate_documents`, `interview_records` | Hiring pipeline |
| **Tasks** | `tasks` | Task management |
| **Meetings** | `meetings` | Calendar and scheduling |
| **Tickets** | `tickets`, `ticket_comments` | IT support |
| **Forms** | `forms`, `form_fields`, `form_submissions` | Custom form builder |
| **Shopify** | `shopify_orders`, `shopify_orders_raw` | E-commerce sync |
| **Audit** | `security_audit_log`, `edit_history`, `user_activity_logs` | Compliance logging |

---

## Edge Functions

18 deployed edge functions. See [EDGE_FUNCTIONS.md](Features/EDGE_FUNCTIONS.md) for detailed documentation.

| Function | Purpose |
|----------|---------|
| `ai-lead-scoring` | AI-powered lead analysis (score 1–10, talking points, risk factors) |
| `ai-sales-assistant` | Conversational AI for product/pricing queries |
| `approve-invitation` | Transactional user invitation approval |
| `attendance-nudge` | Scheduled attendance reminders |
| `auto-checkout` | Automatic checkout after configurable hours |
| `demand-forecast` | Inventory demand forecasting |
| `low-stock-alerts` | Low stock level notifications |
| `payment-risk-scoring` | Customer payment risk analysis |
| `send-order-notification` | Email notifications for order events |
| `send-slack-notification` | Slack channel notifications |
| `send-ticket-email` | Email notifications for IT tickets |
| `shopify-config` | Shopify credential validation and health check |
| `shopify-monitor` | Shopify integration health monitoring |
| `shopify-order-backfill` | Cursor-based historical order backfill |
| `shopify-order-processor` | Batch processes raw Shopify orders |
| `shopify-webhook` | Receives HMAC-verified Shopify order webhooks |
| `google-ads-sync` | Syncs Google Ads Lead Form submissions, parses fields, attributes to campaigns |
| `upload-form-attachment` | File uploads for custom form submissions |

---

## Security Model

XBoom Workflow follows a **6-layer security architecture** (Network → Authentication → Authorization → API → Data Protection → Monitoring).

### Key Security Features

- **RBAC**: 7 roles stored in `user_roles` table, checked via `has_role()` security definer function
- **MFA**: Universal TOTP enforcement — all users must complete AAL2 verification before accessing the application
- **Session Policy**: 12-hour idle timeout, 5-day absolute timeout, device fingerprinting
- **RLS**: Row-Level Security on all tables with `is_user_approved()` checks
- **Admin Controls**: Whitelist-based registration, max 5 admin cap, re-auth for sensitive operations
- **Webhook HMAC**: Timing-safe HMAC-SHA256 verification for Shopify webhooks
- **Immutable Records**: Signed invoices protected by database triggers
- **Private Storage**: All file buckets are private with role-based RLS policies

### Related Security Documents

- [SECURITY_ARCHITECTURE.md](Features/SECURITY_ARCHITECTURE.md) — 6-layer security model, shared responsibility, audit findings
- [IDENTITY_AND_ACCESS_MANAGEMENT.md](Features/IDENTITY_AND_ACCESS_MANAGEMENT.md) — Authentication, RBAC, session policy, MFA, access control matrix
- [SHOPIFY_SECURITY.md](SHOPIFY_SECURITY.md) — Shopify credential management, HMAC verification
- [SHOPIFY_WEBHOOK_SETUP.md](SHOPIFY_WEBHOOK_SETUP.md) — Webhook registration, testing, security notes

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
| **Conversion tracking** | Mark enquiry as converted when linked order is created, update campaign performance |
| **Invoice security** | Prevent edit/delete of signed invoices, log signing events |
| **Validation** | Form submission validation against field schema |
| **HR automation** | Calculate working hours, create employee on profile approval, calculate ticket SLA |

### Scheduled Jobs (pg_cron)

| Job | Schedule | Purpose |
|-----|----------|---------|
| Shopify order processor | Every 2 minutes | Processes raw webhook data into structured orders |
| Auto-checkout | Configurable | Checks out employees after max hours |
| Attendance nudge | Configurable | Reminds employees about missing check-in/checkout |

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

---

## Audit Logging

All security-sensitive events are recorded in `security_audit_log`. Field-level changes tracked in `edit_history`. Session activity in `user_activity_logs`.

### Key Audited Events

| Event | Trigger |
|-------|---------|
| `SALARY_SHEET_CREATED` | New salary sheet created |
| `SALARY_SHEET_LOCKED` | Sheet finalized for payment |
| `PAYSLIP_GENERATED` | Payslip PDF created |
| `BANK_TRANSFER_FILE_GENERATED` | NEFT file downloaded |
| `PAYROLL_PAYMENT_MARKED_PAID` | Payment status updated |
| `PAYROLL_RECONCILIATION_FILE_IMPORTED` | Bank statement uploaded |
| `BANK_UPDATE_REQUEST_CREATED` | Employee bank detail change request |
| `BANK_UPDATE_REQUEST_APPROVED` | Bank detail change approved |
| `ROLE_ASSIGNED` / `ROLE_REMOVED` | User role changes |
| `USER_APPROVED` | New user approved by admin |
| `MFA_ENABLED` / `MFA_DISABLED` | MFA status changes |
| `SESSION_IDLE_TIMEOUT` / `SESSION_ABSOLUTE_TIMEOUT` | Session expirations |
| `PASSWORD_CHANGED` | Password updates |
| `INVOICE_SIGNED` | Invoice digitally signed |

---

## Payroll Lifecycle

Complete end-to-end payroll flow managed within the system:

```
Attendance Data (daily check-in/out)
       ↓
Leave Calculation (deductions computed)
       ↓
Salary Sheet Creation (auto-populated from employee data)
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

- [x] Google Ads lead sync and ROI dashboard
- [x] AI-powered campaign decision engine
- [x] Conversion tracking with revenue attribution
- [ ] Company operations dashboard (executive overview)
- [ ] Payroll analytics and department cost reports
- [ ] Multi-warehouse inventory tracking
- [ ] WhatsApp / email integration for lead capture
- [ ] Customer self-service portal
- [ ] Automated follow-up sequences
- [ ] Bank feed integration for payment reconciliation
- [ ] Multi-currency support
- [ ] Marketing campaign management
- [ ] Advanced demand forecasting with ML

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
