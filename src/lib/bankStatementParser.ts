/**
 * Client-side CSV/Excel bank statement parser.
 * Designed for real-world bank exports with metadata rows, varied headers, and mixed amount formats.
 */

type CellValue = string | number | null | undefined;

type CanonicalField =
  | 'transaction_id'
  | 'transaction_date'
  | 'value_date'
  | 'reference_no'
  | 'narration'
  | 'debit_amount'
  | 'credit_amount'
  | 'running_balance'
  | 'amount';

type AmountParseResult = {
  value: number;
  hasContent: boolean;
  valid: boolean;
};

type SkipReason = 'blank' | 'summary' | 'data';

type HeaderDetectionResult = {
  index: number;
  score: number;
  mappedFields: CanonicalField[];
};

type HeaderMapping = {
  indexes: Partial<Record<CanonicalField, number>>;
  originalHeaders: string[];
  mappedFields: CanonicalField[];
};

export interface ParsedTransaction {
  transaction_date: string;
  value_date: string | null;
  transaction_id: string | null;
  reference_no: string | null;
  bank_reference: string | null;
  narration: string | null;
  credit_amount: number;
  debit_amount: number;
  running_balance: number | null;
  transaction_type: 'credit' | 'debit' | 'unknown';
  direction: 'Credit' | 'Debit' | 'Unknown';
}

export interface ParseDiagnostics {
  fileName: string;
  sheetName: string | null;
  detectedHeaderRow: number | null;
  detectedColumns: string[];
  mappedFields: string[];
  rowsScanned: number;
  rowsSkipped: number;
  transactionsParsed: number;
  reason: string | null;
}

const HEADER_ALIASES: Record<CanonicalField, string[]> = {
  transaction_id: ['tran id', 'transaction id', 'transaction id number', 'txn id', 'transaction number', 'utr', 'utr number'],
  transaction_date: ['date', 'txn date', 'transaction date', 'trans date', 'posting date', 'transaction posted date'],
  value_date: ['value date', 'val date', 'value dt'],
  reference_no: ['cheque no', 'cheque number', 'cheque no ref no', 'cheque no reference no', 'cheque no ref', 'ref no', 'reference no', 'reference number', 'ref number', 'reference'],
  narration: ['transaction remarks', 'remarks', 'narration', 'description', 'particulars', 'transaction details', 'details'],
  debit_amount: ['withdrawal amt', 'withdrawal amount', 'withdrawal', 'debit amt', 'debit amount', 'debit', 'dr'],
  credit_amount: ['deposit amt', 'deposit amount', 'deposit', 'credit amt', 'credit amount', 'credit', 'cr'],
  running_balance: ['balance', 'balance amount', 'running balance', 'closing balance', 'available balance'],
  amount: ['amount', 'transaction amount'],
};

const SKIP_PHRASES = [
  'page total',
  'opening bal',
  'opening balance',
  'closing bal',
  'closing balance',
  'withdrawls',
  'withdrawals',
  'deposits',
  'legends used in account statement',
  'legends used',
  'legend',
  'statement summary',
  'account statement',
  'this is a computer generated',
  'summary',
  'total credits',
  'total debits',
  'page no',
  'generated on',
];

const MONTH_ABBR: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(inr|rs|rupees)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeader(value: string): string {
  return normalizeComparableText(value);
}

function mapHeaderToField(header: string): CanonicalField | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [CanonicalField, string[]][]) {
    if (aliases.includes(normalized)) return field;
  }

  if (normalized.includes('remarks') || normalized.includes('narration') || normalized.includes('description') || normalized.includes('particular')) return 'narration';
  if (normalized.includes('value date')) return 'value_date';
  if (normalized.includes('transaction date') || normalized.includes('txn date') || normalized.includes('posting date') || normalized === 'date') return 'transaction_date';
  if ((normalized.includes('transaction') || normalized.includes('txn') || normalized.includes('tran')) && normalized.includes('id')) return 'transaction_id';
  if (normalized.includes('reference') || normalized.includes('ref no') || normalized.includes('cheque no')) return 'reference_no';
  if (normalized.includes('withdraw') || normalized.includes('debit') || normalized === 'dr') return 'debit_amount';
  if (normalized.includes('deposit') || normalized.includes('credit') || normalized === 'cr') return 'credit_amount';
  if (normalized.includes('balance')) return 'running_balance';
  if (normalized === 'amount' || normalized.endsWith(' amount')) return 'amount';

  return null;
}

