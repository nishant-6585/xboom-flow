import { describe, it, expect } from 'vitest';
import { importFormSchema } from '@/lib/schemas/imports';
import { multiProductProcurementSchema } from '@/lib/schemas/procurement';
import { validate } from '@/lib/schemas/formErrors';
import { formatCurrency, sumByCurrency, formatCurrencyTotals } from '@/lib/currency';

const baseImport = {
  items: [
    {
      product_name: 'DJI Mavic 3',
      product_category: 'Consumer Drones',
      product_code: '',
      quantity: 2,
      unit_price: 6049,
      total_amount: 12098,
      hsn_code: '',
      notes: '',
    },
  ],
  currency: 'INR',
  base_currency: 'INR',
  fx_rate: 1,
  fx_rate_date: '',
  supplier_id: '',
  supplier_name: 'Abdul Gadgets',
  origin_country: 'India',
  shipping_method: '',
  port_of_origin: '',
  port_of_destination: '',
  shipping_line: '',
  container_number: '',
  bl_number: '',
  status: 'pending',
  order_date: '',
  expected_arrival: '',
  actual_arrival: '',
  clearance_date: '',
  payment_status: 'pending',
  payment_amount: 0,
  payment_date: '',
  notes: '',
  freight_cost: 0,
  insurance_cost: 0,
  customs_duty: 0,
  clearing_agent_fee: 0,
  port_charges: 0,
  other_landed_costs: 0,
  igst_amount: 0,
  assessable_value: 0,
};

const baseProcurement = {
  items: [
    {
      id: 'a',
      productName: 'DJI Mavic 3',
      productCategory: 'Consumer Drones',
      productCode: '',
      quantity: '2',
      unitPrice: '6049',
      gstPercent: '18',
      priceIncludesGst: false,
      linkType: 'inventory' as const,
      orderId: '',
      addToInventory: true,
      fulfillFromStock: false,
      selectedInventoryId: '',
    },
  ],
  supplierId: '11111111-1111-1111-1111-111111111111',
  paymentTerms: 'net_30',
  paymentStatus: 'pending' as const,
  paymentAmount: '',
  paymentMode: 'bank_transfer',
  paymentReferenceNumber: '',
  procurementDate: new Date('2026-08-21'),
  paymentDueDate: undefined,
  notes: '',
};

