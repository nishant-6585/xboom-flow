import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await anonClient.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const requestingUserId = claimsData.claims.sub;

    // Check if requesting user is admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUserId)
      .eq("role", "admin");

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Only admins can approve invitations" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { invitation_id } = await req.json();
    if (!invitation_id) {
      return new Response(JSON.stringify({ error: "invitation_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the invitation
    const { data: invitation, error: invError } = await adminClient
      .from("user_invitations")
      .select("*")
      .eq("id", invitation_id)
      .eq("status", "pending")
      .single();

    if (invError || !invitation) {
      return new Response(JSON.stringify({ error: "Invitation not found or already processed" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get admin name for audit log
    const { data: adminProfile } = await adminClient
      .from("profiles")
      .select("name")
      .eq("user_id", requestingUserId)
      .single();
    const adminName = adminProfile?.name || "Admin";

    // --- STEP 1: Create or find auth user ---
    let targetUserId: string;
    let isExistingUser = false;
    let authUserCreatedByUs = false;

    const tempPassword = crypto.randomUUID().slice(0, 16) + "Aa1!";
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: invitation.email,
      password: tempPassword,
      email_confirm: true,
    });

    if (createError) {
      if (createError.message?.includes("already been registered") || createError.message?.includes("already exists")) {
        // Find existing user
        const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
        if (listError) {
          return new Response(JSON.stringify({ error: "Failed to look up existing user" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const existingUser = users?.find((u: any) => u.email === invitation.email);
        if (!existingUser) {
          return new Response(JSON.stringify({ error: "User already registered but could not be found" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        targetUserId = existingUser.id;
        isExistingUser = true;
      } else {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      targetUserId = newUser.user.id;
      authUserCreatedByUs = true;
    }

    // --- STEP 2: Atomic DB transaction (profile + role + employee + invitation + audit) ---
    const { data: txResult, error: txError } = await adminClient.rpc("approve_invitation_atomic", {
      p_user_id: targetUserId,
      p_invitation_id: invitation_id,
      p_name: invitation.name,
      p_email: invitation.email,
      p_role: invitation.role,
      p_department: invitation.department || "",
      p_admin_user_id: requestingUserId,
      p_admin_name: adminName,
      p_is_existing_user: isExistingUser,
    });

    if (txError) {
      console.error("Atomic transaction failed:", txError.message);

      // ROLLBACK: If we created the auth user in step 1, delete it to prevent orphans
      if (authUserCreatedByUs) {
        console.log("Rolling back auth user creation for:", targetUserId);
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
        if (deleteError) {
          console.error("CRITICAL: Failed to rollback auth user:", deleteError.message);
          // This is a critical state - log extensively for manual intervention
        }
      }

      return new Response(JSON.stringify({ 
        error: "Failed to complete invitation approval. All changes have been rolled back.",
        detail: txError.message,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- STEP 3: Send password reset email (non-critical, don't rollback if this fails) ---
    if (!isExistingUser) {
      const siteUrl = Deno.env.get("SITE_URL") || "https://xboom-flow.lovable.app";
      const anonKeyForReset = Deno.env.get("SUPABASE_ANON_KEY")!;
      const resetClient = createClient(supabaseUrl, anonKeyForReset);
      const { error: resetError } = await resetClient.auth.resetPasswordForEmail(invitation.email, {
        redirectTo: `${siteUrl}/auth`,
      });
      if (resetError) {
        console.warn("Password reset email failed (non-critical):", resetError.message);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: isExistingUser 
        ? "Existing user approved successfully" 
        : "User created and approved. Password reset email has been sent.",
      is_existing_user: isExistingUser,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error approving invitation:", error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
