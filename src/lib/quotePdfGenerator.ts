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
  phone: string;
  website: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  ifscCode: string;
  branch: string;
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
  phone: '+91 9876543210',
  website: 'www.xboom.in',
  bankName: 'ICICI Bank',
  accountNumber: '035705004246',
  accountName: 'XBoom Utilities',
  ifscCode: 'ICIC0000357',
  branch: 'Bangalore',
};

// Brand colors - Orange accent based on XBoom branding
const ORANGE_ACCENT: [number, number, number] = [255, 102, 0];
const ORANGE_LIGHT: [number, number, number] = [255, 237, 224];
const DARK_TEXT: [number, number, number] = [33, 37, 41];
const GRAY_TEXT: [number, number, number] = [108, 117, 125];
const LIGHT_GRAY: [number, number, number] = [156, 163, 175];
const LIGHT_BORDER: [number, number, number] = [229, 231, 235];
const TABLE_HEADER_BG: [number, number, number] = [255, 102, 0];
const TABLE_ALTERNATE_BG: [number, number, number] = [254, 249, 245];
const WHITE: [number, number, number] = [255, 255, 255];

// Logo path
const LOGO_PATH = '/images/xboom-logo.png';

// Default Terms & Conditions - Professionally formatted
const DEFAULT_TERMS = [
  {
    title: '1. Validity',
    content: 'This quotation is valid for 7 calendar days from the date of issue, unless otherwise stated. Prices, availability, and terms are subject to change without prior notice after this period.'
  },
  {
    title: '2. Delivery Terms',
    content: 'Estimated delivery timeline is 7–10 working days from the date of payment confirmation. Shipping charges are additional and will be calculated based on the final delivery address. Any specific delivery requirements (e.g., urgent or express delivery) must be communicated in advance and may attract additional charges.'
  },
  {
    title: '3. Taxes & Duties',
    content: 'All prices quoted are exclusive of GST and any applicable government taxes or import duties. These will be charged additionally as applicable at the time of invoicing.'
  },
  {
    title: '4. Payment Terms',
    content: '100% advance payment is required at the time of order confirmation. Order processing and dispatch will commence only after receipt of full payment.'
  },
  {
    title: '5. Warranty',
    content: 'Products carry only the manufacturer\'s warranty, wherever applicable, and as specified. No additional warranty is provided by the seller unless expressly mentioned in writing.'
  },
  {
    title: '6. Cancellation Policy',
    content: 'Orders once confirmed against the quotation cannot be cancelled or modified without prior written consent from the seller. Cancellation, if permitted, may attract charges depending on the product or service involved.'
  },
  {
    title: '7. Product Availability',
    content: 'All quoted products are subject to availability at the time of order confirmation. In case of stock unavailability, a revised quotation or updated lead time will be shared.'
  },
  {
    title: '8. Freight & Insurance',
    content: 'Freight charges are additional. Transit insurance will be charged extra if required by the customer and must be requested at the time of order confirmation.'
  },
  {
    title: '9. Force Majeure',
    content: 'The seller shall not be liable for delays or failure in delivery due to circumstances beyond reasonable control, including but not limited to natural disasters, strikes, transportation disruptions, or regulatory actions.'
  },
  {
    title: '10. Governing Law & Jurisdiction',
    content: 'All transactions shall be governed by the laws of India, and any disputes shall be subject to the exclusive jurisdiction of the courts in Bangalore, Karnataka.'
  }
];

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

// Helper to format currency
function formatCurrency(amount: number): string {
  return '₹ ' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Helper to draw a rounded rectangle
function drawRoundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill: boolean = true, stroke: boolean = false) {
  doc.roundedRect(x, y, w, h, r, r, fill ? 'F' : stroke ? 'S' : 'FD');
}

