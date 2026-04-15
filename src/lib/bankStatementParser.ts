/**
 * Client-side CSV/Excel bank statement parser.
 * Supports ICICI and other Indian bank formats with metadata rows above the transaction table.
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

export interface ParseDiagnostics {
  fileName: string;
  sheetName: string | null;
  detectedHeaderRow: number | null;
  detectedColumns: string[];
  rowsSkipped: number;
  transactionsParsed: number;
  reason: string | null;
}

// Rows containing these phrases are non-transaction rows to skip
const SKIP_PHRASES = [
  'page total', 'opening bal', 'closing bal', 'withdrawls:', 'withdrawals:',
  'deposits:', 'legends used', 'legend:', 'statement summary', 'account statement',
  'total:', 'end of statement', 'this is a computer generated',
];

function shouldSkipRow(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase().trim();
  if (!joined || joined.replace(/[,.\s]/g, '').length === 0) return true;
  return SKIP_PHRASES.some(p => joined.includes(p));
}

// ── Header detection ──────────────────────────────────────────────

// Known header labels mapped to our internal field names
const HEADER_MAP: Record<string, string> = {
  'date': 'transaction_date',
  'txn date': 'transaction_date',
  'transaction date': 'transaction_date',
  'trans date': 'transaction_date',
  'posting date': 'transaction_date',
  'value date': 'value_date',
  'val date': 'value_date',
  'value dt': 'value_date',
  'reference': 'bank_reference',
  'ref no': 'bank_reference',
  'ref': 'bank_reference',
  'chq no': 'bank_reference',
  'cheque no': 'bank_reference',
  'cheque no ref no': 'bank_reference',
  'transaction id': 'bank_reference',
  'tran id': 'bank_reference',
  'utr': 'bank_reference',
  'narration': 'narration',
  'description': 'narration',
  'particulars': 'narration',
  'remarks': 'narration',
  'details': 'narration',
  'transaction details': 'narration',
  'transaction remarks': 'narration',
  'credit': 'credit_amount',
  'credit amount': 'credit_amount',
  'credit amt': 'credit_amount',
  'credit amt inr': 'credit_amount',
  'deposit amt': 'credit_amount',
  'deposit amt inr': 'credit_amount',
  'deposit': 'credit_amount',
  'deposits': 'credit_amount',
  'cr': 'credit_amount',
  'debit': 'debit_amount',
  'debit amount': 'debit_amount',
  'debit amt': 'debit_amount',
  'debit amt inr': 'debit_amount',
  'withdrawal amt': 'debit_amount',
  'withdrawal amt inr': 'debit_amount',
  'withdrawal': 'debit_amount',
  'withdrawals': 'debit_amount',
  'dr': 'debit_amount',
  'balance': 'running_balance',
  'closing balance': 'running_balance',
  'running balance': 'running_balance',
  'available balance': 'running_balance',
  'balance inr': 'running_balance',
  'amount': 'amount',
};

/**
 * Normalize a raw header string for matching:
 * lowercase, remove parens/dots/slashes, collapse whitespace.
 */
function normalizeHeader(h: string): string {
  const key = h
    .toLowerCase()
    .replace(/\(.*?\)/g, '')       // remove parenthetical like (INR)
    .replace(/[^a-z0-9 ]/g, ' ')   // non-alphanum → space
    .replace(/\s+/g, ' ')
    .trim();
  // Exact match first
  if (HEADER_MAP[key]) return HEADER_MAP[key];
  // Partial / fuzzy match
  for (const [pattern, field] of Object.entries(HEADER_MAP)) {
    if (key.includes(pattern) || pattern.includes(key)) return field;
  }
  return key;
}

/**
 * Check whether a row of strings looks like the transaction header.
 * Must contain narration-like AND (credit or debit) columns.
 */
function isHeaderRow(cells: string[]): boolean {
  const mapped = cells.map(normalizeHeader);
  const hasNarration = mapped.includes('narration');
  const hasCredit = mapped.includes('credit_amount');
  const hasDebit = mapped.includes('debit_amount');
  const hasAmount = mapped.includes('amount');
  return hasNarration && (hasCredit || hasDebit || hasAmount);
}

// ── Date parsing ──────────────────────────────────────────────────

