import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ role: 'sales', user: { id: 'u1' } }),
}));
vi.mock('@/components/PaymentStatusTracker', () => ({
  PaymentStatusTracker: () => null,
}));
vi.mock('@/components/OrderStatusBadge', () => ({
  OrderStatusBadge: () => null,
}));
vi.mock('@/components/OrderNumberBadge', () => ({
  OrderNumberBadge: () => null,
}));

import { OrderCard } from '@/components/OrderCard';

const baseOrder: any = {
  id: 'o1',
  order_number: '12345',
  customer_name: 'Test Customer',
  product_name: 'Drone',
  quantity: 1,
  total_sales_amount: 10000,
  selling_price: 10000,
  payment_status: 'pending',
  outcome: 'pending',
  status: 'in_transit',
  order_date: '2025-01-01',
  created_at: '2025-01-01',
  tracking_number: null,
  tracking_url: null,
  courier_name: null,
};

describe('OrderCard tracking display', () => {
  it('renders courier name when only courier_name is set', () => {
    render(<OrderCard order={{ ...baseOrder, courier_name: 'DTDC' }} onClick={() => {}} />);
    expect(screen.getByText('DTDC')).toBeInTheDocument();
  });

  it('renders tracking number when only tracking_number is set', () => {
    render(<OrderCard order={{ ...baseOrder, tracking_number: 'AWB123' }} onClick={() => {}} />);
    expect(screen.getByText('AWB123')).toBeInTheDocument();
  });

  it('renders a "Track shipment" link when only tracking_url is set', () => {
    render(
      <OrderCard
        order={{ ...baseOrder, tracking_url: 'https://track.example.com/x' }}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText('Track shipment')).toBeInTheDocument();
  });

  it('renders courier + tracking number link when all fields are set', () => {
    render(
      <OrderCard
        order={{
          ...baseOrder,
          courier_name: 'Bluedart',
          tracking_number: 'BD9999',
          tracking_url: 'https://bluedart.com/track/BD9999',
        }}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText('Bluedart')).toBeInTheDocument();
    expect(screen.getByText('BD9999')).toBeInTheDocument();
  });

  it('does not render the tracking block when no tracking fields are set', () => {
    const { container } = render(<OrderCard order={baseOrder} onClick={() => {}} />);
    // Truck icon lives only inside the tracking block
    expect(container.querySelector('.lucide-truck')).toBeNull();
  });
});
