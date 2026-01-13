import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Enquiry } from "@/hooks/useEnquiries";
import { format } from "date-fns";

interface ExportOptions {
  filename: string;
  title?: string;
  subtitle?: string;
}

// Format enquiry data for export
const formatEnquiryData = (enquiries: Enquiry[]) => {
  return enquiries.map((e) => ({
    "Date": format(new Date(e.created_at), "dd/MM/yyyy HH:mm"),
    "Product Name": e.product_name,
    "Product Code": e.product_code,
    "Category": e.product_category || "-",
    "Quantity": e.quantity,
    "Customer Name": e.customer_name,
    "Company": e.customer_company || "-",
    "Sales Person": e.sales_person_name,
    "Urgency": e.urgency.charAt(0).toUpperCase() + e.urgency.slice(1),
    "Requested Timeline": e.requested_timeline || "-",
    "Status": e.status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    "Pricing (INR)": e.response_pricing || "-",
    "Availability": e.response_availability || "-",
    "Lead Time": e.response_lead_time || "-",
    "Response Notes": e.response_notes || "-",
    "Escalated": e.is_escalated ? "Yes" : "No",
    "Escalation Reason": e.escalation_reason || "-",
    "Notes": e.notes || "-",
  }));
};

// Export to Excel
export const exportToExcel = (enquiries: Enquiry[], options: ExportOptions) => {
  const data = formatEnquiryData(enquiries);
  
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  
  // Set column widths
  const colWidths = [
    { wch: 18 }, // Date
    { wch: 25 }, // Product Name
    { wch: 15 }, // Product Code
    { wch: 20 }, // Category
    { wch: 10 }, // Quantity
    { wch: 20 }, // Customer Name
    { wch: 20 }, // Company
    { wch: 18 }, // Sales Person
    { wch: 10 }, // Urgency
    { wch: 20 }, // Requested Timeline
    { wch: 12 }, // Status
    { wch: 15 }, // Pricing
    { wch: 15 }, // Availability
    { wch: 15 }, // Lead Time
    { wch: 25 }, // Response Notes
    { wch: 10 }, // Escalated
    { wch: 30 }, // Escalation Reason
    { wch: 30 }, // Notes
  ];
  worksheet["!cols"] = colWidths;
  
  XLSX.utils.book_append_sheet(workbook, worksheet, "Enquiries");
  XLSX.writeFile(workbook, `${options.filename}.xlsx`);
};

// Export to PDF
export const exportToPDF = (enquiries: Enquiry[], options: ExportOptions) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  
  // Add title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(options.title || "Enquiries Report", 14, 15);
  
  // Add subtitle
  if (options.subtitle) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(options.subtitle, 14, 22);
  }
  
  // Add generation date
  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 14, 28);
  
  // Prepare table data
  const tableData = enquiries.map((e) => [
    format(new Date(e.created_at), "dd/MM/yy"),
    e.product_name.substring(0, 20) + (e.product_name.length > 20 ? "..." : ""),
    e.product_code,
    e.product_category?.substring(0, 15) || "-",
    e.quantity.toString(),
    e.customer_name.substring(0, 15) + (e.customer_name.length > 15 ? "..." : ""),
    e.sales_person_name.substring(0, 12) + (e.sales_person_name.length > 12 ? "..." : ""),
    e.urgency.charAt(0).toUpperCase() + e.urgency.slice(1),
    e.status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    e.response_pricing || "-",
    e.is_escalated ? "Yes" : "No",
  ]);
  
  autoTable(doc, {
    head: [[
      "Date",
      "Product",
      "Code",
      "Category",
      "Qty",
      "Customer",
      "Sales Person",
      "Urgency",
      "Status",
      "Price",
      "Escalated",
    ]],
    body: tableData,
    startY: 32,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 35 },
      2: { cellWidth: 20 },
      3: { cellWidth: 25 },
      4: { cellWidth: 12 },
      5: { cellWidth: 28 },
      6: { cellWidth: 25 },
      7: { cellWidth: 18 },
      8: { cellWidth: 20 },
      9: { cellWidth: 22 },
      10: { cellWidth: 18 },
    },
  });
  
  // Add footer with page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() - 25,
      doc.internal.pageSize.getHeight() - 10
    );
    doc.text(
      "Xboom Product Enquiry System",
      14,
      doc.internal.pageSize.getHeight() - 10
    );
  }
  
  doc.save(`${options.filename}.pdf`);
};