function parseDate(val: string | number | null | undefined): string | null {
  if (val == null) return null;
  // Excel serial date number
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      return d.toISOString().substring(0, 10);
    }
    return null;
  }
  const s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m2) return `20${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  return null;
}

// ── Number parsing (Indian format support) ────────────────────────

function parseNumber(val: string | number | null | undefined): number {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).trim().replace(/,/g, '').replace(/[^0-9.\-]/g, '');
  return parseFloat(cleaned) || 0;
}

// ── CSV line splitter ─────────────────────────────────────────────

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

// ── Main CSV parser ───────────────────────────────────────────────

export function parseCSVContent(csvText: string, diagnostics?: ParseDiagnostics): ParsedTransaction[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    if (diagnostics) diagnostics.reason = 'File has fewer than 2 lines';
    return [];
  }

  // Scan up to 30 rows for header
  let headerIdx = -1;
  for (let i = 0; i < Math.min(30, lines.length); i++) {
    const cols = splitCSVLine(lines[i]);
    if (isHeaderRow(cols)) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    // Fallback: try first row with ≥2 known columns (old behaviour)
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const cols = splitCSVLine(lines[i]);
      const mapped = cols.map(normalizeHeader);
      const matchCount = mapped.filter(m => Object.values(HEADER_MAP).includes(m)).length;
      if (matchCount >= 2) { headerIdx = i; break; }
    }
  }

  if (headerIdx === -1) {
    if (diagnostics) diagnostics.reason = 'Could not detect a valid header row in first 30 rows';
    return [];
  }

  const rawHeaders = splitCSVLine(lines[headerIdx]);
  const headers = rawHeaders.map(normalizeHeader);

  if (diagnostics) {
    diagnostics.detectedHeaderRow = headerIdx + 1;
    diagnostics.detectedColumns = rawHeaders.filter(h => h.trim());
  }

  const results: ParsedTransaction[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length < 3) { skipped++; continue; }

    // Skip non-transaction rows
    if (shouldSkipRow(cols)) { skipped++; continue; }

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });

    const txDate = parseDate(row['transaction_date']);
    if (!txDate) { skipped++; continue; }

    let credit = parseNumber(row['credit_amount']);
    let debit = parseNumber(row['debit_amount']);

    // If only 'amount' column exists
    if (!credit && !debit && row['amount']) {
      const amt = parseNumber(row['amount']);
      if (amt > 0) credit = amt;
      else debit = Math.abs(amt);
    }

    // Valid transaction needs at least one non-zero amount
    if (credit <= 0 && debit <= 0) { skipped++; continue; }

    const txType = credit > 0 ? 'credit' : 'debit';

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

  if (diagnostics) {
    diagnostics.rowsSkipped = skipped;
    diagnostics.transactionsParsed = results.length;
    if (results.length === 0 && !diagnostics.reason) {
      diagnostics.reason = 'Header detected but no valid transaction rows found after it';
    }
  }

  return results;
}

// ── Excel (XLSX) specific parser ──────────────────────────────────

/**
 * Parse an XLSX worksheet that has been converted to a 2D array of cells.
 * This handles metadata rows, ICICI-style headers, and Indian number formats.
 */
export function parseExcelRows(rows: (string | number | null | undefined)[][], diagnostics?: ParseDiagnostics): ParsedTransaction[] {
  if (rows.length < 2) {
    if (diagnostics) diagnostics.reason = 'Sheet has fewer than 2 rows';
    return [];
  }

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const cells = rows[i].map(c => String(c ?? ''));
    if (isHeaderRow(cells)) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    // Fallback
    for (let i = 0; i < Math.min(30, rows.length); i++) {
      const cells = rows[i].map(c => String(c ?? ''));
      const mapped = cells.map(normalizeHeader);
      const matchCount = mapped.filter(m => Object.values(HEADER_MAP).includes(m)).length;
      if (matchCount >= 2) { headerIdx = i; break; }
    }
  }

  if (headerIdx === -1) {
    if (diagnostics) diagnostics.reason = 'Could not detect a valid header row in first 30 rows';
    return [];
  }

  const rawHeaders = rows[headerIdx].map(c => String(c ?? ''));
  const headers = rawHeaders.map(normalizeHeader);

  if (diagnostics) {
    diagnostics.detectedHeaderRow = headerIdx + 1;
    diagnostics.detectedColumns = rawHeaders.filter(h => h.trim());
  }

  const results: ParsedTransaction[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = rows[i];
    const cellStrings = cells.map(c => String(c ?? ''));

    if (shouldSkipRow(cellStrings)) { skipped++; continue; }

    const row: Record<string, string | number | null | undefined> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx]; });

    const txDate = parseDate(row['transaction_date'] as any);
    if (!txDate) { skipped++; continue; }

    let credit = parseNumber(row['credit_amount'] as any);
    let debit = parseNumber(row['debit_amount'] as any);

    if (!credit && !debit && row['amount'] != null) {
      const amt = parseNumber(row['amount'] as any);
      if (amt > 0) credit = amt;
      else debit = Math.abs(amt);
    }

    if (credit <= 0 && debit <= 0) { skipped++; continue; }

    const txType = credit > 0 ? 'credit' : 'debit';

    results.push({
      transaction_date: txDate,
      value_date: parseDate(row['value_date'] as any),
      bank_reference: row['bank_reference'] ? String(row['bank_reference']) : null,
      narration: row['narration'] ? String(row['narration']) : null,
      credit_amount: credit,
      debit_amount: debit,
      running_balance: row['running_balance'] != null ? parseNumber(row['running_balance'] as any) : null,
      transaction_type: txType,
    });
  }

  if (diagnostics) {
    diagnostics.rowsSkipped = skipped;
    diagnostics.transactionsParsed = results.length;
    if (results.length === 0 && !diagnostics.reason) {
      diagnostics.reason = 'Header detected but no valid transaction rows found after it';
    }
  }

  return results;
}

export function createDiagnostics(fileName: string): ParseDiagnostics {
  return {
    fileName,
    sheetName: null,
    detectedHeaderRow: null,
    detectedColumns: [],
    rowsSkipped: 0,
    transactionsParsed: 0,
    reason: null,
  };
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
