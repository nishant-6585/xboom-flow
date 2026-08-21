import { z } from 'zod';

/**
 * Validation for the multi-product procurement wizard.
 *
 * Every numeric field in that form is held as a *string* in useState and pushed
 * through `Number(...)` at submit time. `Number('')` is 0 and `Number('12a')` is
 * NaN, so a blank quantity previously became a zero-quantity procurement and a
 * malformed price became a NaN total in the supplier ledger. These schemas parse
 * the strings rather than trusting them.
 */

/** A numeric string from a text/number input → a validated number. */
const numericString = (
  label: string,
  opts: { min?: number; max?: number; integer?: boolean; required?: boolean } = {}
) => {
  const { min = 0, max = 1_000_000_000_000, integer = false, required = true } = opts;

  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value === '') {
        if (required) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is required` });
        }
        return;
      }

      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a number` });
        return;
      }
      if (integer && !Number.isInteger(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a whole number` });
        return;
      }
      if (parsed < min) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be at least ${min}` });
        return;
      }
      if (parsed > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} looks unrealistically large` });
      }
    })
    .transform(value => (value === '' ? null : Number(value)));
};

export const procurementItemSchema = z
  .object({
    id: z.string(),
    productName: z.string().trim().min(1, 'Product name is required').max(200, 'Product name is too long'),
    productCategory: z.string().trim().max(100).optional().or(z.literal('')),
    productCode: z.string().trim().max(100).optional().or(z.literal('')),
    quantity: numericString('Quantity', { min: 1, integer: true }),
    unitPrice: numericString('Unit price', { min: 0, required: false }),
    gstPercent: numericString('GST %', { min: 0, max: 100, required: false }),
    priceIncludesGst: z.boolean(),
    linkType: z.enum(['order', 'inventory']),
    orderId: z.string(),
    addToInventory: z.boolean(),
    fulfillFromStock: z.boolean(),
    selectedInventoryId: z.string(),
  })
  .superRefine((item, ctx) => {
    // An order-linked line without an order creates an orphan procurement that
    // never shows up in the tracker.
    if (item.linkType === 'order' && !item.orderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['orderId'],
        message: 'Select the order this line fulfils',
      });
    }
    if (item.fulfillFromStock) {
      if (!item.selectedInventoryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['selectedInventoryId'],
          message: 'Choose the stock this line is fulfilled from',
        });
      }
      if (!item.orderId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['orderId'],
          message: 'Fulfilling from stock requires a linked order',
        });
      }
    }
    // Nothing is both consumed from stock and added back to it.
    if (item.fulfillFromStock && item.addToInventory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['addToInventory'],
        message: 'A line cannot both consume stock and add to it',
      });
    }
  });

export type ProcurementItemInput = z.infer<typeof procurementItemSchema>;

export const PAYMENT_STATUS_VALUES = ['pending', 'partial', 'paid'] as const;

export const multiProductProcurementSchema = z
  .object({
    items: z.array(procurementItemSchema).min(1, 'Add at least one product'),
    supplierId: z.string(),
    paymentTerms: z.string(),
    paymentStatus: z.enum(PAYMENT_STATUS_VALUES),
    paymentAmount: numericString('Payment amount', { min: 0, required: false }),
    paymentMode: z.string(),
    paymentReferenceNumber: z.string().trim().max(120).optional().or(z.literal('')),
    procurementDate: z.date({ invalid_type_error: 'Select a procurement date' }),
    paymentDueDate: z.date().optional(),
    notes: z.string().trim().max(4000).optional().or(z.literal('')),
  })
  .superRefine((form, ctx) => {
    const needsSupplier = form.items.some(item => !item.fulfillFromStock);

    // Stock fulfilment creates no payable, so it needs no supplier. Anything
    // actually procured does.
    if (needsSupplier && !form.supplierId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['supplierId'],
        message: 'Select a supplier for the products being procured',
      });
    }

    if (form.paymentStatus !== 'pending') {
      if (!form.paymentAmount || form.paymentAmount <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paymentAmount'],
          message: 'Enter the amount paid',
        });
      }
      if (!form.paymentMode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paymentMode'],
          message: 'Select how the payment was made',
        });
      }
    }

    if (form.paymentDueDate && form.paymentDueDate < form.procurementDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paymentDueDate'],
        message: 'Payment due date cannot be before the procurement date',
      });
    }
  });

export type MultiProductProcurementInput = z.infer<typeof multiProductProcurementSchema>;

/** Fields each wizard step owns, so a step only shows its own errors. */
export const PROCUREMENT_STEP_FIELDS: Record<number, string[]> = {
  1: ['items'],
  2: ['supplierId'],
  3: [
    'paymentTerms',
    'paymentStatus',
    'paymentAmount',
    'paymentMode',
    'paymentReferenceNumber',
    'paymentDueDate',
    'procurementDate',
  ],
  4: [],
};
