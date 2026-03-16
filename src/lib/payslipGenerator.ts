import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SalarySheetEntry, calculateEarnings, calculateTotalDeductions, calculateNetPay } from "@/hooks/useSalarySheets";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface PayslipData {
  entry: SalarySheetEntry;
  month: number;
  year: number;
  department?: string;
  designation?: string;
  employeeNumber?: string;
  dateOfBirth?: string;
  joiningDate?: string;
  pan?: string;
  payableDays?: number;
  leaveBalance?: number;
  regimeOpted?: string;
}

function fmtCurrency(val: number): string {
  return val.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtCurrencyWithSymbol(val: number): string {
  return `₹${fmtCurrency(val)}`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function drawWatermark(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Draw large faded X shapes as watermark
  doc.setGState(new (doc as any).GState({ opacity: 0.04 }));
  doc.setTextColor(180, 180, 180);
  doc.setFontSize(120);
  doc.setFont("helvetica", "bold");

  // Multiple X watermarks scattered
  const positions = [
    { x: 30, y: 80 },
    { x: pageWidth - 60, y: 60 },
    { x: pageWidth / 2 - 20, y: pageHeight / 2 },
    { x: 20, y: pageHeight - 80 },
    { x: pageWidth - 50, y: pageHeight - 60 },
    { x: pageWidth / 2 + 30, y: pageHeight - 30 },
  ];

  for (const pos of positions) {
    doc.text("X", pos.x, pos.y);
  }

  // Colored accent lines (like the original's gradient stripes)
  doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
  // Top-right orange/red diagonal
  doc.setFillColor(243, 156, 18);
  doc.triangle(pageWidth - 40, 0, pageWidth, 0, pageWidth, 40, "F");
  doc.setFillColor(231, 76, 60);
  doc.triangle(pageWidth - 25, 0, pageWidth, 0, pageWidth, 25, "F");

  // Bottom-left green accent
  doc.setFillColor(39, 174, 96);
  doc.triangle(0, pageHeight - 30, 30, pageHeight, 0, pageHeight, "F");

  // Reset opacity
  doc.setGState(new (doc as any).GState({ opacity: 1 }));
}

import xboomLogoUrl from "@/assets/xboom-logo-payslip.png";

async function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("No canvas context")); return; }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function drawLogo(doc: jsPDF) {
  try {
    const logoBase64 = await loadImageAsBase64(xboomLogoUrl);
    // Logo aspect ratio ~3.5:1, render at ~40x12mm
    doc.addImage(logoBase64, "PNG", 14, 12, 40, 12);
  } catch {
    // Fallback text logo if image fails
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(231, 76, 60);
    doc.text("X", 14, 22);
    const xWidth = doc.getTextWidth("X");
    doc.setTextColor(33, 33, 33);
    doc.text("Boom", 14 + xWidth, 22);
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(120, 120, 120);
    doc.text("Gadgets Reloaded!", 14, 27);
  }
}

