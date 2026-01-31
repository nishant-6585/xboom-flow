import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Quote, QuoteItem } from '@/hooks/useQuotes';
import { format } from 'date-fns';

interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  gst?: string;
}

const defaultCompanyInfo: CompanyInfo = {
  name: 'XBoom Utilities Pvt Ltd',
  address: 'Mumbai, Maharashtra, India',
  phone: '+91 9876543210',
  email: 'sales@xboom.in',
  gst: '27XXXXX1234X1ZX',
};

// Brand colors
const BRAND_BLUE: [number, number, number] = [59, 130, 163]; // Steel blue like in the reference
const DARK_TEXT: [number, number, number] = [33, 37, 41];
const GRAY_TEXT: [number, number, number] = [108, 117, 125];
const LIGHT_GRAY_BG: [number, number, number] = [248, 249, 250];

export function generateQuotePdf(quote: Quote, items: QuoteItem[], companyInfo: CompanyInfo = defaultCompanyInfo) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  
  // ============ HEADER SECTION ============
  // Blue header background
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  // QUOTATION title (left side)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('QUOTATION', margin, 25);
  
  // Quote number below title
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(quote.quote_number, margin, 37);
  
  // Company info (right side of header)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const rightX = pageWidth - margin;
  doc.text(companyInfo.name, rightX, 15, { align: 'right' });
  doc.text(companyInfo.address, rightX, 22, { align: 'right' });
  doc.text(companyInfo.phone, rightX, 29, { align: 'right' });
  doc.text(companyInfo.email, rightX, 36, { align: 'right' });
  
  // ============ INFO BOX SECTION ============
  let yPos = 60;
  
  // Light gray background box
  doc.setFillColor(...LIGHT_GRAY_BG);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 45, 2, 2, 'FD');
  
  // Left side - Quote details
  const leftColX = margin + 10;
  const leftValX = margin + 55;
  
  doc.setTextColor(...DARK_TEXT);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Quote Date:', leftColX, yPos + 15);
  doc.text('Valid Until:', leftColX, yPos + 27);
  doc.text('Status:', leftColX, yPos + 39);
  
  doc.setFont('helvetica', 'normal');
  doc.text(format(new Date(quote.created_at), 'dd MMM yyyy'), leftValX, yPos + 15);
  doc.text(quote.valid_until ? format(new Date(quote.valid_until), 'dd MMM yyyy') : 'N/A', leftValX, yPos + 27);
  doc.text(quote.status.charAt(0).toUpperCase() + quote.status.slice(1), leftValX, yPos + 39);
  
  // Right side - Bill To
  const rightColX = pageWidth / 2 + 10;
  
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', rightColX, yPos + 15);
  doc.setFont('helvetica', 'normal');
  
  let billToY = yPos + 27;
  doc.text(quote.customer_name, rightColX, billToY);
  
  if (quote.customer_company) {
    billToY += 8;
    doc.setTextColor(...GRAY_TEXT);
    doc.text(quote.customer_company, rightColX, billToY);
  }
  
  if (quote.customer_phone) {
    billToY += 8;
    doc.setTextColor(...GRAY_TEXT);
    doc.text(quote.customer_phone, rightColX, billToY);
  }
  
  // ============ ITEMS TABLE ============
  yPos += 60;
  
  const tableData = items.map((item, index) => [
    (index + 1).toString(),
    item.product_name + (item.product_code ? `\n(${item.product_code})` : ''),
    item.quantity.toString(),
    `₹${item.unit_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    `${item.gst_percent}%`,
    `₹${item.gst_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    `₹${item.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Product', 'Qty', 'Unit Price', 'GST %', 'GST Amt', 'Total']],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: BRAND_BLUE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 6,
    },
    bodyStyles: {
      fontSize: 10,
      cellPadding: 6,
      textColor: DARK_TEXT,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 25, halign: 'right' },
      6: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: margin, right: margin },
    tableLineColor: [220, 220, 220],
    tableLineWidth: 0.1,
  });

  // ============ SUMMARY SECTION ============
  const finalY = (doc as any).lastAutoTable.finalY || yPos + 50;
  yPos = finalY + 20;
  
  // Right-aligned summary
  const summaryLabelX = pageWidth - 100;
  const summaryValueX = pageWidth - margin;
  
  doc.setFontSize(10);
  doc.setTextColor(...DARK_TEXT);
  
  // Subtotal
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', summaryLabelX, yPos);
  doc.text(`₹${quote.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, summaryValueX, yPos, { align: 'right' });
  
  // Total GST
  yPos += 12;
  doc.text('Total GST:', summaryLabelX, yPos);
  doc.text(`₹${quote.total_gst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, summaryValueX, yPos, { align: 'right' });
  
  // Discount (if applicable)
  if (quote.discount_amount > 0) {
    yPos += 12;
    doc.text('Discount:', summaryLabelX, yPos);
    doc.text(`-₹${quote.discount_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, summaryValueX, yPos, { align: 'right' });
  }
  
  // Separator line
  yPos += 8;
  doc.setDrawColor(...BRAND_BLUE);
  doc.setLineWidth(0.5);
  doc.line(summaryLabelX, yPos, summaryValueX, yPos);
  
  // Total
  yPos += 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total:', summaryLabelX, yPos);
  doc.text(`₹${quote.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, summaryValueX, yPos, { align: 'right' });
  
  // ============ TERMS & CONDITIONS ============
  yPos += 30;
  
  // Default terms if none provided
  const defaultTerms = `1. This quotation is valid for the period mentioned above.
2. Prices are exclusive of applicable taxes unless otherwise stated.
3. Delivery timelines will be confirmed upon order confirmation.
4. Payment terms: 50% advance, 50% before delivery.
5. All disputes are subject to Mumbai jurisdiction.`;
  
  const termsText = quote.terms_and_conditions || defaultTerms;
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...DARK_TEXT);
  doc.text('Terms & Conditions:', margin, yPos);
  
  yPos += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TEXT);
  
  const termsLines = doc.splitTextToSize(termsText, pageWidth - (margin * 2));
  doc.text(termsLines, margin, yPos);
  
  // ============ NOTES (if any) ============
  if (quote.notes) {
    yPos += (termsLines.length * 5) + 15;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...DARK_TEXT);
    doc.text('Notes:', margin, yPos);
    
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_TEXT);
    
    const notesLines = doc.splitTextToSize(quote.notes, pageWidth - (margin * 2));
    doc.text(notesLines, margin, yPos);
  }
  
  // ============ FOOTER ============
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 8, { align: 'center' });

  return doc;
}

export function downloadQuotePdf(quote: Quote, items: QuoteItem[]) {
  const doc = generateQuotePdf(quote, items);
  doc.save(`${quote.quote_number}.pdf`);
}
