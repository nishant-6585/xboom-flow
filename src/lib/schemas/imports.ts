import { z } from 'zod';
import { CURRENCY_CODES } from '@/lib/currency';
import { IMPORT_STATUSES, PAYMENT_STATUSES, SHIPPING_METHODS } from '@/hooks/useImports';

/**
 * Validation for the import wizard.
 *
 * The dialog collects everything as loose useState, so quantities and prices
 * arrive as raw numbers straight off `<input type="number">` — which yields NaN
 * for a blank or malformed field. These schemas are the gate before anything
 * reaches Supabase.
 */

const currencyCodes = CURRENCY_CODES as readonly string[];

/** A finite, non-negative money amount. Rejects NaN and Infinity. */
const money = (label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(1_000_000_000_000, `${label} looks unrealistically large`)
    // .min/.max both pass NaN through in zod, so this has to be its own check.
    .refine(Number.isFinite, `${label} must be a number`);

const optionalDate = z
  .string()
  .trim()
  .refine(v => v === '' || !Number.isNaN(Date.parse(v)), 'Enter a valid date')
  .optional()
  .or(z.literal(''));

export const importItemSchema = z.object({
  product_name: z.string().trim().min(1, 'Product name is required').max(200, 'Product name is too long'),
  product_category: z.string().trim().max(100).optional().or(z.literal('')),
  product_code: z.string().trim().max(100).optional().or(z.literal('')),
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1')
    .refine(Number.isFinite, 'Quantity must be a number'),
  unit_price: money('Unit price'),
  total_amount: money('Line total'),
  // HSN codes are 4, 6 or 8 digits. Optional, but if given it must be plausible
  // — a wrong HSN is a customs problem, not a cosmetic one.
  hsn_code: z
    .string()
    .trim()
    .regex(/^(\d{4}|\d{6}|\d{8})$/, 'HSN code must be 4, 6 or 8 digits')
    .optional()
    .or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export type ImportItemInput = z.infer<typeof importItemSchema>;

/** Step 1 — products, currency and the FX rate that converts them. */
export const importProductsStepSchema = z
  .object({
    items: z.array(importItemSchema).min(1, 'Add at least one product'),
    currency: z.enum(currencyCodes as [string, ...string[]], {
      errorMap: () => ({ message: 'Select a currency' }),
    }),
    base_currency: z.enum(currencyCodes as [string, ...string[]]),
    fx_rate: z
      .number({ invalid_type_error: 'Exchange rate must be a number' })
      .positive('Exchange rate must be greater than zero')
      .refine(Number.isFinite, 'Exchange rate must be a number'),
    fx_rate_date: optionalDate,
  })
  .superRefine((value, ctx) => {
    const sameCurrency = value.currency === value.base_currency;

    // Mirrors the imports_fx_rate_identity constraint. A leftover rate after
    // switching back to INR would silently restate the value of the import.
    if (sameCurrency && value.fx_rate !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fx_rate'],
        message: `An import booked in ${value.base_currency} must use a rate of 1`,
      });
    }

    // A foreign-currency import with no rate date cannot be defended later —
    // the rate becomes an unsourced number.
    if (!sameCurrency && !value.fx_rate_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fx_rate_date'],
        message: 'Record the date this exchange rate was taken',
      });
    }
  });

/** Step 2 — supplier and origin. */
export const importSupplierStepSchema = z.object({
  supplier_id: z.string().uuid('Select a supplier from the list').optional().or(z.literal('')),
  supplier_name: z.string().trim().max(200).optional().or(z.literal('')),
  origin_country: z.string().trim().max(100).optional().or(z.literal('')),
});

