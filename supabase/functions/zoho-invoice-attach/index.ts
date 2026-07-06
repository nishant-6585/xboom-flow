import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
  const td = await resp.json();
  if (!resp.ok || td.error) throw new Error(`Token refresh failed: ${td.error || resp.status}`);
  const newAccess = td.access_token;
  const expiresIn = td.expires_in ?? 3600;
  const newExpires = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();
  await supabase.from("zoho_tokens").update({
    access_token: newAccess, expires_at: newExpires, updated_at: new Date().toISOString(),
  }).eq("provider", "zoho_books");
  return { ...token, access_token: newAccess, expires_at: newExpires };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData, error: userErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
    const ok = roles?.some((r: { role: string }) => ["admin", "finance"].includes(r.role));
    if (!ok) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const zohoInvoiceId: string = body?.zoho_invoice_id;
    const orderId: string = body?.order_id;
    if (!zohoInvoiceId || !orderId) {
      return new Response(JSON.stringify({ error: "zoho_invoice_id and order_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update the link + match_status via SECURITY DEFINER RPC (enforces role again)
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { error: attErr } = await userClient.rpc("attach_zoho_invoice_to_order", {
      p_zoho_invoice_id: zohoInvoiceId, p_order_id: orderId,
    });
    if (attErr) throw attErr;

    // Load invoice + fetch PDF
    const { data: mirror } = await admin
      .from("zoho_books_invoices")
      .select("invoice_id, invoice_number, total, balance")
      .eq("invoice_id", zohoInvoiceId)
      .maybeSingle();
    if (!mirror) throw new Error("Zoho invoice mirror row missing");

    const token = await getValidToken(admin);
    if (!token.organization_id) throw new Error("No Zoho organization_id stored");
    const pdfUrl =
      `${token.api_domain}/books/v3/invoices/${encodeURIComponent(zohoInvoiceId)}` +
      `?organization_id=${encodeURIComponent(token.organization_id)}&accept=pdf`;
    const pdfResp = await fetch(pdfUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` },
    });
    if (!pdfResp.ok) throw new Error(`Zoho PDF fetch failed (${pdfResp.status})`);
    const pdfBuf = await pdfResp.arrayBuffer();

    const invNum = mirror.invoice_number || zohoInvoiceId;
    const storagePath = `zoho/${orderId}/${zohoInvoiceId}.pdf`;
    const { error: upErr } = await admin.storage
      .from("invoices")
      .upload(storagePath, new Uint8Array(pdfBuf), {
        contentType: "application/pdf", upsert: true,
      });
    if (upErr) throw upErr;

    const payload = {
      order_id: orderId,
      storage_path: storagePath,
      invoice_number: invNum,
      file_name: `${invNum}.pdf`,
      source: "zoho",
      document_type: "tax_invoice",
      total: Number(mirror.total || 0),
      amount_paid: Number(mirror.total || 0) - Number(mirror.balance || 0),
      zoho_invoice_id: zohoInvoiceId,
    } as Record<string, unknown>;

    // Prefer adopting an existing zoho-keyed row; else a manual/legacy row for the
    // same (order_id, invoice_number) with NULL zoho_invoice_id; else insert fresh.
    // Avoids spawning duplicate order_invoices rows because the unique index on
    // zoho_invoice_id treats NULLs as distinct.
    let oiId: string | null = null;
    const { data: existingByZoho } = await admin
      .from("order_invoices")
      .select("id")
      .eq("zoho_invoice_id", zohoInvoiceId)
      .maybeSingle();
    if (existingByZoho?.id) {
      const { error } = await admin.from("order_invoices").update(payload).eq("id", existingByZoho.id);
      if (error) throw error;
      oiId = existingByZoho.id;
    } else {
      const { data: manualRow } = await admin
        .from("order_invoices")
        .select("id")
        .eq("order_id", orderId)
        .eq("invoice_number", invNum)
        .is("zoho_invoice_id", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (manualRow?.id) {
        const { error } = await admin.from("order_invoices").update(payload).eq("id", manualRow.id);
        if (error) throw error;
        oiId = manualRow.id;
      } else {
        const { data: inserted, error } = await admin
          .from("order_invoices")
          .insert(payload)
          .select("id")
          .maybeSingle();
        if (error || !inserted) throw error || new Error("order_invoices insert failed");
        oiId = inserted.id;
      }
    }
    const oi = { id: oiId as string };

    // Digest / hash for consistency
    const digest = await crypto.subtle.digest("SHA-256", pdfBuf);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    await admin.from("zoho_books_invoices").update({
      pdf_attached_invoice_id: oi.id,
      pdf_hash: hex,
      pdf_synced_at: new Date().toISOString(),
    }).eq("invoice_id", zohoInvoiceId);

    // Fire email (manual mode so it always sends; internal function dedupes on 'sent')
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-invoice-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ invoice_id: oi.id, mode: "auto" }),
      });
    } catch (_) { /* non-blocking */ }

    return new Response(JSON.stringify({ ok: true, order_invoice_id: oi.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("zoho-invoice-attach error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});