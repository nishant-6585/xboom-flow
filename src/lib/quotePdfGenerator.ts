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

export function generateQuotePdf(quote: Quote, items: QuoteItem[], companyInfo: CompanyInfo = defaultCompanyInfo) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Colors
  const primaryColor: [number, number, number] = [41, 128, 185];
  const darkColor: [number, number, number] = [44, 62, 80];
  const grayColor: [number, number, number] = [127, 140, 141];
  
  let yPos = 20;

  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('QUOTATION', 15, 25);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(quote.quote_number, 15, 34);
  
  // Company info (right side of header)
  doc.setFontSize(10);
  doc.text(companyInfo.name, pageWidth - 15, 15, { align: 'right' });
  doc.text(companyInfo.address, pageWidth - 15, 22, { align: 'right' });
  doc.text(companyInfo.phone, pageWidth - 15, 29, { align: 'right' });
  doc.text(companyInfo.email, pageWidth - 15, 36, { align: 'right' });
  
  yPos = 55;

  // Quote details box
  doc.setFillColor(245, 245, 245);
  doc.rect(15, yPos - 5, pageWidth - 30, 35, 'F');
  
  doc.setTextColor(...darkColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Quote Date:', 20, yPos + 5);
  doc.text('Valid Until:', 20, yPos + 15);
  doc.text('Status:', 20, yPos + 25);
  
  doc.setFont('helvetica', 'normal');
  doc.text(format(new Date(quote.created_at), 'dd MMM yyyy'), 55, yPos + 5);
  doc.text(quote.valid_until ? format(new Date(quote.valid_until), 'dd MMM yyyy') : 'N/A', 55, yPos + 15);
  doc.text(quote.status.charAt(0).toUpperCase() + quote.status.slice(1), 55, yPos + 25);
  
  // Customer info (right side)
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', pageWidth / 2 + 10, yPos + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(quote.customer_name, pageWidth / 2 + 10, yPos + 12);
  if (quote.customer_company) {
    doc.text(quote.customer_company, pageWidth / 2 + 10, yPos + 19);
  }
  if (quote.customer_phone) {
    doc.text(quote.customer_phone, pageWidth / 2 + 10, yPos + 26);
  }
  
  yPos += 45;

  // Items table
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
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 25, halign: 'right' },
      6: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: 15, right: 15 },
  });

  // Get the final Y position after the table
  const finalY = (doc as any).lastAutoTable.finalY || yPos + 50;
  yPos = finalY + 15;

  // Summary section
  const summaryX = pageWidth - 80;
  const labelX = summaryX;
  const valueX = pageWidth - 20;
  
  doc.setFontSize(10);
  doc.setTextColor(...darkColor);
  
  doc.text('Subtotal:', labelX, yPos);
  doc.text(`₹${quote.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, valueX, yPos, { align: 'right' });
  
  yPos += 8;
  doc.text('Total GST:', labelX, yPos);
  doc.text(`₹${quote.total_gst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, valueX, yPos, { align: 'right' });
  
  if (quote.discount_amount > 0) {
    yPos += 8;
    doc.text('Discount:', labelX, yPos);
    doc.text(`-₹${quote.discount_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, valueX, yPos, { align: 'right' });
  }
  
  yPos += 10;
  doc.setDrawColor(...primaryColor);
  doc.line(labelX, yPos - 3, valueX, yPos - 3);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total:', labelX, yPos + 5);
  doc.text(`₹${quote.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, valueX, yPos + 5, { align: 'right' });
  
  yPos += 20;

  // Notes section
  if (quote.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Notes:', 15, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...grayColor);
    const notesLines = doc.splitTextToSize(quote.notes, pageWidth - 30);
    doc.text(notesLines, 15, yPos + 7);
    yPos += 7 + (notesLines.length * 5);
  }

  // Terms and conditions
  if (quote.terms_and_conditions) {
    yPos += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...darkColor);
    doc.text('Terms & Conditions:', 15, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...grayColor);
    const termsLines = doc.splitTextToSize(quote.terms_and_conditions, pageWidth - 30);
    doc.text(termsLines, 15, yPos + 7);
  }

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFillColor(...primaryColor);
  doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 6, { align: 'center' });

  return doc;
}

export function downloadQuotePdf(quote: Quote, items: QuoteItem[]) {
  const doc = generateQuotePdf(quote, items);
  doc.save(`${quote.quote_number}.pdf`);
}