function classifyRow(cells: string[]): SkipReason {
  const normalizedCells = cells.map((cell) => normalizeComparableText(cell)).filter(Boolean);
  if (normalizedCells.length === 0) return 'blank';

  const joined = normalizedCells.join(' ');
  if (!joined) return 'blank';
  if (SKIP_PHRASES.some((phrase) => joined.includes(phrase))) return 'summary';
  return 'data';
}

function scoreHeaderRow(cells: CellValue[]): HeaderDetectionResult {
  const mappedFields = Array.from(new Set(cells.map((cell) => mapHeaderToField(String(cell ?? ''))).filter(Boolean) as CanonicalField[]));
  let score = 0;

  if (mappedFields.includes('narration')) score += 2;
  if (mappedFields.includes('transaction_date')) score += 2;
  if (mappedFields.includes('debit_amount') || mappedFields.includes('credit_amount') || mappedFields.includes('amount')) score += 2;
  if (mappedFields.includes('running_balance')) score += 1;
  if (mappedFields.includes('transaction_id') || mappedFields.includes('reference_no')) score += 1;

  return { index: -1, score, mappedFields };
}

function detectHeaderRow(rows: CellValue[][]): HeaderDetectionResult | null {
  let best: HeaderDetectionResult | null = null;

  rows.forEach((row, index) => {
    const candidate = scoreHeaderRow(row);
    const withIndex = { ...candidate, index };

    if (!best || withIndex.score > best.score || (withIndex.score === best.score && withIndex.mappedFields.length > best.mappedFields.length)) {
      best = withIndex;
    }
  });

  return best;
}

function buildHeaderMapping(headerRow: CellValue[]): HeaderMapping {
  const indexes: Partial<Record<CanonicalField, number>> = {};
  const originalHeaders = headerRow.map((cell) => String(cell ?? '').trim());

  headerRow.forEach((cell, index) => {
    const field = mapHeaderToField(String(cell ?? ''));
    if (field && indexes[field] == null) indexes[field] = index;
  });

  return {
    indexes,
    originalHeaders,
    mappedFields: Object.keys(indexes) as CanonicalField[],
  };
}

function getCell(row: CellValue[], index?: number): CellValue {
  if (index == null) return null;
  return row[index];
}

function stringifyCell(value: CellValue): string {
  if (value == null) return '';
  return String(value).trim();
}

function parseDate(val: CellValue): string | null {
  if (val == null) return null;
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
  }

  const s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+\d.*)?$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;

  const ddmmyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (ddmmyy) return `20${ddmmyy[3]}-${ddmmyy[2].padStart(2, '0')}-${ddmmyy[1].padStart(2, '0')}`;

  const ddMonYYYY = s.match(/^(\d{1,2})[\/\-\s]([A-Za-z]{3})[\/\-\s](\d{4})$/);
  if (ddMonYYYY) {
    const month = MONTH_ABBR[ddMonYYYY[2].toLowerCase()];
    if (month) return `${ddMonYYYY[3]}-${month}-${ddMonYYYY[1].padStart(2, '0')}`;
  }

  const ddMonYY = s.match(/^(\d{1,2})[\/\-\s]([A-Za-z]{3})[\/\-\s](\d{2})$/);
  if (ddMonYY) {
    const month = MONTH_ABBR[ddMonYY[2].toLowerCase()];
    if (month) return `20${ddMonYY[3]}-${month}-${ddMonYY[1].padStart(2, '0')}`;
  }

  return null;
}

