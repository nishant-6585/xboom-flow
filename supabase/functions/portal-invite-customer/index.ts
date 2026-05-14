// Portal: invite a B2B customer (admin-only).
// Creates portal_account (if needed) + portal_contact + auth user via invite email,
// and assigns the b2b_customer role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InviteBody {
  // Either link to an existing account or create a new one
  account_id?: string;
  new_account?: {
    company_name: string;
    gstin?: string;
    industry?: string;
    billing_address?: string;
    shipping_address?: string;
    primary_contact_name?: string;
  };
  // Contact (the person to invite)
  full_name: string;
  email: string;
  phone?: string;
  whatsapp_number?: string;
  contact_role: "buyer" | "technician" | "admin" | "finance";
  assigned_rep_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Verify caller is an authenticated admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return json({ error: "Missing authorization" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isAdmin = (callerRoles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) return json({ error: "Forbidden — admin only" }, 403);

    // 2. Validate body
    const body = (await req.json()) as InviteBody;
    if (!body?.email || !body?.full_name || !body?.contact_role) {
      return json({ error: "Missing required fields: email, full_name, contact_role" }, 400);
    }
    if (!body.account_id && !body.new_account?.company_name) {
      return json({ error: "Provide account_id OR new_account.company_name" }, 400);
    }
    const email = body.email.trim().toLowerCase();

    // 3. Resolve / create account
    let accountId = body.account_id ?? null;
    if (!accountId && body.new_account) {
      const { data: acct, error: acctErr } = await admin
        .from("portal_accounts")
        .insert({
          company_name: body.new_account.company_name,
          gstin: body.new_account.gstin ?? null,
          industry: body.new_account.industry ?? null,
          billing_address: body.new_account.billing_address ?? null,
          shipping_address: body.new_account.shipping_address ?? null,
          primary_contact_name: body.new_account.primary_contact_name ?? body.full_name,
          assigned_rep_id: body.assigned_rep_id ?? null,
          status: "active",
        })
        .select("id")
        .single();
      if (acctErr) return json({ error: `Account create failed: ${acctErr.message}` }, 500);
      accountId = acct.id;
    }
    if (!accountId) return json({ error: "Could not resolve account" }, 500);

    // 4. Check if a contact with this email already exists in this account
    const { data: existingContact } = await admin
      .from("portal_contacts")
      .select("id, auth_user_id")
      .eq("account_id", accountId)
      .ilike("email", email)
      .maybeSingle();
    if (existingContact?.auth_user_id) {
      return json({ error: "This email is already invited for this account" }, 409);
    }

    // 5. Invite the user via Supabase admin (sends email with magic link)
    const redirectTo =
      (req.headers.get("origin") ?? "") + "/portal/set-password";
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: body.full_name, portal: true },
    });

    let authUserId = inviteData?.user?.id ?? null;

    // If user already exists in auth.users, look them up
    if (inviteErr && /already.*registered|already exists/i.test(inviteErr.message)) {
      const { data: list } = await admin.auth.admin.listUsers();
      const found = list?.users?.find((u) => u.email?.toLowerCase() === email);
      if (!found) return json({ error: "User exists but could not be located" }, 500);
      authUserId = found.id;
    } else if (inviteErr) {
      return json({ error: `Invite failed: ${inviteErr.message}` }, 500);
    }

    if (!authUserId) return json({ error: "No auth user id returned" }, 500);

    // 6. Upsert portal_contact
    let contactId: string;
    if (existingContact) {
      const { data: upd, error: updErr } = await admin
        .from("portal_contacts")
        .update({
          auth_user_id: authUserId,
          full_name: body.full_name,
          phone: body.phone ?? null,
          whatsapp_number: body.whatsapp_number ?? null,
          role: body.contact_role,
          is_active: true,
          invited_at: new Date().toISOString(),
        })
        .eq("id", existingContact.id)
        .select("id")
        .single();
      if (updErr) return json({ error: `Contact update failed: ${updErr.message}` }, 500);
      contactId = upd.id;
    } else {
      const { data: ins, error: insErr } = await admin
        .from("portal_contacts")
        .insert({
          account_id: accountId,
          auth_user_id: authUserId,
          full_name: body.full_name,
          email,
          phone: body.phone ?? null,
          whatsapp_number: body.whatsapp_number ?? null,
          role: body.contact_role,
          is_active: true,
          invited_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insErr) return json({ error: `Contact insert failed: ${insErr.message}` }, 500);
      contactId = ins.id;
    }

    // 7. Assign b2b_customer role (idempotent)
    await admin.from("user_roles").upsert(
      { user_id: authUserId, role: "b2b_customer" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );

    // 8. Default notification preferences row
    await admin
      .from("portal_notification_preferences")
      .upsert({ contact_id: contactId }, { onConflict: "contact_id", ignoreDuplicates: true });

    return json({ ok: true, account_id: accountId, contact_id: contactId, auth_user_id: authUserId }, 200);
  } catch (e) {
    console.error("portal-invite-customer error:", e);
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
