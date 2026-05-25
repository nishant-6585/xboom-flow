import * as XLSX from "xlsx";
import { Repair, ISSUE_TYPES, PAYMENT_STATUSES } from "@/hooks/useRepairs";
import { format } from "date-fns";

const getIssueLabel = (value: string) =>
  ISSUE_TYPES.find((t) => t.value === value)?.label || value;

const getPaymentLabel = (value: string) =>
  PAYMENT_STATUSES.find((s) => s.value === value)?.label || value;

const formatDate = (date: string | null) => {
  if (!date) return "";
  try {
    return format(new Date(date), "dd MMM yyyy");
  } catch {
    return date;
  }
};

export function exportRepairsToExcel(repairs: Repair[]) {
  if (repairs.length === 0) {
    throw new Error("No repair data to export");
  }

  const rows = repairs.map((r) => {
    const components = r.components_replaced ?? [];
    const fromInventoryCount = components.filter((c) => !!c.part_id).length;
    const customCount = components.length - fromInventoryCount;
    return ({
    "Repair #": r.repair_number || "—",
    "Customer Name": r.customer_name,
    "Model": r.model_name,
    "Contact No": r.contact_no,
    "Issue Type": getIssueLabel(r.issue_type),
    "Issue Details": r.issue_details || "",
    "Date Received": formatDate(r.date_of_receipt),
    "Committed Date": formatDate(r.committed_date),
    "Date Completed": formatDate(r.date_completed),
    "Days to Complete": r.days_to_complete ?? "",
    "Components Replaced": r.components_replaced?.map((c) => c.name).join(", ") || "",
    "Parts From Inventory": fromInventoryCount,
    "Parts Custom": customCount,
    "Component Cost (₹)": r.total_component_cost || 0,
    "Inspection Charges (₹)": r.inspection_charges || 0,
    "Repair Cost (₹)": r.repair_cost_charged || 0,
    "Total Quote (₹)": r.total_quote_amount || 0,
    "Advance (₹)": r.advance_amount || 0,
    "Balance (₹)": r.balance_amount || 0,
    "Payment Status": getPaymentLabel(r.payment_status),
    "Profit (₹)": r.profit || 0,
    "Notes": r.notes || "",
    "Created By": r.created_by_name || "",
    "Created At": formatDate(r.created_at),
    });
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto-size columns
  const colWidths = Object.keys(rows[0]).map((key) => ({
    wch: Math.max(
      key.length + 2,
      ...rows.map((r) => String((r as any)[key] ?? "").length).slice(0, 100)
    ),
  }));
  ws["!cols"] = colWidths.map((w) => ({ wch: Math.min(w.wch, 40) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Repairs");

  const filename = `repairs_export_${format(new Date(), "yyyy_MM_dd")}.xlsx`;
  XLSX.writeFile(wb, filename);

  return filename;
}