// Export category summary to Excel
export const exportCategorySummaryToExcel = (
  categoryData: { name: string; value: number }[],
  options: ExportOptions
) => {
  const data = categoryData.map((c) => ({
    "Category": c.name,
    "Number of Enquiries": c.value,
  }));
  
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  
  worksheet["!cols"] = [{ wch: 30 }, { wch: 20 }];
  
  XLSX.utils.book_append_sheet(workbook, worksheet, "Category Summary");
  XLSX.writeFile(workbook, `${options.filename}.xlsx`);
};

// Export category summary to PDF
export const exportCategorySummaryToPDF = (
  categoryData: { name: string; value: number }[],
  options: ExportOptions
) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  
  // Add title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(options.title || "Category Report", 14, 15);
  
  // Add subtitle
  if (options.subtitle) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(options.subtitle, 14, 22);
  }
  
  // Add generation date
  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 14, 28);
  
  // Prepare table data
  const tableData = categoryData.map((c) => [c.name, c.value.toString()]);
  
  // Add total row
  const total = categoryData.reduce((sum, c) => sum + c.value, 0);
  tableData.push(["TOTAL", total.toString()]);
  
  autoTable(doc, {
    head: [["Category", "No. of Enquiries"]],
    body: tableData,
    startY: 35,
    styles: {
      fontSize: 10,
      cellPadding: 4,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 50, halign: "center" },
    },
    didParseCell: (data) => {
      // Style the total row
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [229, 231, 235];
      }
    },
  });
  
  doc.save(`${options.filename}.pdf`);
};

// ==================== PROCUREMENT EXPORTS ====================

export interface SupplierLedgerExportData {
  supplierName: string;
  contactName: string;
  category: string;
  totalOrders: number;
  procurementValue: number;
  paidAmount: number;
  pendingAmount: number;
}

export interface ProcurementAnalyticsExportData {
  dayWise: { date: string; orders: number; value: number; payments: number }[];
  supplierWise: { name: string; value: number }[];
  categoryWise: { name: string; value: number; count: number }[];
  summary: {
    totalOrders: number;
    totalProcurement: number;
    totalPayments: number;
    pendingAmount: number;
    activeSuppliers: number;
  };
}

// Export supplier ledger to Excel
export const exportSupplierLedgerToExcel = (
  data: SupplierLedgerExportData[],
  options: ExportOptions
) => {
  const formattedData = data.map((d) => ({
    "Supplier Name": d.supplierName,
    "Contact": d.contactName,
    "Category": d.category,
    "Total Orders": d.totalOrders,
    "Procurement Value (₹)": d.procurementValue,
    "Paid (₹)": d.paidAmount,
    "Pending (₹)": d.pendingAmount,
  }));

  // Add totals row
  const totals = data.reduce(
    (acc, d) => ({
      procurementValue: acc.procurementValue + d.procurementValue,
      paidAmount: acc.paidAmount + d.paidAmount,
      pendingAmount: acc.pendingAmount + d.pendingAmount,
      totalOrders: acc.totalOrders + d.totalOrders,
    }),
    { procurementValue: 0, paidAmount: 0, pendingAmount: 0, totalOrders: 0 }
  );

  formattedData.push({
    "Supplier Name": "TOTAL",
    "Contact": "",
    "Category": "",
    "Total Orders": totals.totalOrders,
    "Procurement Value (₹)": totals.procurementValue,
    "Paid (₹)": totals.paidAmount,
    "Pending (₹)": totals.pendingAmount,
  });

  const worksheet = XLSX.utils.json_to_sheet(formattedData);
  const workbook = XLSX.utils.book_new();

  worksheet["!cols"] = [
    { wch: 25 },
    { wch: 20 },
    { wch: 20 },
    { wch: 12 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, "Supplier Ledger");
  XLSX.writeFile(workbook, `${options.filename}.xlsx`);
};

// Export supplier ledger to PDF
export const exportSupplierLedgerToPDF = (
  data: SupplierLedgerExportData[],
  options: ExportOptions
) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Add title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(options.title || "Supplier Ledger Report", 14, 15);

  // Add subtitle
  if (options.subtitle) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(options.subtitle, 14, 22);
  }

  // Add generation date
  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 14, 28);

  // Prepare table data
  const tableData = data.map((d) => [
    d.supplierName.substring(0, 25),
    d.contactName.substring(0, 18),
    d.category.substring(0, 18),
    d.totalOrders.toString(),
    `₹${d.procurementValue.toLocaleString()}`,
    `₹${d.paidAmount.toLocaleString()}`,
    `₹${d.pendingAmount.toLocaleString()}`,
  ]);

  // Add totals row
  const totals = data.reduce(
    (acc, d) => ({
      procurementValue: acc.procurementValue + d.procurementValue,
      paidAmount: acc.paidAmount + d.paidAmount,
      pendingAmount: acc.pendingAmount + d.pendingAmount,
      totalOrders: acc.totalOrders + d.totalOrders,
    }),
    { procurementValue: 0, paidAmount: 0, pendingAmount: 0, totalOrders: 0 }
  );

  tableData.push([
    "TOTAL",
    "",
    "",
    totals.totalOrders.toString(),
    `₹${totals.procurementValue.toLocaleString()}`,
    `₹${totals.paidAmount.toLocaleString()}`,
    `₹${totals.pendingAmount.toLocaleString()}`,
  ]);

  autoTable(doc, {
    head: [["Supplier", "Contact", "Category", "Orders", "Procurement", "Paid", "Pending"]],
    body: tableData,
    startY: 35,
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    didParseCell: (data) => {
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [229, 231, 235];
      }
    },
  });

  // Add footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() - 25,
      doc.internal.pageSize.getHeight() - 10
    );
    doc.text("Xboom Procurement System", 14, doc.internal.pageSize.getHeight() - 10);
  }

  doc.save(`${options.filename}.pdf`);
};

