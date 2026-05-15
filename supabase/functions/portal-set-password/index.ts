import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({ error: verifyErr?.message || "Invalid or expired link" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use admin API to set password — bypasses AAL2 requirement for portal customers.
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const { error: updErr } = await admin.auth.admin.updateUserById(verifyData.user.id, {
      password: new_password,
    });
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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