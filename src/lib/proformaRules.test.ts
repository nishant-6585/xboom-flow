import { describe, expect, it } from 'vitest';
import { inferGstRate, detectBundleDuplicates, reconcileProforma } from './proformaRules';

describe('inferGstRate', () => {
  it('treats SAC 997xxx (services / subscriptions) as 18%', () => {
    expect(inferGstRate('DJI Terra - 1 Year Subscription', '997331')).toBe(18);
    expect(inferGstRate('Annual Maintenance', '9973')).toBe(18);
  });

  it('treats drone HSN 8806 as 5%', () => {
    expect(inferGstRate('DJI Matrice 4E Combo', '88062200')).toBe(5);
    expect(inferGstRate('Mavic 3 Enterprise', '88062100')).toBe(5);
  });

  it('treats accessories (including those sharing 8806 HSN) as 18%', () => {
    expect(inferGstRate('DJI Propellers (Pair)', '88062200')).toBe(18);
    expect(inferGstRate('Intelligent Flight Battery', '88062200')).toBe(18);
    expect(inferGstRate('100W Charger', '88062200')).toBe(18);
  });

  it('falls back to 18% for unknown items', () => {
    expect(inferGstRate('Random Widget', '')).toBe(18);
  });

  it('catches subscription keywords without an HSN', () => {
    expect(inferGstRate('DJI Care Refresh — 1 Year', '')).toBe(18);
  });
});

describe('detectBundleDuplicates', () => {
  it('flags a separate Terra line when bundled in a combo', () => {
    const flags = detectBundleDuplicates([
      { product_name: 'DJI Matrice 4E Combo + Terra 1 Year Subscription' },
      { product_name: 'DJI Terra - 1 Year Subscription' },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0].duplicateIndex).toBe(1);
    expect(flags[0].bundleIndex).toBe(0);
  });

  it('does not flag when no bundle exists', () => {
    const flags = detectBundleDuplicates([
      { product_name: 'DJI Matrice 4E Combo' },
      { product_name: 'DJI Terra - 1 Year Subscription' },
    ]);
    expect(flags).toHaveLength(0);
  });
});

describe('reconcileProforma', () => {
  it('attributes a 5% delta to double-taxation when rates are already inclusive', () => {
    // ORD2600320 shape: Zoho says 7,96,010 total. Proforma re-applied 5% on top.
    const lines = [
      { product_name: 'DJI Matrice 4E Combo + Terra', hsn: '88062200', quantity: 1, gross_total: 590100 * 1.05, gst_rate: 5 },
      { product_name: 'DJI Terra - 1 Year Subscription', hsn: '88062200', quantity: 1, gross_total: 205910 * 1.05, gst_rate: 5 },
    ];
    const res = reconcileProforma({
      lines,
      proformaTotal: lines.reduce((s, l) => s + l.gross_total, 0),
      expectedTotal: 796010,
    });
    expect(res.rules.some(r => r.rule === 'DOUBLE_TAX_ON_INCLUSIVE_RATE')).toBe(true);
  });
});