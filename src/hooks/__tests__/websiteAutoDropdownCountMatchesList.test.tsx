import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useOrdersFiltering, type UseOrdersFilteringArgs } from '../useOrdersFiltering';
import type { Order } from '../useOrders';
import type { WooCommerceOrder } from '../useWooCommerceOrders';
import { SYSTEM_USER_ID } from '@/lib/orderSource';

// End-to-end style: render the "WooCommerce (Vishal)" dropdown option label
// (which surfaces the sourceCounts.website_auto number) alongside the actual
// rendered list of unifiedRows filtered to source='website_auto'. The count
// in the dropdown MUST equal the number of list items — this is the invariant
// managers rely on when triaging the tab.

const mkOrder = (o: Partial<Order>): Order =>
  ({
    id: o.id ?? crypto.randomUUID(),
    order_number: o.order_number ?? 'ORD',
    status: 'po_received',
    payment_status: 'full',
    order_type: 'prepaid',
    customer_type: 'b2c',
    order_date: '2026-07-10T00:00:00Z',
    created_at: '2026-07-10T00:00:00Z',
    total_sales_amount: 1000,
    amount_paid: 1000,
    source: 'manual',
    external_id: null,
    sales_person_id: 'rep-1',
    ...o,
  }) as unknown as Order;

const mkWoo = (o: Partial<WooCommerceOrder>): WooCommerceOrder =>
  ({
    id: crypto.randomUUID(),
    woo_order_id: 'W1',
    order_number: 'W1',
    order_status: 'processing',
    payment_status: 'paid',
    created_at: '2026-07-10T00:00:00Z',
    woo_created_at: '2026-07-10T00:00:00Z',
    ...o,
  }) as unknown as WooCommerceOrder;

function baseArgs(
  orders: Order[],
  woo: WooCommerceOrder[],
): UseOrdersFilteringArgs {
  return {
    orders,
    shopifyOrders: [],
    wooOrders: woo,
    wooFailedNotifIds: new Set(),
    wooPendingNotifIds: new Set(),
    enquiryIdFromUrl: null,
    activeTab: 'list',
    searchQuery: '',
    statusFilter: 'all',
    paymentTermsFilter: 'all',
    paymentStatusFilter: 'all',
    orderTypeFilter: 'all',
    outcomeFilter: 'all',
    salesPersonFilter: 'all',
    customerTypeFilter: 'all',
    categoryFilter: 'all',
    startDate: undefined,
    endDate: undefined,
    sourceFilter: 'website_auto',
    shopifySearchQuery: '',
    shopifyStatusFilter: 'all',
    shopifyPaymentStatusFilter: 'all',
    shopifyStartDate: undefined,
    shopifyEndDate: undefined,
    wooSearchQuery: '',
    wooStatusFilter: 'all',
    wooPaymentStatusFilter: 'all',
    wooNotifFilter: 'all',
  };
}

function WooAutoView({ orders, woo }: { orders: Order[]; woo: WooCommerceOrder[] }) {
  const res = useOrdersFiltering(baseArgs(orders, woo));
  return (
    <div>
      <div data-testid="dropdown-label">
        WooCommerce (Vishal) ({res.sourceCounts.website_auto})
      </div>
      <ul data-testid="unified-list">
        {res.unifiedRows.map((r, i) => (
          <li key={i} data-testid="unified-row">
            {r.kind === 'manual'
              ? (r.row as any).order_number
              : (r.row as any).woo_order_id}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('E2E: "WooCommerce (Vishal)" dropdown count matches rendered list', () => {
  const cases: Array<{ name: string; orders: Order[]; woo: WooCommerceOrder[] }> = [
    { name: 'empty state', orders: [], woo: [] },
    { name: 'two live-feed only', orders: [], woo: [mkWoo({ woo_order_id: 'W1' }), mkWoo({ woo_order_id: 'W2' })] },
    {
      name: 'live feed + mirror dedupe',
      orders: [mkOrder({ source: 'website', external_id: 'W2', sales_person_id: SYSTEM_USER_ID })],
      woo: [mkWoo({ woo_order_id: 'W1' }), mkWoo({ woo_order_id: 'W2' })],
    },
    {
      name: 'attributed row must still hide its live-feed dupe',
      orders: [mkOrder({ source: 'manual', external_id: 'W3' })],
      woo: [mkWoo({ woo_order_id: 'W3' }), mkWoo({ woo_order_id: 'W4' })],
    },
  ];

  it.each(cases)('$name', ({ orders, woo }) => {
    render(<WooAutoView orders={orders} woo={woo} />);
    const label = screen.getByTestId('dropdown-label').textContent ?? '';
    const match = label.match(/\((\d+)\)/);
    const dropdownCount = match ? Number(match[1]) : NaN;
    const rendered = screen.queryAllByTestId('unified-row').length;
    expect(dropdownCount).toBe(rendered);
  });
});