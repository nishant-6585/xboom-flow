import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import {
  useWalkInLeads,
  useCreateWalkInLead,
  useExistingLeadMatches,
  useUpdateWalkInOutcome,
} from "@/hooks/useWalkInLeads";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const NOW = new Date();
const yesterday = new Date(NOW.getTime() - 864e5).toISOString();

function walkIn(over: Record<string, unknown> = {}) {
  return {
    lead_id: 1, name: "Ravi Kumar", phone: "9876543210", email: null,
    company: "Acme", status: "contacted", disposition: "prospect",
    assigned_to: "u-me", assigned_to_name: "Me", created_at: NOW.toISOString(),
    visited_at: NOW.toISOString(), store_location: "Bengaluru",
    products_interested: ["Agri Drone"], budget_range: null,
    purchase_timeline: "this_week", visit_outcome: null, follow_up_at: null,
    referral_source: "Google", accompanied_by: null, notes: null,
    follow_up_overdue: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockReset();
});

describe("useWalkInLeads", () => {
  it("summarises the queue so a rep sees what needs action", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "list_walk_in_leads"
        ? {
            data: [
              walkIn(),
              walkIn({ lead_id: 2, visit_outcome: "purchased" }),
              walkIn({ lead_id: 3, follow_up_overdue: true, visited_at: yesterday }),
            ],
            error: null,
          }
        : { data: null, error: null });

    const { result } = renderHook(() => useWalkInLeads(), { wrapper });
    await waitFor(() => expect(result.current.walkIns).toHaveLength(3));

    expect(result.current.stats.total).toBe(3);
    expect(result.current.stats.today).toBe(2);          // the third visited yesterday
    expect(result.current.stats.purchased).toBe(1);
    expect(result.current.stats.overdue).toBe(1);
    // Both the un-outcomed ones — an outcome nobody recorded is the thing
    // that quietly rots, so it gets its own counter.
    expect(result.current.stats.awaitingOutcome).toBe(2);
  });

  it("asks only for the caller's own walk-ins when scoped to mine", async () => {
    rpc.mockImplementation(async () => ({ data: [], error: null }));
    const { result } = renderHook(() => useWalkInLeads(true), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("list_walk_in_leads", { _mine_only: true, _limit: 300 });
  });
});

describe("useExistingLeadMatches", () => {
  it("does not query until there is enough contact detail to match on", async () => {
    rpc.mockImplementation(async () => ({ data: [], error: null }));
    const { result } = renderHook(() => useExistingLeadMatches("98765", ""), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.matches).toEqual([]);
  });

  it("looks up a full phone number, digits only", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "find_leads_by_contact"
        ? { data: [{ source: "website", source_row_id: "9", name: "Ravi", phone: "9876543210",
                     email: null, company: null, status: "new",
                     sales_person_name: "Suman", created_at: NOW.toISOString() }],
            error: null }
        : { data: null, error: null });

    const { result } = renderHook(
      () => useExistingLeadMatches("+91 98765 43210", ""), { wrapper });
    await waitFor(() => expect(result.current.matches).toHaveLength(1));
    // Formatting stripped, so +91/0/spacing variants collide as a human expects.
    expect(rpc).toHaveBeenCalledWith("find_leads_by_contact", {
      _phone: "919876543210",
      _email: null,
    });
  });

  it("matches on email alone when no phone is typed yet", async () => {
    rpc.mockImplementation(async () => ({ data: [], error: null }));
    renderHook(() => useExistingLeadMatches("", "ravi@acme.com"), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("find_leads_by_contact", {
      _phone: null,
      _email: "ravi@acme.com",
    });
  });
});

describe("useCreateWalkInLead", () => {
  it("creates through the RPC — assignment is the database's job, not the client's", async () => {
    rpc.mockImplementation(async () => ({ data: 42, error: null }));
    const { result } = renderHook(() => useCreateWalkInLead(), { wrapper });

    let id: number | undefined;
    await act(async () => {
      id = await result.current.mutateAsync({
        name: "Ravi Kumar", phone: "9876543210",
        products_interested: ["Agri Drone"], store_location: "Bengaluru",
      });
    });

    expect(id).toBe(42);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("create_walk_in_lead");
    // No assignee is sent — the trigger stamps the creator, so it cannot be
    // spoofed or forgotten by a future caller.
    expect(Object.keys(args)).not.toContain("_assigned_to");
    expect(args).toMatchObject({
      _name: "Ravi Kumar",
      _phone: "9876543210",
      _products_interested: ["Agri Drone"],
      _store_location: "Bengaluru",
    });
  });

  it("sends empty optional fields as null rather than empty strings", async () => {
    rpc.mockImplementation(async () => ({ data: 1, error: null }));
    const { result } = renderHook(() => useCreateWalkInLead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: "A", phone: "9876543210", email: "", company: "" });
    });
    const args = rpc.mock.calls[0][1];
    expect(args._email).toBeNull();
    expect(args._company).toBeNull();
  });

  it("surfaces a rejection instead of appearing to succeed", async () => {
    rpc.mockImplementation(async () => ({ data: null, error: { message: "only sales can record a walk-in" } }));
    const { result } = renderHook(() => useCreateWalkInLead(), { wrapper });
    await expect(
      result.current.mutateAsync({ name: "A", phone: "9876543210" }),
    ).rejects.toMatchObject({ message: "only sales can record a walk-in" });
  });
});

describe("useUpdateWalkInOutcome", () => {
  it("records an outcome against the lead", async () => {
    rpc.mockImplementation(async () => ({ data: null, error: null }));
    const { result } = renderHook(() => useUpdateWalkInOutcome(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ leadId: 7, visitOutcome: "purchased" });
    });
    expect(rpc).toHaveBeenCalledWith("update_walk_in_outcome", {
      _lead_id: 7, _visit_outcome: "purchased", _follow_up_at: null, _notes: null,
    });
  });
});
