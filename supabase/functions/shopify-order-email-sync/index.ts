// Recover Shopify customer details from the order-notification emails.
//
// Shopify only exposes customer PII over the Admin API on the Shopify, Advanced
// and Plus plans. On lower plans every webhook and API read arrives with name,
// email, phone, street, city and zip stripped. The "New order" notification
// Shopify emails the merchant is not subject to that restriction — it is sent to
// the store owner, not served over the API — so it still carries the customer
// block in full.
//
// This reads those emails from the shared support inbox and fills the gaps on
// shopify_orders. It complements the CSV importer: the CSV repairs history in
// bulk, this keeps new orders current without anyone remembering to export.
//
// Extraction is done by Claude rather than regex on purpose. Shopify's
// notification template is merchant-editable and changes between themes and
// locales; a regex tuned to today's markup silently returns nothing after the
// next change, whereas a model reading the text keeps working.

import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptToken, encryptToken } from "../_shared/token-encryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// The inbox Shopify sends order notifications to.
const DEFAULT_MAILBOX = "support@xboom.in";

// Shopify sends from @shopify.com; the subject carries the order name.
const GMAIL_QUERY_DAYS = 3;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "n/a") return null;
  return s;
};

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        // GMAIL_*, not GOOGLE_* — matches gmail-oauth-callback and
        // gmail-lead-sync, which own these credentials.
        client_id: Deno.env.get("GMAIL_CLIENT_ID") ?? "",
        client_secret: Deno.env.get("GMAIL_CLIENT_SECRET") ?? "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      console.error("[shopify-order-email-sync] token refresh failed", res.status);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error("[shopify-order-email-sync] token refresh threw", e);
    return null;
  }
}

/** Gmail returns base64url; body parts are nested arbitrarily deep. */
function decodeB64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
    );
  } catch {
    return "";
  }
}

function extractBody(payload: Record<string, unknown>): string {
  const parts = payload?.parts as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(parts)) {
    // Prefer text/plain — far less noise for the model than the HTML template.
    const plain = parts.find((p) => p.mimeType === "text/plain");
    if (plain) return extractBody(plain);
    const html = parts.find((p) => p.mimeType === "text/html");
    if (html) return extractBody(html);
    return parts.map((p) => extractBody(p)).join("\n");
  }
  const body = payload?.body as Record<string, unknown> | undefined;
  const data = body?.data as string | undefined;
  return data ? decodeB64Url(data) : "";
}

/** Strip tags so an HTML-only notification does not blow the token budget. */
function toText(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 12000);
}

interface Extracted {
  order_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: string | null;
  billing_address: string | null;
}

