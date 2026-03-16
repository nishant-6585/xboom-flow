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
}

function fmtCurrency(val: number): string {
  return val.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtCurrencyWithSymbol(val: number): string {
  return `₹${fmtCurrency(val)}`;
}

export function generatePayslipPDF(data: PayslipData): jsPDF {
  const { entry, month, year, department, designation, employeeNumber, dateOfBirth, joiningDate } = data;

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

  // ─── HEADER SECTION ───
  // Company name
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text("XBoom Utilities", 14, 20);

  // Payslip month/year badge (top right)
  const payslipLabel = `Payslip: ${MONTH_SHORT[month]} ${year}`;
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(pageWidth - 70, 10, 56, 14, 2, 2, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text(payslipLabel, pageWidth - 42, 19, { align: "center" });

  // ─── NET PAY SUMMARY BAR ───
  const barY = 30;
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(14, barY, pageWidth - 28, 20, 3, 3, "F");
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(14, barY, pageWidth - 28, 20, 3, 3, "S");

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedText);
  doc.text("Net Pay", 20, barY + 8);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text(fmtCurrencyWithSymbol(netPay), 20, barY + 16);

  // = sign
  doc.setFontSize(14);
  doc.setTextColor(...mutedText);
  doc.text("=", 75, barY + 13);

  // Gross Pay (A)
  doc.setFillColor(...primaryGreen);
  doc.rect(85, barY + 4, 2, 12, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedText);
  doc.text("Gross Pay (A)", 90, barY + 8);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text(`+ ${fmtCurrencyWithSymbol(totalEarnings)}`, 90, barY + 16);

  // Deductions (B)
  doc.setFillColor(192, 57, 43);
  doc.rect(140, barY + 4, 2, 12, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedText);
  doc.text("Deductions (B)", 145, barY + 8);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...darkText);
  doc.text(`- ${fmtCurrencyWithSymbol(totalDeductions)}`, 145, barY + 16);

  // ─── MAIN CONTENT AREA ───
  const contentY = 58;
  const leftColWidth = 60;
  const rightColX = leftColWidth + 18;

  // ─── LEFT SIDEBAR: Employee Details ───
  const detailItems: [string, string][] = [
    ["Employee Code", employeeNumber || entry.employee_id?.substring(0, 8) || "—"],
    ["Name", entry.employee_name],
    ["Designation", designation || "—"],
    ["Department", department || "—"],
  ];
  if (dateOfBirth) {
    detailItems.push(["Date of birth", new Date(dateOfBirth).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })]);
  }
  detailItems.push(["Account no.", entry.bank_account || "—"]);
  detailItems.push(["IFSC code", entry.ifsc_code || "—"]);
  if (joiningDate) {
    detailItems.push(["Date of joining", new Date(joiningDate).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })]);
  }
  if ((entry as any).last_working_date) {
    detailItems.push(["Last Working Date", new Date((entry as any).last_working_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })]);
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
    // Word wrap for long values
    const lines = doc.splitTextToSize(String(value), leftColWidth - 4);
    doc.text(lines, 14, leftY);
    leftY += lines.length * 4.5 + 4;
  }

  // ─── RIGHT SECTION: GROSS PAY (A) ───
  // Section header
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.text("Gross Pay (A)", rightColX, contentY);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedText);
  doc.text("The total money you earned before the deductions", rightColX + 32, contentY);

  // Earnings table
  const earningsBody: any[][] = [];
  if (entry.salary > 0) earningsBody.push(["Basic Salary", fmtCurrency(entry.salary), fmtCurrency(entry.salary)]);
  if (entry.reimbursements > 0) earningsBody.push(["Reimbursements", fmtCurrency(entry.reimbursements), fmtCurrency(entry.reimbursements)]);
  if (earningsBody.length === 0) earningsBody.push(["Basic Salary", fmtCurrency(entry.salary), fmtCurrency(entry.salary)]);

  autoTable(doc, {
    startY: contentY + 4,
    head: [["Earnings", "Monthly", "Total Amount"]],
    body: earningsBody,
    foot: [["", "Gross Pay", fmtCurrency(totalEarnings)]],
    theme: "plain",
    headStyles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontSize: 8, fontStyle: "bold", cellPadding: 3 },
    bodyStyles: { fontSize: 8.5, textColor: darkText as any, cellPadding: 3 },
    footStyles: { fillColor: [235, 250, 240], textColor: darkText as any, fontSize: 9, fontStyle: "bold", cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { halign: "right", cellWidth: 30 },
      2: { halign: "right", cellWidth: 32 },
    },
    margin: { left: rightColX, right: 14 },
    tableLineColor: [230, 230, 230],
    tableLineWidth: 0.2,
  });

  const earningsEndY = (doc as any).lastAutoTable?.finalY || contentY + 50;

  // ─── DEDUCTIONS (B) ───
  const deductionsStartY = earningsEndY + 10;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryOrange[0], primaryOrange[1], primaryOrange[2]);
  doc.text("Deductions (B)", rightColX, deductionsStartY);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedText);
  doc.text("The amount deducted for taxes and other benefits", rightColX + 34, deductionsStartY);

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
    foot: [["", "Total Deductions", fmtCurrency(totalDeductions)]],
    theme: "plain",
    headStyles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontSize: 8, fontStyle: "bold", cellPadding: 3 },
    bodyStyles: { fontSize: 8.5, textColor: darkText as any, cellPadding: 3 },
    footStyles: { fillColor: [255, 245, 235], textColor: darkText as any, fontSize: 9, fontStyle: "bold", cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { halign: "right", cellWidth: 30 },
      2: { halign: "right", cellWidth: 32 },
    },
    margin: { left: rightColX, right: 14 },
    tableLineColor: [230, 230, 230],
    tableLineWidth: 0.2,
  });

  const deductionsEndY = (doc as any).lastAutoTable?.finalY || deductionsStartY + 50;

  // ─── ATTENDANCE SUMMARY (bottom left, below employee details) ───
  // Add attendance info below employee details on the left
  const attendanceY = Math.max(leftY + 4, deductionsEndY - 30);
  const attendanceItems: [string, string][] = [
    ["WFH Days", String(entry.wfh_days)],
    ["Earned Leave", String(entry.el_leaves)],
    ["Sick Leave", String(entry.sl_leaves)],
    ["Unpaid Leaves", String(entry.unpaid_leaves)],
  ];

  for (const [label, value] of attendanceItems) {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...mutedText);
    doc.text(label, 14, attendanceY);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...darkText);
    doc.text(value, 14, attendanceY + 4);
  }

  // ─── NET PAY HIGHLIGHT BOX ───
  const netPayY = deductionsEndY + 12;
  doc.setDrawColor(...primaryGreen as any);
  doc.setFillColor(235, 250, 240);
  doc.roundedRect(rightColX, netPayY, pageWidth - rightColX - 14, 16, 3, 3, "FD");
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryGreen as any);
  doc.text("Net Pay", rightColX + 8, netPayY + 10);
  doc.text(fmtCurrencyWithSymbol(netPay), pageWidth - 18, netPayY + 10, { align: "right" });

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

export function downloadPayslipPDF(data: PayslipData): void {
  const doc = generatePayslipPDF(data);
  doc.save(getPayslipFileName(data));
}

export function getPayslipBlob(data: PayslipData): Blob {
  const doc = generatePayslipPDF(data);
  return doc.output("blob");
}
