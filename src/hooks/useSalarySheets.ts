import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { recordAuditLog } from "@/lib/auditLog";
import { eachDayOfInterval, startOfMonth, endOfMonth, getDay } from "date-fns";
import { buildSegmentsForMonth, calculateSegmentedSalary } from "@/lib/proratedSalary";

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
  last_working_date: string | null;
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

/**
 * Calculate the number of working days in a month, excluding weekends and holidays.
 */
export async function getWorkingDaysInMonth(month: number, year: number): Promise<number> {
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Fetch holidays for this month
  const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const endStr = `${year}-${String(month).padStart(2, "0")}-${String(allDays.length).padStart(2, "0")}`;
  const { data: holidays } = await supabase
    .from("holidays")
    .select("date")
    .gte("date", startStr)
    .lte("date", endStr);

  const holidaySet = new Set((holidays || []).map((h: any) => h.date));

  return allDays.filter(d => {
    const day = getDay(d);
    if (day === 0 || day === 6) return false; // weekend
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (holidaySet.has(dateStr)) return false; // holiday
    return true;
  }).length;
}

export function calculateTotal(entry: Partial<SalarySheetEntry>): number {
  const salary = Number(entry.salary) || 0;
  const deductions = Number(entry.deductions) || 0;
  const pending = Number(entry.pending_amount) || 0;
  const tds = Number(entry.tds) || 0;
  const tax = Number(entry.tax) || 0;
  const reimbursements = Number(entry.reimbursements) || 0;
  return Math.max(0, salary - deductions - pending - tds - tax + reimbursements);
}

/**
 * Calculate pro-rated salary based on last working date within a month.
 * Uses total calendar days in the month (30/31) for calculation.
 */
