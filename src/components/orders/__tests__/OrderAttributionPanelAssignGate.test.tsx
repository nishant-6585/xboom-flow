import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrderAttributionPanel } from '../OrderAttributionPanel';

// -----------------------------------------------------------------------------
// Verifies the client-side gate on the "Assign to salesperson" button matches
// the server RPC (public.can_attribute_website_order). Non-granted supply_chain
// users must NOT see the Assign button, while admins and granted users do.
// -----------------------------------------------------------------------------

const authMock = vi.fn();
const canAttributeMock = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authMock(),
}));

vi.mock('@/hooks/useCanAttributeWebsiteOrder', () => ({
  useCanAttributeWebsiteOrder: () => canAttributeMock(),
}));

vi.mock('@/hooks/useSalesUsers', () => ({
  useSalesUsers: () => ({ salesUsers: [], isLoading: false }),
}));

const ORDER = {
  id: 'ord-1',
  external_id: 'WOO-1',
  source: 'website',
  sales_person_id: 'a8050cc3-7d17-44ac-a083-d8023d505331',
  sales_person_name: 'System',
  sales_attribution_locked: false,
  attributed_at: null,
  attributed_by_name: null,
  sales_attribution_reason: null,
};

vi.mock('@/hooks/useAttributionRequests', async () => {
  const actual = await vi.importActual<any>('@/hooks/useAttributionRequests');
  return {
    ...actual,
    useInternalOrderForAttribution: () => ({ data: ORDER }),
    useMyAttributionRequest: () => ({ data: null }),
    useAttributionLog: () => ({ data: [], isLoading: false }),
    useAttributionMutations: () => ({
      attribute: { mutateAsync: vi.fn(), isPending: false },
      requestAttribution: { mutateAsync: vi.fn(), isPending: false },
      decide: { mutateAsync: vi.fn(), isPending: false },
    }),
    SYSTEM_USER_ID: 'a8050cc3-7d17-44ac-a083-d8023d505331',
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('OrderAttributionPanel — Assign button gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides the Assign button for a non-granted supply_chain user', () => {
    authMock.mockReturnValue({ role: 'supply_chain', user: { id: 'u1' } });
    canAttributeMock.mockReturnValue(false);
    wrap(<OrderAttributionPanel internalOrderId="ord-1" />);
    expect(screen.queryByTestId('assign-salesperson-btn')).toBeNull();
  });

  it('shows the Assign button for a granted supply_chain user', () => {
    authMock.mockReturnValue({ role: 'supply_chain', user: { id: 'u2' } });
    canAttributeMock.mockReturnValue(true);
    wrap(<OrderAttributionPanel internalOrderId="ord-1" />);
    expect(screen.getByTestId('assign-salesperson-btn')).toBeInTheDocument();
  });

  it('shows the Assign button for admin', () => {
    authMock.mockReturnValue({ role: 'admin', user: { id: 'u3' } });
    canAttributeMock.mockReturnValue(true);
    wrap(<OrderAttributionPanel internalOrderId="ord-1" />);
    expect(screen.getByTestId('assign-salesperson-btn')).toBeInTheDocument();
  });

  it('shows the Assign button for sales_manager', () => {
    authMock.mockReturnValue({ role: 'sales_manager', user: { id: 'u4' } });
    canAttributeMock.mockReturnValue(true);
    wrap(<OrderAttributionPanel internalOrderId="ord-1" />);
    expect(screen.getByTestId('assign-salesperson-btn')).toBeInTheDocument();
  });
});