function parseAmount(value: CellValue): AmountParseResult {
  if (value == null) return { value: 0, hasContent: false, valid: true };
  if (typeof value === 'number') return { value: Number.isFinite(value) ? value : 0, hasContent: true, valid: Number.isFinite(value) };

  const raw = String(value).trim();
  if (!raw) return { value: 0, hasContent: false, valid: true };

  const negative = raw.startsWith('(') && raw.endsWith(')');
  const cleaned = raw.replace(/,/g, '').replace(/[₹\s]/g, '').replace(/[()]/g, '');
  if (!cleaned) return { value: 0, hasContent: false, valid: true };

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return { value: 0, hasContent: true, valid: false };
  return { value: negative ? -parsed : parsed, hasContent: true, valid: true };
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  result.push(current.trim());
  return result;
}

function deriveFailureReason(mapping: HeaderMapping | null, counters: Record<string, number>): string {
  if (!mapping) {
    return counters.headerSignals > 0 ? 'Required columns could not be mapped' : 'Header row could not be detected';
  }

  const hasDate = mapping.indexes.transaction_date != null;
  const hasAmountColumns = mapping.indexes.debit_amount != null || mapping.indexes.credit_amount != null || mapping.indexes.amount != null;

  if (!hasDate || !hasAmountColumns) return 'Required columns could not be mapped';
  if (counters.amountParseFailures > 0 && counters.noAmountRows === 0) return 'Amount values could not be parsed';
  if (counters.summaryRows + counters.blankRows > 0 && counters.validDataRows === 0 && counters.invalidDateRows === 0 && counters.noAmountRows === 0) return 'Only summary or blank rows were found';
  if (counters.noAmountRows > 0 || counters.validDataRows > 0) return 'No valid debit or credit rows were found';
  if (counters.invalidDateRows > 0) return 'No valid transaction dates were found after the header row';
  return 'No transactions could be parsed from the file';
}

