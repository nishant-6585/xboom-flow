import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SalarySheetEntry, calculateEarnings, calculateTotalDeductions, calculateNetPay } from "@/hooks/useSalarySheets";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface PayslipData {
  entry: SalarySheetEntry;
  month: number;
  year: number;
  department?: string;
  designation?: string;
}

function fmtCurrency(val: number): string {
  return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export function generatePayslipPDF(data: PayslipData): jsPDF {
  const { entry, month, year, department, designation } = data;
  const doc = new jsPDF();

  const totalEarnings = calculateEarnings(entry);
  const totalDeductions = calculateTotalDeductions(entry);
  const netPay = calculateNetPay(entry);

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("XBoom", 105, 20, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Payslip for ${MONTH_NAMES[month]} ${year}`, 105, 28, { align: "center" });

  // Divider
  doc.setLineWidth(0.5);
  doc.line(14, 33, 196, 33);

  // Employee Details
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Employee Details", 14, 42);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const empDetails = [
    ["Employee Name", entry.employee_name],
    ["Employee ID", entry.employee_id?.substring(0, 8) || "—"],
    ["Department", department || "—"],
    ["Designation", designation || "—"],
    ["Bank Account", entry.bank_account || "—"],
    ["IFSC Code", entry.ifsc_code || "—"],
    ...((entry as any).last_working_date ? [["Last Working Date", new Date((entry as any).last_working_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })]] : []),
  ];

  let y = 48;
  for (const [label, value] of empDetails) {
    doc.setFont("helvetica", "bold");
    doc.text(label + ":", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(value), 70, y);
    y += 6;
  }

  // Leave summary
  y += 4;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Attendance Summary", 14, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["WFH Days", "Earned Leave", "Sick Leave", "Unpaid Leaves"]],
    body: [[
      String(entry.wfh_days),
      String(entry.el_leaves),
      String(entry.sl_leaves),
      String(entry.unpaid_leaves),
    ]],
    theme: "grid",
    headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
    bodyStyles: { fontSize: 8, halign: "center" },
    margin: { left: 14, right: 14 },
  });

  // Earnings & Deductions side by side
  const currentY = (doc as any).lastAutoTable?.finalY + 10 || y + 30;

  autoTable(doc, {
    startY: currentY,
    head: [["Earnings", "Amount"]],
    body: [
      ["Basic Salary", fmtCurrency(entry.salary)],
      ["Reimbursements", fmtCurrency(entry.reimbursements)],
      ["Total Earnings", fmtCurrency(totalEarnings)],
    ],
    theme: "grid",
    headStyles: { fillColor: [39, 174, 96], fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 14, right: 110 },
  });

  autoTable(doc, {
    startY: currentY,
    head: [["Deductions", "Amount"]],
    body: [
      ["Unpaid Leave Deduction", fmtCurrency(entry.deductions)],
      ["Pending Amount", fmtCurrency(entry.pending_amount)],
      ["TDS", fmtCurrency(entry.tds)],
      ["Tax", fmtCurrency(entry.tax)],
      ["Total Deductions", fmtCurrency(totalDeductions)],
    ],
    theme: "grid",
    headStyles: { fillColor: [192, 57, 43], fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 110, right: 14 },
  });

  // Net Pay
  const finalY = (doc as any).lastAutoTable?.finalY + 12 || currentY + 60;
  doc.setDrawColor(41, 128, 185);
  doc.setFillColor(235, 245, 251);
  doc.roundedRect(14, finalY, 182, 18, 3, 3, "FD");
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(41, 128, 185);
  doc.text("Net Pay", 24, finalY + 12);
  doc.text(fmtCurrency(netPay), 186, finalY + 12, { align: "right" });
  doc.setTextColor(0, 0, 0);

  // Footer
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.text("This is a system-generated payslip. No signature required.", 105, 285, { align: "center" });

  return doc;
}

export function downloadPayslipPDF(data: PayslipData): void {
  const doc = generatePayslipPDF(data);
  doc.save(`payslip_${data.entry.employee_name.replace(/\s+/g, "_")}_${MONTH_NAMES[data.month]}_${data.year}.pdf`);
}

export function getPayslipBlob(data: PayslipData): Blob {
  const doc = generatePayslipPDF(data);
  return doc.output("blob");
}
