import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { recordAuditLog } from "@/lib/auditLog";

export interface SalarySheet {
  id: string;
  month: number;
  year: number;
  created_by: string;
  created_by_name: string;
  status: "draft" | "locked";
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
    recordAuditLog(user.id, userName || "", { action: "salary_sheet_created", details: { month, year } });
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

  const addEmployeesToSheet = useCallback(async (sheetId: string, employees: { id: string; name: string }[]) => {
    const rows = employees.map((emp) => ({
      salary_sheet_id: sheetId,
      employee_id: emp.id,
      employee_name: emp.name,
      salary: 0,
      wfh_days: 0,
      unpaid_leaves: 0,
      el_leaves: 0,
      sl_leaves: 0,
      deductions: 0,
      pending_amount: 0,
      tds: 0,
      tax: 0,
      reimbursements: 0,
      total: 0,
    }));
    const { error } = await supabase.from("salary_sheet_entries").insert(rows as any);
    if (error) {
      if (error.code === "23505") {
        toast.error("Some employees are already in this sheet");
      } else {
        toast.error("Failed to add employees");
      }
      return false;
    }
    toast.success(`${employees.length} employees added`);
    await fetchEntries(sheetId);
    return true;
  }, [fetchEntries]);

  const updateEntry = useCallback(async (entryId: string, updates: Partial<SalarySheetEntry>, sheetId: string) => {
    // Recalculate total
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
    recordAuditLog(user.id, userName || "", { action: "salary_sheet_locked", details: { sheetId } });
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
  };
}