function parseRows(rows: CellValue[][], diagnostics?: ParseDiagnostics): ParsedTransaction[] {
  if (rows.length < 2) {
    if (diagnostics) diagnostics.reason = 'File has fewer than 2 rows';
    return [];
  }

  const rowsScanned = Math.min(30, rows.length);
  const scannedRows = rows.slice(0, rowsScanned);
  const bestHeader = detectHeaderRow(scannedRows);
  const headerSignals = scannedRows.reduce((max, row) => Math.max(max, scoreHeaderRow(row).score), 0);

  if (!bestHeader || bestHeader.score < 4) {
    if (diagnostics) {
      diagnostics.rowsScanned = rowsScanned;
      diagnostics.reason = headerSignals > 0 ? 'Required columns could not be mapped' : 'Header row could not be detected';
    }
    return [];
  }

  const mapping = buildHeaderMapping(rows[bestHeader.index]);

  if (diagnostics) {
    diagnostics.rowsScanned = rowsScanned;
    diagnostics.detectedHeaderRow = bestHeader.index + 1;
    diagnostics.detectedColumns = mapping.originalHeaders.filter(Boolean);
    diagnostics.mappedFields = mapping.mappedFields;
  }

  const hasDate = mapping.indexes.transaction_date != null;
  const hasAmountColumns = mapping.indexes.debit_amount != null || mapping.indexes.credit_amount != null || mapping.indexes.amount != null;
  if (!hasDate || !hasAmountColumns) {
    if (diagnostics) diagnostics.reason = 'Required columns could not be mapped';
    return [];
  }

  const counters = {
    blankRows: 0,
    summaryRows: 0,
    invalidDateRows: 0,
    noAmountRows: 0,
    amountParseFailures: 0,
    validDataRows: 0,
    headerSignals,
  };

  const results: ParsedTransaction[] = [];

  for (let index = bestHeader.index + 1; index < rows.length; index++) {
    const row = rows[index] ?? [];
    const rowCells = row.map((cell) => stringifyCell(cell));
    const classification = classifyRow(rowCells);

    if (classification === 'blank') {
      counters.blankRows += 1;
      continue;
    }

    if (classification === 'summary') {
      counters.summaryRows += 1;
      continue;
    }

    counters.validDataRows += 1;

    const transactionDate = parseDate(getCell(row, mapping.indexes.transaction_date));
    if (!transactionDate) {
      counters.invalidDateRows += 1;
      continue;
    }

    const debitResult = parseAmount(getCell(row, mapping.indexes.debit_amount));
    const creditResult = parseAmount(getCell(row, mapping.indexes.credit_amount));
    const amountResult = parseAmount(getCell(row, mapping.indexes.amount));

    if ((!debitResult.valid && debitResult.hasContent) || (!creditResult.valid && creditResult.hasContent) || (!amountResult.valid && amountResult.hasContent)) {
      counters.amountParseFailures += 1;
    }

    let debit = Math.max(debitResult.value, 0);
    let credit = Math.max(creditResult.value, 0);

    if (debit <= 0 && credit <= 0 && amountResult.valid && amountResult.hasContent) {
      if (amountResult.value < 0) debit = Math.abs(amountResult.value);
      if (amountResult.value > 0) credit = amountResult.value;
    }

    if (debit <= 0 && credit <= 0) {
      counters.noAmountRows += 1;
      continue;
    }

    const transactionId = stringifyCell(getCell(row, mapping.indexes.transaction_id)) || null;
    const referenceNo = stringifyCell(getCell(row, mapping.indexes.reference_no)) || null;
    const direction: ParsedTransaction['direction'] = credit > 0 ? 'Credit' : debit > 0 ? 'Debit' : 'Unknown';

    const balanceResult = parseAmount(getCell(row, mapping.indexes.running_balance));

    results.push({
      transaction_date: transactionDate,
      value_date: parseDate(getCell(row, mapping.indexes.value_date)),
      transaction_id: transactionId,
      reference_no: referenceNo,
      bank_reference: referenceNo || transactionId,
      narration: stringifyCell(getCell(row, mapping.indexes.narration)) || null,
      credit_amount: credit,
      debit_amount: debit,
      running_balance: balanceResult.hasContent && balanceResult.valid ? balanceResult.value : null,
      transaction_type: direction === 'Credit' ? 'credit' : direction === 'Debit' ? 'debit' : 'unknown',
      direction,
    });
  }

  if (diagnostics) {
    diagnostics.rowsSkipped = counters.blankRows + counters.summaryRows + counters.invalidDateRows + counters.noAmountRows;
    diagnostics.transactionsParsed = results.length;
    if (results.length === 0) diagnostics.reason = deriveFailureReason(mapping, counters);
  }

  return results;
}

export function parseCSVContent(csvText: string, diagnostics?: ParseDiagnostics): ParsedTransaction[] {
  const rows = csvText.split(/\r?\n/).map(splitCSVLine);
  return parseRows(rows, diagnostics);
}

export function parseExcelRows(rows: CellValue[][], diagnostics?: ParseDiagnostics): ParsedTransaction[] {
  return parseRows(rows, diagnostics);
}

export function createDiagnostics(fileName: string): ParseDiagnostics {
  return {
    fileName,
    sheetName: null,
    detectedHeaderRow: null,
    detectedColumns: [],
    mappedFields: [],
    rowsScanned: 0,
    rowsSkipped: 0,
    transactionsParsed: 0,
    reason: null,
  };
}

export function detectDuplicates(existing: ParsedTransaction[], incoming: ParsedTransaction[]): Set<number> {
  const dupeIndices = new Set<number>();
  const existingKeys = new Set(existing.map((t) =>
    `${t.transaction_date}_${t.credit_amount}_${t.debit_amount}_${(t.narration || '').substring(0, 30)}`
  ));

  incoming.forEach((t, i) => {
    const key = `${t.transaction_date}_${t.credit_amount}_${t.debit_amount}_${(t.narration || '').substring(0, 30)}`;
    if (existingKeys.has(key)) dupeIndices.add(i);
  });

  return dupeIndices;
}
