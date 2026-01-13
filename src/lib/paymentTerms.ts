import { addDays, format } from 'date-fns';

export const PAYMENT_TERMS_DAYS: Record<string, number> = {
  advance: 0,
  cod: 0,
  net_7: 7,
  net_15: 15,
  net_30: 30,
  net_45: 45,
  net_60: 60,
};

export const PAYMENT_TERMS_LABELS: Record<string, string> = {
  advance: 'Advance',
  cod: 'Cash on Delivery',
  net_7: 'Net 7 Days',
  net_15: 'Net 15 Days',
  net_30: 'Net 30 Days',
  net_45: 'Net 45 Days',
  net_60: 'Net 60 Days',
};

/**
 * Calculate payment due date based on payment terms and a reference date
 * @param paymentTerms - The payment terms (e.g., 'net_30')
 * @param referenceDate - The date to calculate from (defaults to today)
 * @returns The calculated due date as a string in YYYY-MM-DD format, or null for advance/cod
 */
export function calculatePaymentDueDate(
  paymentTerms: string,
  referenceDate: Date = new Date()
): string | null {
  const daysToAdd = PAYMENT_TERMS_DAYS[paymentTerms];
  
  if (daysToAdd === undefined || daysToAdd === 0) {
    return null; // No due date for advance or cod
  }
  
  const dueDate = addDays(referenceDate, daysToAdd);
  return format(dueDate, 'yyyy-MM-dd');
}

/**
 * Get formatted payment terms label
 */
export function getPaymentTermsLabel(paymentTerms: string): string {
  return PAYMENT_TERMS_LABELS[paymentTerms] || paymentTerms;
}
