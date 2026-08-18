// Centralized internal-staff routing for portal notifications.
//
// One function decides who gets an email for a portal event. Both
// portal-sla-monitor and portal-notify import this — no duplicated
// routing tables, no "email every admin" fallback.
//
// Rules:
//   first_response_breach   -> (assignee, else rep) + supply_chain role
//                              + sales_manager role unless service_request
//   resolution_breach       -> (assignee, else rep) + supply_chain + sales_manager
//   ticket_created          -> assignee + rep + sales owner + supply_chain role
//   ticket_reply_to_staff   -> assignee + rep + sales owner + supply_chain role
//   ticket_assigned         -> assignee only
//   rfq_submitted           -> assignee + rep;   if none -> sales_manager role
//
// Portal tickets are owned end-to-end by supply chain, so the whole
// supply_chain role is always on ticket_created / ticket_reply_to_staff — an
// unassigned ticket must never be a ticket nobody hears about. Owner-first
// routing still applies on top so the assignee and the order's salesperson
// are never skipped.
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
  | "ticket_assigned"
  | "rfq_submitted";

export interface RoutingOpts {
  assignee?: string | null;
  accountRep?: string | null;
  /** sales_person_id on the ticket's related order, when there is one. */
  salesOwner?: string | null;
  ticketType?: string | null; // e.g. "service_request" | "support" | ...
}

export interface RoutingResult {
  userIds: string[];
  emails: string[];
  /**
   * userId <-> email pairs, for callers that need to reach the same people on
   * a second channel (Slack DM) and must know which address belongs to whom.
   * Users with no resolvable auth email are omitted from `emails` but kept
   * here with `email: null` so a Slack-only recipient is still reachable.
   */
  recipients: Array<{ userId: string; email: string | null }>;
  /** Human-readable breakdown of how each recipient was chosen (for logs). */
  reasons: string[];
}

async function idsForRole(admin: AdminClient, role: string): Promise<string[]> {
  const { data } = await admin.from("user_roles").select("user_id").eq("role", role);
  return ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
}

async function emailsForUserIds(
  admin: AdminClient,
  userIds: string[],
): Promise<Array<{ userId: string; email: string | null }>> {
  const out: Array<{ userId: string; email: string | null }> = [];
  for (const id of userIds) {
    let email: string | null = null;
    try {
      const { data } = await admin.auth.admin.getUserById(id);
      email = data?.user?.email ?? null;
    } catch { /* ignore */ }
    out.push({ userId: id, email });
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
      pushOwner();
      // supply_chain is on every breach, not just service requests — a
      // breached ticket is exactly the case where the owning team must hear
      // about it even if nobody was ever assigned.
      const scIds = await idsForRole(admin, "supply_chain");
      for (const id of scIds) userIds.push(id);
      reasons.push(`role:supply_chain(${scIds.length})`);
      if (!isServiceRequest) {
        const ids = await idsForRole(admin, "sales_manager");
        for (const id of ids) userIds.push(id);
        reasons.push(`role:sales_manager_escalation(${ids.length})`);
      }
      break;
    }
    case "resolution_breach": {
      pushOwner();
      const scIds = await idsForRole(admin, "supply_chain");
      for (const id of scIds) userIds.push(id);
      reasons.push(`role:supply_chain(${scIds.length})`);
      const ids = await idsForRole(admin, "sales_manager");
      for (const id of ids) userIds.push(id);
      reasons.push(`role:sales_manager_escalation(${ids.length})`);
      break;
    }
    case "ticket_assigned": {
      // Deliberately narrow: the new owner, nobody else. The team already
      // heard about this ticket when it was created.
      if (opts.assignee) { userIds.push(opts.assignee); reasons.push(`assignee:${opts.assignee}`); }
      break;
    }
    case "ticket_created":
    case "ticket_reply_to_staff": {
      if (opts.assignee) { userIds.push(opts.assignee); reasons.push(`assignee:${opts.assignee}`); }
      if (opts.accountRep && opts.accountRep !== opts.assignee) {
        userIds.push(opts.accountRep); reasons.push(`account_rep:${opts.accountRep}`);
      }
      if (opts.salesOwner && opts.salesOwner !== opts.assignee && opts.salesOwner !== opts.accountRep) {
        userIds.push(opts.salesOwner); reasons.push(`sales_owner:${opts.salesOwner}`);
      }
      // The supply-chain team is always on portal tickets, assigned or not.
      const scIds = await idsForRole(admin, "supply_chain");
      for (const id of scIds) userIds.push(id);
      reasons.push(`role:supply_chain(${scIds.length})`);
      if (userIds.length === 0) {
        const ids = await idsForRole(admin, "sales_manager");
        for (const id of ids) userIds.push(id);
        reasons.push(`role:sales_manager_fallback(${ids.length})`);
      }
      break;
    }
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
  const recipients = await emailsForUserIds(admin, uniqueIds);
  const emails = [...new Set(recipients.map((r) => r.email).filter((e): e is string => !!e))];
  return { userIds: uniqueIds, emails, recipients, reasons };
}