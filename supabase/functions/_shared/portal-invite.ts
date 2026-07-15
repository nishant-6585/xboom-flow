// Shared helper for ensuring a portal_account + auth user + portal_contact
// exist for a given customer email, and minting (or reusing) a live
// non-consuming invite token. Drone-agnostic — used by both the
// customer-confirmation and portal-welcome (non-drone) paths.

import { backfillBlankAccountName } from "./backfill-name.ts";

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export const PORTAL_BASE = "https://xboomflow.com";

export interface EnsurePortalInviteOrder {
  id: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_company?: string | null;
  sales_person_id?: string | null;
}

export interface EnsurePortalInviteResult {
  activation_link: string;
  /** True when we just created/linked the auth user in this call — i.e.
   *  the customer did not previously have an activated portal account. */
  created_portal: boolean;
  /** True when an activated portal user already existed BEFORE this call.
   *  Callers use this to short-circuit "welcome" emails. */
  already_activated: boolean;
}

export async function ensurePortalInvite(
  admin: AdminClient,
  order: EnsurePortalInviteOrder,
): Promise<EnsurePortalInviteResult | null> {
  const email = (order.customer_email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const { data: contact } = await admin
    .from("portal_contacts")
    .select("id, account_id, auth_user_id")
    .ilike("email", email)
    .maybeSingle();

  const alreadyActivated = !!contact?.auth_user_id;
  let acctId: string | null = contact?.account_id ?? null;
  let authUserId: string | null = contact?.auth_user_id ?? null;
  const createdPortal = !alreadyActivated;

  if (!alreadyActivated) {
    if (!acctId) {
      const { data: acct, error: acctErr } = await admin
        .from("portal_accounts")
        .insert({
          company_name: order.customer_company || order.customer_name || "Customer",
          primary_contact_name: order.customer_name || null,
          assigned_rep_id: order.sales_person_id ?? null,
          status: "active",
        })
        .select("id").single();
      if (acctErr) { console.error("[ensurePortalInvite] account create failed", acctErr); return null; }
      acctId = acct.id;
    }

    if (!authUserId) {
      const tempPassword = crypto.randomUUID().slice(0, 16) + "Aa1!";
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
        user_metadata: { full_name: order.customer_name, portal: true },
      });
      if (createErr && /already.*registered|already exists/i.test(createErr.message)) {
        let page = 1;
        while (!authUserId) {
          const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 100 });
          // deno-lint-ignore no-explicit-any
          const found = list?.users?.find((u: any) => u.email?.toLowerCase() === email);
          if (found) { authUserId = found.id; break; }
          if (!list?.users || list.users.length < 100) break;
          page++;
        }
      } else if (createErr) {
        console.error("[ensurePortalInvite] auth user create failed", createErr);
        return null;
      } else {
        authUserId = created!.user.id;
      }
    }
    if (!authUserId || !acctId) return null;

    if (!contact) {
      await admin.from("portal_contacts").insert({
        account_id: acctId, auth_user_id: authUserId,
        full_name: order.customer_name || email.split("@")[0],
        email, role: "admin", is_active: true,
        invited_at: new Date().toISOString(),
      });
    } else if (!contact.auth_user_id) {
      await admin.from("portal_contacts").update({ auth_user_id: authUserId }).eq("id", contact.id);
    }
    await admin.from("user_roles").upsert(
      { user_id: authUserId, role: "b2b_customer" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  }
  if (!authUserId || !acctId) return null;

  // Keep a reused account's name fresh: backfill a blank name from this order so
  // KYC name-matching + the Customers list show the customer's real name.
  await backfillBlankAccountName(admin, acctId, order.customer_name);

  let token: string | null = null;
  const { data: liveInvite } = await admin
    .from("portal_invite_tokens")
    .select("token")
    .ilike("email", email)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  if (liveInvite?.token) {
    token = liveInvite.token;
  } else {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: inv, error: invErr } = await admin.from("portal_invite_tokens")
      .insert({ auth_user_id: authUserId, email, account_id: acctId, expires_at: expiresAt })
      .select("token").single();
    if (invErr) { console.error("[ensurePortalInvite] invite mint failed", invErr); return null; }
    token = inv.token;
  }
  return {
    activation_link: `${PORTAL_BASE}/portal/activate?invite=${encodeURIComponent(token!)}`,
    created_portal: createdPortal,
    already_activated: alreadyActivated,
  };
}