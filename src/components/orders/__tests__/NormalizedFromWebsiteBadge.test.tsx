import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NormalizedFromWebsiteBadge } from '../NormalizedFromWebsiteBadge';

// Verifies the badge renders the correct actor + timestamp and exposes a
// keyboard-accessible tooltip trigger (focusable, aria-labelled).

describe('NormalizedFromWebsiteBadge', () => {
  const AT = '2026-07-10T12:34:00Z';
  const BY = 'Sales Manager';

  it('renders actor + timestamp inside the tooltip aria-label', () => {
    render(<NormalizedFromWebsiteBadge attributedAt={AT} attributedByName={BY} />);
    const badge = screen.getByTestId('normalized-from-website-badge');
    const label = badge.getAttribute('aria-label') ?? '';
    expect(label).toContain('Normalized from WooCommerce (Vishal)');
    expect(label).toContain(BY);
    // The rendered locale string contains the year the date belongs to.
    expect(label).toContain('2026');
  });

  it('shows a short date chip beside the label when attributed_at is present', () => {
    render(<NormalizedFromWebsiteBadge attributedAt={AT} attributedByName={BY} />);
    expect(screen.getByTestId('normalized-from-website-date')).toBeInTheDocument();
  });

  it('gracefully falls back to "system"/"unknown time" when metadata is missing', () => {
    render(<NormalizedFromWebsiteBadge attributedAt={null} attributedByName={null} />);
    const badge = screen.getByTestId('normalized-from-website-badge');
    const label = badge.getAttribute('aria-label') ?? '';
    expect(label).toContain('system');
    expect(label).toContain('unknown time');
    expect(screen.queryByTestId('normalized-from-website-date')).toBeNull();
  });

  it('is keyboard-focusable (tabIndex=0) with a button role and visible focus ring', () => {
    render(<NormalizedFromWebsiteBadge attributedAt={AT} attributedByName={BY} />);
    const badge = screen.getByTestId('normalized-from-website-badge');
    expect(badge.getAttribute('tabindex')).toBe('0');
    expect(badge.getAttribute('role')).toBe('button');
    expect(badge.className).toMatch(/focus-visible:ring/);
    // Confirm the tooltip trigger can actually receive keyboard focus.
    badge.focus();
    expect(badge).toHaveFocus();
  });
});