import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SECRET = Deno.env.get("DEV_REPORT_SECRET");

const REPORT_COLS = [
  "repo","branch","commit_sha","commit_range","summary",
  "total_issues","critical_count","high_count","medium_count","low_count","info_count",
  "trigger_type","status","triggered_at",
];
const ISSUE_COLS = [
  "file_path","line_number","severity","category","message","suggestion","code_snippet","resolution_status",
];

function pick(obj: Record<string, unknown>, cols: string[]) {
  const out: Record<string, unknown> = {};
  for (const c of cols) if (obj[c] !== undefined) out[c] = obj[c];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { ...corsHeaders, "access-control-allow-headers": "content-type, x-report-secret" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!SECRET) {
    return new Response(JSON.stringify({ error: "secret not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.headers.get("x-report-secret") !== SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const issues = Array.isArray((body as any).issues) ? (body as any).issues : [];
  const reportRow = pick(body, REPORT_COLS);

  const { data: report, error: repErr } = await supabase
    .from("dev_reports")
    .insert(reportRow)
    .select("id")
    .single();

  if (repErr) {
    return new Response(JSON.stringify({ error: repErr.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (issues.length > 0) {
    const rows = issues.map((i: Record<string, unknown>) => ({
      ...pick(i, ISSUE_COLS),
      report_id: report.id,
    }));
    const { error: issErr } = await supabase.from("dev_report_issues").insert(rows);
    if (issErr) {
      return new Response(JSON.stringify({ id: report.id, issues_error: issErr.message }), {
        status: 207,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ id: report.id, issues_inserted: issues.length }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});