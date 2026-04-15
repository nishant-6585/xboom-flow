/**
 * Client-side CSV/Excel bank statement parser.
 * PDF parsing requires server-side processing (edge function).
 */

export interface ParsedTransaction {
  transaction_date: string;
  value_date: string | null;
  bank_reference: string | null;
  narration: string | null;
  credit_amount: number;
  debit_amount: number;
  running_balance: number | null;
  transaction_type: 'credit' | 'debit' | 'unknown';
}

const DATE_PATTERNS = [
  /(\d{2})\/(\d{2})\/(\d{4})/,  // DD/MM/YYYY
  /(\d{2})-(\d{2})-(\d{4})/,    // DD-MM-YYYY
  /(\d{4})-(\d{2})-(\d{2})/,    // YYYY-MM-DD
  /(\d{2})\/(\d{2})\/(\d{2})/,  // DD/MM/YY
];

function parseDate(val: string): string | null {
  if (!val) return null;
  const s = val.trim();
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const m2 = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2})$/);
  if (m2) return `20${m2[3]}-${m2[2]}-${m2[1]}`;
  return null;
}

function parseNumber(val: string | number | null | undefined): number {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return val;
  return parseFloat(val.replace(/,/g, '').replace(/[^0-9.\-]/g, '')) || 0;
}

// Map common header names to our fields
const HEADER_MAP: Record<string, string> = {
  'date': 'transaction_date', 'txn date': 'transaction_date', 'transaction date': 'transaction_date', 'trans date': 'transaction_date', 'posting date': 'transaction_date',
  'value date': 'value_date', 'val date': 'value_date', 'value dt': 'value_date',
  'reference': 'bank_reference', 'ref no': 'bank_reference', 'ref': 'bank_reference', 'chq no': 'bank_reference', 'cheque no': 'bank_reference', 'transaction id': 'bank_reference', 'utr': 'bank_reference',
  'narration': 'narration', 'description': 'narration', 'particulars': 'narration', 'remarks': 'narration', 'details': 'narration', 'transaction details': 'narration',
  'credit': 'credit_amount', 'credit amount': 'credit_amount', 'cr': 'credit_amount', 'deposit': 'credit_amount', 'deposits': 'credit_amount',
  'debit': 'debit_amount', 'debit amount': 'debit_amount', 'dr': 'debit_amount', 'withdrawal': 'debit_amount', 'withdrawals': 'debit_amount',
  'balance': 'running_balance', 'closing balance': 'running_balance', 'running balance': 'running_balance', 'available balance': 'running_balance',
  'amount': 'amount',
};

function normalizeHeader(h: string): string {
  const key = h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  return HEADER_MAP[key] || key;
}

export function parseCSVContent(csvText: string): ParsedTransaction[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Find header row (first row with multiple recognizable columns)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const cols = splitCSVLine(lines[i]);
    const mapped = cols.map(c => normalizeHeader(c));
    const matchCount = mapped.filter(m => Object.values(HEADER_MAP).includes(m)).length;
    if (matchCount >= 2) { headerIdx = i; break; }
  }

  const headers = splitCSVLine(lines[headerIdx]).map(normalizeHeader);
  const results: ParsedTransaction[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 3) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });

    const txDate = parseDate(row['transaction_date']);
    if (!txDate) continue;

    let credit = parseNumber(row['credit_amount']);
    let debit = parseNumber(row['debit_amount']);

    // If only 'amount' column exists
    if (!credit && !debit && row['amount']) {
      const amt = parseNumber(row['amount']);
      if (amt > 0) credit = amt;
      else debit = Math.abs(amt);
    }

    const txType = credit > 0 ? 'credit' : debit > 0 ? 'debit' : 'unknown';

    results.push({
      transaction_date: txDate,
      value_date: parseDate(row['value_date']),
      bank_reference: row['bank_reference'] || null,
      narration: row['narration'] || null,
      credit_amount: credit,
      debit_amount: debit,
      running_balance: row['running_balance'] ? parseNumber(row['running_balance']) : null,
      transaction_type: txType,
    });
  }

  return results;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += char;
  }
  result.push(current.trim());
  return result;
}

export function detectDuplicates(existing: ParsedTransaction[], incoming: ParsedTransaction[]): Set<number> {
  const dupeIndices = new Set<number>();
  const existingKeys = new Set(existing.map(t =>
    `${t.transaction_date}_${t.credit_amount}_${t.debit_amount}_${(t.narration || '').substring(0, 30)}`
  ));
  incoming.forEach((t, i) => {
    const key = `${t.transaction_date}_${t.credit_amount}_${t.debit_amount}_${(t.narration || '').substring(0, 30)}`;
    if (existingKeys.has(key)) dupeIndices.add(i);
  });
  return dupeIndices;
}
