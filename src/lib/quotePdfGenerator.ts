import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Quote, QuoteItem } from '@/hooks/useQuotes';
import { format } from 'date-fns';

interface CompanyInfo {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  gstin: string;
  email: string;
  website: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  ifscCode: string;
}

const defaultCompanyInfo: CompanyInfo = {
  name: 'Xboom Utilities',
  address: 'Bangalore',
  city: 'Bangalore',
  state: 'Karnataka',
  pincode: '560102',
  country: 'India',
  gstin: '29CTKPS7090H1ZW',
  email: 'Contact@xboom.in',
  website: 'www.xboom.in',
  bankName: 'ICICI bank account',
  accountNumber: '035705004246',
  accountName: 'XBoom Utilities',
  ifscCode: 'ICIC0000357',
};

// Brand colors - Orange accent based on XBoom branding
const ORANGE_ACCENT: [number, number, number] = [255, 102, 0];
const DARK_TEXT: [number, number, number] = [33, 37, 41];
const GRAY_TEXT: [number, number, number] = [108, 117, 125];
const LIGHT_BORDER: [number, number, number] = [200, 200, 200];
const TABLE_HEADER_BG: [number, number, number] = [245, 245, 245];

// Logo path
const LOGO_PATH = '/images/xboom-logo.png';

// Default Terms & Conditions
const DEFAULT_TERMS = `1. Validity
This quotation is valid for 7 calendar days from the date of issue, unless otherwise stated. Prices, availability, and terms are subject to change without prior notice after this period.

2. Delivery Terms
Estimated delivery timeline is 7–10 working days from the date of payment confirmation. Shipping charges are additional and will be calculated based on the final delivery address.

3. Taxes & Duties
All prices quoted are exclusive of GST and any applicable government taxes or import duties. These will be charged additionally as applicable at the time of invoicing.

4. Payment Terms
100% advance payment is required at the time of order confirmation. Order processing and dispatch will commence only after receipt of full payment.

5. Warranty
Products carry only the manufacturer's warranty, wherever applicable, and as specified. No additional warranty is provided by the seller unless expressly mentioned in writing.

6. Cancellation Policy
Orders once confirmed against the quotation cannot be cancelled or modified without prior written consent from the seller.

7. Governing Law & Jurisdiction
All transactions shall be governed by the laws of India, and any disputes shall be subject to the exclusive jurisdiction of the courts in Bangalore, Karnataka.`;

function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  if (num === 0) return 'Zero';
  
  const convertLessThanThousand = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanThousand(n % 100) : '');
  };
  
  const numInt = Math.floor(num);
  
  if (numInt >= 10000000) {
    const crore = Math.floor(numInt / 10000000);
    const remainder = numInt % 10000000;
    return convertLessThanThousand(crore) + ' Crore' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
  }
  if (numInt >= 100000) {
    const lakh = Math.floor(numInt / 100000);
    const remainder = numInt % 100000;
    return convertLessThanThousand(lakh) + ' Lakh' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
  }
  if (numInt >= 1000) {
    const thousand = Math.floor(numInt / 1000);
    const remainder = numInt % 1000;
    return convertLessThanThousand(thousand) + ' Thousand' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
  }
  return convertLessThanThousand(numInt);
}

// Helper function to load image as base64
async function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

