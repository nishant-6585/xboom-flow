import { describe, it, expect } from "vitest";
import { resolveRecipients } from "../staff-routing.ts";

/**
 * Minimal stand-in for the service-role Supabase client. Only the two calls
 * resolveRecipients makes are modelled: a user_roles lookup by role, and the
 * auth admin email lookup.
 */
function fakeAdmin(roleMembers: Record<string, string[]>, emails: Record<string, string> = {}) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, role: string) => ({
          data: table === "user_roles"
            ? (roleMembers[role] ?? []).map((user_id) => ({ user_id }))
            : [],
        }),
      }),
    }),
    auth: {
      admin: {
        getUserById: (id: string) =>
          Promise.resolve({ data: emails[id] ? { user: { email: emails[id] } } : null }),
      },
    },
  };
}

const TEAM = {
  supply_chain: ["sc1", "sc2"],
  sales_manager: ["sm1"],
};
const EMAILS = {
  sc1: "sc1@xboom.in",
  sc2: "sc2@xboom.in",
  sm1: "sm1@xboom.in",
  owner: "owner@xboom.in",
  rep: "rep@xboom.in",
};

describe("resolveRecipients — portal ticket events", () => {
  it("alerts the whole supply-chain team on a brand-new unassigned ticket", async () => {
    const r = await resolveRecipients(fakeAdmin(TEAM, EMAILS), "ticket_created", {
      assignee: null,
      accountRep: null,
      ticketType: "general",
    });
    // This is the case that was silently dropping before: no assignee, no rep,
    // no linked order — previously it fell through to sales_manager only.
    expect(r.userIds).toEqual(expect.arrayContaining(["sc1", "sc2"]));
    expect(r.emails).toEqual(expect.arrayContaining(["sc1@xboom.in", "sc2@xboom.in"]));
  });

  it("keeps the team on the thread even after a ticket is assigned", async () => {
    const r = await resolveRecipients(fakeAdmin(TEAM, EMAILS), "ticket_reply_to_staff", {
      assignee: "owner",
      accountRep: null,
      ticketType: "general",
    });
    expect(r.userIds).toContain("owner");
    expect(r.userIds).toEqual(expect.arrayContaining(["sc1", "sc2"]));
  });

  it("includes the related order's salesperson alongside the team", async () => {
    const r = await resolveRecipients(fakeAdmin(TEAM, EMAILS), "ticket_created", {
      assignee: null,
      accountRep: "rep",
      salesOwner: "owner",
      ticketType: "general",
    });
    expect(r.userIds).toEqual(expect.arrayContaining(["rep", "owner", "sc1", "sc2"]));
  });

  it("does not duplicate a person who is both assignee and account rep", async () => {
    const r = await resolveRecipients(fakeAdmin(TEAM, EMAILS), "ticket_created", {
      assignee: "owner",
      accountRep: "owner",
      salesOwner: "owner",
      ticketType: "general",
    });
    expect(r.userIds.filter((u) => u === "owner")).toHaveLength(1);
  });

  it("narrows an assignment alert to the new owner only", async () => {
    const r = await resolveRecipients(fakeAdmin(TEAM, EMAILS), "ticket_assigned", {
      assignee: "owner",
      accountRep: "rep",
      ticketType: "general",
    });
    expect(r.userIds).toEqual(["owner"]);
  });

  it("puts supply chain on every SLA breach, not just service requests", async () => {
    const r = await resolveRecipients(fakeAdmin(TEAM, EMAILS), "first_response_breach", {
      assignee: null,
      accountRep: null,
      ticketType: "general",
    });
    expect(r.userIds).toEqual(expect.arrayContaining(["sc1", "sc2"]));
    // A general-ticket breach also escalates to sales managers.
    expect(r.userIds).toContain("sm1");
  });

  it("escalates a resolution breach to both supply chain and sales managers", async () => {
    const r = await resolveRecipients(fakeAdmin(TEAM, EMAILS), "resolution_breach", {
      assignee: "owner",
      accountRep: null,
      ticketType: "service_request",
    });
    expect(r.userIds).toEqual(expect.arrayContaining(["owner", "sc1", "sc2", "sm1"]));
  });

  it("pairs each recipient with their address so Slack can reach the same people", async () => {
    const r = await resolveRecipients(fakeAdmin(TEAM, EMAILS), "ticket_created", {
      assignee: "owner",
      ticketType: "general",
    });
    expect(r.recipients).toEqual(
      expect.arrayContaining([{ userId: "owner", email: "owner@xboom.in" }]),
    );
  });

  it("keeps a recipient with no auth email reachable for Slack", async () => {
    const r = await resolveRecipients(fakeAdmin(TEAM, {}), "ticket_created", {
      assignee: "ghost",
      ticketType: "general",
    });
    expect(r.emails).toHaveLength(0);
    expect(r.recipients).toEqual(
      expect.arrayContaining([{ userId: "ghost", email: null }]),
    );
  });

  it("leaves rfq routing on its original owner-first rules", async () => {
    const r = await resolveRecipients(fakeAdmin(TEAM, EMAILS), "rfq_submitted", {
      assignee: null,
      accountRep: null,
    });
    expect(r.userIds).toEqual(["sm1"]);
  });
});
