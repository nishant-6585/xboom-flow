import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { recordAuditLog } from "@/lib/auditLog";

export type SalarySheetStatus = "draft" | "hr_approved" | "finance_approved" | "locked";

export interface SalarySheet {
  id: string;
  month: number;
  year: number;
  created_by: string;
  created_by_name: string;
  status: SalarySheetStatus;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalarySheetEntry {
  id: string;
  salary_sheet_id: string;
  employee_id: string;
  employee_name: string;
  salary: number;
  bank_account: string | null;
  ifsc_code: string | null;
  wfh_days: number;
  unpaid_leaves: number;
  el_leaves: number;
  sl_leaves: number;
  deductions: number;
  pending_amount: number;
  tds: number;
  tax: number;
  reimbursements: number;
  total: number;
  remarks: string | null;
  wfh_days_override: boolean;
  unpaid_leaves_override: boolean;
  el_leaves_override: boolean;
  sl_leaves_override: boolean;
  deductions_override: boolean;
}

export interface AttendanceSummary {
  wfh_days: number;
  unpaid_leaves: number;
  el_leaves: number;
  sl_leaves: number;
}

export interface EmployeeProfileData {
  salary: number;
  bank_account: string | null;
  ifsc_code: string | null;
  designation: string | null;
  department: string | null;
}

const TOTAL_WORKING_DAYS = 26;

export function calculateTotal(entry: Partial<SalarySheetEntry>): number {
  const salary = Number(entry.salary) || 0;
  const deductions = Number(entry.deductions) || 0;
  const pending = Number(entry.pending_amount) || 0;
  const tds = Number(entry.tds) || 0;
  const tax = Number(entry.tax) || 0;
  const reimbursements = Number(entry.reimbursements) || 0;
  return Math.max(0, salary - deductions - pending - tds - tax + reimbursements);
}

export function calculateEarnings(entry: Partial<SalarySheetEntry>): number {
  return (Number(entry.salary) || 0) + (Number(entry.reimbursements) || 0);
}

export function calculateTotalDeductions(entry: Partial<SalarySheetEntry>): number {
  return (Number(entry.deductions) || 0) + (Number(entry.pending_amount) || 0) + (Number(entry.tds) || 0) + (Number(entry.tax) || 0);
}

export function calculateNetPay(entry: Partial<SalarySheetEntry>): number {
  return calculateEarnings(entry) - calculateTotalDeductions(entry);
}

export function calculateDeduction(salary: number, unpaidLeaves: number): number {
  if (unpaidLeaves <= 0 || salary <= 0) return 0;
  const perDaySalary = salary / TOTAL_WORKING_DAYS;
  return Math.round(perDaySalary * unpaidLeaves * 100) / 100;
}

/**
 * Fetch the effective salary for an employee for a given month/year from salary_history.
 * Falls back to employees.monthly_salary if no history exists.
 */
export async function getEmployeeProfileData(
  employeeId: string,
  month: number,
  year: number
): Promise<EmployeeProfileData> {
  // Get employee base data
  const { data: emp } = await supabase
    .from("employees")
    .select("monthly_salary, bank_account, ifsc_code, designation, department")
    .eq("id", employeeId)
    .single();

  let salary = Number(emp?.monthly_salary) || 0;

  // Check salary_history for the effective salary for this month
  const effectiveDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const { data: history } = await supabase
    .from("salary_history")
    .select("salary")
    .eq("employee_id", employeeId)
    .lte("effective_from", effectiveDate)
    .order("effective_from", { ascending: false })
    .limit(1);

  if (history && history.length > 0) {
    salary = Number((history[0] as any).salary) || salary;
  }

  return {
    salary,
    bank_account: (emp as any)?.bank_account || null,
    ifsc_code: (emp as any)?.ifsc_code || null,
    designation: (emp as any)?.designation || null,
    department: (emp as any)?.department || null,
  };
}

export async function calculateAttendanceData(
  employeeId: string,
  month: number,
  year: number
): Promise<AttendanceSummary> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const { data: leaves } = await supabase
    .from("leave_requests")
    .select("leave_type, total_days, start_date, end_date")
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .lte("start_date", endDate)
    .gte("end_date", startDate);

  let wfh = 0, unpaid = 0, el = 0, sl = 0;

  for (const lr of leaves || []) {
    const days = Number(lr.total_days) || 0;
    const lt = (lr.leave_type || "").toLowerCase();

    const leaveStart = new Date(lr.start_date);
    const leaveEnd = new Date(lr.end_date);
    const monthStart = new Date(startDate);
    const monthEnd = new Date(endDate);
    monthEnd.setDate(monthEnd.getDate() - 1);

    const overlapStart = leaveStart > monthStart ? leaveStart : monthStart;
    const overlapEnd = leaveEnd < monthEnd ? leaveEnd : monthEnd;
    const overlapDays = Math.max(0, Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1);

    const effectiveDays = (leaveStart >= monthStart && leaveEnd <= monthEnd) ? days : overlapDays;
    const isHalfDay = lt.startsWith("half_day");
    const countDays = isHalfDay ? 0.5 : effectiveDays;

    if (lt === "wfh") wfh += countDays;
    else if (lt === "unpaid" || lt === "half_day_unpaid") unpaid += countDays;
    else if (lt === "paid" || lt === "half_day_paid") el += countDays;
    else if (lt === "sick" || lt === "half_day_sick") sl += countDays;
  }

