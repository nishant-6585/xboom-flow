import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail as sendMailSeam } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ADMIN_RECIPIENTS = [
  { name: "Vishal", email: "vishal.saurav@xboom.in" },
  { name: "Nishant", email: "nishant.k@xboom.in" },
];

const escapeHtml = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth: cron secret OR authenticated admin
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("authorization");

    const isCron = cronSecret && expectedSecret && cronSecret === expectedSecret;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!isCron) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roles } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id);
      const isAdmin = roles?.some((r: any) => r.role === "admin");
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin only" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 1. Run scan
    const { data: scanResult, error: scanErr } = await supabase.rpc("scan_company_field_quality");
    if (scanErr) throw new Error(`Scan failed: ${scanErr.message}`);
    const newCount = Number(scanResult ?? 0);

    // 2. Pull all unresolved findings
    const { data: findings, error: fetchErr } = await supabase
      .from("data_quality_findings")
      .select("source_table, source_id, bad_value, reason, owner_name, customer_name, product_name, detected_at")
      .eq("resolved", false)
      .order("detected_at", { ascending: false })
      .limit(500);
    if (fetchErr) throw new Error(`Fetch failed: ${fetchErr.message}`);

    const total = findings?.length ?? 0;

    // 3. Group by reason and by owner
    const byReason = new Map<string, number>();
    const byOwner = new Map<string, number>();
    const bySource = new Map<string, number>();
    for (const f of findings ?? []) {
      byReason.set(f.reason, (byReason.get(f.reason) ?? 0) + 1);
      const owner = f.owner_name || "Unassigned";
      byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1);
      bySource.set(f.source_table, (bySource.get(f.source_table) ?? 0) + 1);
    }

    const sortDesc = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]);

    // 4. Build HTML report
    const reportDate = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const sampleRows = (findings ?? []).slice(0, 30);

    const html = `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f4f6f8;padding:20px;color:#1a1a1a;">
  <div style="max-width:780px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:28px 32px;">
      <h1 style="margin:0;font-size:22px;">📋 Data Quality Report — Customer Company Field</h1>
      <p style="margin:8px 0 0;opacity:.9;font-size:13px;">Generated ${escapeHtml(reportDate)} IST</p>
    </div>

    <div style="padding:24px 32px;">
      <div style="display:flex;gap:12px;margin-bottom:24px;">
        <div style="flex:1;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#92400e;">${total}</div>
          <div style="font-size:12px;color:#78350f;">Open issues</div>
        </div>
        <div style="flex:1;background:#dbeafe;border:1px solid #93c5fd;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#1e40af;">${newCount}</div>
          <div style="font-size:12px;color:#1e3a8a;">Detected/refreshed today</div>
        </div>
      </div>

      <h3 style="font-size:14px;color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">By Reason</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        ${sortDesc(byReason).map(([k, v]) => `
          <tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${escapeHtml(k)}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;">${v}</td></tr>`).join("")}
      </table>

      <h3 style="font-size:14px;color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">By Source Table</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        ${sortDesc(bySource).map(([k, v]) => `
          <tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-family:monospace;">${escapeHtml(k)}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;">${v}</td></tr>`).join("")}
      </table>

      <h3 style="font-size:14px;color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">By Owner (Salesperson)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
        ${sortDesc(byOwner).slice(0, 15).map(([k, v]) => `
          <tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${escapeHtml(k)}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;">${v}</td></tr>`).join("")}
      </table>

      <h3 style="font-size:14px;color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">Sample Issues (first ${sampleRows.length})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f9fafb;">
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">Source</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">Bad Value</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">Reason</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">Owner</th>
        </tr></thead>
        <tbody>
        ${sampleRows.map(f => `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-family:monospace;font-size:11px;">${escapeHtml(f.source_table)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;color:#dc2626;">${escapeHtml(f.bad_value)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${escapeHtml(f.reason)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">${escapeHtml(f.owner_name || "—")}</td>
          </tr>`).join("")}
        </tbody>
      </table>

      ${total > sampleRows.length ? `<p style="font-size:12px;color:#6b7280;margin-top:12px;">…and ${total - sampleRows.length} more. View the full list in the admin panel.</p>` : ""}

      <p style="font-size:12px;color:#9ca3af;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">
        This is an automated daily report from the XBoom Data Quality scanner.
      </p>
    </div>
  </div>
</body></html>`;

    // 5. Send email through the shared seam.
    const sendResult = await sendMailSeam({
      to: ADMIN_RECIPIENTS.map(r => r.email),
      subject: `📋 Data Quality Report — ${total} open company-name issues`,
      html,
    });

    return new Response(JSON.stringify({
      success: true,
      total_open: total,
      new_or_refreshed: newCount,
      email_sent_to: ADMIN_RECIPIENTS.map(r => r.email),
      send_result: sendResult,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("data-quality-report error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});