// Portal activation — non-consuming invite link handler.
// Validates a portal_invite_tokens row (exists, not used, not expired),
// sets the user's password, marks the token used, and signs the user in.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { invite, new_password } = await req.json();
    if (!invite || typeof invite !== "string") {
      return json({ error: "Invalid invite link." }, 200);
    }
    if (!new_password || typeof new_password !== "string" || new_password.length < 8) {
      return json({ error: "Password must be at least 8 characters." }, 200);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    // Look up the invite token
    const { data: row, error: rowErr } = await admin
      .from("portal_invite_tokens")
      .select("token, auth_user_id, email, account_id, expires_at, used_at")
      .eq("token", invite)
      .maybeSingle();
    if (rowErr) {
      console.error("[portal-activate] lookup error:", rowErr.message);
      return json({ error: "Could not validate invite link." }, 200);
    }
    if (!row) {
      return json({
        error: "This invite link is invalid. Please ask your account manager to resend the invite.",
      }, 200);
    }
    if (row.used_at) {
      return json({
        error: "This invite link has already been used. If you've forgotten your password, use 'Forgot password' on the portal login page.",
      }, 200);
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return json({
        error: "This invite link has expired. Please ask your account manager to resend the invite.",
      }, 200);
    }

    // Set the password (admin API bypasses AAL2 requirement for portal customers)
    const { error: updErr } = await admin.auth.admin.updateUserById(row.auth_user_id, {
      password: new_password,
      email_confirm: true,
    });
    if (updErr) {
      const raw = updErr.message || "";
      let friendly = raw;
      if (/same.*password|should be different/i.test(raw)) {
        friendly = "Your new password must be different from your current password.";
      } else if (/weak|pwned|leaked|compromised/i.test(raw)) {
        friendly = "This password is too weak or has appeared in known data breaches. Please choose a stronger one.";
      } else if (/at least|minimum|length/i.test(raw)) {
        friendly = "Password does not meet the minimum strength requirements.";
      }
      console.error("[portal-activate] update error:", raw);
      return json({ error: friendly }, 200);
    }

    // Ensure the portal contact is linked even for legacy/unlinked rows or
    // recovery paths that created the auth user before the contact was linked.
    const contactUpdate = admin
      .from("portal_contacts")
      .update({ auth_user_id: row.auth_user_id })
      .ilike("email", row.email)
      .or(`auth_user_id.is.null,auth_user_id.eq.${row.auth_user_id}`);
    const { error: linkErr } = row.account_id
      ? await contactUpdate.eq("account_id", row.account_id)
      : await contactUpdate;
    if (linkErr) {
      console.error("[portal-activate] contact-link error:", linkErr.message);
      return json({ error: "Could not link portal access. Please ask your account manager to resend the invite." }, 200);
    }

    // Mark token used (best-effort: still proceed if it fails)
    const { error: markErr } = await admin
      .from("portal_invite_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", invite)
      .is("used_at", null);
    if (markErr) {
      console.error("[portal-activate] mark-used error:", markErr.message);
    }

    // Sign in
    const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
    const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({
      email: row.email,
      password: new_password,
    });
    if (signErr || !signIn.session) {
      return json({ ok: true, session: null });
    }

    return json({
      ok: true,
      session: {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});