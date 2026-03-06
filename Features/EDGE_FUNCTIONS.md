# XBoom Workflow — Edge Functions Reference

> Documentation for all 17 deployed edge functions.

---

## Overview

Edge functions run on the Deno runtime and are auto-deployed from `supabase/functions/`. They handle operations that require server-side logic, external API calls, or service-role database access.

---

## Function Reference

### ai-lead-scoring

| Property | Value |
|----------|-------|
| **Purpose** | AI-powered lead analysis — generates a 1–10 score with talking points, risk factors, and recommended approach |
| **Trigger** | On-demand via frontend (per enquiry) |
| **Input** | JSON body with enquiry details (customer, product, quantity, urgency, temperature) |
| **Output** | Score (1–10), confidence level, key factors, suggested approach, priority actions, talking points, risk factors, timeline |
| **Security** | JWT required (authenticated users only) |
| **AI Model** | Google Gemini 3 Flash via Lovable AI Gateway |
| **JWT Verification** | Disabled in config (validates internally) |

---

### ai-sales-assistant

| Property | Value |
|----------|-------|
| **Purpose** | Conversational AI chatbot for product/pricing queries |
| **Trigger** | On-demand via frontend chat interface |
| **Input** | JSON body with user message, conversation history, user role |
| **Output** | AI-generated response about products, pricing, availability |
| **Security** | JWT required; cost-price data restricted to admin/supply_chain roles (server-side enforced) |
| **AI Model** | Google Gemini 3 Flash via Lovable AI Gateway |

---

### approve-invitation

| Property | Value |
|----------|-------|
| **Purpose** | Transactional user invitation approval — creates auth user, profile, employee record, and role in a single atomic operation |
| **Trigger** | Admin invites a user via the admin panel |
| **Input** | Invitation details (email, name, role, department) |
| **Output** | Success/failure with created user details |
| **Security** | JWT required (admin only); uses service role for auth user creation |
| **Atomicity** | Full rollback on any step failure |

---

### attendance-nudge

| Property | Value |
|----------|-------|
| **Purpose** | Sends attendance reminders to employees who haven't checked in or checked out |
| **Trigger** | Scheduled via pg_cron |
| **Input** | None (reads attendance policy settings and current logs) |
| **Output** | Notification records created |
| **Security** | No JWT verification (cron-triggered) |

---

### auto-checkout

| Property | Value |
|----------|-------|
| **Purpose** | Automatically checks out employees after configurable maximum hours |
| **Trigger** | Scheduled via pg_cron |
| **Input** | None (reads attendance policy settings) |
| **Output** | Updated attendance logs with auto-checkout flag |
| **Security** | No JWT verification (cron-triggered) |

---

### demand-forecast

| Property | Value |
|----------|-------|
| **Purpose** | Generates inventory demand forecasts based on historical consumption data |
| **Trigger** | On-demand or scheduled |
| **Input** | Product ID or batch processing parameters |
| **Output** | Predicted daily demand, confidence level, days to stockout, recommended reorder quantity |
| **Security** | JWT required |

---

### low-stock-alerts

| Property | Value |
|----------|-------|
| **Purpose** | Checks inventory levels and sends notifications for products below threshold |
| **Trigger** | Scheduled or on-demand |
| **Input** | None (reads inventory table) |
| **Output** | Alert notifications for low-stock items |
| **Security** | No JWT verification (cron-triggered) |

---

### payment-risk-scoring

| Property | Value |
|----------|-------|
| **Purpose** | Analyzes customer payment history to generate risk scores |
| **Trigger** | On-demand |
| **Input** | Customer/order details |
| **Output** | Risk score and risk factors |
| **Security** | JWT required |

---

### send-order-notification

| Property | Value |
|----------|-------|
| **Purpose** | Sends email notifications on order events (creation, status change) |
| **Trigger** | Called from frontend on order events |
| **Input** | Order details, notification type, recipient |
| **Output** | Email sent confirmation |
| **Security** | JWT required |

---

### send-slack-notification

