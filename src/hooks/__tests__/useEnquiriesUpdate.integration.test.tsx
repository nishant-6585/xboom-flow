import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";

/**
 * Integration test for useEnquiries.updateEnquiry — verifies that the
 * enquiry_messages "mirror" INSERT only fires when the enquiry status
 * transitions to "responded", and never for other statuses or empty
 * quote content.
 *
 * The Supabase client is mocked with a chainable builder that records
 * every `.insert(...)` call keyed by table name, so we can assert on
 * exactly which tables were written to for each status.
 */

type Insert = { table: string; row: Record<string, unknown> };
const inserts: Insert[] = [];

function makeQueryBuilder(table: string) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve({ data: [], error: null }),
    insert: (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      // The insert result must behave two ways:
      //  - `await from().insert(row)` → `{ error: null }`
      //  - `await from().insert(row).select().single()` → `{ data, error }`
      // Implemented as a thenable that also exposes .select().single().
      const result: any = {
        select: () => ({
          single: () => Promise.resolve({ data: { id: "new-id" }, error: null }),
        }),
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
          return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
        },
      };
      return result;
    },
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => {
  const channel: any = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: (table: string) => makeQueryBuilder(table),
      channel: () => channel,
      removeChannel: () => {},
      rpc: vi.fn().mockResolvedValue({ error: null }),
    },
  };
});

// Stable references — returning fresh objects each render would cause
// useEffect(fetch) to re-run forever.
const stableAuth = {
  user: { id: "user-1" },
  profile: { name: "Test SC" },
  role: "supply_chain" as const,
};
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => stableAuth,
}));

// Stable toast reference — returning a fresh object each render would
// change useCallback deps and trigger an infinite re-fetch loop.
const stableToast = { toast: vi.fn() };
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => stableToast,
  toast: vi.fn(),
}));

vi.mock("@/hooks/useSlackSettings", () => ({
  sendSlackNotification: vi.fn().mockResolvedValue(undefined),
}));

import { useEnquiries } from "@/hooks/useEnquiries";
import type { QueryStatus } from "@/hooks/useEnquiries";

const messageInserts = () => inserts.filter((i) => i.table === "enquiry_messages");

describe("useEnquiries.updateEnquiry — thread mirror gating", () => {
  beforeEach(() => {
    inserts.length = 0;
  });
  afterEach(() => {
    cleanup();
  });

  const cases: { status: QueryStatus; expectMirror: boolean }[] = [
    { status: "responded",         expectMirror: true  },
    { status: "pending",           expectMirror: false },
    { status: "follow_up",         expectMirror: false },
    { status: "on_hold",           expectMirror: false },
    { status: "moved_to_pipeline", expectMirror: false },
    { status: "order_won",         expectMirror: false },
    { status: "order_lost",        expectMirror: false },
  ];

  for (const { status, expectMirror } of cases) {
    it(`${expectMirror ? "posts" : "does NOT post"} into enquiry_messages when status = ${status}`, async () => {
      const { result } = renderHook(() => useEnquiries());

      await act(async () => {
        await result.current.updateEnquiry(
          "enq-1",
          status,
          { pricing: "₹1000", availability: "In stock", leadTime: "3 days", notes: "Ship tomorrow." },
          status === "order_lost" ? "pricing" : undefined,
        );
      });

      if (expectMirror) {
        await waitFor(() => expect(messageInserts()).toHaveLength(1));
        const row = messageInserts()[0].row;
        expect(row.enquiry_id).toBe("enq-1");
        expect(String(row.message)).toContain("Pricing: ₹1000");
        expect(String(row.message)).toContain("Ship tomorrow.");
      } else {
        expect(messageInserts()).toHaveLength(0);
      }
    });
  }

  it("does NOT post when status = responded but every quote field is empty/whitespace", async () => {
    const { result } = renderHook(() => useEnquiries());
    await act(async () => {
      await result.current.updateEnquiry("enq-2", "responded", {
        pricing: "  ",
        availability: "",
        leadTime: "\n",
        notes: "   ",
      });
    });
    expect(messageInserts()).toHaveLength(0);
  });

  it("posts exactly ONE mirror row for a responded transition with only notes", async () => {
    const { result } = renderHook(() => useEnquiries());
    await act(async () => {
      await result.current.updateEnquiry("enq-3", "responded", {
        notes: "Awaiting supplier confirmation, will update by EOD.",
      });
    });
    await waitFor(() => expect(messageInserts()).toHaveLength(1));
    expect(String(messageInserts()[0].row.message)).toBe(
      "Awaiting supplier confirmation, will update by EOD.",
    );
  });
});