export async function generateQuotePdf(quote: Quote, items: QuoteItem[], companyInfo: CompanyInfo = defaultCompanyInfo) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  
  // ============ HEADER BORDER (Orange line at top) ============
  doc.setDrawColor(...ORANGE_ACCENT);
  doc.setLineWidth(3);
  doc.line(0, 3, pageWidth, 3);
  
  // ============ LOGO & COMPANY INFO ============
  let yPos = 15;
  
  // Try to load and add the logo
  try {
    const logoBase64 = await loadImageAsBase64(LOGO_PATH);
    // Add logo - aspect ratio approximately 4:1 for the XBoom logo
    doc.addImage(logoBase64, 'PNG', margin, yPos - 5, 40, 15);
  } catch (error) {
    // Fallback to text if logo fails to load
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ORANGE_ACCENT);
    doc.text('XBOOM', margin, yPos + 5);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...GRAY_TEXT);
    doc.text('Gadgets Reloaded!', margin, yPos + 11);
  }
  
  // Company info (center-left)
  const companyX = 55;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(companyInfo.name, companyX, yPos);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  doc.text(`${companyInfo.city} ${companyInfo.state} ${companyInfo.pincode}`, companyX, yPos + 6);
  doc.text(companyInfo.country, companyX, yPos + 11);
  doc.text(`GSTIN ${companyInfo.gstin}`, companyX, yPos + 16);
  doc.text(companyInfo.email, companyX, yPos + 21);
  doc.text(companyInfo.website, companyX, yPos + 26);
  
  // "Quote" title (right side)
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ORANGE_ACCENT);
  doc.text('Quote', pageWidth - margin, yPos + 10, { align: 'right' });
  
  // ============ QUOTE INFO ROW ============
  yPos = 50;
  
  // Draw separator line
  doc.setDrawColor(...LIGHT_BORDER);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  
  yPos += 8;
  
  // Quote details in a row
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  
  doc.text('Quote No', margin, yPos);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(`: ${quote.quote_number}`, margin + 20, yPos);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Quote Date', margin, yPos + 8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(`: ${format(new Date(quote.created_at), 'dd/MM/yyyy')}`, margin + 20, yPos + 8);
  
  // Place of Supply (right side)
  const rightInfoX = pageWidth / 2;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Place Of Supply', rightInfoX, yPos);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ORANGE_ACCENT);
  doc.text(`: ${quote.customer_state || 'India'}`, rightInfoX + 35, yPos);
  
  // ============ BILL TO SECTION ============
  yPos += 20;
  
  doc.setDrawColor(...LIGHT_BORDER);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  
  yPos += 8;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Bill To', margin, yPos);
  
  yPos += 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(quote.customer_name, margin, yPos);
  
  if (quote.customer_company) {
    yPos += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(quote.customer_company, margin, yPos);
  }
  
  if (quote.customer_address) {
    yPos += 5;
    doc.setFontSize(9);
    doc.text(quote.customer_address, margin, yPos);
  }
  
  if (quote.customer_state) {
    yPos += 5;
    doc.text(quote.customer_state, margin, yPos);
  }
  
  // ============ ITEMS TABLE ============
  yPos += 12;
  
  const tableData = items.map((item, index) => {
    let description = item.product_name;
    if (item.description) {
      description += '\n' + item.description;
    }
    if (item.product_code) {
      description += `\n(${item.product_code})`;
    }
    
    return [
      (index + 1).toString(),
      description,
      item.product_code || '-',
      item.quantity.toFixed(2),
      item.unit_price.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      `${item.gst_percent}%`,
      item.gst_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      item.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [
      [
        { content: 'Sr No', styles: { halign: 'center' } },
        { content: 'Item & Description', styles: { halign: 'left' } },
        { content: 'HSN/SAC', styles: { halign: 'center' } },
        { content: 'Qty', styles: { halign: 'center' } },
        { content: 'Rate', styles: { halign: 'right' } },
        { content: '%', colSpan: 1, styles: { halign: 'center' } },
        { content: 'Amt', styles: { halign: 'right' } },
        { content: 'Amount', styles: { halign: 'right' } },
      ]
    ],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: TABLE_HEADER_BG,
      textColor: DARK_TEXT,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 4,
      lineColor: LIGHT_BORDER,
      lineWidth: 0.5,
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 4,
      textColor: DARK_TEXT,
      lineColor: LIGHT_BORDER,
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 12, halign: 'center' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 25, halign: 'right' },
    },
    margin: { left: margin, right: margin },
    tableLineColor: LIGHT_BORDER,
    tableLineWidth: 0.5,
    didDrawPage: (data) => {
      // Draw IGST header spanning % and Amt columns
    },
  });

  // ============ TOTALS SECTION ============
  let finalY = (doc as any).lastAutoTable.finalY || yPos + 50;
  yPos = finalY + 5;
  
  // Total in Words (left side)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Total In Words', margin, yPos);
  
  yPos += 6;
  doc.setFont('helvetica', 'bolditalic');
  doc.setTextColor(...DARK_TEXT);
  const amountInWords = `Indian Rupee ${numberToWords(quote.total_amount)} Only`;
  const wrappedWords = doc.splitTextToSize(amountInWords, 100);
  doc.text(wrappedWords, margin, yPos);
  
  // Summary (right side)
  const summaryX = pageWidth - 85;
  const summaryValX = pageWidth - margin;
  let summaryY = finalY + 5;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DARK_TEXT);
  
  doc.text('Sub Total', summaryX, summaryY);
  doc.text(quote.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), summaryValX, summaryY, { align: 'right' });
  
  summaryY += 8;
  doc.text(`IGST (${items[0]?.gst_percent || 18}%)`, summaryX, summaryY);
  doc.text(quote.total_gst.toLocaleString('en-IN', { minimumFractionDigits: 2 }), summaryValX, summaryY, { align: 'right' });
  
  if (quote.discount_amount > 0) {
    summaryY += 8;
    doc.text('Discount', summaryX, summaryY);
    doc.text(`-${quote.discount_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, summaryValX, summaryY, { align: 'right' });
  }
  
  // Total with box
  summaryY += 10;
  doc.setFont('helvetica', 'bold');
  doc.text('Total', summaryX, summaryY);
  doc.setFontSize(10);
  doc.text(`₹${quote.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, summaryValX, summaryY, { align: 'right' });
  
  // ============ BANK DETAILS & SIGNATURE ============
  yPos = Math.max(yPos + 15, summaryY + 15);
  
  // Bank details (left)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(companyInfo.bankName, margin, yPos);
  
  doc.setFont('helvetica', 'normal');
  yPos += 6;
  doc.text(`Account Number: ${companyInfo.accountNumber}`, margin, yPos);
  yPos += 5;
  doc.text(`Account Name: ${companyInfo.accountName}`, margin, yPos);
  yPos += 5;
  doc.text(`IFSC Code: ${companyInfo.ifscCode}`, margin, yPos);
  
  // Authorized Signature (right)
  doc.setDrawColor(...DARK_TEXT);
  doc.setLineWidth(0.3);
  const sigLineX = pageWidth - 70;
  doc.line(sigLineX, yPos, pageWidth - margin, yPos);
  doc.setFontSize(9);
  doc.text('Authorized Signature', sigLineX + 10, yPos + 5);
  
  // ============ TERMS & CONDITIONS ============
  yPos += 20;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text('Terms & Conditions', margin, yPos);
  
  yPos += 8;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  
  const termsText = quote.terms_and_conditions || DEFAULT_TERMS;
  const termsLines = doc.splitTextToSize(termsText, pageWidth - (margin * 2));
  
  // Check if we need a new page for terms
  if (yPos + (termsLines.length * 4) > pageHeight - 20) {
    doc.addPage();
    yPos = 20;
    
    // Add orange top border on new page
    doc.setDrawColor(...ORANGE_ACCENT);
    doc.setLineWidth(3);
    doc.line(0, 3, pageWidth, 3);
  }
  
  doc.text(termsLines, margin, yPos);
  
  return doc;
}

export async function downloadQuotePdf(quote: Quote, items: QuoteItem[]) {
  const doc = await generateQuotePdf(quote, items);
  doc.save(`${quote.quote_number}.pdf`);
}
