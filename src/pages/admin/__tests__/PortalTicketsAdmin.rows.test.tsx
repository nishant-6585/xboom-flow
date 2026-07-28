import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// Mock supabase client so useTicketInbox returns deterministic rows.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (name: string) => {
      if (name === "list_portal_ticket_inbox") {
        return {
          data: [
            {
              id: "t1",
              ticket_number: "TCK-001",
              subject: "Drone won't power on",
              status: "open",
              priority: "high",
              ticket_type: "general",
              category: "delivery_issue",
              account_id: "a1",
              company_name: "Acme Farms",
              related_order_id: "o1",
              related_order_number: "W-2024-0099",
              related_product_name: null,
              customer_email: "buyer@acme.com",
              item_summary: "Agri Drone × 1, Battery × 2",
              assigned_to: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              first_response_at: null,
              resolved_at: null,
              sla_first_response_due_at: null,
              sla_resolution_due_at: null,
              last_message_at: null,
              last_message_by_customer: true,
              unread_customer_count: 2,
            },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    }),
  },
}));

// Header and AdminTabsNav pull in the whole app; stub them out.
vi.mock("@/components/Header", () => ({ Header: () => <div /> }));
vi.mock("@/components/admin/AdminTabsNav", () => ({ default: () => <div /> }));

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

describe("Portal Tickets inbox rows", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the WooCommerce order number, customer email, and item summary inline", async () => {
    renderPage();
    // Order number appears inline
    expect(await screen.findByText(/Order W-2024-0099/)).toBeInTheDocument();
    // Customer email
    expect(screen.getByTestId("row-customer-email")).toHaveTextContent(
      "buyer@acme.com",
    );
    // Item summary
    expect(screen.getByTestId("row-item-summary")).toHaveTextContent(
      "Agri Drone × 1, Battery × 2",
    );
  });

  it("renders a bulk-actions toolbar with mark-as-read and status controls", async () => {
    renderPage();
    const toolbar = await screen.findByTestId("bulk-toolbar");
    expect(within(toolbar).getByRole("button", { name: /Mark as read/i }))
      .toBeInTheDocument();
    expect(within(toolbar).getByText(/Change status/i)).toBeInTheDocument();
  });
});
