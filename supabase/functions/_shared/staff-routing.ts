// Centralized internal-staff routing for portal notifications.
//
// One function decides who gets an email for a portal event. Both
// portal-sla-monitor and portal-notify import this — no duplicated
// routing tables, no "email every admin" fallback.
//
// Rules:
//   first_response_breach   -> assignee, else account rep, else sales_manager role
//   resolution_breach       -> (assignee, else rep) + sales_manager role
//   *service_request*       -> (assignee, else rep) + supply_chain role  (overrides sales_manager)
//   ticket_created          -> assignee + rep;   if none -> sales_manager role
//   ticket_reply_to_staff   -> assignee + rep;   if none -> sales_manager role
//   rfq_submitted           -> assignee + rep;   if none -> sales_manager role
//
// Admins (and by extension the CEO) are NEVER added here. Admin visibility
// is preserved through the in-app notifications table only.

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export type RoutingEvent =
  | "first_response_breach"
  | "resolution_breach"
  | "ticket_created"
  | "ticket_reply_to_staff"
  | "rfq_submitted";

export interface RoutingOpts {
  assignee?: string | null;
  accountRep?: string | null;
  ticketType?: string | null; // e.g. "service_request" | "support" | ...
}

export interface RoutingResult {
  userIds: string[];
  emails: string[];
  /** Human-readable breakdown of how each recipient was chosen (for logs). */
  reasons: string[];
}

async function idsForRole(admin: AdminClient, role: string): Promise<string[]> {
  const { data } = await admin.from("user_roles").select("user_id").eq("role", role);
  return ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
}

async function emailsForUserIds(admin: AdminClient, userIds: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of userIds) {
    try {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data?.user?.email) out.push(data.user.email);
    } catch { /* ignore */ }
  }
  return out;
}

export async function resolveRecipients(
  admin: AdminClient,
  event: RoutingEvent,
  opts: RoutingOpts,
): Promise<RoutingResult> {
  const userIds: string[] = [];
  const reasons: string[] = [];
  const isServiceRequest = opts.ticketType === "service_request";

  const pushOwner = () => {
    if (opts.assignee) { userIds.push(opts.assignee); reasons.push(`assignee:${opts.assignee}`); return true; }
    if (opts.accountRep) { userIds.push(opts.accountRep); reasons.push(`account_rep:${opts.accountRep}`); return true; }
    return false;
  };

  switch (event) {
    case "first_response_breach": {
      const hasOwner = pushOwner();
      if (isServiceRequest) {
        const ids = await idsForRole(admin, "supply_chain");
        for (const id of ids) userIds.push(id);
        reasons.push(`role:supply_chain(${ids.length})`);
      } else if (!hasOwner) {
        const ids = await idsForRole(admin, "sales_manager");
        for (const id of ids) userIds.push(id);
        reasons.push(`role:sales_manager_fallback(${ids.length})`);
      }
      break;
    }
    case "resolution_breach": {
      pushOwner();
      if (isServiceRequest) {
        const ids = await idsForRole(admin, "supply_chain");
        for (const id of ids) userIds.push(id);
        reasons.push(`role:supply_chain(${ids.length})`);
      } else {
        const ids = await idsForRole(admin, "sales_manager");
        for (const id of ids) userIds.push(id);
        reasons.push(`role:sales_manager_escalation(${ids.length})`);
      }
      break;
    }
    case "ticket_created":
    case "ticket_reply_to_staff":
    case "rfq_submitted": {
      if (opts.assignee) { userIds.push(opts.assignee); reasons.push(`assignee:${opts.assignee}`); }
      if (opts.accountRep && opts.accountRep !== opts.assignee) {
        userIds.push(opts.accountRep); reasons.push(`account_rep:${opts.accountRep}`);
      }
      if (userIds.length === 0) {
        const ids = await idsForRole(admin, "sales_manager");
        for (const id of ids) userIds.push(id);
        reasons.push(`role:sales_manager_fallback(${ids.length})`);
      }
      break;
    }
  }

  const uniqueIds = [...new Set(userIds)];
  const emails = [...new Set(await emailsForUserIds(admin, uniqueIds))];
  return { userIds: uniqueIds, emails, reasons };
}