# XBoom Workflow — Edge Functions (AI Context)

> Quick reference for all 17 deployed edge functions. For full details see `Features/EDGE_FUNCTIONS.md`.

---

## Function Summary

| Function | Purpose | Auth | Trigger |
|----------|---------|------|---------|
| `ai-lead-scoring` | AI lead quality analysis (1–10 score) | JWT (internal) | On-demand |
| `ai-sales-assistant` | Chat-based product/pricing assistant | JWT (internal) | On-demand |
| `approve-invitation` | Atomic user creation (auth + profile + employee + role) | JWT (admin) | Admin action |
| `attendance-nudge` | Sends check-in/check-out reminders | None (cron) | pg_cron |
| `auto-checkout` | Auto checks out after max hours | None (cron) | pg_cron |
| `demand-forecast` | Inventory demand prediction | JWT | On-demand |
| `low-stock-alerts` | Low inventory notifications | None (cron) | Scheduled |
| `payment-risk-scoring` | Customer payment risk analysis | JWT | On-demand |
| `send-order-notification` | Order event email notifications | JWT | On-demand |
| `send-slack-notification` | Slack alerts for hot leads, escalations | None (trigger) | DB trigger / frontend |
| `send-ticket-email` | IT ticket email notifications | JWT | On-demand |
| `shopify-config` | Validate Shopify credentials | JWT (admin) | On-demand |
| `shopify-monitor` | Integration health check | None | On-demand |
| `shopify-order-backfill` | Historical order import | None | Admin-initiated |
| `shopify-order-processor` | Process raw → structured orders | None (cron) | pg_cron (every 2 min) |
| `shopify-webhook` | Receive Shopify order webhooks | HMAC-SHA256 | External webhook |
| `upload-form-attachment` | File upload for custom forms | JWT | Frontend upload |

---

## Auth Categories

**JWT verified internally** (verify_jwt = false in config, but validates in code):
- `ai-lead-scoring`, `ai-sales-assistant`

**No auth** (cron-triggered or external):
- `attendance-nudge`, `auto-checkout`, `low-stock-alerts`
- `shopify-order-processor`, `shopify-order-backfill`, `shopify-monitor`
- `send-slack-notification`

**HMAC verified** (external webhook):
- `shopify-webhook` (SHA256, timing-safe comparison)

---

## AI Functions

Both use **Lovable AI Gateway** (no API key needed):
- Model: `google/gemini-3-flash-preview`
- `ai-lead-scoring`: Returns score, confidence, talking points, risk factors
- `ai-sales-assistant`: Role-aware (cost-price data restricted to admin/supply_chain)

---

## Environment Variables

All functions have access to:

| Variable | Auto-provided |
|----------|:---:|
| `SUPABASE_URL` | ✅ |
| `SUPABASE_ANON_KEY` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ |

Shopify functions additionally need:

| Variable | Source |
|----------|--------|
| `SHOPIFY_STORE_DOMAIN` | Cloud secret |
| `SHOPIFY_ADMIN_API_TOKEN` | Cloud secret |
| `SHOPIFY_API_SECRET` | Cloud secret |

*Last updated: 2026-03-06*
