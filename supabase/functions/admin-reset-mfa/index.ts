import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await anonClient.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const requestingUserId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Only admins can reset MFA
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUserId)
      .eq("role", "admin");

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Only admins can reset MFA" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { target_user_id } = await req.json();
    if (!target_user_id) {
      return new Response(JSON.stringify({ error: "target_user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List MFA factors for the target user
    const { data: factorsData, error: listErr } = await admin.auth.admin.mfa.listFactors({
      userId: target_user_id,
    });
    if (listErr) {
      console.error("listFactors error:", listErr.message);
      return new Response(JSON.stringify({ error: listErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const factors = factorsData?.factors ?? [];
    let deletedCount = 0;
    for (const factor of factors) {
      const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({
        userId: target_user_id,
        id: factor.id,
      });
      if (delErr) {
        console.error(`Failed to delete factor ${factor.id}:`, delErr.message);
      } else {
        deletedCount++;
      }
    }

    // Revoke all trusted devices for this user so MFA is required on next login
    await admin
      .from("trusted_devices")
      .update({ is_revoked: true })
      .eq("user_id", target_user_id)
      .eq("is_revoked", false);

    // Sign user out of all sessions to force re-auth
    try {
      await admin.auth.admin.signOut(target_user_id, "global");
    } catch (e) {
      console.warn("signOut failed (non-fatal):", (e as Error).message);
    }

    // Audit log
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("name")
      .eq("user_id", requestingUserId)
      .maybeSingle();

    await admin.from("security_audit_log").insert({
      user_id: requestingUserId,
      user_name: adminProfile?.name ?? "Unknown Admin",
      action: "admin_reset_mfa",
      target_user_id,
      details: { factors_removed: deletedCount },
      user_agent: req.headers.get("user-agent"),
    });

    return new Response(
      JSON.stringify({ success: true, factors_removed: deletedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("admin-reset-mfa error:", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});