async function extractWithClaude(text: string): Promise<Extracted | null> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      // Haiku 4.5 is accurate on this kind of bounded field extraction and
      // cheap enough to run on every order notification. Move to
      // claude-sonnet-5 if address parsing proves unreliable on your template.
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system:
        "You extract order details from Shopify merchant notification emails. " +
        "Reply with a single JSON object and nothing else. Use null for anything " +
        "not clearly present — never guess, never invent a value, and never copy " +
        "the merchant's own address or the Shopify support address as the " +
        "customer's. Addresses must be a single line, comma separated.",
      messages: [{
        role: "user",
        content:
          "Extract from this Shopify order notification email:\n\n" +
          "{\n" +
          '  "order_number": order number without the # (string or null),\n' +
          '  "customer_name": the customer full name (string or null),\n' +
          '  "customer_email": the customer email (string or null),\n' +
          '  "customer_phone": the customer phone (string or null),\n' +
          '  "shipping_address": shipping address, one line (string or null),\n' +
          '  "billing_address": billing address, one line (string or null)\n' +
          "}\n\nEMAIL:\n" + text,
      }],
    }),
  });

  if (!res.ok) {
    console.error(
      "[shopify-order-email-sync] Anthropic error",
      res.status,
      (await res.text()).slice(0, 300),
    );
    return null;
  }

  const data = await res.json();
  const content = data?.content?.[0]?.text ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Extracted;
  } catch {
    console.error("[shopify-order-email-sync] unparseable model output");
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method === "GET") {
    return new Response("shopify-order-email-sync is live", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // --- Auth: cron secret, or an admin JWT for manual runs ---
  let authorized = false;
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedCron = Deno.env.get("CRON_SECRET");
  if (cronSecret && expectedCron && cronSecret === expectedCron) authorized = true;
  if (!authorized && cronSecret) {
    const { data: vaultSecret } = await supabase.rpc("get_cron_secret");
    if (typeof vaultSecret === "string" && vaultSecret === cronSecret) authorized = true;
  }
  const authHeader = req.headers.get("Authorization");
  if (!authorized && authHeader?.startsWith("Bearer ")) {
    const { data: claims } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    const uid = claims?.claims?.sub as string | undefined;
    if (uid) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin");
      if (roles && roles.length > 0) authorized = true;
    }
  }
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  let mailbox = DEFAULT_MAILBOX;
  let lookbackDays = GMAIL_QUERY_DAYS;
  try {
    const body = await req.clone().json();
    if (typeof body?.mailbox === "string") mailbox = body.mailbox;
    if (Number.isFinite(body?.days)) lookbackDays = Math.min(Number(body.days), 90);
  } catch { /* defaults */ }

  const { data: integration } = await supabase
    .from("gmail_integrations")
    .select("id, email, access_token, refresh_token, token_expiry")
    .eq("email", mailbox)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return json({
      error: `No active Gmail integration for ${mailbox}`,
      hint: "Connect that mailbox under Admin → Integrations first.",
    }, 404);
  }

  let accessToken = await decryptToken(integration.access_token);
  if (integration.token_expiry && new Date(integration.token_expiry) <= new Date()) {
    const refreshed = await refreshAccessToken(
      await decryptToken(integration.refresh_token),
    );
    if (!refreshed) return json({ error: "Gmail token refresh failed" }, 502);
    accessToken = refreshed.access_token;
    await supabase
      .from("gmail_integrations")
      .update({
        access_token: await encryptToken(refreshed.access_token),
        token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("id", integration.id);
  }

  const query =
    `from:shopify.com subject:"order" newer_than:${lookbackDays}d`;
  const listRes = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?q=${
      encodeURIComponent(query)
    }&maxResults=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listRes.ok) {
    return json({
      error: "Gmail list failed",
      status: listRes.status,
      detail: (await listRes.text()).slice(0, 300),
    }, 502);
  }

  const messages = (await listRes.json())?.messages ?? [];
  let examined = 0;
  let extracted = 0;
  let updated = 0;
  let unmatched = 0;
  const errors: string[] = [];

  for (const msg of messages as Array<{ id: string }>) {
    try {
      const msgRes = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!msgRes.ok) continue;
      const full = await msgRes.json();
      examined++;

      const text = toText(extractBody(full.payload ?? {}));
      if (text.length < 50) continue;

      const parsed = await extractWithClaude(text);
      if (!parsed?.order_number) continue;
      extracted++;

      const orderNumber = String(parsed.order_number).replace(/^#/, "").trim();
      const { data: existing } = await supabase
        .from("shopify_orders")
        .select(
          "id, customer_name, customer_email, customer_phone, shipping_address, " +
            "billing_address, order_number, shopify_order_id",
        )
        .eq("order_number", orderNumber)
        .limit(1);

      if (!existing || existing.length === 0) {
        unmatched++;
        continue;
      }
      const current = existing[0];

      // FILL-ONLY, same rule as the CSV importer: never overwrite a value that
      // is already there. The only replaceable value is the ingest's
      // "Shopify Order <n>" placeholder, which is by definition not a real name.
      const patch: Record<string, string> = {};
      const placeholder = !current.customer_name ||
        current.customer_name === `Shopify Order ${current.order_number}` ||
        current.customer_name === `Shopify Order ${current.shopify_order_id}`;

      const name = clean(parsed.customer_name);
      if (name && placeholder) patch.customer_name = name;

      const fill = (value: string | null, column: keyof typeof current) => {
        const incoming = clean(value);
        if (incoming && !clean(current[column] as string | null)) {
          patch[column as string] = incoming;
        }
      };
      fill(parsed.customer_email, "customer_email");
      fill(parsed.customer_phone, "customer_phone");
      fill(parsed.shipping_address, "shipping_address");
      fill(parsed.billing_address, "billing_address");

      if (Object.keys(patch).length === 0) continue;

      const { error: updateError } = await supabase
        .from("shopify_orders")
        .update(patch)
        .eq("id", current.id);
      if (updateError) {
        errors.push(`${orderNumber}: ${updateError.message}`);
        continue;
      }
      updated++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  await supabase
    .from("gmail_integrations")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", integration.id);

  const summary = {
    mailbox,
    messages_found: messages.length,
    examined,
    extracted,
    updated,
    unmatched,
    errors: errors.slice(0, 10),
  };
  console.log("[shopify-order-email-sync]", summary);
  return json({ success: true, ...summary });
});
