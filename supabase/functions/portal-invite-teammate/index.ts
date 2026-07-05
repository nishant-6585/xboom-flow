// Portal: invite a teammate (customer-admin self-service).
// Caller must be an authenticated portal_contact with role='admin'. The new
// teammate is added to the caller's account_id only — the caller cannot pick
// an arbitrary account.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail as sendMailSeam } from "../_shared/email.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  full_name: string;
  email: string;
  phone?: string;
  whatsapp_number?: string;
  contact_role: "buyer" | "technician" | "admin" | "finance";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve caller's portal contact and require admin role
    const { data: callerContact, error: ccErr } = await admin
      .from("portal_contacts")
      .select("id, account_id, role, is_active")
      .eq("auth_user_id", callerId)
      .eq("is_active", true)
      .maybeSingle();
    if (ccErr || !callerContact) return json({ error: "Not a portal user" }, 403);
    if (callerContact.role !== "admin") return json({ error: "Only customer admins can invite teammates" }, 403);

    const accountId = callerContact.account_id as string;

    const body = (await req.json()) as Body;
    if (!body?.email || !body?.full_name || !body?.contact_role) {
      return json({ error: "Missing required fields" }, 400);
    }
    const email = body.email.trim().toLowerCase();

    // Reject duplicates within this account
    const { data: existing } = await admin
      .from("portal_contacts")
      .select("id, auth_user_id")
      .eq("account_id", accountId)
      .ilike("email", email)
      .maybeSingle();
    if (existing?.auth_user_id) {
      return json({ error: "This email is already on your account" }, 409);
    }

    const PORTAL_BASE = "https://xboomflow.com";
    const redirectTo = `${PORTAL_BASE}/portal/set-password`;

    let authUserId: string | null = null;
    let isExistingUser = false;
    const tempPassword = crypto.randomUUID().slice(0, 16) + "Aa1!";

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: body.full_name, portal: true },
    });
    if (createErr) {
      if (/already.*registered|already exists/i.test(createErr.message)) {
        let page = 1;
        const perPage = 100;
        while (!authUserId) {
          const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage });
          if (listErr) return json({ error: `Lookup failed: ${listErr.message}` }, 500);
          const found = list?.users?.find((u) => u.email?.toLowerCase() === email);
          if (found) { authUserId = found.id; isExistingUser = true; break; }
          if (!list?.users || list.users.length < perPage) break;
          page++;
        }
        if (!authUserId) return json({ error: "User exists but could not be located" }, 500);
      } else {
        return json({ error: `User create failed: ${createErr.message}` }, 500);
      }
    } else {
      authUserId = created.user.id;
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (linkErr) return json({ error: `Link generation failed: ${linkErr.message}` }, 500);
    const hashedToken = linkData?.properties?.hashed_token;
    if (!hashedToken) return json({ error: "No token returned" }, 500);
    const actionLink = `${PORTAL_BASE}/portal/set-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;

    let contactId: string;
    if (existing) {
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
        .eq("id", existing.id)
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

    await admin.from("user_roles").upsert(
      { user_id: authUserId, role: "b2b_customer" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
    await admin
      .from("portal_notification_preferences")
      .upsert({ contact_id: contactId }, { onConflict: "contact_id", ignoreDuplicates: true });

    let emailSent = false;
    let emailError: string | null = null;
    {
      // Stable idempotency: per (contact, hashedToken) — each fresh invite
      // gets a new token, so re-invites send a new email; retries of the
      // same invocation collapse.
      const tokenFingerprint = hashedToken.slice(0, 24);
      const idempotencyKey = `portal-invite-teammate:${contactId}:${tokenFingerprint}`;
      try {
        const r = await sendMailSeam({
          provider: "platform",
          to: email,
          subject: "",
          html: "",
          templateName: "portal-invite-teammate",
          templateData: {
            full_name: body.full_name,
            action_link: actionLink,
            is_existing_user: isExistingUser,
          },
          idempotencyKey,
        });
        if (!r.ok) {
          emailError = `Email ${r.status}: ${r.error ?? ""}`.slice(0, 300);
        } else {
          emailSent = true;
        }
      } catch (e) {
        emailError = (e as Error).message;
      }
    }

    return json({ ok: true, contact_id: contactId, email_sent: emailSent, email_error: emailError });
  } catch (e) {
    console.error("portal-invite-teammate error:", e);
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});