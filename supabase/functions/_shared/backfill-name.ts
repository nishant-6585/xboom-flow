// Backfill a BLANK account/contact name from an order's customer_name.
//
// WHY: both onboarding paths (portal-invite, kyc-handler) set
// primary_contact_name / full_name ONLY when they first create the account. A
// reused account (returning customer, or a contact created before it had a
// name) never gets refreshed — so it can carry a blank/stale name that later
// fails KYC name-matching even though the order name is correct (the SATYAM
// KUMAR case).
//
// We fill blanks ONLY — never overwrite an intentionally-set name (e.g. a
// business "Purchasing Dept" contact), since a later order under a different
// individual shouldn't clobber it. The KYC matcher already tolerates differing
// names by also checking the order's customer_name.

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export async function backfillBlankAccountName(
  admin: AdminClient,
  accountId: string,
  name: string | null | undefined,
): Promise<void> {
  const clean = (name || "").trim();
  if (!clean || !accountId) return;

  const { data: acctRow } = await admin
    .from("portal_accounts")
    .select("primary_contact_name")
    .eq("id", accountId)
    .maybeSingle();
  if (!((acctRow?.primary_contact_name) || "").trim()) {
    await admin.from("portal_accounts")
      .update({ primary_contact_name: clean })
      .eq("id", accountId);
  }

  const { data: primaryContact } = await admin
    .from("portal_contacts")
    .select("id, full_name")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (primaryContact && !((primaryContact.full_name) || "").trim()) {
    await admin.from("portal_contacts")
      .update({ full_name: clean })
      .eq("id", primaryContact.id);
  }
}