  return { wfh_days: wfh, unpaid_leaves: unpaid, el_leaves: el, sl_leaves: sl };
}

export function useSalarySheets() {
  const { user, profile } = useAuth();
  const userName = profile?.name || "Unknown";
  const [sheets, setSheets] = useState<SalarySheet[]>([]);
  const [entries, setEntries] = useState<SalarySheetEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSheets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("salary_sheets")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    if (error) {
      toast.error("Failed to load salary sheets");
    } else {
      setSheets((data as unknown as SalarySheet[]) || []);
    }
    setLoading(false);
  }, []);

  const createSheet = useCallback(async (month: number, year: number) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("salary_sheets")
      .insert({ month, year, created_by: user.id, created_by_name: userName || "Unknown" } as any)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        toast.error(`Salary sheet for ${month}/${year} already exists`);
      } else {
        toast.error("Failed to create salary sheet");
      }
      return null;
    }
    recordAuditLog(user.id, userName || "", { action: "SALARY_SHEET_CREATED", details: { month, year } });
    toast.success("Salary sheet created");
    await fetchSheets();
    return data as unknown as SalarySheet;
  }, [user, userName, fetchSheets]);

  const fetchEntries = useCallback(async (sheetId: string) => {
    const { data, error } = await supabase
      .from("salary_sheet_entries")
      .select("*")
      .eq("salary_sheet_id", sheetId)
      .order("employee_name", { ascending: true });
    if (error) {
      toast.error("Failed to load entries");
      return [];
    }
    const result = (data as unknown as SalarySheetEntry[]) || [];
    setEntries(result);
    return result;
  }, []);

  const addEmployeesToSheet = useCallback(async (
    sheetId: string,
    employees: { id: string; name: string }[],
    month?: number,
    year?: number
  ) => {
    const rows = [];
    for (const emp of employees) {
      let attendanceData: AttendanceSummary = { wfh_days: 0, unpaid_leaves: 0, el_leaves: 0, sl_leaves: 0 };
      let profileData: EmployeeProfileData = { salary: 0, bank_account: null, ifsc_code: null, designation: null, department: null };

      if (month && year) {
        try {
          [attendanceData, profileData] = await Promise.all([
            calculateAttendanceData(emp.id, month, year),
            getEmployeeProfileData(emp.id, month, year),
          ]);
        } catch (e) {
          console.error("Failed to calc data for", emp.name, e);
        }
      }

      const deduction = calculateDeduction(profileData.salary, attendanceData.unpaid_leaves);
      const total = calculateTotal({
        salary: profileData.salary,
        deductions: deduction,
        pending_amount: 0,
        tds: 0,
        tax: 0,
        reimbursements: 0,
      });

      rows.push({
        salary_sheet_id: sheetId,
        employee_id: emp.id,
        employee_name: emp.name,
        salary: profileData.salary,
        bank_account: profileData.bank_account,
        ifsc_code: profileData.ifsc_code,
        wfh_days: attendanceData.wfh_days,
        unpaid_leaves: attendanceData.unpaid_leaves,
        el_leaves: attendanceData.el_leaves,
        sl_leaves: attendanceData.sl_leaves,
        deductions: deduction,
        pending_amount: 0,
        tds: 0,
        tax: 0,
        reimbursements: 0,
        total,
        wfh_days_override: false,
        unpaid_leaves_override: false,
        el_leaves_override: false,
        sl_leaves_override: false,
        deductions_override: false,
      });
    }

    const { error } = await supabase.from("salary_sheet_entries").insert(rows as any);
    if (error) {
      if (error.code === "23505") {
        toast.error("Some employees are already in this sheet");
      } else {
        toast.error("Failed to add employees");
      }
      return false;
    }

    if (user && month && year) {
      recordAuditLog(user.id, userName || "", {
        action: "SALARY_AUTO_CALCULATED",
        details: {
          month, year,
          employee_count: employees.length,
          calculated_fields: ["salary", "bank_account", "ifsc_code", "wfh_days", "unpaid_leaves", "el_leaves", "sl_leaves", "deductions"],
        },
      });
    }

    toast.success(`${employees.length} employees added with auto-filled data`);
    await fetchEntries(sheetId);
    return true;
  }, [fetchEntries, user, userName]);

  const updateEntry = useCallback(async (entryId: string, updates: Partial<SalarySheetEntry>, sheetId: string) => {
    const total = calculateTotal(updates);
    const { error } = await supabase
      .from("salary_sheet_entries")
      .update({ ...updates, total } as any)
      .eq("id", entryId);
    if (error) {
      toast.error("Failed to update entry");
      return false;
    }
    await fetchEntries(sheetId);
    return true;
  }, [fetchEntries]);

  const refreshAttendanceData = useCallback(async (sheetId: string, month: number, year: number) => {
    const currentEntries = await fetchEntries(sheetId);
    let updatedCount = 0;

    for (const entry of currentEntries) {
      const attendanceData = await calculateAttendanceData(entry.employee_id, month, year);
      const updates: Record<string, any> = {};

      if (!entry.wfh_days_override) updates.wfh_days = attendanceData.wfh_days;
      if (!entry.unpaid_leaves_override) updates.unpaid_leaves = attendanceData.unpaid_leaves;
      if (!entry.el_leaves_override) updates.el_leaves = attendanceData.el_leaves;
      if (!entry.sl_leaves_override) updates.sl_leaves = attendanceData.sl_leaves;

      const effectiveUnpaid = updates.unpaid_leaves ?? entry.unpaid_leaves;
      if (!entry.deductions_override) {
        updates.deductions = calculateDeduction(entry.salary, effectiveUnpaid);
      }

      if (Object.keys(updates).length > 0) {
        const total = calculateTotal({ ...entry, ...updates });
        await supabase
          .from("salary_sheet_entries")
          .update({ ...updates, total } as any)
          .eq("id", entry.id);
        updatedCount++;
      }
    }

    if (user) {
      recordAuditLog(user.id, userName || "", {
        action: "SALARY_AUTO_CALCULATED",
        details: { month, year, refreshed_entries: updatedCount },
      });
    }

    await fetchEntries(sheetId);
    toast.success(`Attendance data refreshed for ${updatedCount} entries`);
  }, [fetchEntries, user, userName]);

  const validateBeforeLock = useCallback((entriesToValidate: SalarySheetEntry[]): string[] => {
    const errors: string[] = [];
    for (const e of entriesToValidate) {
      if (!e.salary || e.salary <= 0) errors.push(`${e.employee_name}: Salary not entered`);
      if (!e.bank_account) errors.push(`${e.employee_name}: Bank account missing`);
      if (!e.ifsc_code) errors.push(`${e.employee_name}: IFSC code missing`);
      const netPay = calculateNetPay(e);
      if (netPay < 0) errors.push(`${e.employee_name}: Net pay is negative`);
    }
    return errors;
  }, []);

  const submitForFinanceApproval = useCallback(async (sheetId: string) => {
    if (!user) return false;
    const { error } = await supabase
      .from("salary_sheets")
      .update({ status: "hr_approved" } as any)
      .eq("id", sheetId);
    if (error) { toast.error("Failed to submit for approval"); return false; }
    recordAuditLog(user.id, userName || "", { action: "PAYROLL_SUBMITTED_FOR_APPROVAL", details: { sheetId } });
    toast.success("Submitted for finance approval");
    await fetchSheets();
    return true;
  }, [user, userName, fetchSheets]);

  const financeApprove = useCallback(async (sheetId: string) => {
    if (!user) return false;
    const { error } = await supabase
      .from("salary_sheets")
      .update({ status: "finance_approved" } as any)
      .eq("id", sheetId);
    if (error) { toast.error("Failed to approve"); return false; }
    recordAuditLog(user.id, userName || "", { action: "PAYROLL_FINANCE_APPROVED", details: { sheetId } });
    toast.success("Payroll approved by finance");
    await fetchSheets();
    return true;
  }, [user, userName, fetchSheets]);

  const financeRequestChanges = useCallback(async (sheetId: string) => {
    if (!user) return false;
    const { error } = await supabase
      .from("salary_sheets")
      .update({ status: "draft" } as any)
      .eq("id", sheetId);
    if (error) { toast.error("Failed to return to draft"); return false; }
    recordAuditLog(user.id, userName || "", { action: "PAYROLL_CHANGES_REQUESTED", details: { sheetId } });
    toast.success("Returned to draft for changes");
    await fetchSheets();
    return true;
  }, [user, userName, fetchSheets]);

  const lockSheet = useCallback(async (sheetId: string) => {
    if (!user) return false;
    const { error } = await supabase
      .from("salary_sheets")
      .update({ status: "locked", locked_at: new Date().toISOString(), locked_by: userName || "Unknown" } as any)
      .eq("id", sheetId);
    if (error) {
      toast.error("Failed to lock sheet");
      return false;
    }
    recordAuditLog(user.id, userName || "", { action: "PAYROLL_LOCKED", details: { sheetId } });
    toast.success("Salary sheet locked");
    await fetchSheets();
    return true;
  }, [user, userName, fetchSheets]);

  const deleteEntry = useCallback(async (entryId: string, sheetId: string) => {
    const { error } = await supabase
      .from("salary_sheet_entries")
      .delete()
      .eq("id", entryId);
    if (error) {
      toast.error("Failed to remove employee");
      return false;
    }
    await fetchEntries(sheetId);
    return true;
  }, [fetchEntries]);

  return {
    sheets,
    entries,
    loading,
    fetchSheets,
    createSheet,
    fetchEntries,
    addEmployeesToSheet,
    updateEntry,
    lockSheet,
    deleteEntry,
    refreshAttendanceData,
    validateBeforeLock,
    submitForFinanceApproval,
    financeApprove,
    financeRequestChanges,
  };
}
