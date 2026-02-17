

# Secure Credential Foundation for Shopify Integration

## Overview
Create a production-ready, server-side-only credential handling layer for the upcoming Shopify integration. No Shopify API calls will be made -- this is purely the security foundation.

## What Will Be Created

### 1. Store Shopify Secrets Securely
Three secrets will be requested from you via the secure secrets manager:
- **SHOPIFY_STORE_DOMAIN** -- Your myshopify.com domain (e.g., `your-store.myshopify.com`)
- **SHOPIFY_ADMIN_API_TOKEN** -- Admin API access token (starts with `shpat_`)
- **SHOPIFY_API_SECRET** -- API secret key for webhook HMAC validation

These are stored encrypted and are only accessible from backend functions -- never exposed to the browser.

### 2. Backend Function: `shopify-config` (Edge Function)
A new backend function at `supabase/functions/shopify-config/index.ts` that serves as the central configuration module. It will:

- **Load and validate** all three credentials from environment variables at invocation time
- **Fail fast** with clear error messages if any credential is missing
- **Export helper functions** for use by future Shopify-related backend functions:
  - `getShopifyConfig()` -- returns validated credentials
  - `maskSecret(value)` -- masks tokens for safe logging (e.g., `shpat_****abcd`)
  - `validateWebhookHmac(rawBody, hmacHeader, secret)` -- validates Shopify's `X-Shopify-Hmac-Sha256` signature using HMAC-SHA256
- **Abstract the config source** behind a simple interface so a future Secret Manager (AWS/GCP/Azure) can be swapped in without changing consuming code

### 3. Webhook HMAC Validation Utility
Inside the same module, a `validateWebhookHmac` function will:
- Accept the raw request body (as a string/ArrayBuffer) and the `X-Shopify-Hmac-Sha256` header value
- Compute HMAC-SHA256 using the `SHOPIFY_API_SECRET`
- Use timing-safe comparison to prevent timing attacks
- Return `true`/`false`

### 4. Health-Check / Validation Endpoint
The `shopify-config` edge function will also serve as a health-check endpoint (POST with `action: "validate"`). Admin-only (JWT-verified), it will:
- Confirm all credentials are present
- Return masked versions of the credentials for verification
- Report readiness status

### 5. Documentation
A `SHOPIFY_SECURITY.md` file in the project root documenting:
- How credentials are configured (via Lovable Cloud secrets)
- How to rotate tokens safely
- Security best practices (never log full tokens, HMAC validation, etc.)
- Architecture of the abstraction layer

## Files Created

| File | Purpose |
|------|---------|
| `supabase/functions/shopify-config/index.ts` | Central config module with validation, masking, HMAC utilities, and health-check endpoint |
| `SHOPIFY_SECURITY.md` | Developer documentation for credential management |

## Design Decisions

- **Server-side only**: All credentials live in backend secrets and are accessed exclusively from edge functions. The frontend never sees them.
- **Single module pattern**: One shared config function that future Shopify functions (orders sync, webhooks, etc.) will call internally or import patterns from.
- **Abstracted config loader**: A `ConfigProvider` interface pattern so swapping to AWS Secrets Manager later requires changing only one function.
- **Timing-safe HMAC comparison**: Uses `crypto.subtle` and constant-time comparison to prevent side-channel attacks on webhook validation.
- **Admin-gated health check**: Only authenticated admin users can call the validation endpoint, following the existing JWT verification pattern used in other edge functions.

## Technical Details

The config module will follow the existing edge function patterns (CORS headers, JWT auth via Bearer token, Deno `serve`). The HMAC validation uses the Web Crypto API (`crypto.subtle.importKey` + `crypto.subtle.sign`) available natively in Deno, with no external dependencies.

The masking utility will show the first 5 and last 4 characters of tokens, replacing the middle with `****` (e.g., `shpat_****abcd`). For short values, it masks everything except the last 4 characters.