// Export procurement analytics to Excel
export const exportProcurementAnalyticsToExcel = (
  data: ProcurementAnalyticsExportData,
  options: ExportOptions
) => {
  const workbook = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    { "Metric": "Total Orders", "Value": data.summary.totalOrders },
    { "Metric": "Total Procurement (₹)", "Value": data.summary.totalProcurement },
    { "Metric": "Total Payments (₹)", "Value": data.summary.totalPayments },
    { "Metric": "Pending Amount (₹)", "Value": data.summary.pendingAmount },
    { "Metric": "Active Suppliers", "Value": data.summary.activeSuppliers },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  summarySheet["!cols"] = [{ wch: 25 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  // Day-wise sheet
  const dayWiseData = data.dayWise.map((d) => ({
    "Date": d.date,
    "Orders": d.orders,
    "Procurement Value (₹)": d.value,
    "Payments (₹)": d.payments,
  }));
  const dayWiseSheet = XLSX.utils.json_to_sheet(dayWiseData);
  dayWiseSheet["!cols"] = [{ wch: 15 }, { wch: 10 }, { wch: 22 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, dayWiseSheet, "Day-wise");

  // Supplier-wise sheet
  const supplierWiseData = data.supplierWise.map((d) => ({
    "Supplier": d.name,
    "Procurement Value (₹)": d.value,
  }));
  const supplierSheet = XLSX.utils.json_to_sheet(supplierWiseData);
  supplierSheet["!cols"] = [{ wch: 30 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(workbook, supplierSheet, "Supplier-wise");

  // Category-wise sheet
  const categoryWiseData = data.categoryWise.map((d) => ({
    "Category": d.name,
    "Procurement Value (₹)": d.value,
    "Order Count": d.count,
  }));
  const categorySheet = XLSX.utils.json_to_sheet(categoryWiseData);
  categorySheet["!cols"] = [{ wch: 25 }, { wch: 22 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(workbook, categorySheet, "Category-wise");

  XLSX.writeFile(workbook, `${options.filename}.xlsx`);
};

// Export procurement analytics to PDF
export const exportProcurementAnalyticsToPDF = (
  data: ProcurementAnalyticsExportData,
  options: ExportOptions
) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Add title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(options.title || "Procurement Analytics Report", 14, 15);

  // Add subtitle
  if (options.subtitle) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(options.subtitle, 14, 22);
  }

  // Add generation date
  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 14, 28);

  // Summary Section
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Summary", 14, 40);

  autoTable(doc, {
    body: [
      ["Total Orders", data.summary.totalOrders.toString()],
      ["Total Procurement", `₹${data.summary.totalProcurement.toLocaleString()}`],
      ["Total Payments", `₹${data.summary.totalPayments.toLocaleString()}`],
      ["Pending Amount", `₹${data.summary.pendingAmount.toLocaleString()}`],
      ["Active Suppliers", data.summary.activeSuppliers.toString()],
    ],
    startY: 45,
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 60 },
      1: { halign: "right", cellWidth: 60 },
    },
    theme: "plain",
  });

  // Top Suppliers Section
  const supplierStartY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Top Suppliers by Procurement", 14, supplierStartY);

  autoTable(doc, {
    head: [["Supplier", "Value (₹)"]],
    body: data.supplierWise.slice(0, 10).map((d) => [
      d.name,
      `₹${d.value.toLocaleString()}`,
    ]),
    startY: supplierStartY + 5,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  // Category-wise Section
  const categoryStartY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Category-wise Procurement", 14, categoryStartY);

  autoTable(doc, {
    head: [["Category", "Value (₹)", "Orders"]],
    body: data.categoryWise.map((d) => [
      d.name,
      `₹${d.value.toLocaleString()}`,
      d.count.toString(),
    ]),
    startY: categoryStartY + 5,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  // Add footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() - 25,
      doc.internal.pageSize.getHeight() - 10
    );
    doc.text("Xboom Procurement System", 14, doc.internal.pageSize.getHeight() - 10);
  }

  doc.save(`${options.filename}.pdf`);
};

// ==================== SUPPLIER PAYMENT HISTORY EXPORTS ====================

export interface SupplierPaymentExportData {
  date: string;
  amount: number;
  type: string;
  mode: string;
  referenceNumber: string;
  notes: string;
  orderId?: string;
}

export interface SupplierPaymentHistoryExport {
  supplierName: string;
  supplierContact: string;
  totalPaid: number;
  payments: SupplierPaymentExportData[];
}

// Export supplier payment history to Excel
export const exportSupplierPaymentHistoryToExcel = (
  data: SupplierPaymentHistoryExport,
  options: ExportOptions
) => {
  const formattedData = data.payments.map((p) => ({
    "Date": p.date,
    "Amount (₹)": p.amount,
    "Type": p.type.charAt(0).toUpperCase() + p.type.slice(1),
    "Mode": p.mode ? p.mode.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : '-',
    "Reference Number": p.referenceNumber || '-',
    "Notes": p.notes || '-',
  }));

  // Add totals row
  formattedData.push({
    "Date": "TOTAL",
    "Amount (₹)": data.totalPaid,
    "Type": "",
    "Mode": "",
    "Reference Number": "",
    "Notes": "",
  });

  const worksheet = XLSX.utils.json_to_sheet(formattedData);
  const workbook = XLSX.utils.book_new();

  worksheet["!cols"] = [
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
    { wch: 15 },
    { wch: 25 },
    { wch: 35 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, "Payment History");
  XLSX.writeFile(workbook, `${options.filename}.xlsx`);
};

// Export supplier payment history to PDF
export const exportSupplierPaymentHistoryToPDF = (
  data: SupplierPaymentHistoryExport,
  options: ExportOptions
) => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Add title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(options.title || "Payment History", 14, 15);

  // Add supplier name
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(`Supplier: ${data.supplierName}`, 14, 24);
  
  if (data.supplierContact) {
    doc.setFontSize(10);
    doc.text(`Contact: ${data.supplierContact}`, 14, 30);
  }

  // Add generation date and total
  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 14, 38);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text(`Total Paid: ₹${data.totalPaid.toLocaleString('en-IN')}`, 14, 45);

  // Prepare table data
  const tableData = data.payments.map((p) => [
    p.date,
    `₹${p.amount.toLocaleString('en-IN')}`,
    p.type.charAt(0).toUpperCase() + p.type.slice(1),
    p.mode ? p.mode.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : '-',
    p.referenceNumber || '-',
    (p.notes || '-').substring(0, 30) + ((p.notes?.length || 0) > 30 ? '...' : ''),
  ]);

  autoTable(doc, {
    head: [["Date", "Amount", "Type", "Mode", "Reference", "Notes"]],
    body: tableData,
    startY: 52,
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 25 },
      2: { cellWidth: 22 },
      3: { cellWidth: 28 },
      4: { cellWidth: 35 },
      5: { cellWidth: 45 },
    },
  });

  // Add footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() - 25,
      doc.internal.pageSize.getHeight() - 10
    );
    doc.text("Xboom Supplier Payments", 14, doc.internal.pageSize.getHeight() - 10);
  }

  doc.save(`${options.filename}.pdf`);
};
