import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { data: { user: requestingUser }, error: authError } = await anonClient.auth.getUser();
    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if requesting user is admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
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

    // Generate a random password for the user
    const tempPassword = crypto.randomUUID().slice(0, 16) + "Aa1!";

    // Create the auth user using admin API
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: invitation.email,
      password: tempPassword,
      email_confirm: true,
    });

    if (createError) {
      // If user already exists, try to find them
      if (createError.message?.includes("already been registered") || createError.message?.includes("already exists")) {
        const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
        const existingUser = users?.find((u: any) => u.email === invitation.email);
        
        if (existingUser) {
          // Check if profile already exists
          const { data: existingProfile } = await adminClient
            .from("profiles")
            .select("id")
            .eq("user_id", existingUser.id)
            .maybeSingle();

          if (!existingProfile) {
            await adminClient.from("profiles").insert({
              user_id: existingUser.id,
              name: invitation.name,
              email: invitation.email,
              is_approved: true,
            });

            await adminClient.from("user_roles").insert({
              user_id: existingUser.id,
              role: invitation.role,
            });
          } else {
            // Just approve existing profile
            await adminClient
              .from("profiles")
              .update({ is_approved: true })
              .eq("user_id", existingUser.id);
          }

          // Update the employee record with the correct department
          if (invitation.department) {
            await adminClient
              .from("employees")
              .update({ department: invitation.department })
              .eq("user_id", existingUser.id);
          }

          // Mark invitation as accepted
          await adminClient
            .from("user_invitations")
            .update({ status: "accepted", accepted_at: new Date().toISOString() })
            .eq("id", invitation_id);

          return new Response(JSON.stringify({ 
            success: true, 
            message: "Existing user approved successfully",
            is_existing_user: true,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ error: "User already registered but could not be found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create profile (triggers auto employee creation)
    await adminClient.from("profiles").insert({
      user_id: newUser.user.id,
      name: invitation.name,
      email: invitation.email,
      is_approved: true,
    });

    // Create user role
    await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role: invitation.role,
    });

    // Update the auto-created employee record with the correct department
    if (invitation.department) {
      await adminClient
        .from("employees")
        .update({ department: invitation.department })
        .eq("user_id", newUser.user.id);
    }

    // Mark invitation as accepted
    await adminClient
      .from("user_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invitation_id);

    // Send password reset email so user can set their own password
    const siteUrl = Deno.env.get("SITE_URL") || "https://xboom-flow.lovable.app";
    
    // Use anon client to trigger the built-in email hook
    const anonKeyForReset = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resetClient = createClient(supabaseUrl, anonKeyForReset);
    const { error: resetError } = await resetClient.auth.resetPasswordForEmail(invitation.email, {
      redirectTo: `${siteUrl}/auth`,
    });
    
    console.log("Reset email result:", resetError ? resetError.message : "sent successfully");

    return new Response(JSON.stringify({ 
      success: true, 
      message: "User created and approved. Password reset email has been sent.",
      is_existing_user: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error approving invitation:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
