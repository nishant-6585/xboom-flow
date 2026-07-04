import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FROM = "XBOOM HR <hr@xboom.in>";

interface Body {
  email: string;
  name?: string;
}

const escapeHtml = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function buildHtml(opts: { name: string; actionLink: string; siteUrl: string }) {
  const { name, actionLink, siteUrl } = opts;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 8px 0;font-size:22px;color:#0f172a;">Reset your XBOOM Flow password${name ? ", " + escapeHtml(name) : ""}</h1>
          <p style="margin:0 0 16px 0;font-size:14px;line-height:22px;color:#374151;">
            An administrator requested a password reset for your XBOOM Flow account.
            Click the button below to choose a new password. This link is valid for 24 hours.
          </p>
          <p style="margin:24px 0;">
            <a href="${escapeHtml(actionLink)}"
               style="background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block;">
              Reset my password
            </a>
          </p>
          <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;">Or copy and paste this link into your browser:</p>
          <p style="margin:0 0 20px 0;font-size:12px;color:#374151;word-break:break-all;">${escapeHtml(actionLink)}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
          <p style="margin:0;font-size:12px;color:#6b7280;">
            Didn't request this? You can safely ignore this email or contact HR at hr@xboom.in.<br/>
            Portal: <a href="${escapeHtml(siteUrl)}" style="color:#0f172a;">${escapeHtml(siteUrl)}</a>
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0 0;font-size:11px;color:#9ca3af;">© XBOOM Utilities</p>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const SITE_URL = Deno.env.get("SITE_URL") || "https://xboomflow.com";

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

  let logId: string | null = null;
  let recipientEmail = "";
  let recipientUserId: string | null = null;
  let triggeredBy: string | null = null;

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    triggeredBy = userData.user.id;
    const { data: roles } = await adminClient
      .from("user_roles").select("role").eq("user_id", triggeredBy)
      .in("role", ["admin", "hr"]);
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    const rawEmail = (body?.email || "").trim().toLowerCase();
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    recipientEmail = rawEmail;
    const displayName = body?.name || "";

    // Best-effort lookup of the recipient's user id for the log
    try {
      const { data: profileRow } = await adminClient
        .from("profiles").select("id").eq("email", recipientEmail).maybeSingle();
      recipientUserId = (profileRow as any)?.id ?? null;
    } catch (_) { /* ignore */ }

    const { data: logRow, error: logErr } = await adminClient
      .from("password_reset_email_log")
      .insert({
        recipient_email: recipientEmail,
        recipient_user_id: recipientUserId,
        from_address: FROM,
        status: "queued",
        provider: "resend",
        triggered_by: triggeredBy,
        context: "admin_reset",
      })
      .select("id").single();
    if (logErr) console.error("Failed to write password_reset_email_log:", logErr.message);
    logId = logRow?.id ?? null;

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: recipientEmail,
      options: { redirectTo: `${SITE_URL}/auth` },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      throw new Error(linkErr?.message || "Failed to generate recovery link");
    }
    const actionLink = linkData.properties.action_link;

    const html = buildHtml({ name: displayName, actionLink, siteUrl: SITE_URL });

    const { sendEmail: sendMailSeam } = await import("../_shared/email.ts");
    const resendResp = await sendMailSeam({
      to: recipientEmail,
      subject: "Reset your XBOOM Flow password",
      html,
    });
    const resendBody: any = resendResp.raw ?? {};
    if (!resendResp.ok) {
      throw new Error(resendResp.error || `Email failed (${resendResp.status})`);
    }

    if (logId) {
      await adminClient.from("password_reset_email_log").update({
        status: "sent",
        provider_message_id: resendBody?.id || null,
        updated_at: new Date().toISOString(),
      }).eq("id", logId);
    }

    return new Response(JSON.stringify({ success: true, message_id: resendBody?.id || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-password-reset-email error:", err?.message || err);
    if (logId) {
      await adminClient.from("password_reset_email_log").update({
        status: "failed",
        error_message: String(err?.message || err).slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq("id", logId);
    } else if (recipientEmail) {
      await adminClient.from("password_reset_email_log").insert({
        recipient_email: recipientEmail,
        recipient_user_id: recipientUserId,
        from_address: FROM,
        status: "failed",
        provider: "resend",
        error_message: String(err?.message || err).slice(0, 500),
        triggered_by: triggeredBy,
        context: "admin_reset",
      });
    }
    return new Response(JSON.stringify({ error: err?.message || "Failed to send password reset email" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});