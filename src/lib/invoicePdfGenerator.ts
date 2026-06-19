import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import logoAsset from '@/assets/xboom-logo.png.asset.json';
import {
  GstSplit,
  GstTreatment,
  inrAmountInWords,
  splitGstInclusive,
} from './invoiceGst';

export interface ProformaLineInput {
  product_name: string;
  description?: string | null;
  hsn?: string | null;
  quantity: number;
  gross_total: number; // line total INCLUDING GST
  gst_rate: number;
}

export interface ProformaInput {
  proforma_number: string;
  invoice_date: Date;
  due_date?: Date | null;
  order_number?: string | null;
  bill_to: {
    name: string;
    company?: string | null;
    address?: string | null;
    state?: string | null;
    gstin?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  place_of_supply_code: string;
  place_of_supply_name: string;
  treatment: GstTreatment;
  items: ProformaLineInput[];
  amount_paid?: number;
  notes?: string | null;
  signature_data_url?: string | null;
}

export interface ProformaTotals {
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  line_splits: GstSplit[];
  tax_breakup: Array<{ rate: number; taxable: number; cgst: number; sgst: number; igst: number }>;
}

const SELLER = {
  name: 'Xboom Utilities',
  address: 'Bangalore, Karnataka 560102',
  gstin: '29CTKPS7090H1ZW',
  email: 'Contact@xboom.in',
  website: 'www.xboom.in',
};

const BANK = {
  name: 'XBoom Utilities',
  account: '035705004246',
  ifsc: 'ICIC0000357',
  bank: 'ICICI Bank, HSR Layout Bangalore',
  upi: 'Xboom@icici',
};

const TERMS: Array<{ title: string; content: string }> = [
  { title: '1. Document Type', content: 'This is a Proforma Invoice issued for advance confirmation and payment reconciliation. It is NOT a valid tax invoice for the purpose of claiming GST input credit. A formal GST tax invoice will be issued separately on dispatch.' },
  { title: '2. Validity', content: 'This proforma is valid for 7 calendar days from the date of issue.' },
  { title: '3. Payment Terms', content: 'Due on receipt. Order processing begins on confirmation of payment.' },
  { title: '4. Taxes', content: 'All amounts shown are inclusive of GST at the rate indicated. HSN/SAC: 88062200 (default, unless overridden).' },
  { title: '5. Delivery', content: 'Estimated delivery is 7–10 working days from payment confirmation, unless agreed otherwise.' },
  { title: '6. Warranty', content: 'Standard manufacturer warranty applies wherever applicable.' },
  { title: '7. Cancellations', content: 'Confirmed orders cannot be cancelled or modified without prior written consent from the seller.' },
  { title: '8. Availability', content: 'Subject to stock availability at the time of payment confirmation.' },
  { title: '9. Force Majeure', content: 'Seller is not liable for delays caused by events beyond reasonable control.' },
  { title: '10. Jurisdiction', content: 'Governed by the laws of India; disputes are subject to the exclusive jurisdiction of courts in Bangalore, Karnataka.' },
];

function loadImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no ctx'));
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('img load failed'));
    img.src = url;
  });
}

