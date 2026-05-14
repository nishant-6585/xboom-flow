// Portal: invite a B2B customer (admin-only).
// Creates portal_account (if needed) + portal_contact + auth user, generates a
// recovery link, and emails it via Resend from notifications@xboom.in (same
// sender used for ticket/order notifications).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = "XBOOM Flow <notifications@xboom.in>";

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

    // 5. Create or look up the auth user (email_confirm: true so they can set a password right away)
    // Always use the production portal URL so the invite link works regardless of where the admin invited from.
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
        // Page through existing users to find by email
        let page = 1;
        const perPage = 100;
        while (!authUserId) {
          const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage });
          if (listErr) return json({ error: `Lookup failed: ${listErr.message}` }, 500);
          const found = list?.users?.find((u) => u.email?.toLowerCase() === email);
          if (found) {
            authUserId = found.id;
            isExistingUser = true;
            break;
          }
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

    // 5b. Generate a recovery link (works for both new + existing users)
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (linkErr) {
      return json({ error: `Link generation failed: ${linkErr.message}` }, 500);
    }
    // Build a direct link to our portal page using the hashed token so the
    // recipient never has to hit the raw Supabase verify endpoint (which
    // some networks fail to resolve and looks unbranded).
    const hashedToken = linkData?.properties?.hashed_token;
    if (!hashedToken) return json({ error: "No token returned" }, 500);
    const actionLink = `${PORTAL_BASE}/portal/set-password?token_hash=${encodeURIComponent(
      hashedToken,
    )}&type=recovery`;

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

    // 9. Send the branded invite email via Resend (notifications@xboom.in)
    let emailSent = false;
    let emailError: string | null = null;
    if (!RESEND_API_KEY) {
      emailError = "RESEND_API_KEY not configured";
    } else {
      const html = renderInviteEmail({
        fullName: body.full_name,
        actionLink,
        isExistingUser,
      });
      const subject = isExistingUser
        ? "You've been added to the XBOOM B2B Portal"
        : "You're invited to the XBOOM B2B Portal";
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_ADDRESS,
            to: [email],
            subject,
            html,
          }),
        });
        if (!r.ok) {
          const txt = await r.text();
          emailError = `Resend ${r.status}: ${txt.slice(0, 300)}`;
          console.error("Resend send failed:", emailError);
        } else {
          emailSent = true;
        }
      } catch (e) {
        emailError = (e as Error).message;
        console.error("Resend send threw:", emailError);
      }
    }

    return json(
      {
        ok: true,
        account_id: accountId,
        contact_id: contactId,
        auth_user_id: authUserId,
        email_sent: emailSent,
        email_error: emailError,
      },
      200,
    );
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

function renderInviteEmail(opts: { fullName: string; actionLink: string; isExistingUser: boolean }) {
  const { fullName, actionLink, isExistingUser } = opts;
  const heading = isExistingUser
    ? "You've been added to the XBOOM B2B Portal"
    : "Welcome to the XBOOM B2B Portal";
  const intro = isExistingUser
    ? "Your existing account has been linked to a B2B customer portal. Use the button below to set or reset your password and sign in."
    : "An admin has invited you to access the XBOOM B2B Portal. Click below to set your password and sign in.";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);">
        <tr><td style="background:#0c1e3e;padding:24px 28px;">
          <div style="font-size:22px;font-weight:700;letter-spacing:.3px;color:#ffffff;">
            x<span style="color:#d4af37;">boom</span>
            <span style="font-size:11px;letter-spacing:1.5px;color:rgba(255,255,255,.7);margin-left:10px;text-transform:uppercase;">Customer Portal</span>
          </div>
        </td></tr>
        <tr><td style="padding:32px 28px 8px 28px;">
          <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#0f172a;">${heading}</h1>
          <p style="margin:0 0 8px 0;font-size:15px;color:#334155;">Hi ${escapeHtml(fullName)},</p>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.55;color:#334155;">${intro}</p>
          <p style="margin:0 0 32px 0;">
            <a href="${actionLink}" style="display:inline-block;background:#0c1e3e;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px;">Set up my account</a>
          </p>
          <p style="margin:0 0 8px 0;font-size:13px;color:#64748b;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="margin:0 0 24px 0;font-size:12px;color:#475569;word-break:break-all;"><a href="${actionLink}" style="color:#0c1e3e;">${actionLink}</a></p>
          <p style="margin:0;font-size:12px;color:#94a3b8;">This link will expire in 24 hours. If you weren't expecting this invitation, you can ignore this email.</p>
        </td></tr>
        <tr><td style="padding:24px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
          XBOOM Flow · Customer Portal
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
