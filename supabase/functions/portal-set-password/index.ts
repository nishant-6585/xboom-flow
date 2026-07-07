import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token_hash, type, new_password } = await req.json();
    if (!token_hash || !type || !new_password || typeof new_password !== "string" || new_password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the recovery/invite token by exchanging it for a session (anon client).
    const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
    const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
      token_hash, type,
    });
    if (verifyErr || !verifyData?.user) {
      console.error("[portal-set-password] verify error:", verifyErr?.message);
      return new Response(JSON.stringify({
        error: "This invite link has expired or was already used. Please ask your account manager to resend the invite.",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use admin API to set password — bypasses AAL2 requirement for portal customers.
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const { error: updErr } = await admin.auth.admin.updateUserById(verifyData.user.id, {
      password: new_password,
    });
    if (updErr) {
      // Common cases: same_password, weak_password, leaked password (HIBP).
      const raw = updErr.message || "";
      let friendly = raw;
      if (/same.*password|should be different/i.test(raw)) {
        friendly = "Your new password must be different from your current password.";
      } else if (/weak|pwned|leaked|compromised/i.test(raw)) {
        friendly = "This password is too weak or has appeared in known data breaches. Please choose a stronger one.";
      } else if (/at least|minimum|length/i.test(raw)) {
        friendly = "Password does not meet the minimum strength requirements.";
      }
      console.error("[portal-set-password] update error:", raw);
      return new Response(JSON.stringify({ error: friendly }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Close the legacy recovery-link gap: if a portal contact exists by email
    // but was never linked, attach it to the verified auth user before login.
    const { error: linkErr } = await admin
      .from("portal_contacts")
      .update({ auth_user_id: verifyData.user.id })
      .ilike("email", verifyData.user.email!)
      .or(`auth_user_id.is.null,auth_user_id.eq.${verifyData.user.id}`);
    if (linkErr) {
      console.error("[portal-set-password] contact-link error:", linkErr.message);
      return new Response(JSON.stringify({ error: "Could not link portal access. Please ask your account manager to resend the invite." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sign user in with new password to return a session for client.
    const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({
      email: verifyData.user.email!,
      password: new_password,
    });
    if (signErr || !signIn.session) {
      return new Response(JSON.stringify({ ok: true, session: null }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      session: {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
      },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});