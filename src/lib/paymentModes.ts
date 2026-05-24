export type PaymentMode =
  | 'payment_gateway'
  | 'neft'
  | 'rtgs'
  | 'imps'
  | 'upi'
  | 'cash'
  | 'cheque'
  | 'dd'
  | 'credit_card'
  | 'debit_card'
  | 'bank_transfer'
  | 'other';

export interface PaymentModeDef {
  value: PaymentMode;
  label: string;
  shortLabel: string;
  category: 'digital' | 'bank' | 'physical' | 'other';
  description?: string;
}

export const PAYMENT_MODES: ReadonlyArray<PaymentModeDef> = [
  { value: 'payment_gateway', label: 'Payment Gateway', shortLabel: 'Gateway', category: 'digital', description: 'Razorpay / PayU / online cards' },
  { value: 'upi',             label: 'UPI',             shortLabel: 'UPI',     category: 'digital' },
  { value: 'neft',            label: 'NEFT',            shortLabel: 'NEFT',    category: 'bank',    description: 'B2B bank transfer' },
  { value: 'rtgs',            label: 'RTGS',            shortLabel: 'RTGS',    category: 'bank' },
  { value: 'imps',            label: 'IMPS',            shortLabel: 'IMPS',    category: 'bank' },
  { value: 'cheque',          label: 'Cheque',          shortLabel: 'Cheque',  category: 'physical' },
  { value: 'dd',              label: 'Demand Draft',    shortLabel: 'DD',      category: 'physical' },
  { value: 'cash',            label: 'Cash',            shortLabel: 'Cash',    category: 'physical' },
  { value: 'credit_card',     label: 'Credit Card',     shortLabel: 'Credit',  category: 'digital' },
  { value: 'debit_card',      label: 'Debit Card',      shortLabel: 'Debit',   category: 'digital' },
  { value: 'bank_transfer',   label: 'Bank Transfer',   shortLabel: 'Bank',    category: 'bank',    description: 'Generic / legacy' },
  { value: 'other',           label: 'Other',           shortLabel: 'Other',   category: 'other' },
];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = Object.fromEntries(
  PAYMENT_MODES.map((m) => [m.value, m.label]),
) as Record<PaymentMode, string>;

export const PAYMENT_MODE_CATEGORIES: ReadonlyArray<{ value: PaymentModeDef['category']; label: string }> = [
  { value: 'digital',  label: 'Digital' },
  { value: 'bank',     label: 'Bank' },
  { value: 'physical', label: 'Physical' },
  { value: 'other',    label: 'Other' },
];

export function getPaymentModeLabel(mode: string | null | undefined): string {
  if (!mode) return 'Unknown';
  if (mode === 'mixed') return 'Mixed';
  return PAYMENT_MODE_LABELS[mode as PaymentMode] ?? mode;
}

export function getPaymentModeCategory(mode: string | null | undefined): PaymentModeDef['category'] | null {
  return PAYMENT_MODES.find((m) => m.value === mode)?.category ?? null;
}

export function getPaymentModeBadgeClass(mode: string | null | undefined): string {
  if (mode === 'mixed') {
    return 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20';
  }
  const cat = getPaymentModeCategory(mode);
  switch (cat) {
    case 'digital':  return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20';
    case 'bank':     return 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20';
    case 'physical': return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
    case 'other':    return 'bg-muted text-muted-foreground border-border';
    default:         return 'bg-muted text-muted-foreground border-border';
  }
}

export function getReferenceNumberPlaceholder(mode: string | null | undefined): string {
  switch (mode) {
    case 'upi':
    case 'imps':
      return 'UTR or transaction ID';
    case 'neft':
    case 'rtgs':
      return 'UTR or transaction reference';
    case 'payment_gateway':
      return 'Gateway transaction ID';
    case 'cheque':
    case 'dd':
      return 'Cheque / DD number';
    case 'cash':
      return 'Optional';
    default:
      return 'Optional';
  }
}