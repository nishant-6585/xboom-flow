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

    // 5. Send email through the shared seam (platform).
    // Stable idempotency: one report per calendar day per recipient set.
    // Retries collapse via the per-recipient key suffix in the seam.
    const day = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `data-quality-report:${day}`;
    const sendResult = await sendMailSeam({
      provider: "platform",
      to: ADMIN_RECIPIENTS.map(r => r.email),
      subject: "",
      html: "",
      templateName: "data-quality-report",
      templateData: {
        report_date: reportDate,
        total,
        new_count: newCount,
        by_reason: sortDesc(byReason),
        by_source: sortDesc(bySource),
        by_owner: sortDesc(byOwner),
        sample: sampleRows,
        extra: Math.max(0, total - sampleRows.length),
      },
      idempotencyKey,
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