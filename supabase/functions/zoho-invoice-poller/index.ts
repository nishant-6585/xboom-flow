import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isAuthorizedCron } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ZOHO_ACCOUNTS_BASE = "https://accounts.zoho.com";
const BUCKET = "invoices";
const PROVIDER = "zoho_books";

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
    .eq("provider", PROVIDER)
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
    .eq("provider", PROVIDER);

  return { ...token, access_token: newAccess, expires_at: newExpires };
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Zoho Books' last_modified_time query param wants ISO WITHOUT fractional seconds
// and with a compact numeric offset ("+0000"), not the SQL-style "+00:00".
function toZohoTimeParam(iso: string): string {
  // Normalise to Date first, then rebuild in Zoho's accepted shape.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  // Emit UTC to avoid TZ ambiguity; Zoho accepts "+0000".
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+0000`
  );
}

async function findMatchingOrder(
  admin: any,
  invoice: any,
): Promise<{ order_id: string; order_number: string; method: string } | null> {
  // (a) reference_number == orders.order_number
  const ref = (invoice.reference_number || "").trim();
  if (ref) {
    const { data } = await admin
      .from("orders")
      .select("id, order_number")
      .eq("order_number", ref)
      .limit(1)
      .maybeSingle();
    if (data) return { order_id: data.id, order_number: data.order_number, method: "reference_number" };
  }

  // (b) email match + total within ±1
  const email = (invoice.email || invoice.customer_email || "").trim().toLowerCase();
  const total = Number(invoice.total || 0);
  if (email && total > 0) {
    const { data } = await admin
      .from("orders")
      .select("id, order_number, total_sales_amount, customer_email")
      .ilike("customer_email", email)
      .gte("total_sales_amount", total - 1)
      .lte("total_sales_amount", total + 1)
      .limit(2);
    if (data && data.length === 1) {
      return {
        order_id: data[0].id,
        order_number: data[0].order_number,
        method: "email_amount",
      };
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const stats = {
    scanned: 0,
    upserted: 0,
    matched: 0,
    unmatched: 0,
    pdfs_attached: 0,
    pdfs_skipped_same_hash: 0,
    emails_triggered: 0,
    errors: [] as string[],
  };

  try {
    // Auth: cron OR admin/finance JWT (for manual triggers/backfills)
    const isCron = await isAuthorizedCron(req);
    let manualSince: string | null = null;

    if (!isCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: userData, error: userErr } = await admin.auth.getUser(
        authHeader.replace("Bearer ", ""),
      );
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);
      const ok = roles?.some((r: { role: string }) =>
        ["admin", "finance"].includes(r.role),
      );
      if (!ok) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const body = await req.json().catch(() => ({}));
        if (body?.since) manualSince = String(body.since);
      } catch (_) { /* ignore */ }
    }

    const token = await getValidToken(admin);
    if (!token.organization_id) throw new Error("No Zoho organization_id stored");

    // Read cursor
    const { data: stateRow } = await admin
      .from("zoho_poller_state")
      .select("last_polled_at")
      .eq("provider", PROVIDER)
      .maybeSingle();
    const cursor =
      manualSince ||
      stateRow?.last_polled_at ||
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch invoices modified since cursor (asc so we can advance the cursor safely)
    const collected: any[] = [];
    let page = 1;
    const perPage = 200;
    while (true) {
      const url =
        `${token.api_domain}/books/v3/invoices` +
        `?organization_id=${encodeURIComponent(token.organization_id)}` +
        `&last_modified_time=${encodeURIComponent(toZohoTimeParam(cursor))}` +
        `&sort_column=last_modified_time&sort_order=A&page=${page}&per_page=${perPage}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` },
      });
      if (resp.status === 204) break;
      const data = await resp.json();
      if (!resp.ok) {
        if (resp.status === 429 || data?.code === 45) {
          // Daily/per-minute Zoho quota reached — leave cursor untouched, log softly, exit.
          await admin.from("zoho_sync_log").insert({
            provider: PROVIDER,
            entity: "poller",
            status: "rate_limited",
            error_message: (data?.message || "Zoho API rate limit").slice(0, 500),
            completed_at: new Date().toISOString(),
          });
          return new Response(
            JSON.stringify({ ok: true, rate_limited: true, stats }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        throw new Error(
          `Zoho list error [${resp.status}]: ${JSON.stringify(data).slice(0, 300)}`,
        );
      }
      const invs: any[] = data.invoices ?? [];
      collected.push(...invs);
      stats.scanned += invs.length;
      if (!data?.page_context?.has_more_page || invs.length === 0) break;
      page += 1;
      if (page > 25) break; // safety cap = 5000 invoices per run
    }

    // Upsert mirror rows first (bulk)
    if (collected.length > 0) {
      const rows = collected.map((inv) => ({
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
      const { error: upErr } = await admin
        .from("zoho_books_invoices")
        .upsert(rows, { onConflict: "invoice_id" });
      if (upErr) throw upErr;
      stats.upserted = rows.length;
    }

    // Run auto-match first (covers reference_number + cf fields), then per-invoice PDF flow
    try {
      await admin.rpc("match_zoho_invoices_to_orders");
    } catch (mErr) {
      console.error("match rpc error:", mErr);
    }

    let maxSeen = cursor;

    // Per-run enrichment cap: keep Zoho API consumption predictable.
    // Steady-state deltas rarely exceed this; leftovers pick up next tick.
    const ENRICH_CAP = 50;
    let enriched = 0;

    for (const inv of collected) {
      const advanceCursor = () => {
        if (inv.last_modified_time && inv.last_modified_time > maxSeen) {
          maxSeen = inv.last_modified_time;
        }
      };
      try {
        if (enriched >= ENRICH_CAP) {
          // Enrichment budget spent. Leftover invoices resume next tick.
          stats.errors.push(`enrichment_cap_hit at ${enriched}/${collected.length}`);
          break;
        }

        // Fetch current mirror row (post-match)
        const { data: mirror } = await admin
          .from("zoho_books_invoices")
          .select("invoice_id, invoice_number, linked_order_id, linked_order_number, match_method, pdf_hash, pdf_attached_invoice_id")
          .eq("invoice_id", inv.invoice_id)
          .maybeSingle();
        if (!mirror) continue;

        // Determine order match if RPC didn't already link
        let orderId = mirror.linked_order_id as string | null;
        let orderNumber = mirror.linked_order_number as string | null;
        let matchMethod = mirror.match_method as string | null;

        if (!orderId) {
          const m = await findMatchingOrder(admin, inv);
          if (m) {
            orderId = m.order_id;
            orderNumber = m.order_number;
            matchMethod = m.method;
            await admin
              .from("zoho_books_invoices")
              .update({
                linked_order_id: orderId,
                linked_order_number: orderNumber,
                match_method: matchMethod,
                match_status: "matched",
                matched_at: new Date().toISOString(),
              })
              .eq("invoice_id", inv.invoice_id);
          } else {
            await admin
              .from("zoho_books_invoices")
              .update({ match_status: "unmatched" })
              .eq("invoice_id", inv.invoice_id);
            stats.unmatched += 1;
            advanceCursor();
            continue;
          }
        }

        stats.matched += 1;

        enriched += 1;

        // Fetch PDF
        const pdfUrl =
          `${token.api_domain}/books/v3/invoices/${encodeURIComponent(inv.invoice_id)}` +
          `?organization_id=${encodeURIComponent(token.organization_id)}&accept=pdf`;
        const pdfResp = await fetch(pdfUrl, {
          headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` },
        });
        if (!pdfResp.ok) {
          stats.errors.push(`PDF ${inv.invoice_id} status ${pdfResp.status}`);
          continue;
        }
        const pdfBuf = await pdfResp.arrayBuffer();
        const hash = await sha256Hex(pdfBuf);

        if (mirror.pdf_hash === hash && mirror.pdf_attached_invoice_id) {
          stats.pdfs_skipped_same_hash += 1;
          advanceCursor();
          continue;
        }

        const invNum = inv.invoice_number || inv.invoice_id;
        const storagePath = `zoho/${orderId}/${inv.invoice_id}.pdf`;
        const { error: upErr } = await admin.storage
          .from(BUCKET)
          .upload(storagePath, new Uint8Array(pdfBuf), {
            contentType: "application/pdf",
            upsert: true,
          });
        if (upErr) {
          stats.errors.push(`upload ${inv.invoice_id}: ${upErr.message}`);
          continue;
        }

        // Idempotent order_invoices upsert keyed on zoho_invoice_id
        const orderInvoicePayload = {
          order_id: orderId,
          storage_path: storagePath,
          invoice_number: invNum,
          file_name: `${invNum}.pdf`,
          source: "zoho",
          document_type: "tax_invoice",
          total: Number(inv.total || 0),
          amount_paid: Number(inv.total || 0) - Number(inv.balance || 0),
          zoho_invoice_id: inv.invoice_id,
        } as Record<string, unknown>;

        const { data: oi, error: oiErr } = await admin
          .from("order_invoices")
          .upsert(orderInvoicePayload, { onConflict: "zoho_invoice_id" })
          .select("id")
          .maybeSingle();
        if (oiErr || !oi) {
          stats.errors.push(`order_invoices ${inv.invoice_id}: ${oiErr?.message}`);
          continue;
        }

        await admin
          .from("zoho_books_invoices")
          .update({
            pdf_attached_invoice_id: oi.id,
            pdf_hash: hash,
            pdf_synced_at: new Date().toISOString(),
          })
          .eq("invoice_id", inv.invoice_id);

        stats.pdfs_attached += 1;

        advanceCursor();

        // Fire the invoice email (idempotent inside send-invoice-email)
        try {
          const cronSecret =
            Deno.env.get("CRON_SECRET") ?? Deno.env.get("ZOHO_SYNC_CRON_SECRET");
          const emailResp = await fetch(
            `${SUPABASE_URL}/functions/v1/send-invoice-email`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-cron-secret": cronSecret || "",
              },
              body: JSON.stringify({ invoice_id: oi.id, mode: "auto" }),
            },
          );
          if (emailResp.ok) stats.emails_triggered += 1;
          else {
            const t = await emailResp.text();
            stats.errors.push(`email ${inv.invoice_id}: ${t.slice(0, 120)}`);
          }
        } catch (emailErr) {
          stats.errors.push(`email ${inv.invoice_id}: ${String(emailErr).slice(0, 120)}`);
        }
      } catch (perInvErr) {
        stats.errors.push(`inv ${inv.invoice_id}: ${String(perInvErr).slice(0, 200)}`);
      }
    }

    // ---- PDF backfill for stranded rows ----
    // Rows that were matched previously but never got a PDF attached
    // (side-effect of the pre-migration 20260705145336 unique-index bug).
    // Drain a few per tick until empty, sharing the same ENRICH_CAP budget
    // so we don't burn the daily Zoho API quota.
    (stats as any).backfill_attached = 0;
    (stats as any).backfill_skipped_void = 0;
    (stats as any).backfill_remaining = 0;
    if (enriched < ENRICH_CAP) {
      const remainingBudget = ENRICH_CAP - enriched;
      const { data: stranded } = await admin
        .from("zoho_books_invoices")
        .select("invoice_id, invoice_number, linked_order_id, status, total, balance, pdf_hash, pdf_attached_invoice_id")
        .eq("match_status", "matched")
        .is("pdf_attached_invoice_id", null)
        .not("linked_order_id", "is", null)
        .neq("status", "void")
        .order("date", { ascending: false })
        .limit(remainingBudget);

      for (const row of (stranded ?? []) as any[]) {
        if (enriched >= ENRICH_CAP) break;
        try {
          enriched += 1;

          const pdfUrl =
            `${token.api_domain}/books/v3/invoices/${encodeURIComponent(row.invoice_id)}` +
            `?organization_id=${encodeURIComponent(token.organization_id)}&accept=pdf`;
          const pdfResp = await fetch(pdfUrl, {
            headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` },
          });
          if (!pdfResp.ok) {
            stats.errors.push(`backfill PDF ${row.invoice_id} status ${pdfResp.status}`);
            continue;
          }
          const pdfBuf = await pdfResp.arrayBuffer();
          const hash = await sha256Hex(pdfBuf);

          if (row.pdf_hash === hash && row.pdf_attached_invoice_id) {
            stats.pdfs_skipped_same_hash += 1;
            continue;
          }

          const invNum = row.invoice_number || row.invoice_id;
          const storagePath = `zoho/${row.linked_order_id}/${row.invoice_id}.pdf`;
          const { error: upErr } = await admin.storage
            .from(BUCKET)
            .upload(storagePath, new Uint8Array(pdfBuf), {
              contentType: "application/pdf",
              upsert: true,
            });
          if (upErr) {
            stats.errors.push(`backfill upload ${row.invoice_id}: ${upErr.message}`);
            continue;
          }

          const { data: oi, error: oiErr } = await admin
            .from("order_invoices")
            .upsert(
              {
                order_id: row.linked_order_id,
                storage_path: storagePath,
                invoice_number: invNum,
                file_name: `${invNum}.pdf`,
                source: "zoho",
                document_type: "tax_invoice",
                total: Number(row.total || 0),
                amount_paid: Number(row.total || 0) - Number(row.balance || 0),
                zoho_invoice_id: row.invoice_id,
              },
              { onConflict: "zoho_invoice_id" },
            )
            .select("id")
            .maybeSingle();
          if (oiErr || !oi) {
            stats.errors.push(`backfill order_invoices ${row.invoice_id}: ${oiErr?.message}`);
            continue;
          }

          await admin
            .from("zoho_books_invoices")
            .update({
              pdf_attached_invoice_id: oi.id,
              pdf_hash: hash,
              pdf_synced_at: new Date().toISOString(),
            })
            .eq("invoice_id", row.invoice_id);

          (stats as any).backfill_attached += 1;
          stats.pdfs_attached += 1;
        } catch (bfErr) {
          stats.errors.push(`backfill ${row.invoice_id}: ${String(bfErr).slice(0, 200)}`);
        }
      }

      const { count: remaining } = await admin
        .from("zoho_books_invoices")
        .select("invoice_id", { head: true, count: "exact" })
        .eq("match_status", "matched")
        .is("pdf_attached_invoice_id", null)
        .not("linked_order_id", "is", null)
        .neq("status", "void");
      (stats as any).backfill_remaining = remaining ?? 0;
    }

    // Advance cursor on success
    await admin
      .from("zoho_poller_state")
      .update({
        last_polled_at: maxSeen,
        last_success_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", PROVIDER);

    await admin.from("zoho_sync_log").insert({
      provider: PROVIDER,
      entity: "poller",
      status: stats.errors.length > 0 ? "success_with_errors" : "success",
      records_synced: stats.upserted,
      error_message: stats.errors.length > 0 ? stats.errors.slice(0, 5).join(" | ").slice(0, 900) : null,
      completed_at: new Date().toISOString(),
      stats: stats as any,
    });

    return new Response(JSON.stringify({ ok: true, stats }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("zoho-invoice-poller error:", e);
    await admin
      .from("zoho_poller_state")
      .update({
        last_error: String(e).slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("provider", PROVIDER);
    await admin.from("zoho_sync_log").insert({
      provider: PROVIDER,
      entity: "poller",
      status: "error",
      error_message: String(e).slice(0, 900),
      completed_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ error: String(e), stats }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});