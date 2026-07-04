import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ZOHO_ACCOUNTS_BASE = "https://accounts.zoho.com";

type ZohoToken = {
  provider: string;
  access_token: string;
  refresh_token: string;
  api_domain: string;
  organization_id: string | null;
  expires_at: string;
};

async function getValidToken(supabase: any): Promise<ZohoToken> {
  const { data, error } = await supabase
    .from("zoho_tokens")
    .select("*")
    .eq("provider", "zoho_books")
    .maybeSingle();
  if (error || !data) throw new Error("Zoho Books not connected");
  const token = data as ZohoToken;
  if (new Date(token.expires_at).getTime() > Date.now() + 30_000) return token;

  const clientId = Deno.env.get("ZOHO_CLIENT_ID")!;
  const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET")!;
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const resp = await fetch(`${ZOHO_ACCOUNTS_BASE}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const tokenData = await resp.json();
  if (!resp.ok || tokenData.error) {
    throw new Error(`Token refresh failed: ${tokenData.error || resp.status}`);
  }
  const newAccess = tokenData.access_token;
  const expiresIn = tokenData.expires_in ?? 3600;
  const newExpires = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();
  await supabase
    .from("zoho_tokens")
    .update({
      access_token: newAccess,
      expires_at: newExpires,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "zoho_books");
  return { ...token, access_token: newAccess, expires_at: newExpires };
}

function extractInvoiceId(payload: any): string | null {
  if (!payload) return null;
  // Zoho workflow custom payloads let you send `${invoice.invoice_id}` in a
  // top-level field like { "invoice_id": "..." }. Native payloads embed the
  // invoice object as `data.invoice` or `invoice`.
  return (
    payload.invoice_id ||
    payload.invoiceId ||
    payload?.data?.invoice?.invoice_id ||
    payload?.invoice?.invoice_id ||
    payload?.JSONString?.invoice_id ||
    null
  );
}

function isDelete(payload: any): boolean {
  const event = String(
    payload?.event_type || payload?.eventType || payload?.event || "",
  ).toLowerCase();
  return event.includes("delete") || event.includes("void") || !!payload?.deleted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const expectedSecret = Deno.env.get("ZOHO_WEBHOOK_SECRET");
    if (!expectedSecret) throw new Error("ZOHO_WEBHOOK_SECRET not configured");

    // Accept the shared secret either as a custom header or as a `?secret=` query
    // param — some Zoho workflow rules only allow query params.
    const url = new URL(req.url);
    const providedSecret =
      req.headers.get("x-webhook-secret") ||
      req.headers.get("X-Webhook-Secret") ||
      url.searchParams.get("secret");
    if (providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    let payload: any = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      payload = {};
    }

    // Zoho workflows can also pass invoice_id as query param.
    const invoiceId = extractInvoiceId(payload) || url.searchParams.get("invoice_id");
    if (!invoiceId) {
      await supabase.from("zoho_sync_log").insert({
        provider: "zoho_books",
        entity: "invoice_webhook",
        status: "error",
        error_message: `No invoice_id in payload: ${rawBody.slice(0, 300)}`,
        completed_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ ok: false, error: "invoice_id missing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle void/delete events — mark the cached row as deleted so tally
    // reconciliation doesn't keep counting it.
    if (isDelete(payload)) {
      await supabase
        .from("zoho_books_invoices")
        .update({ status: "deleted", synced_at: new Date().toISOString() })
        .eq("invoice_id", invoiceId);
      await supabase.from("zoho_sync_log").insert({
        provider: "zoho_books",
        entity: "invoice_webhook",
        status: "success",
        records_synced: 1,
        error_message: `deleted:${invoiceId}`,
        completed_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ ok: true, deleted: invoiceId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getValidToken(supabase);
    if (!token.organization_id) throw new Error("No Zoho organization_id stored");

    // Fetch the full invoice detail (1 API call).
    const detailResp = await fetch(
      `${token.api_domain}/books/v3/invoices/${invoiceId}` +
        `?organization_id=${encodeURIComponent(token.organization_id)}`,
      { headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` } },
    );
    const detailJson = await detailResp.json();
    if (!detailResp.ok) {
      const isRateLimited = detailResp.status === 429 || detailJson?.code === 45;
      await supabase.from("zoho_sync_log").insert({
        provider: "zoho_books",
        entity: "invoice_webhook",
        status: isRateLimited ? "rate_limited" : "error",
        error_message: (detailJson?.message || `HTTP ${detailResp.status}`).slice(0, 500),
        completed_at: new Date().toISOString(),
      });
      // Return 200 for rate limit so Zoho doesn't disable the webhook after
      // repeated failures; return 502 for other upstream errors so Zoho retries.
      return new Response(
        JSON.stringify({ ok: false, rate_limited: isRateLimited, invoice_id: invoiceId }),
        {
          status: isRateLimited ? 200 : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const inv = detailJson?.invoice;
    if (!inv) throw new Error("Zoho response missing invoice object");

    const row = {
      invoice_id: inv.invoice_id,
      organization_id: token.organization_id,
      invoice_number: inv.invoice_number ?? null,
      customer_id: inv.customer_id ?? null,
      customer_name: inv.customer_name ?? null,
      status: inv.status ?? null,
      date: inv.date ?? null,
      due_date: inv.due_date ?? null,
      currency_code: inv.currency_code ?? null,
      total: inv.total ?? null,
      balance: inv.balance ?? null,
      reference_number: inv.reference_number ?? null,
      created_time: inv.created_time ?? null,
      last_modified_time: inv.last_modified_time ?? null,
      raw: inv,
      synced_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabase
      .from("zoho_books_invoices")
      .upsert(row, { onConflict: "invoice_id" });
    if (upErr) throw upErr;

    // Try to auto-match to an internal order (exact match only).
    try {
      await supabase.rpc("match_zoho_invoices_to_orders");
    } catch (mErr) {
      console.error("auto-match error:", mErr);
    }

    await supabase.from("zoho_sync_log").insert({
      provider: "zoho_books",
      entity: "invoice_webhook",
      status: "success",
      records_synced: 1,
      completed_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ ok: true, invoice_id: invoiceId, invoice_number: inv.invoice_number }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("zoho-books-webhook error:", e);
    await supabase.from("zoho_sync_log").insert({
      provider: "zoho_books",
      entity: "invoice_webhook",
      status: "error",
      error_message: String(e).slice(0, 1000),
      completed_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});