/** Step 3 — shipment and timeline. */
export const importShippingStepSchema = z
  .object({
    shipping_method: z
      .enum(SHIPPING_METHODS.map(m => m.value) as [string, ...string[]], {
        errorMap: () => ({ message: 'Select a shipping method' }),
      })
      .optional()
      .or(z.literal('')),
    port_of_origin: z.string().trim().max(120).optional().or(z.literal('')),
    port_of_destination: z.string().trim().max(120).optional().or(z.literal('')),
    shipping_line: z.string().trim().max(120).optional().or(z.literal('')),
    container_number: z.string().trim().max(60).optional().or(z.literal('')),
    bl_number: z.string().trim().max(60).optional().or(z.literal('')),
    status: z.enum(IMPORT_STATUSES.map(s => s.value) as [string, ...string[]]),
    order_date: optionalDate,
    expected_arrival: optionalDate,
    actual_arrival: optionalDate,
    clearance_date: optionalDate,
  })
  .superRefine((value, ctx) => {
    const at = (key: string) => (value as Record<string, string>)[key];
    const parse = (key: string) => (at(key) ? Date.parse(at(key)) : null);

    const ordered = parse('order_date');
    const expected = parse('expected_arrival');
    const actual = parse('actual_arrival');
    const cleared = parse('clearance_date');

    // A shipment cannot arrive before it was ordered, or clear customs before
    // it lands. These are the transpositions people actually make.
    if (ordered && expected && expected < ordered) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expected_arrival'],
        message: 'Expected arrival cannot be before the order date',
      });
    }
    if (ordered && actual && actual < ordered) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actual_arrival'],
        message: 'Actual arrival cannot be before the order date',
      });
    }
    if (actual && cleared && cleared < actual) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clearance_date'],
        message: 'Customs clearance cannot precede arrival',
      });
    }
    if (value.status === 'delivered' && !at('actual_arrival')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actual_arrival'],
        message: 'Record the actual arrival date before marking an import delivered',
      });
    }
  });

/** Step 5 — payment. */
export const importPaymentStepSchema = z.object({
  payment_status: z.enum(PAYMENT_STATUSES.map(s => s.value) as [string, ...string[]]),
  payment_amount: money('Payment amount'),
  payment_date: optionalDate,
  notes: z.string().trim().max(4000).optional().or(z.literal('')),

  // Landed cost components — all in base currency, all non-negative.
  freight_cost: money('Freight'),
  insurance_cost: money('Insurance'),
  customs_duty: money('Customs duty'),
  clearing_agent_fee: money('Clearing agent fee'),
  port_charges: money('Port charges'),
  other_landed_costs: money('Other landed costs'),
  igst_amount: money('IGST'),
  assessable_value: money('Assessable value'),
});

/**
 * The whole form. Cross-step rules live here because they cannot be expressed
 * on a single step.
 */
export const importFormSchema = importProductsStepSchema
  .and(importSupplierStepSchema)
  .and(importPaymentStepSchema)
  .and(importShippingStepSchema)
  .superRefine((value, ctx) => {
    const v = value as Record<string, unknown>;
    const items = v.items as ImportItemInput[];
    const total = items.reduce((sum, item) => sum + (item.total_amount || 0), 0);
    const paid = (v.payment_amount as number) || 0;
    const status = v.payment_status as string;

    // Over-payment against the import value is nearly always a typo, and it
    // silently corrupts the supplier balance.
    if (paid > total && total > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payment_amount'],
        message: 'Payment cannot exceed the import value',
      });
    }
    if (status === 'partial' && paid <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payment_amount'],
        message: 'Enter the amount paid so far',
      });
    }
    if (status === 'paid' && total > 0 && paid > 0 && paid < total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payment_status'],
        message: 'Amount paid is less than the import value — mark this Partial',
      });
    }
    if (!v.supplier_id && !String(v.supplier_name ?? '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['supplier_id'],
        message: 'Select a supplier, or type a supplier name',
      });
    }
  });

export type ImportFormInput = z.infer<typeof importFormSchema>;

/** Fields each wizard step owns, so a step only shows its own errors. */
export const IMPORT_STEP_FIELDS: Record<number, string[]> = {
  1: ['items', 'currency', 'base_currency', 'fx_rate', 'fx_rate_date'],
  2: ['supplier_id', 'supplier_name', 'origin_country'],
  3: [
    'shipping_method',
    'port_of_origin',
    'port_of_destination',
    'shipping_line',
    'container_number',
    'bl_number',
    'status',
    'order_date',
    'expected_arrival',
    'actual_arrival',
    'clearance_date',
  ],
  4: [],
  5: [
    'payment_status',
    'payment_amount',
    'payment_date',
    'notes',
    'freight_cost',
    'insurance_cost',
    'customs_duty',
    'clearing_agent_fee',
    'port_charges',
    'other_landed_costs',
    'igst_amount',
    'assessable_value',
  ],
};