| Property | Value |
|----------|-------|
| **Purpose** | Sends automated Slack notifications for hot leads, mega deals, and escalations |
| **Trigger** | Called from database triggers via pg_net or frontend |
| **Input** | Channel, message content, notification type |
| **Output** | Slack API response |
| **Security** | No JWT verification (called by triggers); uses Slack connector OAuth token |

---

### send-ticket-email

| Property | Value |
|----------|-------|
| **Purpose** | Sends email notifications for IT ticket events |
| **Trigger** | Called from frontend on ticket creation/update |
| **Input** | Ticket details, recipient, event type |
| **Output** | Email sent confirmation |
| **Security** | JWT required |

---

### shopify-config

| Property | Value |
|----------|-------|
| **Purpose** | Validates Shopify credentials and provides health-check endpoint |
| **Trigger** | On-demand (admin health check) |
| **Input** | `{ "action": "validate" }` |
| **Output** | Credential validation status with masked secrets |
| **Security** | JWT required (admin only for validation); provides HMAC utilities for other Shopify functions |

See [SHOPIFY_SECURITY.md](../SHOPIFY_SECURITY.md) for credential management details.

---

### shopify-monitor

| Property | Value |
|----------|-------|
| **Purpose** | Monitors Shopify integration health — checks pending order age, failure rates |
| **Trigger** | On-demand or scheduled |
| **Input** | None |
| **Output** | Health status (pending counts, failure rates, last processed timestamp) |
| **Security** | No JWT verification |

---

### shopify-order-backfill

| Property | Value |
|----------|-------|
| **Purpose** | Backfills historical Shopify orders using cursor-based pagination |
| **Trigger** | On-demand (admin-initiated) |
| **Input** | Optional cursor for pagination |
| **Output** | Backfilled order count, next cursor |
| **Security** | No JWT verification; uses service role + Shopify Admin API token |

---

### shopify-order-processor

| Property | Value |
|----------|-------|
| **Purpose** | Batch processes raw Shopify orders from `shopify_orders_raw` into structured `shopify_orders` |
| **Trigger** | Scheduled via pg_cron (every 2 minutes) |
| **Input** | None (reads unprocessed rows from `shopify_orders_raw`) |
| **Output** | Processed order count, inventory adjustments |
| **Security** | No JWT verification (cron-triggered); uses service role |

See [SHOPIFY_WEBHOOK_SETUP.md](../SHOPIFY_WEBHOOK_SETUP.md) for the full webhook pipeline.

---

### shopify-webhook

| Property | Value |
|----------|-------|
| **Purpose** | Receives Shopify `orders/create` webhooks and stores raw payloads |
| **Trigger** | Shopify webhook POST |
| **Input** | Raw Shopify order JSON payload |
| **Output** | `{ "status": "ok" }` |
| **Security** | HMAC-SHA256 verification (timing-safe comparison); no JWT (external webhook) |
| **Idempotency** | `ON CONFLICT (shop_domain, order_id) DO NOTHING` |

---

### upload-form-attachment

| Property | Value |
|----------|-------|
| **Purpose** | Handles file uploads for custom form submissions |
| **Trigger** | Frontend file upload in form builder |
| **Input** | FormData with `file`, `formId`, `fieldId` |
| **Output** | `{ "path": "stored/file/path" }` |
| **Security** | JWT required (validates user claims); file type validation (PDF, Word, images only); 10MB size limit |
| **Storage** | Private `form-attachments` bucket |

---

## Configuration

Edge function settings are defined in `supabase/config.toml`:

```toml
[functions.function-name]
verify_jwt = false  # or true
```

Functions with `verify_jwt = false` either handle authentication internally or are triggered by external systems (webhooks, cron jobs).

---

## Environment Variables

All edge functions have access to:

| Variable | Source |
|----------|--------|
| `SUPABASE_URL` | Auto-provided |
| `SUPABASE_ANON_KEY` | Auto-provided |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-provided |
| `SHOPIFY_STORE_DOMAIN` | Cloud secret |
| `SHOPIFY_ADMIN_API_TOKEN` | Cloud secret |
| `SHOPIFY_API_SECRET` | Cloud secret |

---

*Last updated: 2026-03-06*
