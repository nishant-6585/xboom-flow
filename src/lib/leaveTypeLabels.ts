// Single shared source of truth for leave-type values shown in Leave History
// and its export. Keep the option list here so the Type filter, table cells,
// and Excel export never drift.

export type LeaveHistoryTypeValue =
  | 'EL'
  | 'sick'
  | 'unpaid'
  | 'wfh'
  | 'compoff'
  | 'maternity';

export interface LeaveTypeOption {
  value: LeaveHistoryTypeValue;
  label: string;
}

// Options rendered inside the Leave History "Type" dropdown.
export const LEAVE_HISTORY_TYPE_OPTIONS: LeaveTypeOption[] = [
  { value: 'EL', label: 'Earned Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
  { value: 'wfh', label: 'WFH' },
  { value: 'compoff', label: 'Comp-Off' },
  { value: 'maternity', label: 'Maternity Leave' },
];

// Full label map — covers historical variants stored in leave_requests
// (casual/paid/half_day_*) even though we don't expose them as filter options.
export const LEAVE_TYPE_LABELS: Record<string, string> = {
  EL: 'Earned Leave',
  casual: 'Earned (Casual)',
  paid: 'Earned (Paid)',
  sick: 'Sick Leave',
  unpaid: 'Unpaid Leave',
  half_day_EL: 'Half Day (EL)',
  half_day_sick: 'Half Day (Sick)',
  half_day_unpaid: 'Half Day (Unpaid)',
  half_day_casual: 'Half Day (Casual)',
  half_day_paid: 'Half Day (Paid)',
  wfh: 'WFH',
  compoff: 'Comp-Off',
  maternity: 'Maternity Leave',
};

export function getLeaveTypeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return LEAVE_TYPE_LABELS[value] ?? value;
}