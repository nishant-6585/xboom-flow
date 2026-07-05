import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FROM = "XBOOM HR <hr@xboom.in>";

interface Body {
  invitation_id: string;
  // optional overrides (rarely used)
  email?: string;
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
          <h1 style="margin:0 0 8px 0;font-size:22px;color:#0f172a;">Welcome to XBOOM Flow${name ? ", " + escapeHtml(name) : ""} 👋</h1>
          <p style="margin:0 0 16px 0;font-size:14px;line-height:22px;color:#374151;">
            Your XBOOM Flow account has been approved. Click the button below to set your password and sign in.
            This link is valid for 24 hours.
          </p>
          <p style="margin:24px 0;">
            <a href="${escapeHtml(actionLink)}"
               style="background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block;">
              Set my password
            </a>
          </p>
          <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;">Or copy and paste this link into your browser:</p>
          <p style="margin:0 0 20px 0;font-size:12px;color:#374151;word-break:break-all;">${escapeHtml(actionLink)}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
          <p style="margin:0;font-size:12px;color:#6b7280;">
            Having trouble? Reply to this email or contact HR at hr@xboom.in.<br/>
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
  let invitationId: string | null = null;
  let triggeredBy: string | null = null;

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    // AuthN — only admin or HR may trigger. Accept a valid Authorization JWT.
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
    if (!body?.invitation_id) {
      return new Response(JSON.stringify({ error: "invitation_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    invitationId = body.invitation_id;

    const { data: inv, error: invErr } = await adminClient
      .from("user_invitations").select("id,name,email").eq("id", invitationId).single();
    if (invErr || !inv) throw new Error("Invitation not found");
    recipientEmail = (body.email || inv.email || "").toLowerCase();
    const displayName = body.name || inv.name || "";

    // Queue log row
    const { data: logRow, error: logErr } = await adminClient
      .from("invitation_email_log")
      .insert({
        invitation_id: invitationId,
        recipient_email: recipientEmail,
        from_address: FROM,
        status: "queued",
        provider: "resend",
        triggered_by: triggeredBy,
        context: "invitation_approval",
      })
      .select("id").single();
    if (logErr) console.error("Failed to write invitation_email_log:", logErr.message);
    logId = logRow?.id ?? null;

    // Generate a recovery link (Supabase does NOT send an email for this method)
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: recipientEmail,
      options: { redirectTo: `${SITE_URL}/auth` },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      throw new Error(linkErr?.message || "Failed to generate recovery link");
    }
    const actionLink = linkData.properties.action_link;

    const { sendEmail: sendMailSeam } = await import("../_shared/email.ts");
    // Stable idempotency from the log-of-record: one attempt per queued
    // invitation_email_log row. Retries of the same invocation collapse;
    // resends (which insert a new log row) send again.
    const idempotencyKey = logId
      ? `send-invite-email:${logId}`
      : `send-invite-email:${invitationId}:${recipientEmail}`;
    const platformResp = await sendMailSeam({
      provider: "platform",
      to: recipientEmail,
      subject: "",
      html: "",
      templateName: "hr-user-invite",
      templateData: {
        name: displayName,
        action_link: actionLink,
        site_url: SITE_URL,
      },
      idempotencyKey,
    });
    const platformBody: any = platformResp.raw ?? {};
    if (!platformResp.ok) {
      throw new Error(platformResp.error || `Email failed (${platformResp.status})`);
    }

    if (logId) {
      await adminClient.from("invitation_email_log").update({
        status: "sent",
        provider: "platform",
        provider_message_id: platformBody?.message_id || platformBody?.id || null,
      }).eq("id", logId);
    }

    return new Response(JSON.stringify({ success: true, message_id: platformBody?.message_id || platformBody?.id || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-invite-email error:", err?.message || err);
    if (logId) {
      await adminClient.from("invitation_email_log").update({
        status: "failed",
        error_message: String(err?.message || err).slice(0, 500),
      }).eq("id", logId);
    } else if (invitationId) {
      await adminClient.from("invitation_email_log").insert({
        invitation_id: invitationId,
        recipient_email: recipientEmail,
        from_address: FROM,
        status: "failed",
        provider: "resend",
        error_message: String(err?.message || err).slice(0, 500),
        triggered_by: triggeredBy,
        context: "invitation_approval",
      });
    }
    return new Response(JSON.stringify({ error: err?.message || "Failed to send invite email" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});