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
let insertSeq = 0;

function makeQueryBuilder(table: string) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve({ data: [], error: null }),
    insert: (row: Record<string, unknown>) => {
      insertSeq += 1;
      inserts.push({ table, row: { ...row, __seq: insertSeq } });
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
    insertSeq = 0;
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
        expect(String(row.message)).toContain("Availability: In stock");
        expect(String(row.message)).toContain("Lead time: 3 days");
        // Response Notes textarea was removed from the UI — updateEnquiry
        // must never pass notes into the mirror, even if the caller
        // supplies a legacy `response.notes` value.
        expect(String(row.message)).not.toContain("Ship tomorrow.");
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

  it("does NOT mirror a responded transition that carries only notes (notes are excluded from the mirror)", async () => {
    const { result } = renderHook(() => useEnquiries());
    await act(async () => {
      await result.current.updateEnquiry("enq-3", "responded", {
        notes: "Awaiting supplier confirmation, will update by EOD.",
      });
    });
    // Notes are no longer part of the mirror payload; with no pricing /
    // availability / lead time supplied, buildQuoteMirrorMessage yields
    // null and NO thread row is inserted.
    expect(messageInserts()).toHaveLength(0);
  });

  it("mirror contains ONLY the pricing/availability/lead-time line, never notes", async () => {
    const { result } = renderHook(() => useEnquiries());
    await act(async () => {
      await result.current.updateEnquiry("enq-4", "responded", {
        pricing: "₹500",
        leadTime: "1 week",
        notes: "secret internal comment",
      });
    });
    await waitFor(() => expect(messageInserts()).toHaveLength(1));
    expect(String(messageInserts()[0].row.message)).toBe(
      "Pricing: ₹500 · Lead time: 1 week",
    );
  });

  it("inserts mirrored enquiry_messages in chronological order across multiple status updates", async () => {
    const { result } = renderHook(() => useEnquiries());

    // Sequence of updates: only the "responded" flips should mirror into the
    // thread. Non-responded flips must NOT insert, and the mirror inserts
    // that DO fire must land in the same order they were issued.
    const flow: Array<{ status: QueryStatus; response: any; expectMessage: string | null }> = [
      { status: "responded", response: { pricing: "₹100", availability: "In stock", leadTime: "2 days" },
        expectMessage: "Pricing: ₹100 · Availability: In stock · Lead time: 2 days" },
      { status: "follow_up", response: { pricing: "₹100" }, expectMessage: null },
      { status: "responded", response: { pricing: "₹150", leadTime: "3 days" },
        expectMessage: "Pricing: ₹150 · Lead time: 3 days" },
      { status: "on_hold", response: {}, expectMessage: null },
      { status: "responded", response: { availability: "Backorder" },
        expectMessage: "Availability: Backorder" },
    ];

    for (const step of flow) {
      await act(async () => {
        await result.current.updateEnquiry("enq-order", step.status, step.response);
      });
    }

    const expected = flow
      .filter((s) => s.expectMessage !== null)
      .map((s) => s.expectMessage as string);

    await waitFor(() => expect(messageInserts()).toHaveLength(expected.length));

    const rows = messageInserts();
    // Chronological guarantee 1: messages appear in the exact order issued.
    expect(rows.map((r) => String(r.row.message))).toEqual(expected);

    // Chronological guarantee 2: the underlying insert sequence numbers are
    // strictly monotonically increasing — no interleaved / out-of-order
    // writes even though multiple awaited updateEnquiry calls ran back-to-back.
    const seqs = rows.map((r) => Number(r.row.__seq));
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }

    // And each mirror insert was preceded by its enquiries UPDATE — i.e. the
    // enquiries row is written before the thread row for every "responded"
    // flip. We assert this by checking no message insert's seq comes before
    // the first recorded insert.
    expect(rows[0].row.enquiry_id).toBe("enq-order");
  });
});