# Shopify Webhook Integration — Setup & Testing Guide

## Overview

The `shopify-webhook` edge function receives Shopify `orders/create` webhooks, validates their HMAC signature, and stores the raw payload in the `shopify_orders_raw` table for downstream processing.

---

## Architecture

```
┌──────────────┐    POST + HMAC     ┌──────────────────┐
│   Shopify    │ ──────────────────▶ │  shopify-webhook  │
│   (orders/   │                    │  (Edge Function)  │
│    create)   │ ◀── 200 OK ─────── │                    │
└──────────────┘                    └────────┬───────────┘
                                             │ service_role
                                    ┌────────▼───────────┐
                                    │ shopify_orders_raw  │
                                    │ (Supabase table)    │
                                    └────────────────────┘
```

---

## Webhook Registration

### Option 1: Programmatic (recommended)

Call the registration endpoint as an authenticated admin:

```bash
curl -X POST \
  "https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/shopify-webhook?action=register" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json"
```

This registers `orders/create` pointing to:
```
https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/shopify-webhook
```

### Option 2: Manual (Shopify Admin)

1. Go to **Shopify Admin → Settings → Notifications → Webhooks**
2. Click **Create webhook**
3. Set:
   - **Event**: Order creation
   - **Format**: JSON
   - **URL**: `https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/shopify-webhook`
4. Save

---

## Testing

### Test with curl (simulated webhook)

Generate an HMAC for your test payload:

```bash
# 1. Create a test payload
PAYLOAD='{"id":123456789,"email":"test@example.com","total_price":"99.99","line_items":[]}'

# 2. Compute HMAC (replace YOUR_SHOPIFY_API_SECRET)
HMAC=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "YOUR_SHOPIFY_API_SECRET" -binary | base64)

# 3. Send the test webhook
curl -X POST \
  "https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/shopify-webhook" \
  -H "Content-Type: application/json" \
  -H "x-shopify-hmac-sha256: $HMAC" \
  -H "x-shopify-topic: orders/create" \
  -H "x-shopify-shop-domain: your-store.myshopify.com" \
  -d "$PAYLOAD"
```

**Expected response:**
```json
{ "status": "ok" }
```

### Test with invalid HMAC

```bash
curl -X POST \
  "https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/shopify-webhook" \
  -H "Content-Type: application/json" \
  -H "x-shopify-hmac-sha256: invalidhmac" \
  -H "x-shopify-topic: orders/create" \
  -d '{"id":1}'
```

**Expected response (401):**
```json
{ "error": "Invalid HMAC signature" }
```

### Health check (admin only)

```bash
curl -X GET \
  "https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/shopify-webhook?action=health" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT"
```

**Expected response:**
```json
{
  "status": "healthy",
  "checks": {
    "webhook_secret": "configured",
    "database": "connected"
  }
}
```

---

## HMAC Verification — How It Works

Shopify signs every webhook with your **API Secret** using HMAC-SHA256:

1. Shopify computes `HMAC-SHA256(raw_request_body, API_SECRET)`
2. The base64-encoded result is sent in the `X-Shopify-Hmac-Sha256` header
3. Our edge function:
   - Reads the **raw body** (before any JSON parsing) to ensure byte-exact matching
   - Computes its own HMAC using the same secret
   - Compares using **timing-safe comparison** (constant-time XOR) to prevent side-channel attacks
4. If the signatures don't match → **401 Unauthorized**

### Why raw body matters

JSON parsing and re-serialization can alter whitespace or key ordering. HMAC must be computed on the **exact bytes** Shopify sent. That's why we use `req.text()` first, validate HMAC, then `JSON.parse()`.

---

## Security Notes

- **No secrets in responses**: The webhook handler never returns credentials or full payloads
- **No full payload logging**: Only `order_id`, `email`, `total_price` are logged
- **Service role for inserts**: The edge function uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS for writes; the table has admin-only RLS for reads
- **Idempotent inserts**: `ON CONFLICT (shop_domain, order_id) DO NOTHING` prevents duplicate storage from Shopify's retry mechanism
- **`processed` flag**: Downstream processors can mark orders as processed without re-reading the full table

---

## Database Schema

```sql
CREATE TABLE public.shopify_orders_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain TEXT NOT NULL,
  order_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_domain, order_id)
);
```

**RLS**: Enabled. Admin-only SELECT policy. Edge function writes via service_role (bypasses RLS).
