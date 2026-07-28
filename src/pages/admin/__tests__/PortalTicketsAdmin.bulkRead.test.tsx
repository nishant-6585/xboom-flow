import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";

const successToast = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (msg: string) => successToast(msg), error: vi.fn() },
}));

// Auth stub
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

// Shell stubs
vi.mock("@/components/Header", () => ({ Header: () => <div /> }));
vi.mock("@/components/admin/AdminTabsNav", () => ({ default: () => <div /> }));
vi.mock("@/portal/lib/portalNotify", () => ({ notifyPortal: vi.fn() }));

// Fixtures
function makeRow(id: string, unread: number) {
  return {
    id,
    ticket_number: `TCK-${id}`,
    subject: `Subject ${id}`,
    status: "open",
    priority: "medium",
    ticket_type: "general",
    category: "delivery_issue",
    account_id: "acc",
    company_name: `Company ${id}`,
    related_order_id: `o-${id}`,
    related_order_number: `W-${id}`,
    related_product_name: null,
    customer_email: `buyer-${id}@example.com`,
    item_summary: `Item ${id}`,
    assigned_to: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    first_response_at: null,
    resolved_at: null,
    sla_first_response_due_at: null,
    sla_resolution_due_at: null,
    last_message_at: null,
    last_message_by_customer: true,
    unread_customer_count: unread,
  };
}

const initialRows = [
  makeRow("t1", 2),
  makeRow("t2", 3),
  makeRow("t3", 0),
];
const clearedRows = initialRows.map((r) => ({ ...r, unread_customer_count: 0 }));

// Mutable state so refetch returns updated rows after bulk mark-as-read
const state = { rows: initialRows };
const markReadSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (name: string, args?: any) => {
      if (name === "list_portal_ticket_inbox") {
        return { data: state.rows, error: null };
      }
      if (name === "list_portal_ticket_reads") {
        return { data: [], error: null };
      }
      if (name === "mark_portal_tickets_read") {
        markReadSpy(args);
        state.rows = clearedRows;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }),
  },
}));

import PortalTicketsAdmin from "@/pages/admin/PortalTicketsAdmin";

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PortalTicketsAdmin />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Portal Tickets inbox — bulk mark-as-read", () => {
  beforeEach(() => {
    state.rows = initialRows;
    markReadSpy.mockClear();
    successToast.mockClear();
  });

  it("selects two tickets, marks them as read, and updates UI + backend", async () => {
    renderPage();

    // Two amber "new from customer" badges should render for t1 and t2
    await waitFor(() => {
      expect(screen.getAllByText(/new from customer/i)).toHaveLength(2);
    });

    // Select t1 and t2 via their row checkboxes
    const cb1 = screen.getByLabelText("Select ticket TCK-t1");
    const cb2 = screen.getByLabelText("Select ticket TCK-t2");
    fireEvent.click(cb1);
    fireEvent.click(cb2);

    expect(await screen.findByText(/2 selected/)).toBeInTheDocument();

    // Click Mark as read
    fireEvent.click(screen.getByRole("button", { name: /Mark as read/i }));

    // Backend call fired with both ids
    await waitFor(() => {
      expect(markReadSpy).toHaveBeenCalledTimes(1);
    });
    const args = markReadSpy.mock.calls[0][0];
    expect(args._ticket_ids).toEqual(expect.arrayContaining(["t1", "t2"]));
    expect(args._ticket_ids).toHaveLength(2);

    // Success toast reported
    expect(successToast).toHaveBeenCalledWith(
      expect.stringMatching(/Marked 2 ticket\(s\) as read/i),
    );

    // After refetch, the unread badges disappear
    await waitFor(() => {
      expect(screen.queryByText(/new from customer/i)).not.toBeInTheDocument();
    });
  });
});