export async function calculateProratedSalary(
  fullSalary: number,
  lastWorkingDate: string,
  month: number,
  year: number
): Promise<number> {
  if (!lastWorkingDate || fullSalary <= 0) return fullSalary;
  const lwd = new Date(lastWorkingDate);
  const lwdMonth = lwd.getMonth() + 1;
  const lwdYear = lwd.getFullYear();
  // Only pro-rate if LWD falls within the sheet month
  if (lwdMonth !== month || lwdYear !== year) return fullSalary;

  const monthStart = startOfMonth(new Date(year, month - 1));
  const totalDaysInMonth = endOfMonth(monthStart).getDate();
  // Calendar days from 1st to LWD (inclusive)
  const daysWorked = lwd.getDate();

  const perDaySalary = fullSalary / totalDaysInMonth;
  return Math.round(perDaySalary * daysWorked * 100) / 100;
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

/**
 * Calculate deduction based on actual working days in the month (not a fixed 26).
 * workingDays should be pre-calculated via getWorkingDaysInMonth().
 */
export function calculateDeduction(salary: number, unpaidLeaves: number, workingDays: number = 26): number {
  if (unpaidLeaves <= 0 || salary <= 0 || workingDays <= 0) return 0;
  const perDaySalary = salary / workingDays;
  return Math.round(perDaySalary * unpaidLeaves * 100) / 100;
}

/**
 * Count calendar days between two dates (inclusive).
 */
function countCalendarDaysBetween(
  fromDate: Date,
  toDate: Date,
): number {
  if (fromDate > toDate) return 0;
  const days = eachDayOfInterval({ start: fromDate, end: toDate });
  return days.length;
}

/**
 * Fetch the effective salary for an employee for a given month/year from salary_history.
 * If there's a mid-month salary change, automatically pro-rates between old and new salary
 * based on total calendar days (30/31) before and after the change date.
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

  const baseSalary = Number(emp?.monthly_salary) || 0;
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));
  const totalDaysInMonth = monthEnd.getDate();
  const monthEndStr = `${year}-${String(month).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`;
  const monthStartStr = `${year}-${String(month).padStart(2, "0")}-01`;

  // ========== Check employment_history for Intern→Full-Time transitions ==========
  const { data: empHistory } = await supabase
    .from("employment_history" as any)
    .select("employment_type, salary, stipend, effective_from, effective_to")
    .eq("employee_id", employeeId)
    .lte("effective_from", monthEndStr)
    .or(`effective_to.is.null,effective_to.gte.${monthStartStr}`)
    .order("effective_from", { ascending: true });

  if (empHistory && empHistory.length > 0) {
    // Use employment_history segments for salary calculation
    const segments = buildSegmentsForMonth(empHistory as any, monthStart, monthEnd);
    if (segments.length > 0) {
      const salary = calculateSegmentedSalary(segments, totalDaysInMonth, 0);
      return {
        salary,
        bank_account: (emp as any)?.bank_account || null,
        ifsc_code: (emp as any)?.ifsc_code || null,
        designation: (emp as any)?.designation || null,
        department: (emp as any)?.department || null,
      };
    }
  }

  // ========== Fallback: salary_history-based calculation ==========
  const { data: allHistory } = await supabase
    .from("salary_history")
    .select("salary, effective_from")
    .eq("employee_id", employeeId)
    .lte("effective_from", monthEndStr)
    .order("effective_from", { ascending: true });

  let salary = baseSalary;

  if (allHistory && allHistory.length > 0) {
    const beforeMonth = allHistory.filter((h: any) => h.effective_from < monthStartStr);
    const duringMonth = allHistory.filter((h: any) => h.effective_from >= monthStartStr && h.effective_from <= monthEndStr);

    const startingSalary = beforeMonth.length > 0
      ? (Number((beforeMonth[beforeMonth.length - 1] as any).salary) ?? baseSalary)
      : (duringMonth.length > 0 ? 0 : baseSalary);

    if (duringMonth.length === 0) {
      salary = startingSalary;
    } else {
      if (totalDaysInMonth <= 0) {
        salary = startingSalary;
      } else {
        type Segment = { salary: number; from: Date; to: Date };
        const segments: Segment[] = [];

        let currentSal = startingSalary;
        let segStart = monthStart;

        for (const entry of duringMonth) {
          const changeDate = new Date((entry as any).effective_from);
          if (changeDate > segStart) {
            const segEnd = new Date(changeDate);
            segEnd.setDate(segEnd.getDate() - 1);
            if (segEnd >= segStart) {
              segments.push({ salary: currentSal, from: segStart, to: segEnd });
            }
          }
          const newSal = Number((entry as any).salary);
          currentSal = isNaN(newSal) ? currentSal : newSal;
          segStart = changeDate;
        }

        segments.push({ salary: currentSal, from: segStart, to: monthEnd });

        let weightedTotal = 0;
        for (const seg of segments) {
          const days = countCalendarDaysBetween(seg.from, seg.to);
          weightedTotal += seg.salary * (days / totalDaysInMonth);
        }

        salary = Math.round(weightedTotal * 100) / 100;
      }
    }
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
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = endOfMonth(monthStart);
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  // Fetch holidays for the month
  const endDateStr = `${year}-${String(month).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`;
  const { data: holidays } = await supabase
    .from("holidays")
    .select("date")
    .gte("date", startDate)
    .lte("date", endDateStr);
  const holidaySet = new Set((holidays || []).map((h: any) => h.date));

  const { data: leaves } = await supabase
    .from("leave_requests")
    .select("leave_type, total_days, start_date, end_date")
    .eq("employee_id", employeeId)
    .eq("status", "approved")
    .lte("start_date", endDate)
    .gte("end_date", startDate);

  let wfh = 0, unpaid = 0, el = 0, sl = 0;

  for (const lr of leaves || []) {
    const lt = (lr.leave_type || "").toLowerCase();
    const isHalfDay = lt.startsWith("half_day");

    // Maternity leave is fully PAID and balance-exempt: it must never be counted
    // as unpaid leave / LOP, so calculateDeduction() never docks salary for it.
    if (lt === "maternity") continue;

    const leaveStart = new Date(lr.start_date);
    const leaveEnd = new Date(lr.end_date);

    // Calculate effective working days in leave range that overlap this month
    const overlapStart = leaveStart > monthStart ? leaveStart : monthStart;
    const overlapEnd = leaveEnd < monthEnd ? leaveEnd : monthEnd;

    if (overlapStart > overlapEnd) continue;

    const daysInRange = eachDayOfInterval({ start: overlapStart, end: overlapEnd });
    // Count only working days (exclude weekends and holidays)
    const workingLeaveDays = daysInRange.filter(d => {
      const day = getDay(d);
      if (day === 0 || day === 6) return false; // weekend
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (holidaySet.has(dateStr)) return false; // holiday
      return true;
    }).length;

    const countDays = isHalfDay ? 0.5 : workingLeaveDays;

    if (lt === "wfh") wfh += countDays;
    else if (lt === "unpaid" || lt === "half_day_unpaid") unpaid += countDays;
    else if (lt === "paid" || lt === "half_day_paid" || lt === "el" || lt === "half_day_el") el += countDays;
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
    let workingDays = 26; // fallback
    if (month && year) {
      try { workingDays = await getWorkingDaysInMonth(month, year); } catch {}
    }

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


      // Check if employee has an exit_date in this month
      let lastWorkingDate: string | null = null;
      const { data: empData } = await supabase
        .from("employees")
        .select("exit_date")
        .eq("id", emp.id)
        .single();
      if (empData?.exit_date) {
        const exitDate = new Date(empData.exit_date);
        if (month && year && exitDate.getMonth() + 1 === month && exitDate.getFullYear() === year) {
          lastWorkingDate = empData.exit_date;
        }
      }

      // Pro-rate salary if LWD is set
      let effectiveSalary = profileData.salary;
      if (lastWorkingDate && month && year) {
        effectiveSalary = await calculateProratedSalary(profileData.salary, lastWorkingDate, month, year);
      }

      const deduction = calculateDeduction(effectiveSalary, attendanceData.unpaid_leaves, workingDays);
      const total = calculateTotal({
        salary: effectiveSalary,
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
        salary: effectiveSalary,
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
        last_working_date: lastWorkingDate,
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
    let addedCount = 0;
    let workingDays = 26;
    try { workingDays = await getWorkingDaysInMonth(month, year); } catch {}

    // --- Step 1: Update existing entries ---
    for (const entry of currentEntries) {
      const [attendanceData, profileData] = await Promise.all([
        calculateAttendanceData(entry.employee_id, month, year),
        getEmployeeProfileData(entry.employee_id, month, year),
      ]);
      const updates: Record<string, any> = {};

      // Refresh financial details from employee master (single source of truth)
      const currentBank = entry.bank_account || null;
      const currentIfsc = entry.ifsc_code || null;
      const masterBank = profileData.bank_account || null;
      const masterIfsc = profileData.ifsc_code || null;
      if (masterBank !== currentBank) updates.bank_account = masterBank;
      if (masterIfsc !== currentIfsc) updates.ifsc_code = masterIfsc;

      // Refresh salary from employee master / salary history
      if (profileData.salary && profileData.salary !== (entry.salary || 0)) {
        const { data: empData } = await supabase
          .from("employees")
          .select("exit_date")
          .eq("id", entry.employee_id)
          .single();
        let effectiveSalary = profileData.salary;
        if (empData?.exit_date) {
          const exitDate = new Date(empData.exit_date);
          if (exitDate.getMonth() + 1 === month && exitDate.getFullYear() === year) {
            effectiveSalary = await calculateProratedSalary(profileData.salary, empData.exit_date, month, year);
          }
        }
        updates.salary = effectiveSalary;
      }

      if (!entry.wfh_days_override) updates.wfh_days = attendanceData.wfh_days;
      if (!entry.unpaid_leaves_override) updates.unpaid_leaves = attendanceData.unpaid_leaves;
      if (!entry.el_leaves_override) updates.el_leaves = attendanceData.el_leaves;
      if (!entry.sl_leaves_override) updates.sl_leaves = attendanceData.sl_leaves;

      const effectiveUnpaid = updates.unpaid_leaves ?? entry.unpaid_leaves;
      const effectiveSalaryForDeduction = updates.salary ?? entry.salary;
      if (!entry.deductions_override) {
        updates.deductions = calculateDeduction(effectiveSalaryForDeduction, effectiveUnpaid, workingDays);
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

    // --- Step 2: Auto-add missing active employees ---
    const existingEmployeeIds = new Set(currentEntries.map(e => e.employee_id));
    const { data: allActiveEmployees } = await supabase
      .from("employees")
      .select("id, name, exit_date, is_active, employment_status")
      .eq("is_active", true)
      .eq("employment_status", "active");

    if (allActiveEmployees) {
      const missingEmployees = allActiveEmployees.filter(e => !existingEmployeeIds.has(e.id));
      
      if (missingEmployees.length > 0) {
        const newRows = [];
        for (const emp of missingEmployees) {
          let attendanceData: AttendanceSummary = { wfh_days: 0, unpaid_leaves: 0, el_leaves: 0, sl_leaves: 0 };
          let profileData: EmployeeProfileData = { salary: 0, bank_account: null, ifsc_code: null, designation: null, department: null };
          try {
            [attendanceData, profileData] = await Promise.all([
              calculateAttendanceData(emp.id, month, year),
              getEmployeeProfileData(emp.id, month, year),
            ]);
          } catch (e) {
            console.error("Failed to calc data for", emp.name, e);
          }

          let effectiveSalary = profileData.salary;
          if (emp.exit_date) {
            const exitDate = new Date(emp.exit_date);
            if (exitDate.getMonth() + 1 === month && exitDate.getFullYear() === year) {
              effectiveSalary = await calculateProratedSalary(profileData.salary, emp.exit_date, month, year);
            }
          }

          const deduction = calculateDeduction(effectiveSalary, attendanceData.unpaid_leaves, workingDays);
          const total = calculateTotal({
            salary: effectiveSalary, deductions: deduction, pending_amount: 0,
            tds: 0, tax: 0, reimbursements: 0,
          });

          newRows.push({
            salary_sheet_id: sheetId,
            employee_id: emp.id,
            employee_name: emp.name,
            salary: effectiveSalary,
            bank_account: profileData.bank_account,
            ifsc_code: profileData.ifsc_code,
            wfh_days: attendanceData.wfh_days,
            unpaid_leaves: attendanceData.unpaid_leaves,
            el_leaves: attendanceData.el_leaves,
            sl_leaves: attendanceData.sl_leaves,
            deductions: deduction,
            pending_amount: 0, tds: 0, tax: 0, reimbursements: 0,
            total,
            wfh_days_override: false,
            unpaid_leaves_override: false,
            el_leaves_override: false,
            sl_leaves_override: false,
            deductions_override: false,
            last_working_date: null,
          });
        }

        if (newRows.length > 0) {
          const { error } = await supabase.from("salary_sheet_entries").insert(newRows as any);
          if (!error) {
            addedCount = newRows.length;
          } else {
            console.error("Failed to auto-add employees:", error);
          }
        }
      }
    }

    if (user) {
      recordAuditLog(user.id, userName || "", {
        action: "SALARY_DATA_REFRESHED",
        details: { month, year, refreshed_entries: updatedCount, added_entries: addedCount, includes: ["attendance", "financial_details", "salary", "auto_add_missing"] },
      });
    }

    await fetchEntries(sheetId);
    const parts = [];
    if (updatedCount > 0) parts.push(`${updatedCount} updated`);
    if (addedCount > 0) parts.push(`${addedCount} new employees added`);
    toast.success(`Data refreshed: ${parts.length > 0 ? parts.join(", ") : "all up to date"}`);
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
