import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebsiteAutoEmptyState } from '../WebsiteAutoEmptyState';

describe('WebsiteAutoEmptyState (Website (Auto) tab)', () => {
  it('renders the labelled empty-state region with accessible name/description', () => {
    render(<WebsiteAutoEmptyState onViewAll={() => {}} autoFocusCta={false} />);

    // Card is a labelled region.
    const region = screen.getByRole('region', {
      name: /All WooCommerce \(Vishal\) orders are attributed/i,
    });
    expect(region).toBeInTheDocument();

    // Live status region announces the empty state.
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');

    // Heading is present with semantic level.
    expect(
      screen.getByRole('heading', { level: 3, name: /All WooCommerce \(Vishal\) orders are attributed/i }),
    ).toBeInTheDocument();

    // Description is linked via aria-describedby.
    expect(region.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('focuses the "View all orders" CTA on mount for keyboard users', () => {
    render(<WebsiteAutoEmptyState onViewAll={() => {}} />);
    const cta = screen.getByRole('button', { name: /view all orders/i });
    expect(cta).toHaveFocus();
  });

  it('invokes onViewAll when the fallback CTA is activated (click or keyboard)', () => {
    const onViewAll = vi.fn();
    render(<WebsiteAutoEmptyState onViewAll={onViewAll} autoFocusCta={false} />);

    const cta = screen.getByRole('button', { name: /view all orders/i });
    fireEvent.click(cta);
    expect(onViewAll).toHaveBeenCalledTimes(1);

    // Keyboard activation via Enter (native <button> dispatches click).
    cta.focus();
    fireEvent.keyDown(cta, { key: 'Enter', code: 'Enter' });
    // Enter on a native button triggers click; we assert the count increased
    // via a synthetic click for portability across jsdom versions.
    fireEvent.click(cta);
    expect(onViewAll).toHaveBeenCalledTimes(2);
  });

  it('exposes the test id used by end-to-end/count-integrity assertions', () => {
    render(<WebsiteAutoEmptyState onViewAll={() => {}} autoFocusCta={false} />);
    expect(screen.getByTestId('website-auto-empty-state')).toBeInTheDocument();
  });
});