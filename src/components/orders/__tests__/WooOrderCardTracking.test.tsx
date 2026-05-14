import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/orders/WooOrderStatusActions', () => ({
  WooOrderStatusActions: () => null,
}));
vi.mock('@/components/orders/WooWhatsappStatus', () => ({
  WooWhatsappStatus: () => null,
}));

import { WooOrderCard } from '@/components/orders/WooOrderCard';

const base: any = {
  woo_order_id: 'w1',
  order_number: '999',
  product_name: 'Drone',
  customer_name: 'Foo',
  customer_email: 'foo@example.com',
  customer_phone: '9999999999',
  quantity: 1,
  total_sales_amount: 5000,
  selling_price: 5000,
  payment_status: 'paid',
  order_status: 'processing',
  woo_created_at: '2025-01-01T00:00:00Z',
  woo_updated_at: '2025-01-01T00:00:00Z',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  tracking_status: null,
  tracking_number: null,
  courier: null,
};

describe('WooOrderCard tracking display', () => {
  it('shows courier when only courier is set', () => {
    render(<WooOrderCard order={{ ...base, courier: 'DTDC' }} />);
    expect(screen.getByText('DTDC')).toBeInTheDocument();
  });

  it('shows tracking number when only tracking_number is set', () => {
    render(<WooOrderCard order={{ ...base, tracking_number: 'AWB123' }} />);
    expect(screen.getByText('AWB123')).toBeInTheDocument();
  });

  it('shows tracking_status label when set', () => {
    render(<WooOrderCard order={{ ...base, tracking_status: 'in_transit' }} />);
    expect(screen.getByText(/in_transit/i)).toBeInTheDocument();
  });

  it('shows courier + tracking number together when both set', () => {
    render(
      <WooOrderCard
        order={{ ...base, courier: 'Bluedart', tracking_number: 'BD42' }}
      />,
    );
    expect(screen.getByText('Bluedart')).toBeInTheDocument();
    expect(screen.getByText('BD42')).toBeInTheDocument();
  });

  it('hides tracking block when no tracking fields are set', () => {
    const { container } = render(<WooOrderCard order={base} />);
    expect(container.querySelector('.lucide-truck')).toBeNull();
  });
});
