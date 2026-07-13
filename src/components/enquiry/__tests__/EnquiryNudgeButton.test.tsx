import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock supabase client — realtime channel + query builder used in useEffect/refresh.
vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  const from = () => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: [] }),
        }),
      }),
    }),
  });
  return {
    supabase: {
      from,
      channel: () => channel,
      removeChannel: () => {},
      rpc: vi.fn().mockResolvedValue({ error: null }),
    },
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@test" }, profile: { full_name: "Tester" } }),
}));

vi.mock("@/lib/auditLog", () => ({ recordAuditLog: vi.fn() }));

import { EnquiryNudgeButton, formatRemaining } from "@/components/enquiry/EnquiryNudgeButton";

const RECENT = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30m ago
const OLD = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3h ago

describe("formatRemaining", () => {
  it("formats hours + minutes", () => {
    expect(formatRemaining((1 * 60 + 23) * 60_000)).toBe("1h 23m");
  });
  it("formats minutes only under an hour", () => {
    expect(formatRemaining(23 * 60_000)).toBe("23m");
  });
  it("formats exact hours cleanly", () => {
    expect(formatRemaining(2 * 60 * 60_000)).toBe("2h");
  });
  it("shows 'less than a minute' for sub-minute", () => {
    expect(formatRemaining(5_000)).toBe("less than a minute");
  });
});

describe("EnquiryNudgeButton visibility & state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is hidden when visible=false (non-sales roles)", () => {
    const { container } = render(
      <EnquiryNudgeButton
        enquiryId="e1"
        enquiryCreatedAt={OLD}
        enquiryStatus="pending"
        visible={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is disabled ghost variant for sales on pending enquiry within 2h window", () => {
    render(
      <EnquiryNudgeButton
        enquiryId="e1"
        enquiryCreatedAt={RECENT}
        enquiryStatus="pending"
        visible
      />
    );
    const btn = screen.getByTestId("enquiry-nudge-button");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("data-state")).toBe("pre-threshold");
  });

  it("is enabled outline variant for sales_manager on follow_up enquiry older than 2h", () => {
    render(
      <EnquiryNudgeButton
        enquiryId="e1"
        enquiryCreatedAt={OLD}
        enquiryStatus="follow_up"
        visible
      />
    );
    const btn = screen.getByTestId("enquiry-nudge-button");
    expect(btn).not.toBeDisabled();
    expect(btn.getAttribute("data-state")).toBe("ready");
  });
});