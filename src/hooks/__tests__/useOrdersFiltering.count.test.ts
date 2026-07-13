// Invariant: the count shown in the Website (Auto) source-filter dropdown
// must always equal the number of rows the unified list actually renders
// for that same source, across every combination of Woo + manual inputs.
// Both values are derived from the SAME buckets inside useOrdersFiltering,
// so this test locks that in against regressions.
import { describe, it, expect } from "vitest";
import { useOrdersFiltering, type UseOrdersFilteringArgs } from "../useOrdersFiltering";
import type { Order } from "../useOrders";
import type { WooCommerceOrder } from "../useWooCommerceOrders";
import { SYSTEM_USER_ID } from "@/lib/orderSource";

const baseArgs = (
  orders: Order[],
  wooOrders: WooCommerceOrder[],
  sourceFilter: UseOrdersFilteringArgs["sourceFilter"],
): UseOrdersFilteringArgs => ({
  orders,
  shopifyOrders: [],
  wooOrders,
  wooFailedNotifIds: new Set(),
  wooPendingNotifIds: new Set(),
  enquiryIdFromUrl: null,
  activeTab: "list",
  searchQuery: "",
  statusFilter: "all",
  paymentTermsFilter: "all",
  paymentStatusFilter: "all",
  orderTypeFilter: "all",
  outcomeFilter: "all",
  salesPersonFilter: "all",
  customerTypeFilter: "all",
  categoryFilter: "all",
  startDate: undefined,
  endDate: undefined,
  sourceFilter,
  shopifySearchQuery: "",
  shopifyStatusFilter: "all",
  shopifyPaymentStatusFilter: "all",
  shopifyStartDate: undefined,
  shopifyEndDate: undefined,
  wooSearchQuery: "",
  wooStatusFilter: "all",
  wooPaymentStatusFilter: "all",
  wooNotifFilter: "all",
});

const mkOrder = (o: Partial<Order>): Order =>
  ({
    id: o.id ?? crypto.randomUUID(),
    order_number: o.order_number ?? "ORD",
    status: o.status ?? "po_received",
    payment_status: o.payment_status ?? "full",
    order_type: "prepaid",
    customer_type: "b2c",
    order_date: o.order_date ?? "2026-07-10T00:00:00Z",
    created_at: o.created_at ?? "2026-07-10T00:00:00Z",
    total_sales_amount: o.total_sales_amount ?? 1000,
    amount_paid: o.amount_paid ?? 1000,
    source: o.source ?? "manual",
    external_id: o.external_id ?? null,
    sales_person_id: o.sales_person_id ?? "rep-1",
    ...o,
  }) as unknown as Order;

const mkWoo = (o: Partial<WooCommerceOrder>): WooCommerceOrder =>
  ({
    id: o.id ?? crypto.randomUUID(),
    woo_order_id: o.woo_order_id ?? "W1",
    order_number: o.order_number ?? "W1",
    order_status: o.order_status ?? "processing",
    payment_status: o.payment_status ?? "paid",
    created_at: o.created_at ?? "2026-07-10T00:00:00Z",
    woo_created_at: o.woo_created_at ?? "2026-07-10T00:00:00Z",
    ...o,
  }) as unknown as WooCommerceOrder;

describe("useOrdersFiltering — website_auto count matches list length", () => {
  const scenarios: Array<{
    name: string;
    orders: Order[];
    woo: WooCommerceOrder[];
  }> = [
    { name: "no data at all", orders: [], woo: [] },
    {
      name: "one live-feed Woo order, no mirrors",
      orders: [],
      woo: [mkWoo({ woo_order_id: "W1" })],
    },
    {
      name: "one mirrored+paid website order, no live feed",
      orders: [
        mkOrder({
          source: "website",
          external_id: "W2",
          payment_status: "full",
          sales_person_id: SYSTEM_USER_ID,
        }),
      ],
      woo: [],
    },
    {
      name: "mirror suppresses matching live-feed row",
      orders: [mkOrder({ source: "website", external_id: "W3", sales_person_id: SYSTEM_USER_ID })],
      woo: [
        mkWoo({ woo_order_id: "W3" }),
        mkWoo({ woo_order_id: "W4" }),
      ],
    },
    {
      name: "attributed (rep-owned) order still suppresses its Woo feed dupe and stays out of website_auto",
      orders: [mkOrder({ source: "manual", external_id: "W5" })],
      woo: [mkWoo({ woo_order_id: "W5" })],
    },
    {
      name: "mix of manual, attributed, system-owned backfill, mirrored, and live feed",
      orders: [
        mkOrder({ source: "manual", external_id: null }),
        mkOrder({ source: "manual", external_id: "W6" }),
        mkOrder({ source: "website", external_id: "W7", sales_person_id: SYSTEM_USER_ID }),
        // system-owned but source='manual' (older backfill) — must land in website_auto
        mkOrder({ source: "manual", external_id: "W9", sales_person_id: SYSTEM_USER_ID }),
      ],
      woo: [mkWoo({ woo_order_id: "W6" }), mkWoo({ woo_order_id: "W8" })],
    },
  ];

  it.each(scenarios)(
    "$name — website_auto count === website_auto unifiedRows length",
    ({ orders, woo }) => {
      const res = useOrdersFiltering(baseArgs(orders, woo, "website_auto"));
      expect(res.sourceCounts.website_auto).toBe(res.unifiedRows.length);
    },
  );

  it.each(scenarios)(
    "$name — manual count === manual unifiedRows length",
    ({ orders, woo }) => {
      const res = useOrdersFiltering(baseArgs(orders, woo, "manual"));
      expect(res.sourceCounts.manual).toBe(res.unifiedRows.length);
    },
  );

  it.each(scenarios)(
    "$name — all count === all unifiedRows length AND manual+website_auto",
    ({ orders, woo }) => {
      const res = useOrdersFiltering(baseArgs(orders, woo, "all"));
      expect(res.sourceCounts.all).toBe(res.unifiedRows.length);
      expect(res.sourceCounts.all).toBe(
        res.sourceCounts.manual + res.sourceCounts.website_auto,
      );
    },
  );
});