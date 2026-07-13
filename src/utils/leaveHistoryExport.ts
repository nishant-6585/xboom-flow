import * as XLSX from "xlsx";
import { format } from "date-fns";
import { LeaveHistoryRecord } from "@/hooks/useLeaveHistory";
import { getLeaveTypeLabel } from "@/lib/leaveTypeLabels";

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  submitted: 'Pending',
  draft: 'Draft',
  cancelled: 'Cancelled',
};

const formatDate = (date: string | null) => {
  if (!date) return "";
  try {
    return format(new Date(date), "dd MMM yyyy");
  } catch {
    return date;
  }
};

export function exportLeaveHistoryToExcel(records: LeaveHistoryRecord[]) {
  if (records.length === 0) {
    throw new Error("No leave data to export");
  }

  const rows = records.map((r) => ({
    "Employee Name": r.employee_name,
    "Leave Type": getLeaveTypeLabel(r.leave_type),
    "Start Date": formatDate(r.start_date),
    "End Date": formatDate(r.end_date),
    "Total Days": r.total_days,
    "Status": STATUS_LABELS[r.status] || r.status,
    "Reason": r.reason || "",
    "Applied On": formatDate(r.created_at),
    "Applied By": r.is_hr_applied ? (r.applied_by_name || 'HR') : 'Self',
    "Approved/Rejected By": r.approver_name || "",
    "Approved/Rejected On": formatDate(r.approved_rejected_at),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  const colWidths = Object.keys(rows[0]).map((key) => ({
    wch: Math.max(
      key.length + 2,
      ...rows.map((r) => String((r as any)[key] ?? "").length).slice(0, 100)
    ),
  }));
  ws["!cols"] = colWidths.map((w) => ({ wch: Math.min(w.wch, 40) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leave History");

  const filename = `leave_history_${format(new Date(), "yyyy_MM_dd")}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}
