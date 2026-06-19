import jsPDF from 'jspdf';

export interface ReconLineRow {
  product_name: string;
  hsn: string;
  quantity: number;
  gst_rate: number;
  gross_total: number;
  expected_gross?: number | null;
  delta?: number | null;
}

export interface ReconExportPayload {
  orderNumber: string;
  proformaTotal: number;
  expectedTotal: number;
  delta: number;
  amountPaid: number;
  rules: Array<{ rule: string; detail: string }>;
  lines: ReconLineRow[];
  generatedAt?: Date;
}

function inr(n: number): string {
  return `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportReconciliationCsv(p: ReconExportPayload, filename?: string) {
  const rows: string[] = [];
  rows.push(`Proforma reconciliation,${csvEscape(p.orderNumber)}`);
  rows.push(`Generated,${csvEscape((p.generatedAt || new Date()).toISOString())}`);
  rows.push('');
  rows.push('Summary');
  rows.push(`Proforma total,${p.proformaTotal}`);
  rows.push(`Expected (Zoho) total,${p.expectedTotal}`);
  rows.push(`Delta,${p.delta}`);
  rows.push(`Amount paid,${p.amountPaid}`);
  rows.push('');
  rows.push('Line items');
  rows.push(['Item', 'HSN', 'Qty', 'GST %', 'Proforma total', 'Expected total', 'Delta']
    .map(csvEscape).join(','));
  for (const l of p.lines) {
    rows.push([
      l.product_name, l.hsn, l.quantity, l.gst_rate, l.gross_total,
      l.expected_gross ?? '', l.delta ?? '',
    ].map(csvEscape).join(','));
  }
  rows.push('');
  rows.push('Rule attribution');
  rows.push(['Rule', 'Detail'].map(csvEscape).join(','));
  for (const r of p.rules) rows.push([r.rule, r.detail].map(csvEscape).join(','));

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `reconciliation-${p.orderNumber}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportReconciliationPdf(p: ReconExportPayload, filename?: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  let y = 40;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('Proforma Reconciliation', 40, y); y += 22;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Order: ${p.orderNumber}`, 40, y);
  doc.text(`Generated: ${(p.generatedAt || new Date()).toLocaleString('en-IN')}`, W - 220, y);
  y += 18;

  doc.setDrawColor(220); doc.line(40, y, W - 40, y); y += 14;

  doc.setFont('helvetica', 'bold'); doc.text('Summary', 40, y); y += 14;
  doc.setFont('helvetica', 'normal');
  const sumRows: Array<[string, string]> = [
    ['Proforma total', inr(p.proformaTotal)],
    ['Expected (Zoho) total', inr(p.expectedTotal)],
    ['Delta', inr(p.delta)],
    ['Amount paid', inr(p.amountPaid)],
  ];
  for (const [k, v] of sumRows) {
    doc.text(k, 50, y); doc.text(v, W - 50, y, { align: 'right' }); y += 14;
  }
  y += 8;

  doc.setFont('helvetica', 'bold'); doc.text('Line items', 40, y); y += 14;
  doc.setFontSize(9);
  const headers = ['Item', 'HSN', 'Qty', 'GST %', 'Proforma', 'Expected', 'Delta'];
  const colX = [40, 230, 280, 320, 370, 440, 510];
  headers.forEach((h, i) => doc.text(h, colX[i], y));
  y += 12; doc.setFont('helvetica', 'normal');
  for (const l of p.lines) {
    if (y > 760) { doc.addPage(); y = 40; }
    const name = (l.product_name || '').slice(0, 38);
    doc.text(name, colX[0], y);
    doc.text(String(l.hsn || ''), colX[1], y);
    doc.text(String(l.quantity), colX[2], y);
    doc.text(`${l.gst_rate}%`, colX[3], y);
    doc.text(inr(l.gross_total), colX[4], y);
    doc.text(l.expected_gross != null ? inr(l.expected_gross) : '—', colX[5], y);
    doc.text(l.delta != null ? inr(l.delta) : '—', colX[6], y);
    y += 12;
  }
  y += 12;

  if (y > 720) { doc.addPage(); y = 40; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('Rule attribution', 40, y); y += 14;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  for (const r of p.rules) {
    if (y > 780) { doc.addPage(); y = 40; }
    doc.setFont('helvetica', 'bold'); doc.text(r.rule, 40, y);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(r.detail, W - 200);
    doc.text(wrapped, 200, y);
    y += 12 * Math.max(1, wrapped.length);
  }

  doc.save(filename || `reconciliation-${p.orderNumber}.pdf`);
}