describe('importFormSchema', () => {
  it('accepts a well-formed import', () => {
    expect(validate(importFormSchema, baseImport).success).toBe(true);
  });

  it('rejects a NaN quantity from an empty number input', () => {
    const result = validate(importFormSchema, {
      ...baseImport,
      items: [{ ...baseImport.items[0], quantity: Number('') || NaN }],
    });
    expect(result.success).toBe(false);
    expect(result.errors['items.0.quantity']).toBeTruthy();
  });

  it('rejects a zero quantity', () => {
    const result = validate(importFormSchema, {
      ...baseImport,
      items: [{ ...baseImport.items[0], quantity: 0 }],
    });
    expect(result.errors['items.0.quantity']).toMatch(/at least 1/i);
  });

  it('rejects a payment larger than the import value', () => {
    const result = validate(importFormSchema, {
      ...baseImport,
      payment_status: 'paid',
      payment_amount: 99999,
    });
    expect(result.errors['payment_amount']).toMatch(/exceed/i);
  });

  it('rejects an arrival date before the order date', () => {
    const result = validate(importFormSchema, {
      ...baseImport,
      order_date: '2026-08-20',
      expected_arrival: '2026-08-10',
    });
    expect(result.errors['expected_arrival']).toMatch(/before the order date/i);
  });

  it('requires an actual arrival date before an import can be marked delivered', () => {
    const result = validate(importFormSchema, { ...baseImport, status: 'delivered' });
    expect(result.errors['actual_arrival']).toBeTruthy();
  });

  it('requires a supplier', () => {
    const result = validate(importFormSchema, { ...baseImport, supplier_name: '' });
    expect(result.errors['supplier_id']).toMatch(/supplier/i);
  });

  it('rejects a rate other than 1 for a same-currency import', () => {
    const result = validate(importFormSchema, { ...baseImport, fx_rate: 83.2 });
    expect(result.errors['fx_rate']).toMatch(/rate of 1/i);
  });

  it('requires a rate date on a foreign-currency import', () => {
    const result = validate(importFormSchema, {
      ...baseImport,
      currency: 'USD',
      fx_rate: 83.2,
      fx_rate_date: '',
    });
    expect(result.errors['fx_rate_date']).toMatch(/date this exchange rate/i);
  });

  it('accepts a foreign-currency import with a dated rate', () => {
    const result = validate(importFormSchema, {
      ...baseImport,
      currency: 'USD',
      fx_rate: 83.2,
      fx_rate_date: '2026-08-20',
      payment_amount: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a zero or negative exchange rate', () => {
    const result = validate(importFormSchema, {
      ...baseImport,
      currency: 'USD',
      fx_rate: 0,
      fx_rate_date: '2026-08-20',
    });
    expect(result.errors['fx_rate']).toMatch(/greater than zero/i);
  });

  it('rejects a negative landed cost component', () => {
    const result = validate(importFormSchema, { ...baseImport, freight_cost: -500 });
    expect(result.errors['freight_cost']).toMatch(/cannot be negative/i);
  });

  it('rejects a malformed HSN code', () => {
    const result = validate(importFormSchema, {
      ...baseImport,
      items: [{ ...baseImport.items[0], hsn_code: '12' }],
    });
    expect(result.errors['items.0.hsn_code']).toMatch(/4, 6 or 8 digits/);
  });
});

describe('multiProductProcurementSchema', () => {
  it('accepts a well-formed procurement', () => {
    expect(validate(multiProductProcurementSchema, baseProcurement).success).toBe(true);
  });

  it('rejects a blank quantity rather than coercing it to zero', () => {
    const result = validate(multiProductProcurementSchema, {
      ...baseProcurement,
      items: [{ ...baseProcurement.items[0], quantity: '' }],
    });
    expect(result.errors['items.0.quantity']).toMatch(/required/i);
  });

  it('rejects a non-numeric price rather than passing NaN to the ledger', () => {
    const result = validate(multiProductProcurementSchema, {
      ...baseProcurement,
      items: [{ ...baseProcurement.items[0], unitPrice: '12a' }],
    });
    expect(result.errors['items.0.unitPrice']).toMatch(/must be a number/i);
  });

  it('rejects GST above 100%', () => {
    const result = validate(multiProductProcurementSchema, {
      ...baseProcurement,
      items: [{ ...baseProcurement.items[0], gstPercent: '180' }],
    });
    expect(result.errors['items.0.gstPercent']).toBeTruthy();
  });

  it('requires an order when a line is order-linked', () => {
    const result = validate(multiProductProcurementSchema, {
      ...baseProcurement,
      items: [{ ...baseProcurement.items[0], linkType: 'order', orderId: '' }],
    });
    expect(result.errors['items.0.orderId']).toMatch(/order/i);
  });

  it('rejects a line that both consumes stock and adds to it', () => {
    const result = validate(multiProductProcurementSchema, {
      ...baseProcurement,
      items: [
        {
          ...baseProcurement.items[0],
          fulfillFromStock: true,
          addToInventory: true,
          orderId: 'order-1',
          selectedInventoryId: 'inv-1',
        },
      ],
    });
    expect(result.errors['items.0.addToInventory']).toBeTruthy();
  });

  it('requires a supplier when anything is actually procured', () => {
    const result = validate(multiProductProcurementSchema, { ...baseProcurement, supplierId: '' });
    expect(result.errors['supplierId']).toMatch(/supplier/i);
  });

  it('does not require a supplier when every line is fulfilled from stock', () => {
    const result = validate(multiProductProcurementSchema, {
      ...baseProcurement,
      supplierId: '',
      items: [
        {
          ...baseProcurement.items[0],
          fulfillFromStock: true,
          addToInventory: false,
          orderId: 'order-1',
          selectedInventoryId: 'inv-1',
        },
      ],
    });
    expect(result.errors['supplierId']).toBeUndefined();
  });

  it('requires an amount when payment is not pending', () => {
    const result = validate(multiProductProcurementSchema, {
      ...baseProcurement,
      paymentStatus: 'partial',
    });
    expect(result.errors['paymentAmount']).toMatch(/amount paid/i);
  });

  it('rejects a due date before the procurement date', () => {
    const result = validate(multiProductProcurementSchema, {
      ...baseProcurement,
      paymentDueDate: new Date('2026-08-01'),
    });
    expect(result.errors['paymentDueDate']).toMatch(/before the procurement date/i);
  });
});

describe('currency', () => {
  it('formats INR with Indian digit grouping and the right symbol', () => {
    expect(formatCurrency(1250000, 'INR')).toContain('₹');
    expect(formatCurrency(1250000, 'INR')).toContain('12,50,000');
  });

  it('does not render INR amounts as dollars', () => {
    expect(formatCurrency(12098, 'INR')).not.toContain('$');
  });

  it('buckets mixed currencies instead of summing them', () => {
    const totals = sumByCurrency(
      [
        { total_amount: 12098, currency: 'INR' },
        { total_amount: 5000, currency: 'USD' },
        { total_amount: 1902, currency: 'INR' },
      ],
      r => r.total_amount,
      r => r.currency
    );
    expect(totals).toEqual({ INR: 14000, USD: 5000 });
  });

  it('reports the largest bucket and how many others exist', () => {
    const { primary, extraCount } = formatCurrencyTotals({ INR: 14000, USD: 5000 });
    expect(primary).toContain('₹');
    expect(extraCount).toBe(1);
  });

  it('defaults a missing currency to the base currency rather than dropping the row', () => {
    const totals = sumByCurrency(
      [{ total_amount: 100, currency: null }],
      r => r.total_amount,
      r => r.currency
    );
    expect(totals).toEqual({ INR: 100 });
  });
});