export async function generateQuotePdf(quote: Quote, items: QuoteItem[], companyInfo: CompanyInfo = defaultCompanyInfo) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 15;
  const marginRight = 15;
  const contentWidth = pageWidth - marginLeft - marginRight;
  
  // ============ TOP ACCENT BAR ============
  doc.setFillColor(...ORANGE_ACCENT);
  doc.rect(0, 0, pageWidth, 6, 'F');
  
  // ============ HEADER SECTION ============
  let yPos = 18;
  
  // Try to load and add the logo
  try {
    const logoBase64 = await loadImageAsBase64(LOGO_PATH);
    doc.addImage(logoBase64, 'PNG', marginLeft, yPos - 6, 45, 18);
  } catch (error) {
    // Fallback to styled text if logo fails
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ORANGE_ACCENT);
    doc.text('XBOOM', marginLeft, yPos + 4);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...GRAY_TEXT);
    doc.text('Gadgets Reloaded!', marginLeft, yPos + 11);
  }
  
  // "QUOTATION" Title Badge (right side)
  const badgeWidth = 55;
  const badgeHeight = 14;
  const badgeX = pageWidth - marginRight - badgeWidth;
  const badgeY = yPos - 4;
  
  doc.setFillColor(...ORANGE_ACCENT);
  drawRoundedRect(doc, badgeX, badgeY, badgeWidth, badgeHeight, 2);
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text('QUOTATION', badgeX + badgeWidth / 2, badgeY + 10, { align: 'center' });
  
  // ============ COMPANY INFO SECTION ============
  yPos = 42;
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(companyInfo.name, marginLeft, yPos);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  
  yPos += 6;
  doc.text(`${companyInfo.city}, ${companyInfo.state} - ${companyInfo.pincode}`, marginLeft, yPos);
  
  yPos += 5;
  doc.text(`GSTIN: ${companyInfo.gstin}`, marginLeft, yPos);
  
  yPos += 5;
  doc.text(`Email: ${companyInfo.email}  |  Web: ${companyInfo.website}`, marginLeft, yPos);
  
  // ============ QUOTE INFO BOX (Right aligned) ============
  const infoBoxWidth = 75;
  const infoBoxX = pageWidth - marginRight - infoBoxWidth;
  const infoBoxY = 38;
  
  doc.setFillColor(...ORANGE_LIGHT);
  doc.setDrawColor(...ORANGE_ACCENT);
  doc.setLineWidth(0.3);
  drawRoundedRect(doc, infoBoxX, infoBoxY, infoBoxWidth, 28, 3, true, false);
  doc.roundedRect(infoBoxX, infoBoxY, infoBoxWidth, 28, 3, 3, 'S');
  
  const labelX = infoBoxX + 5;
  const valueX = infoBoxX + 38;
  let infoY = infoBoxY + 8;
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Quote No:', labelX, infoY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(quote.quote_number, valueX, infoY);
  
  infoY += 7;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Date:', labelX, infoY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(format(new Date(quote.created_at), 'dd MMM yyyy'), valueX, infoY);
  
  infoY += 7;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Valid Until:', labelX, infoY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ORANGE_ACCENT);
  doc.text(quote.valid_until ? format(new Date(quote.valid_until), 'dd MMM yyyy') : '7 Days', valueX, infoY);
  
  // ============ DIVIDER LINE ============
  yPos = 72;
  doc.setDrawColor(...LIGHT_BORDER);
  doc.setLineWidth(0.5);
  doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
  
  // ============ BILL TO & SHIP TO SECTIONS ============
  yPos = 80;
  
  const halfWidth = (contentWidth - 10) / 2;
  
  // Bill To Box
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(marginLeft, yPos, halfWidth, 35, 2, 2, 'F');
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ORANGE_ACCENT);
  doc.text('BILL TO', marginLeft + 5, yPos + 7);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(quote.customer_name, marginLeft + 5, yPos + 15);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  
  let billY = yPos + 21;
  if (quote.customer_company) {
    doc.text(quote.customer_company, marginLeft + 5, billY);
    billY += 5;
  }
  if (quote.customer_address) {
    const addressLines = doc.splitTextToSize(quote.customer_address, halfWidth - 10);
    doc.text(addressLines.slice(0, 2), marginLeft + 5, billY);
    billY += addressLines.slice(0, 2).length * 4;
  }
  if (quote.customer_state) {
    doc.text(quote.customer_state, marginLeft + 5, billY);
  }
  
  // Customer GST (if available)
  if (quote.customer_gst) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY_TEXT);
    doc.text(`GSTIN: ${quote.customer_gst}`, marginLeft + 5, yPos + 32);
  }
  
  // Ship To Box (right side - placeholder same as Bill To for now)
  const shipToX = marginLeft + halfWidth + 10;
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(shipToX, yPos, halfWidth, 35, 2, 2, 'F');
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ORANGE_ACCENT);
  doc.text('SHIP TO', shipToX + 5, yPos + 7);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(quote.customer_name, shipToX + 5, yPos + 15);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  
  let shipY = yPos + 21;
  if (quote.customer_company) {
    doc.text(quote.customer_company, shipToX + 5, shipY);
    shipY += 5;
  }
  if (quote.customer_address) {
    const addressLines = doc.splitTextToSize(quote.customer_address, halfWidth - 10);
    doc.text(addressLines.slice(0, 2), shipToX + 5, shipY);
    shipY += addressLines.slice(0, 2).length * 4;
  }
  if (quote.customer_state) {
    doc.text(`${quote.customer_state}, India`, shipToX + 5, shipY);
  }
  
  // ============ ITEMS TABLE ============
  yPos = 122;
  
  const tableData = items.map((item, index) => {
    let description = item.product_name;
    if (item.description) {
      description += '\n' + item.description;
    }
    
    const basePrice = item.price_includes_gst 
      ? item.unit_price / (1 + item.gst_percent / 100)
      : item.unit_price;
    
    return [
      (index + 1).toString(),
      description,
      item.product_code || '-',
      item.quantity.toString(),
      formatCurrency(basePrice),
      `${item.gst_percent}%`,
      formatCurrency(item.gst_amount),
      formatCurrency(item.total_amount),
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [[
      { content: 'Sr.', styles: { halign: 'center' } },
      { content: 'Description', styles: { halign: 'left' } },
      { content: 'HSN/SAC', styles: { halign: 'center' } },
      { content: 'Qty', styles: { halign: 'center' } },
      { content: 'Unit Price', styles: { halign: 'right' } },
      { content: 'GST', styles: { halign: 'center' } },
      { content: 'GST Amt', styles: { halign: 'right' } },
      { content: 'Total', styles: { halign: 'right' } },
    ]],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: TABLE_HEADER_BG,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: { top: 5, bottom: 5, left: 3, right: 3 },
      textColor: DARK_TEXT,
      lineColor: LIGHT_BORDER,
      lineWidth: 0.1,
    },
    alternateRowStyles: {
      fillColor: TABLE_ALTERNATE_BG,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 52 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 26, halign: 'right' },
    },
    margin: { left: marginLeft, right: marginRight },
    tableLineColor: LIGHT_BORDER,
    tableLineWidth: 0.3,
    didDrawCell: (data) => {
      // Draw bottom border for each row
      if (data.section === 'body') {
        doc.setDrawColor(...LIGHT_BORDER);
        doc.setLineWidth(0.1);
        doc.line(
          data.cell.x,
          data.cell.y + data.cell.height,
          data.cell.x + data.cell.width,
          data.cell.y + data.cell.height
        );
      }
    },
  });

  // ============ TOTALS SECTION ============
  let finalY = (doc as any).lastAutoTable.finalY || yPos + 50;
  yPos = finalY + 8;
  
  // Summary Box (right side)
  const summaryBoxWidth = 85;
  const summaryBoxX = pageWidth - marginRight - summaryBoxWidth;
  const summaryBoxY = yPos - 2;
  
  // Calculate summary box height
  const hasDiscount = quote.discount_amount > 0;
  const summaryRows = hasDiscount ? 4 : 3;
  const summaryBoxHeight = summaryRows * 10 + 16;
  
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(summaryBoxX, summaryBoxY, summaryBoxWidth, summaryBoxHeight, 3, 3, 'F');
  
  let summaryY = summaryBoxY + 10;
  const summaryLabelX = summaryBoxX + 5;
  const summaryValueX = summaryBoxX + summaryBoxWidth - 5;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Sub Total:', summaryLabelX, summaryY);
  doc.setTextColor(...DARK_TEXT);
  doc.text(formatCurrency(quote.subtotal), summaryValueX, summaryY, { align: 'right' });
  
  summaryY += 10;
  doc.setTextColor(...GRAY_TEXT);
  doc.text(`GST (${items[0]?.gst_percent || 18}%):`, summaryLabelX, summaryY);
  doc.setTextColor(...DARK_TEXT);
  doc.text(formatCurrency(quote.total_gst), summaryValueX, summaryY, { align: 'right' });
  
  if (hasDiscount) {
    summaryY += 10;
    doc.setTextColor(...GRAY_TEXT);
    doc.text('Discount:', summaryLabelX, summaryY);
    doc.setTextColor(220, 38, 38); // Red for discount
    doc.text(`- ${formatCurrency(quote.discount_amount)}`, summaryValueX, summaryY, { align: 'right' });
  }
  
  // Total row with accent background
  summaryY += 6;
  doc.setFillColor(...ORANGE_ACCENT);
  doc.roundedRect(summaryBoxX, summaryY, summaryBoxWidth, 14, 0, 0, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text('TOTAL:', summaryLabelX, summaryY + 10);
  doc.text(formatCurrency(quote.total_amount), summaryValueX, summaryY + 10, { align: 'right' });
  
  // Amount in Words (left side)
  const wordsY = yPos + 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Amount in Words:', marginLeft, wordsY);
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  const amountInWords = `Indian Rupees ${numberToWords(quote.total_amount)} Only`;
  const wrappedWords = doc.splitTextToSize(amountInWords, summaryBoxX - marginLeft - 10);
  doc.text(wrappedWords, marginLeft, wordsY + 6);
  
  // ============ BANK DETAILS SECTION ============
  yPos = summaryBoxY + summaryBoxHeight + 12;
  
  doc.setFillColor(...ORANGE_LIGHT);
  doc.roundedRect(marginLeft, yPos, contentWidth / 2 - 5, 35, 3, 3, 'F');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ORANGE_ACCENT);
  doc.text('BANK DETAILS', marginLeft + 5, yPos + 8);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...DARK_TEXT);
  
  const bankLabelX = marginLeft + 5;
  const bankValueX = marginLeft + 40;
  let bankY = yPos + 15;
  
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Bank Name:', bankLabelX, bankY);
  doc.setTextColor(...DARK_TEXT);
  doc.text(companyInfo.bankName, bankValueX, bankY);
  
  bankY += 6;
  doc.setTextColor(...GRAY_TEXT);
  doc.text('Account No:', bankLabelX, bankY);
  doc.setTextColor(...DARK_TEXT);
  doc.text(companyInfo.accountNumber, bankValueX, bankY);
  
  bankY += 6;
  doc.setTextColor(...GRAY_TEXT);
  doc.text('IFSC Code:', bankLabelX, bankY);
  doc.setTextColor(...DARK_TEXT);
  doc.text(companyInfo.ifscCode, bankValueX, bankY);
  
  // Authorized Signature (right side)
  const sigBoxX = marginLeft + contentWidth / 2 + 5;
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(sigBoxX, yPos, contentWidth / 2 - 5, 35, 3, 3, 'F');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ORANGE_ACCENT);
  doc.text('AUTHORIZED SIGNATURE', sigBoxX + 5, yPos + 8);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK_TEXT);
  doc.text(companyInfo.name, sigBoxX + 5, yPos + 28);
  
  // Signature line
  doc.setDrawColor(...LIGHT_GRAY);
  doc.setLineWidth(0.5);
  doc.line(sigBoxX + 5, yPos + 22, sigBoxX + contentWidth / 2 - 15, yPos + 22);
  
  // ============ TERMS & CONDITIONS (NEW PAGE) ============
  yPos += 50;
  
  // Check if we need a new page
  if (yPos + 100 > pageHeight - 20) {
    doc.addPage();
    yPos = 20;
    
    // Add accent bar on new page
    doc.setFillColor(...ORANGE_ACCENT);
    doc.rect(0, 0, pageWidth, 6, 'F');
    yPos = 20;
  }
  
  // Terms header
  doc.setFillColor(...ORANGE_ACCENT);
  doc.roundedRect(marginLeft, yPos, contentWidth, 10, 2, 2, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text('TERMS & CONDITIONS', marginLeft + 5, yPos + 7);
  
  yPos += 16;
  
  // Terms content
  const terms = quote.terms_and_conditions 
    ? [{ title: '', content: quote.terms_and_conditions }] 
    : DEFAULT_TERMS;
  
  doc.setFontSize(7.5);
  
  for (const term of terms) {
    // Check if we need a new page
    if (yPos + 15 > pageHeight - 15) {
      doc.addPage();
      doc.setFillColor(...ORANGE_ACCENT);
      doc.rect(0, 0, pageWidth, 6, 'F');
      yPos = 20;
    }
    
    if (term.title) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...DARK_TEXT);
      doc.text(term.title, marginLeft, yPos);
      yPos += 4;
    }
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY_TEXT);
    
    const contentLines = doc.splitTextToSize(term.content, contentWidth);
    doc.text(contentLines, marginLeft, yPos);
    yPos += contentLines.length * 3.5 + 4;
  }
  
  // ============ FOOTER ============
  const footerY = pageHeight - 12;
  
  doc.setDrawColor(...LIGHT_BORDER);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, footerY - 5, pageWidth - marginRight, footerY - 5);
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...LIGHT_GRAY);
  doc.text('This is a computer-generated document. No signature is required.', pageWidth / 2, footerY, { align: 'center' });
  
  doc.setTextColor(...GRAY_TEXT);
  doc.text(`${companyInfo.name}  |  ${companyInfo.email}  |  ${companyInfo.website}`, pageWidth / 2, footerY + 4, { align: 'center' });
  
  return doc;
}

export async function downloadQuotePdf(quote: Quote, items: QuoteItem[]) {
  const doc = await generateQuotePdf(quote, items);
  doc.save(`${quote.quote_number}.pdf`);
}