export async function generatePayslipPDF(data: PayslipData): Promise<jsPDF> {
  const { entry, month, year, department, designation, employeeNumber, dateOfBirth, joiningDate, pan, payableDays, leaveBalance, regimeOpted } = data;

  const totalEarnings = calculateEarnings(entry);
  const totalDeductions = calculateTotalDeductions(entry);
  const netPay = calculateNetPay(entry);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Colors
  const primaryGreen: [number, number, number] = [39, 174, 96];
  const primaryOrange: [number, number, number] = [243, 156, 18];
  const darkText: [number, number, number] = [33, 33, 33];
  const mutedText: [number, number, number] = [120, 120, 120];

  // ─── WATERMARK ───
  drawWatermark(doc);

  // ─── HEADER ───
  await drawLogo(doc);

  // Company name "Xboom Utilities" positioned after logo
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text("Xboom Utilities", 56, 20);

  // Payslip month/year badge (top right)
  const payslipLabel = `Payslip: ${MONTH_SHORT[month]} ${year}`;
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(pageWidth - 70, 10, 56, 16, 2, 2, "F");
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(pageWidth - 70, 10, 56, 16, 2, 2, "S");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text(payslipLabel, pageWidth - 42, 20, { align: "center" });

  // ─── NET PAY SUMMARY BAR ───
  const barY = 34;
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(14, barY, pageWidth - 28, 22, 3, 3, "F");
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(14, barY, pageWidth - 28, 22, 3, 3, "S");

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedText);
  doc.text("Net Pay", 20, barY + 8);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text(fmtCurrency(netPay), 20, barY + 17);

  // = sign
  doc.setFontSize(16);
  doc.setTextColor(...mutedText);
  doc.text("=", 68, barY + 14);

  // Gross Pay (A) - green bar
  doc.setFillColor(...primaryGreen);
  doc.rect(80, barY + 5, 2, 12, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedText);
  doc.text("Gross Pay (A)", 85, barY + 9);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text(`+ ${fmtCurrency(totalEarnings)}`, 85, barY + 17);

  // Deductions (B) - red bar
  doc.setFillColor(192, 57, 43);
  doc.rect(135, barY + 5, 2, 12, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedText);
  doc.text("Deductions (B)", 140, barY + 9);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text(`- ${fmtCurrency(totalDeductions)}`, 140, barY + 17);

  // ─── MAIN CONTENT ───
  const contentY = 66;
  const leftColWidth = 58;
  const rightColX = leftColWidth + 20;

  // ─── LEFT SIDEBAR: Employee Details ───
  const detailItems: [string, string][] = [
    ["Employee Code", employeeNumber || entry.employee_id?.substring(0, 8) || "—"],
    ["Name", entry.employee_name],
    ["Designation", designation || "—"],
    ["Department", department || "—"],
  ];

  if (dateOfBirth) {
    detailItems.push(["Date of birth", fmtDate(dateOfBirth)]);
  }

  if (pan) {
    detailItems.push(["PAN", pan]);
  }

  detailItems.push(["Account no.", entry.bank_account || "—"]);
  detailItems.push(["IFSC code", entry.ifsc_code || "—"]);

  if (joiningDate) {
    detailItems.push(["Date of joining", fmtDate(joiningDate)]);
  }

  if (entry.last_working_date) {
    detailItems.push(["Last Working Date", fmtDate(entry.last_working_date)]);
  }

  let leftY = contentY;
  for (const [label, value] of detailItems) {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...mutedText);
    doc.text(label, 14, leftY);
    leftY += 4;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...darkText);
    const lines = doc.splitTextToSize(String(value), leftColWidth - 4);
    doc.text(lines, 14, leftY);
    leftY += lines.length * 4.5 + 4;
  }

  // Extra fields: Payable Days, Leave Balance, Regime Opted
  leftY += 2;
  const extraItems: [string, string][] = [];
  if (payableDays !== undefined) extraItems.push(["Payable Days", String(payableDays)]);
  if (leaveBalance !== undefined) extraItems.push(["Leave Balance", String(leaveBalance)]);
  if (regimeOpted) extraItems.push(["Regime Opted", regimeOpted]);

  for (const [label, value] of extraItems) {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...mutedText);
    doc.text(label, 14, leftY);
    leftY += 4;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...darkText);
    doc.text(value, 14, leftY);
    leftY += 8;
  }

  // ─── RIGHT SECTION: GROSS PAY (A) ───
  // Orange diamond bullet
  doc.setFillColor(39, 174, 96);
  doc.circle(rightColX - 2, contentY - 1.5, 1.5, "F");

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryGreen);
  doc.text("Gross Pay (A)", rightColX + 2, contentY);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedText);
  doc.text("The total money you earned before the deductions", rightColX + 34, contentY);

  // Earnings table
  const earningsBody: any[][] = [];
  if (entry.salary > 0) earningsBody.push(["Basic", fmtCurrency(entry.salary), fmtCurrency(entry.salary)]);
  if (entry.reimbursements > 0) earningsBody.push(["Reimbursements", fmtCurrency(entry.reimbursements), fmtCurrency(entry.reimbursements)]);
  if (earningsBody.length === 0) earningsBody.push(["Basic", fmtCurrency(entry.salary), fmtCurrency(entry.salary)]);

  autoTable(doc, {
    startY: contentY + 4,
    head: [["Earnings", "Monthly", "Total Amount"]],
    body: earningsBody,
    foot: [["", { content: "Gross Pay", styles: { halign: "right" } }, { content: fmtCurrency(totalEarnings), styles: { halign: "right" } }]],
    theme: "plain",
    headStyles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontSize: 8, fontStyle: "bold", cellPadding: 3 },
    bodyStyles: { fontSize: 8.5, textColor: darkText as any, cellPadding: 3 },
    footStyles: { fillColor: [235, 250, 240], textColor: darkText as any, fontSize: 9, fontStyle: "bold", cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 40 },
      2: { halign: "right", cellWidth: 40 },
    },
    margin: { left: rightColX, right: 14 },
    tableLineColor: [230, 230, 230],
    tableLineWidth: 0.2,
  });

  const earningsEndY = (doc as any).lastAutoTable?.finalY || contentY + 50;

  // ─── DEDUCTIONS (B) ───
  const deductionsStartY = earningsEndY + 10;

  // Orange diamond bullet
  doc.setFillColor(243, 156, 18);
  doc.circle(rightColX - 2, deductionsStartY - 1.5, 1.5, "F");

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryOrange);
  doc.text("Deductions (B)", rightColX + 2, deductionsStartY);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedText);
  doc.text("The amount deducted for taxes and other benefits", rightColX + 36, deductionsStartY);

  const deductionsBody: any[][] = [];
  if (entry.deductions > 0) deductionsBody.push(["Unpaid Leave Deduction", fmtCurrency(entry.deductions), fmtCurrency(entry.deductions)]);
  if (entry.pending_amount > 0) deductionsBody.push(["Pending Amount", fmtCurrency(entry.pending_amount), fmtCurrency(entry.pending_amount)]);
  if (entry.tds > 0) deductionsBody.push(["TDS", fmtCurrency(entry.tds), fmtCurrency(entry.tds)]);
  if (entry.tax > 0) deductionsBody.push(["Professional Tax", fmtCurrency(entry.tax), fmtCurrency(entry.tax)]);
  if (deductionsBody.length === 0) deductionsBody.push(["—", "0", "0"]);

  autoTable(doc, {
    startY: deductionsStartY + 4,
    head: [["Deductions", "Monthly", "Total Amount"]],
    body: deductionsBody,
    foot: [["", { content: "Total Deductions", styles: { halign: "right" } }, { content: fmtCurrency(totalDeductions), styles: { halign: "right" } }]],
    theme: "plain",
    headStyles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontSize: 8, fontStyle: "bold", cellPadding: 3 },
    bodyStyles: { fontSize: 8.5, textColor: darkText as any, cellPadding: 3 },
    footStyles: { fillColor: [255, 245, 235], textColor: darkText as any, fontSize: 9, fontStyle: "bold", cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 40 },
      2: { halign: "right", cellWidth: 40 },
    },
    margin: { left: rightColX, right: 14 },
    tableLineColor: [230, 230, 230],
    tableLineWidth: 0.2,
  });

  const deductionsEndY = (doc as any).lastAutoTable?.finalY || deductionsStartY + 50;

  // ─── NET PAY HIGHLIGHT BOX ───
  const netPayY = deductionsEndY + 14;
  const netPayBoxWidth = pageWidth - rightColX - 14;
  doc.setDrawColor(...primaryGreen);
  doc.setLineWidth(0.5);
  doc.setFillColor(235, 250, 240);
  doc.roundedRect(rightColX, netPayY, netPayBoxWidth, 18, 3, 3, "FD");

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryGreen);
  doc.text("Net Pay", rightColX + 8, netPayY + 11);

  // Right-align net pay amount with padding to stay inside box
  const netPayText = fmtCurrency(netPay);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text(netPayText, rightColX + netPayBoxWidth - 8, netPayY + 11, { align: "right" });

  // ─── FOOTER ───
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...mutedText);
  doc.text("This is a system-generated payslip. No signature required.", pageWidth / 2, 285, { align: "center" });

  return doc;
}

export function getPayslipFileName(data: PayslipData): string {
  const empName = data.entry.employee_name.replace(/\s+/g, "_");
  const empId = data.employeeNumber || data.entry.employee_id?.substring(0, 8) || "unknown";
  const monthName = MONTH_NAMES[data.month];
  return `${empName}-${empId}-${monthName}-Payslip.pdf`;
}

export async function downloadPayslipPDF(data: PayslipData): Promise<void> {
  const doc = await generatePayslipPDF(data);
  doc.save(getPayslipFileName(data));
}

export async function getPayslipBlob(data: PayslipData): Promise<Blob> {
  const doc = await generatePayslipPDF(data);
  return doc.output("blob");
}
