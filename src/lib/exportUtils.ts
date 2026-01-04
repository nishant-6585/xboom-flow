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
