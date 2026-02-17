# Shopify Integration — Security & Credential Management

## Overview

All Shopify credentials are stored server-side only via Lovable Cloud secrets. They are **never** exposed to the frontend browser.

---

## Credentials

| Secret Name | Description | Example |
|---|---|---|
| `SHOPIFY_STORE_DOMAIN` | Your myshopify.com domain | `your-store.myshopify.com` |
| `SHOPIFY_ADMIN_API_TOKEN` | Admin API access token | `shpat_xxxxxxxxxxxxxxxx` |
| `SHOPIFY_API_SECRET` | API secret for webhook HMAC validation | (from Shopify app settings) |

### How to Configure

Secrets are added through the Lovable Cloud secrets manager. They become available as environment variables in all backend functions.

### How to Rotate Tokens

1. Generate a new token in your Shopify Admin → Apps → API credentials.
2. Update the secret in Lovable Cloud secrets manager.
3. The new value takes effect on the next function invocation — no redeployment needed.
4. Verify by calling the health-check endpoint (see below).
5. Revoke the old token in Shopify Admin.

---

## Architecture

```
┌─────────────┐
│   Browser    │  ← Never sees credentials
└──────┬───────┘
       │ HTTPS (Bearer JWT)
┌──────▼───────┐
│ shopify-     │  ← Admin-only health check
│ config       │  ← Loads & validates credentials
│ (Edge Fn)    │  ← Provides masking & HMAC utils
└──────┬───────┘
       │
┌──────▼───────┐
│ Env Secrets  │  ← Encrypted at rest
│ (Cloud)      │
└──────────────┘
```

### Config Provider Abstraction

The `EnvConfigProvider` class implements a `ConfigProvider` interface. To migrate to AWS Secrets Manager, GCP Secret Manager, or Azure Key Vault:

1. Create a new class implementing `ConfigProvider`.
2. Swap the `configProvider` constant in `shopify-config/index.ts`.
3. No other code changes required.

---

## Security Best Practices

- **Never log full credentials.** Use `maskSecret()` for any logging (e.g., `shpat****0xyz`).
- **Webhook HMAC validation** uses `crypto.subtle` (Web Crypto API) with timing-safe comparison to prevent side-channel attacks.
- **Admin-gated health check** — only authenticated admin users can call the validation endpoint.
- **Fail fast** — if any credential is missing, the config loader throws immediately with a clear error message.

---

## Health-Check Endpoint

**POST** to the `shopify-config` function with a valid admin Bearer token:

```json
{ "action": "validate" }
```

**Success response (200):**
```json
{
  "status": "ready",
  "credentials": {
    "storeDomain": "your-****..com",
    "adminApiToken": "shpat****abcd",
    "apiSecret": "abc1****wxyz"
  },
  "message": "All Shopify credentials are configured and valid."
}
```

**Failure response (503):**
```json
{
  "status": "not_ready",
  "error": "Missing required Shopify credentials: SHOPIFY_ADMIN_API_TOKEN"
}
```
