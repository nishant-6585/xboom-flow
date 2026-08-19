import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/components/Header", () => ({ Header: () => <div /> }));
vi.mock("@/components/admin/AdminTabsNav", () => ({ default: () => <div /> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
vi.mock("@/portal/lib/portalNotify", () => ({ notifyPortal: vi.fn() }));

import PortalTicketsAdmin from "@/pages/admin/PortalTicketsAdmin";
import {
  usePortalTicketAssignees,
  useAssignPortalTicket,
  usePortalTicketPool,
  useSetPortalTicketAssignable,
} from "@/hooks/usePortalTicketAssignees";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    ticket_number: "TCK-001",
    subject: "When will the product dispatch?",
    status: "open",
    priority: "critical",
    ticket_type: "general",
    category: "delivery_issue",
    account_id: "a1",
    company_name: "Acme Farms",
    related_order_id: null,
    related_order_number: null,
    related_product_name: null,
    customer_email: "buyer@acme.com",
    item_summary: null,
    assigned_to: null,
    assigned_to_name: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    first_response_at: null,
    resolved_at: null,
    sla_first_response_due_at: null,
    sla_resolution_due_at: null,
    last_message_at: null,
    last_message_by_customer: true,
    unread_customer_count: 1,
    ...over,
  };
}

const ASSIGNEES = [
  {
    user_id: "u-sc", name: "Suman Das", email: "suman@xboom.in",
    role: "supply_chain", in_slack_channel: true, assigned_count: 3,
  },
  {
    user_id: "u-sm", name: "Vishal R", email: "vishal@xboom.in",
    role: "sales_manager", in_slack_channel: true, assigned_count: 2,
  },
];

function mockRpc(rows: Record<string, unknown>[]) {
  rpc.mockImplementation(async (name: string) => {
    if (name === "list_portal_ticket_inbox") return { data: rows, error: null };
    if (name === "list_portal_ticket_assignees") return { data: ASSIGNEES, error: null };
    return { data: null, error: null };
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PortalTicketsAdmin />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Portal Tickets inbox — ownership is visible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockReset();
  });

  it("flags a ticket nobody owns, so it cannot sit unattended unnoticed", async () => {
    mockRpc([row()]);
    renderPage();
    expect(await screen.findByTestId("unassigned-badge-t1")).toBeInTheDocument();
    expect(screen.getByText(/1 unassigned/)).toBeInTheDocument();
  });

  it("shows the owner and drops the unassigned flag once someone takes it", async () => {
    mockRpc([row({ assigned_to: "u-sc", assigned_to_name: "Suman Das" })]);
    renderPage();
    const select = await screen.findByTestId("assignee-select-t1");
    expect(select).toHaveTextContent("Suman Das");
    expect(screen.queryByTestId("unassigned-badge-t1")).not.toBeInTheDocument();
    expect(screen.getByText(/0 unassigned/)).toBeInTheDocument();
  });

  it("counts only the unowned tickets in the header", async () => {
    mockRpc([
      row(),
      row({ id: "t2", ticket_number: "TCK-002", assigned_to: "u-sc", assigned_to_name: "Suman Das" }),
      row({ id: "t3", ticket_number: "TCK-003" }),
    ]);
    renderPage();
    await screen.findByText("TCK-001");
    expect(screen.getByText(/2 unassigned/)).toBeInTheDocument();
  });
});

describe("usePortalTicketAssignees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockReset();
  });

  it("lists internal users from the security-definer RPC", async () => {
    mockRpc([]);
    const { result } = renderHook(() => usePortalTicketAssignees(), { wrapper });
    await waitFor(() => expect(result.current.assignees).toHaveLength(2));
    expect(rpc).toHaveBeenCalledWith("list_portal_ticket_assignees");
    expect(result.current.assignees[0]).toMatchObject({
      user_id: "u-sc",
      name: "Suman Das",
      role: "supply_chain",
      in_slack_channel: true,
      assigned_count: 3,
    });
  });

  it("falls back to the email when a profile has no name", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "list_portal_ticket_assignees") {
        return {
          data: [{
            user_id: "u-x", name: null, email: "x@xboom.in",
            role: "supply_chain", in_slack_channel: true, assigned_count: 0,
          }],
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const { result } = renderHook(() => usePortalTicketAssignees(), { wrapper });
    await waitFor(() => expect(result.current.assignees).toHaveLength(1));
    expect(result.current.assignees[0].name).toBe("x@xboom.in");
  });
});

