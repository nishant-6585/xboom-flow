import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  email: string;
  name?: string;
}
const FROM = "XBOOM HR <hr@xboom.in>";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SITE_URL = Deno.env.get("SITE_URL") || "https://xboomflow.com";

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

  let logId: string | null = null;
  let recipientEmail = "";
  let recipientUserId: string | null = null;
  let triggeredBy: string | null = null;

  try {
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
        provider: "platform",
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

    // Stable idempotency: keyed on the password_reset_email_log row id.
    // Each admin-initiated reset writes a new log row and generates a new
    // recovery link, so re-resets fire a fresh email; retries of the same
    // invocation collapse. Fallback to a token fingerprint when the log
    // insert failed so we still get a stable-per-invocation key.
    const tokenFingerprint = String(linkData?.properties?.hashed_token || actionLink).slice(0, 24);
    const idempotencyKey = logId
      ? `send-password-reset-email:${logId}`
      : `send-password-reset-email:${recipientEmail}:${tokenFingerprint}`;

    const { sendEmail: sendMailSeam } = await import("../_shared/email.ts");
    const sendResp = await sendMailSeam({
      provider: "platform",
      to: recipientEmail,
      subject: "",
      html: "",
      templateName: "password-reset-admin",
      templateData: {
        name: displayName,
        action_link: actionLink,
        site_url: SITE_URL,
      },
      idempotencyKey,
    });
    if (!sendResp.ok) {
      throw new Error(sendResp.error || `Email failed (${sendResp.status})`);
    }

    if (logId) {
      await adminClient.from("password_reset_email_log").update({
        status: "sent",
        provider_message_id: null,
        updated_at: new Date().toISOString(),
      }).eq("id", logId);
    }

    return new Response(JSON.stringify({ success: true }), {
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
        provider: "platform",
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