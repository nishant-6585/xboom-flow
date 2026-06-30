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

  // Refresh
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  let userId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) throw new Error("Unauthorized");
    userId = userData.user.id;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = roles?.some((r: { role: string }) =>
      ["admin", "finance"].includes(r.role),
    );
    if (!allowed) throw new Error("Admin or Finance role required");

    const token = await getValidToken(supabase);
    if (!token.organization_id) throw new Error("No Zoho organization_id stored");

    // Log start
    const { data: logRow } = await supabase
      .from("zoho_sync_log")
      .insert({
        provider: "zoho_books",
        entity: "invoices",
        status: "running",
        triggered_by: userId,
      })
      .select("id")
      .single();
    const logId = logRow?.id;

    // Pull invoices (paginate)
    let page = 1;
    let totalSynced = 0;
    const perPage = 200;
    while (true) {
      const apiUrl =
        `${token.api_domain}/books/v3/invoices` +
        `?organization_id=${encodeURIComponent(token.organization_id)}` +
        `&page=${page}&per_page=${perPage}&sort_column=last_modified_time&sort_order=D`;
      const resp = await fetch(apiUrl, {
        headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` },
      });
      if (resp.status === 204) break;
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(
          `Zoho API error [${resp.status}]: ${JSON.stringify(data).slice(0, 300)}`,
        );
      }
      const invoices: any[] = data.invoices ?? [];
      if (invoices.length === 0) break;

      const rows = invoices.map((inv) => ({
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
      }));

      const { error: upErr } = await supabase
        .from("zoho_books_invoices")
        .upsert(rows, { onConflict: "invoice_id" });
      if (upErr) throw upErr;
      totalSynced += rows.length;

      const hasMore = data?.page_context?.has_more_page;
      if (!hasMore) break;
      page += 1;
      if (page > 50) break; // safety
    }

    if (logId) {
      await supabase
        .from("zoho_sync_log")
        .update({
          status: "success",
          records_synced: totalSynced,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }

    // Run the slow detail-enrichment + auto-match in the background so the
    // HTTP response returns within the client's invoke timeout (~60s). Without
    // this, the function can take 90s+ and the browser reports "Sync failed"
    // even though the server succeeded.
    const backgroundWork = (async () => {
      let detailEnriched = 0;
      try {
        const { data: missing } = await supabase
        .from("zoho_books_invoices")
        .select("invoice_id, raw")
        .is("linked_order_id", null)
        .order("last_modified_time", { ascending: false })
          .limit(500);
        const targets = (missing ?? []).filter((r: any) => {
          const raw = r.raw ?? {};
          return !raw.cf_order_id && !raw.cf_order_number;
        });
        const concurrency = 6;
        let idx = 0;
        async function worker() {
          while (idx < targets.length) {
            const my = idx++;
            const inv = targets[my];
            try {
              const detailResp = await fetch(
                `${token.api_domain}/books/v3/invoices/${inv.invoice_id}` +
                  `?organization_id=${encodeURIComponent(token.organization_id!)}`,
                { headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` } },
              );
              if (!detailResp.ok) continue;
              const detailJson = await detailResp.json();
              const fullInv = detailJson?.invoice;
              if (!fullInv) continue;
              await supabase
                .from("zoho_books_invoices")
                .update({
                  raw: fullInv,
                  reference_number: fullInv.reference_number ?? null,
                  synced_at: new Date().toISOString(),
                })
                .eq("invoice_id", inv.invoice_id);
              detailEnriched += 1;
            } catch (err) {
              console.error("detail fetch failed", inv.invoice_id, err);
            }
          }
        }
        await Promise.all(Array.from({ length: concurrency }, () => worker()));
      } catch (enrichErr) {
        console.error("detail enrichment error:", enrichErr);
      }

      // Auto-match newly synced invoices to internal orders (exact match only).
      try {
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader! } },
        });
        const { error: mErr } = await userClient.rpc("match_zoho_invoices_to_orders");
        if (mErr) throw mErr;
      } catch (mErr) {
        console.error("auto-match error:", mErr);
      }

      try {
        await supabase.from("zoho_sync_log").insert({
          provider: "zoho_books",
          entity: "invoices_enrichment",
          status: "success",
          records_synced: detailEnriched,
          completed_at: new Date().toISOString(),
          triggered_by: userId,
        });
      } catch (_) { /* ignore */ }
    })();

    // @ts-ignore - EdgeRuntime is provided by Supabase Edge runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundWork);
    } else {
      // Fallback (local dev): don't block the response.
      backgroundWork.catch((e) => console.error("background work error:", e));
    }

    return new Response(
      JSON.stringify({ ok: true, records_synced: totalSynced, background: "enrichment_and_match_running" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("zoho-books-sync error:", e);
    await supabase.from("zoho_sync_log").insert({
      provider: "zoho_books",
      entity: "invoices",
      status: "error",
      error_message: String(e).slice(0, 1000),
      completed_at: new Date().toISOString(),
      triggered_by: userId,
    });
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});