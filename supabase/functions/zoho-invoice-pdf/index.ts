import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Manual JWT verification
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Role check — same set that can view invoices in the app
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowedRoles = ["admin", "finance", "sales", "supply_chain", "manager"];
    const allowed = roles?.some((r: { role: string }) => allowedRoles.includes(r.role));
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Accept invoice_id from query or JSON body
    const url = new URL(req.url);
    let invoiceId = url.searchParams.get("invoice_id");
    let mode = url.searchParams.get("mode") || "inline"; // inline | download | url
    if (!invoiceId && (req.method === "POST")) {
      const body = await req.json().catch(() => ({}));
      invoiceId = body.invoice_id ?? null;
      mode = body.mode ?? mode;
    }
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "invoice_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Confirm the invoice exists in our mirror (and grab its number for filename)
    const { data: invRow } = await supabase
      .from("zoho_books_invoices")
      .select("invoice_id, invoice_number")
      .eq("invoice_id", invoiceId)
      .maybeSingle();
    if (!invRow) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getValidToken(supabase);
    if (!token.organization_id) throw new Error("No Zoho organization_id stored");

    const pdfUrl =
      `${token.api_domain}/books/v3/invoices/${encodeURIComponent(invoiceId)}` +
      `?organization_id=${encodeURIComponent(token.organization_id)}&accept=pdf`;

    const pdfResp = await fetch(pdfUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` },
    });

    if (!pdfResp.ok) {
      const txt = await pdfResp.text();
      return new Response(
        JSON.stringify({ error: `Zoho PDF fetch failed (${pdfResp.status})`, detail: txt.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fileName = `${invRow.invoice_number || invoiceId}.pdf`;
    const buf = await pdfResp.arrayBuffer();
    const disposition = mode === "download" ? "attachment" : "inline";
    return new Response(buf, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${fileName}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});