describe("useAssignPortalTicket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockReset();
  });

  it("assigns through the RPC — the write that fires the owner's alerts", async () => {
    mockRpc([]);
    const { result } = renderHook(() => useAssignPortalTicket(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ticketId: "t1", userId: "u-sc" });
    });
    expect(rpc).toHaveBeenCalledWith("assign_portal_ticket", {
      _ticket_id: "t1",
      _user_id: "u-sc",
    });
  });

  it("clears the owner by passing null rather than an empty string", async () => {
    mockRpc([]);
    const { result } = renderHook(() => useAssignPortalTicket(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ticketId: "t1", userId: null });
    });
    expect(rpc).toHaveBeenCalledWith("assign_portal_ticket", {
      _ticket_id: "t1",
      _user_id: null,
    });
  });

  it("surfaces an RLS rejection instead of silently succeeding", async () => {
    rpc.mockImplementation(async () => ({ data: null, error: { message: "forbidden" } }));
    const { result } = renderHook(() => useAssignPortalTicket(), { wrapper });
    await expect(
      result.current.mutateAsync({ ticketId: "t1", userId: "u-sc" }),
    ).rejects.toMatchObject({ message: "forbidden" });
  });
});

describe("assignment pool fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockReset();
  });

  it("flags rows as outside the Slack channel when the pool is empty", async () => {
    // The RPC falls back to the role-based list and marks the rows, so the
    // admin UI can warn that assignment is wider than #customer-portal-ticket.
    rpc.mockImplementation(async (name: string) => {
      if (name === "list_portal_ticket_assignees") {
        return {
          data: [{
            user_id: "u-any", name: "Some Admin", email: "a@xboom.in",
            role: "admin", in_slack_channel: false, assigned_count: 0,
          }],
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const { result } = renderHook(() => usePortalTicketAssignees(), { wrapper });
    await waitFor(() => expect(result.current.assignees).toHaveLength(1));
    expect(result.current.assignees[0].in_slack_channel).toBe(false);
  });

  it("treats a missing in_slack_channel field as in-channel rather than warning", async () => {
    // Defensive: an older RPC shape must not light up the amber fallback banner.
    rpc.mockImplementation(async (name: string) => {
      if (name === "list_portal_ticket_assignees") {
        return {
          data: [{ user_id: "u-a", name: "A", email: "a@x.in", role: "supply_chain" }],
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const { result } = renderHook(() => usePortalTicketAssignees(), { wrapper });
    await waitFor(() => expect(result.current.assignees).toHaveLength(1));
    expect(result.current.assignees[0].in_slack_channel).toBe(true);
    expect(result.current.assignees[0].assigned_count).toBe(0);
  });
});

describe("rotation opt-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockReset();
  });

  const POOL = [
    {
      user_id: "u-sc", name: "Sanu Sabu", email: "sanu@xboom.in", role: "supply_chain",
      slack_handle: "Sanu Sabu", is_active: true, is_assignable: true,
      assigned_count: 4, last_assigned_at: "2026-08-19T10:00:00Z",
    },
    {
      user_id: "u-admin", name: "Nishant Kumar", email: "n@xboom.in", role: "admin",
      slack_handle: "Nishant Kumar", is_active: true, is_assignable: false,
      assigned_count: 1, last_assigned_at: "2026-08-19T09:00:00Z",
    },
  ];

  it("lists channel members who are opted out, so the state stays visible", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "list_portal_ticket_pool" ? { data: POOL, error: null } : { data: null, error: null });
    const { result } = renderHook(() => usePortalTicketPool(), { wrapper });
    await waitFor(() => expect(result.current.pool).toHaveLength(2));
    // Still in the channel, just not taking a turn — the dropdown hides them
    // but the admin panel must not, or an opt-out looks like a failed sync.
    expect(result.current.pool[1]).toMatchObject({ is_active: true, is_assignable: false });
  });

  it("keeps an opted-out member out of the assignable list the dropdown uses", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "list_portal_ticket_assignees"
        ? { data: [{ ...POOL[0], in_slack_channel: true }], error: null }
        : { data: null, error: null });
    const { result } = renderHook(() => usePortalTicketAssignees(), { wrapper });
    await waitFor(() => expect(result.current.assignees).toHaveLength(1));
    expect(result.current.assignees.map((a) => a.user_id)).not.toContain("u-admin");
  });

  it("toggles a member out of the rotation through the RPC", async () => {
    rpc.mockImplementation(async () => ({ data: null, error: null }));
    const { result } = renderHook(() => useSetPortalTicketAssignable(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ userId: "u-admin", assignable: false });
    });
    expect(rpc).toHaveBeenCalledWith("set_portal_ticket_assignable", {
      _user_id: "u-admin",
      _assignable: false,
    });
  });

  it("surfaces a rejection rather than appearing to succeed", async () => {
    rpc.mockImplementation(async () => ({ data: null, error: { message: "forbidden" } }));
    const { result } = renderHook(() => useSetPortalTicketAssignable(), { wrapper });
    await expect(
      result.current.mutateAsync({ userId: "u-admin", assignable: true }),
    ).rejects.toMatchObject({ message: "forbidden" });
  });
});
