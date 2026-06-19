import { describe, expect, it } from 'vitest';
import { inferGstRate, detectBundleDuplicates, reconcileProforma, explainGstRate, PROFORMA_RULES_VERSION } from './proformaRules';

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

  it('treats a drone combo whose name includes a bundled subscription as 5%', () => {
    // ORD2600320 line: combo line is taxed as a drone bundle (5%), the Terra
    // portion is a separate 18% line in the same proforma.
    expect(inferGstRate('DJI matrice 4E combo+ terra 1 year subscription', '88062200')).toBe(5);
    expect(inferGstRate('DJI matrice 4E combo+ terra 1 year subscription', '')).toBe(5);
  });
});

describe('detectBundleDuplicates', () => {
  it('flags a small standalone add-on that is already included in a combo line', () => {
    const flags = detectBundleDuplicates([
      { product_name: 'DJI Matrice 4E Combo + Terra 1 Year Subscription', gross_total: 700000 } as any,
      { product_name: 'DJI Terra - 1 Year Subscription', gross_total: 0 } as any,
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0].duplicateIndex).toBe(1);
  });

  it('does NOT flag a separately-priced standalone line as a duplicate', () => {
    // order_items carries combo (~5.9L) and Terra (~2L) as two distinct
    // priced rows that together sum to the order total — they must not be
    // collapsed.
    const flags = detectBundleDuplicates([
      { product_name: 'DJI Matrice 4E Combo + Terra 1 Year Subscription', gross_total: 590100 } as any,
      { product_name: 'DJI Terra - 1 Year Subscription', gross_total: 205910 } as any,
    ]);
    expect(flags).toHaveLength(0);
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

describe('ORD2600320 regression — full proforma matches Zoho exactly', () => {
  // order_items as stored: unit_price is the customer-billed (GST-inclusive)
  // amount, sales_gst_percent was incorrectly saved as 18.
  const items = [
    { product_name: 'DJI matrice 4E combo+ terra 1 year subscription', quantity: 1, unit_price: 590100, sales_gst_percent: 18, sales_price_includes_gst: true },
    { product_name: 'DJI Terra - 1 Year Subscription', quantity: 1, unit_price: 205910, sales_gst_percent: 18, sales_price_includes_gst: true },
  ];
  const ZOHO_TOTAL = 796010;

  it('infers correct per-line GST rates (5% combo, 18% subscription)', () => {
    expect(inferGstRate(items[0].product_name, '88062200')).toBe(5);
    expect(inferGstRate(items[1].product_name, '88062200')).toBe(18);
  });

  it('builds line totals that sum to the Zoho invoice total', () => {
    const lines = items.map((it) => {
      const rate = inferGstRate(it.product_name, '88062200');
      const gross = it.unit_price * it.quantity;
      const taxable = gross / (1 + rate / 100);
      return { ...it, rate, gross, taxable };
    });
    const totalGross = lines.reduce((s, l) => s + l.gross, 0);
    expect(totalGross).toBe(ZOHO_TOTAL);
    // Reconciliation must be OK.
    const recon = reconcileProforma({
      lines: lines.map((l) => ({ product_name: l.product_name, hsn: '88062200', quantity: l.quantity, gross_total: l.gross, gst_rate: l.rate })),
      proformaTotal: totalGross,
      expectedTotal: ZOHO_TOTAL,
    });
    expect(recon.delta).toBe(0);
    expect(recon.rules.some((r) => r.rule === 'OK')).toBe(true);
  });

  it('does not flag the Terra line as a duplicate when separately priced', () => {
    const flags = detectBundleDuplicates([
      { product_name: items[0].product_name, gross_total: 590100 } as any,
      { product_name: items[1].product_name, gross_total: 205910 } as any,
    ]);
    expect(flags).toHaveLength(0);
  });

  it('explains why each rate was chosen', () => {
    expect(explainGstRate(items[0].product_name, '88062200').source).toBe('HSN_8806_DRONE');
    expect(explainGstRate(items[1].product_name, '88062200').source).toBe('NAME_SUBSCRIPTION');
  });

  it('exposes a stable rules version string', () => {
    expect(PROFORMA_RULES_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
  });
});

describe('Totals mapping regressions', () => {
  it('treats subscription-only lines (HSN service code 997) as 18%', () => {
    expect(inferGstRate('Annual Maintenance Plan', '997331')).toBe(18);
  });
  it('rejects 0% / 12% / 28% inference (only 5 or 18 should ever come out)', () => {
    const samples = [
      ['DJI Mavic 3 Enterprise', '88062100'],
      ['Replacement propellers', '88062200'],
      ['Random thing', ''],
      ['Care Refresh 1 Year', ''],
    ] as const;
    for (const [n, h] of samples) {
      const r = inferGstRate(n, h);
      expect([5, 18]).toContain(r);
    }
  });
});