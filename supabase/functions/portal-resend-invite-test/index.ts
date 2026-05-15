// One-off helper: resend the portal setup link to a specific email.
// Used only for testing — no auth required (relies on existence of the
// portal_contact + auth user already created via portal-invite-customer).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = "XBOOM Flow <notifications@xboom.in>";
const PORTAL_BASE = "https://xboomflow.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { email, full_name } = await req.json();
    if (!email) {
      return json({ error: "email required" }, 400);
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const redirectTo = `${PORTAL_BASE}/portal/set-password`;
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (linkErr) return json({ error: linkErr.message }, 500);
    const hashedToken = linkData?.properties?.hashed_token;
    if (!hashedToken) return json({ error: "no token" }, 500);
    const actionLink = `${PORTAL_BASE}/portal/set-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 12px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);">
<tr><td style="background:#0c1e3e;padding:24px 28px;"><div style="font-size:22px;font-weight:700;color:#ffffff;">x<span style="color:#d4af37;">boom</span> <span style="font-size:11px;letter-spacing:1.5px;color:rgba(255,255,255,.7);margin-left:10px;text-transform:uppercase;">Customer Portal</span></div></td></tr>
<tr><td style="padding:32px 28px;">
<h1 style="margin:0 0 12px 0;font-size:22px;color:#0f172a;">Welcome to the XBOOM B2B Portal</h1>
<p style="margin:0 0 8px 0;font-size:15px;color:#334155;">Hi ${full_name ?? "there"},</p>
<p style="margin:0 0 24px 0;font-size:15px;line-height:1.55;color:#334155;">An admin has invited you to access the XBOOM B2B Portal. Click below to set your password and sign in.</p>
<p style="margin:0 0 32px 0;"><a href="${actionLink}" style="display:inline-block;background:#0c1e3e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px;">Set up my account</a></p>
<p style="margin:0 0 8px 0;font-size:13px;color:#64748b;">If the button doesn't work, paste this link into your browser:</p>
<p style="margin:0;font-size:12px;color:#475569;word-break:break-all;"><a href="${actionLink}" style="color:#0c1e3e;">${actionLink}</a></p>
</td></tr>
<tr><td style="padding:24px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">XBOOM Flow · Customer Portal</td></tr>
</table></td></tr></table></body></html>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [email], subject: "You're invited to the XBOOM B2B Portal", html }),
    });
    const txt = await r.text();
    return json({ ok: r.ok, status: r.status, resend: txt.slice(0, 500), action_link: actionLink });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  function json(b: unknown, s = 200) {
    return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});