function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function computeProformaTotals(input: ProformaInput): ProformaTotals {
  const line_splits = input.items.map(it =>
    splitGstInclusive(it.gross_total, it.gst_rate, input.treatment)
  );
  const subtotal = line_splits.reduce((s, l) => s + l.taxable, 0);
  const cgst = line_splits.reduce((s, l) => s + l.cgst, 0);
  const sgst = line_splits.reduce((s, l) => s + l.sgst, 0);
  const igst = line_splits.reduce((s, l) => s + l.igst, 0);
  const tax = cgst + sgst + igst;
  const total = input.items.reduce((s, it) => s + (Number(it.gross_total) || 0), 0);
  const amount_paid = Number(input.amount_paid || 0);
  const balance_due = Math.max(0, total - amount_paid);

  // Tax breakup grouped by rate
  const map = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  input.items.forEach((it, idx) => {
    const sp = line_splits[idx];
    const cur = map.get(sp.rate) || { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    cur.taxable += sp.taxable; cur.cgst += sp.cgst; cur.sgst += sp.sgst; cur.igst += sp.igst;
    map.set(sp.rate, cur);
  });
  const tax_breakup = Array.from(map.entries())
    .map(([rate, v]) => ({ rate, ...v }))
    .sort((a, b) => a.rate - b.rate);

  return { subtotal, cgst, sgst, igst, tax, total, amount_paid, balance_due, line_splits, tax_breakup };
}

export async function generateProformaPdf(input: ProformaInput): Promise<{ blob: Blob; totals: ProformaTotals }> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const ORANGE: [number, number, number] = [255, 102, 0];
  const DARK: [number, number, number] = [33, 37, 41];
  const GRAY: [number, number, number] = [108, 117, 125];
  const BORDER: [number, number, number] = [220, 220, 220];

  // Top accent
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, pageW, 5, 'F');

  // Logo
  let y = 14;
  try {
    const logo = await loadImage(logoAsset.url);
    doc.addImage(logo, 'PNG', margin, y - 4, 38, 14);
  } catch {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...ORANGE);
    doc.text('XBOOM', margin, y + 4);
  }

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...DARK);
  doc.text('PROFORMA INVOICE', pageW - margin, y + 2, { align: 'right' });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('Not a valid tax invoice for GST input credit', pageW - margin, y + 7, { align: 'right' });

  // Seller block
  y = 34;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...DARK);
  doc.text(SELLER.name, margin, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
  doc.text(SELLER.address, margin, y + 4);
  doc.text(`GSTIN: ${SELLER.gstin}`, margin, y + 8);
  doc.text(`${SELLER.email}  |  ${SELLER.website}`, margin, y + 12);

  // Meta box (right)
  const metaX = pageW - margin - 75;
  const metaY = y - 4;
  const metaH = input.order_number ? 28 : 22;
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
  doc.roundedRect(metaX, metaY, 75, metaH, 2, 2, 'S');
  doc.setFontSize(8); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal');
  const lx = metaX + 3, vx = metaX + 32;
  doc.text('Proforma #:', lx, metaY + 5);
  doc.text('Date:', lx, metaY + 11);
  doc.text('Terms:', lx, metaY + 17);
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
  doc.text(input.proforma_number, vx, metaY + 5);
  doc.text(format(input.invoice_date, 'dd MMM yyyy'), vx, metaY + 11);
  doc.text('Due on Receipt', vx, metaY + 17);
  if (input.order_number) {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
    doc.text('Order #:', lx, metaY + 23);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
    doc.text(input.order_number, vx, metaY + 23);
  }

  // Place of Supply
  y = 52;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
  doc.text(`Place of Supply: ${input.place_of_supply_name} (${input.place_of_supply_code})`, margin, y);

  // Bill To
  y = 58;
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(margin, y, pageW - margin * 2, 26, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...ORANGE);
  doc.text('BILL TO', margin + 4, y + 6);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...DARK);
  doc.text(input.bill_to.name || '—', margin + 4, y + 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
  const billLines: string[] = [];
  if (input.bill_to.company) billLines.push(input.bill_to.company);
  if (input.bill_to.address) billLines.push(...doc.splitTextToSize(input.bill_to.address, pageW - margin * 2 - 8));
  if (input.bill_to.gstin) billLines.push(`GSTIN: ${input.bill_to.gstin}`);
  if (input.bill_to.email || input.bill_to.phone) {
    billLines.push([input.bill_to.email, input.bill_to.phone].filter(Boolean).join(' | '));
  }
  let by = y + 17;
  billLines.slice(0, 3).forEach(l => { doc.text(l, margin + 4, by); by += 4; });

  // Compute totals
  const totals = computeProformaTotals(input);

  // Items table
  const isCgst = input.treatment === 'cgst_sgst';
  const head = isCgst
    ? [['#', 'Item & Description', 'HSN/SAC', 'Qty', 'Rate', 'GST %', 'CGST', 'SGST', 'Amount']]
    : [['#', 'Item & Description', 'HSN/SAC', 'Qty', 'Rate', 'GST %', 'IGST', 'Amount']];

  const body = input.items.map((it, idx) => {
    const sp = totals.line_splits[idx];
    const qty = Number(it.quantity) || 1;
    const ratePerUnit = sp.taxable / qty;
    const desc = it.description ? `${it.product_name}\n${it.description}` : it.product_name;
    if (isCgst) {
      return [
        String(idx + 1), desc, it.hsn || '88062200', String(qty),
        fmt(ratePerUnit), `${sp.rate}%`, fmt(sp.cgst), fmt(sp.sgst), fmt(sp.taxable),
      ];
    }
    return [
      String(idx + 1), desc, it.hsn || '88062200', String(qty),
      fmt(ratePerUnit), `${sp.rate}%`, fmt(sp.igst), fmt(sp.taxable),
    ];
  });

  autoTable(doc, {
    startY: y + 30,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: DARK },
    styles: { cellPadding: 2, lineColor: BORDER, lineWidth: 0.2 },
    columnStyles: isCgst
      ? { 0: { halign: 'center', cellWidth: 8 }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'center' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right', fontStyle: 'bold' } }
      : { 0: { halign: 'center', cellWidth: 8 }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'center' }, 6: { halign: 'right' }, 7: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: margin, right: margin },
  });

  let cursorY = (doc as any).lastAutoTable.finalY + 6;

  // Totals summary (right)
  const sumW = 80;
  const sumX = pageW - margin - sumW;
  const rows: Array<[string, string]> = [];
  rows.push(['Sub Total (Taxable)', fmt(totals.subtotal)]);
  totals.tax_breakup.forEach(b => {
    if (isCgst) {
      rows.push([`CGST @ ${b.rate / 2}%`, fmt(b.cgst)]);
      rows.push([`SGST @ ${b.rate / 2}%`, fmt(b.sgst)]);
    } else {
      rows.push([`IGST @ ${b.rate}%`, fmt(b.igst)]);
    }
  });
  rows.push(['Total', fmt(totals.total)]);
  rows.push(['Payment Made', `(-) ${fmt(totals.amount_paid)}`]);
  rows.push(['Balance Due', fmt(totals.balance_due)]);

  const rowH = 6;
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.roundedRect(sumX, cursorY, sumW, rows.length * rowH + 4, 2, 2, 'S');
  let ry = cursorY + 5;
  rows.forEach(([k, v], idx) => {
    const isTotal = k === 'Total';
    const isBalance = k === 'Balance Due';
    doc.setFont('helvetica', isTotal || isBalance ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...(isBalance ? ORANGE : DARK));
    doc.text(k, sumX + 3, ry);
    doc.text(v, sumX + sumW - 3, ry, { align: 'right' });
    ry += rowH;
    if (idx < rows.length - 1) {
      doc.setDrawColor(...BORDER);
      doc.line(sumX + 1, ry - rowH + 1.5, sumX + sumW - 1, ry - rowH + 1.5);
    }
  });

  // Amount in words (left, aligned to summary top)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...DARK);
  doc.text('Total in Words:', margin, cursorY + 5);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
  const words = doc.splitTextToSize(inrAmountInWords(totals.total), sumX - margin - 5);
  doc.text(words, margin, cursorY + 10);

  cursorY += rows.length * rowH + 12;

  // Notes
  if (input.notes) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...DARK);
    doc.text('Notes', margin, cursorY); cursorY += 4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
    const notes = doc.splitTextToSize(input.notes, pageW - margin * 2);
    doc.text(notes, margin, cursorY);
    cursorY += notes.length * 4 + 3;
  }

  // Bank details + Signature
  cursorY += 2;
  const bankBoxW = (pageW - margin * 2) * 0.62;
  const sigBoxX = margin + bankBoxW + 4;
  const sigBoxW = pageW - margin - sigBoxX;
  const boxH = 36;

  doc.setDrawColor(...BORDER);
  doc.roundedRect(margin, cursorY, bankBoxW, boxH, 2, 2, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text('Company Bank Details', margin + 3, cursorY + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
  const bx = margin + 3; let byy = cursorY + 11;
  [
    ['Account Name', BANK.name],
    ['Account Number', BANK.account],
    ['IFSC', BANK.ifsc],
    ['Bank', BANK.bank],
    ['UPI', BANK.upi],
  ].forEach(([k, v]) => {
    doc.text(`${k}: ${v}`, bx, byy);
    byy += 4.5;
  });

  doc.roundedRect(sigBoxX, cursorY, sigBoxW, boxH, 2, 2, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text('Authorized Signature', sigBoxX + 3, cursorY + 5);
  if (input.signature_data_url) {
    try {
      doc.addImage(input.signature_data_url, 'PNG', sigBoxX + 4, cursorY + 8, sigBoxW - 8, 18);
    } catch { /* ignore */ }
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
  doc.text('For ' + SELLER.name, sigBoxX + 3, cursorY + boxH - 3);

  cursorY += boxH + 6;

  // Terms (next page if needed)
  if (cursorY > 240) { doc.addPage(); cursorY = 18; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...DARK);
  doc.text('Terms & Conditions', margin, cursorY); cursorY += 4;
  doc.setFontSize(7); doc.setTextColor(...GRAY);
  TERMS.forEach(t => {
    const block = doc.splitTextToSize(`${t.title}: ${t.content}`, pageW - margin * 2);
    if (cursorY + block.length * 3 > 285) { doc.addPage(); cursorY = 18; }
    doc.setFont('helvetica', 'bold'); doc.text(t.title, margin, cursorY);
    doc.setFont('helvetica', 'normal');
    const body2 = doc.splitTextToSize(t.content, pageW - margin * 2);
    doc.text(body2, margin, cursorY + 3);
    cursorY += body2.length * 3 + 3;
  });

  const blob = doc.output('blob');
  return { blob, totals };
}