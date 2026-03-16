import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Lock, Download, UserPlus, Trash2, Loader2, Pencil, RefreshCw, FileText, AlertTriangle, CheckCircle, RotateCcw, Send } from "lucide-react";
import { SalarySheet, SalarySheetEntry, SalarySheetStatus, useSalarySheets, calculateEarnings, calculateTotalDeductions, calculateNetPay } from "@/hooks/useSalarySheets";
import { SalaryAddEmployeesDialog } from "./SalaryAddEmployeesDialog";
import { SalaryEntryEditDialog } from "./SalaryEntryEditDialog";
import { PayrollSummaryPanel } from "./PayrollSummaryPanel";
import { BankTransferFileGenerator } from "./BankTransferFileGenerator";
import { downloadPayslipPDF, getPayslipBlob, getPayslipFileName, PayslipData } from "@/lib/payslipGenerator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { recordAuditLog } from "@/lib/auditLog";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Props {
  sheet: SalarySheet;
  onBack: () => void;
  onLock: () => Promise<void>;
  onStatusChange?: () => void;
}

const STATUS_LABELS: Record<SalarySheetStatus, string> = {
  draft: "Draft",
  hr_approved: "HR Approved",
  finance_approved: "Finance Approved",
  locked: "Locked",
};

const STATUS_COLORS: Record<SalarySheetStatus, string> = {
  draft: "",
  hr_approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  finance_approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  locked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function SalarySheetView({ sheet, onBack, onLock, onStatusChange }: Props) {
  const { user, profile, role } = useAuth();
  const { entries, fetchEntries, updateEntry, addEmployeesToSheet, deleteEntry, refreshAttendanceData, validateBeforeLock, submitForFinanceApproval, financeApprove, financeRequestChanges } = useSalarySheets();
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editEntry, setEditEntry] = useState<SalarySheetEntry | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<SalarySheetStatus>(sheet.status);
  const [submitting, setSubmitting] = useState(false);

  const isLocked = currentStatus === "locked";
  const isDraft = currentStatus === "draft";
  const isHrApproved = currentStatus === "hr_approved";
  const isFinanceApproved = currentStatus === "finance_approved";
  const isHROrAdmin = role === "admin" || role === "hr";
  const isFinance = role === "finance" || role === "admin";
  const canEdit = isDraft && isHROrAdmin;

  useEffect(() => {
    setLoading(true);
    fetchEntries(sheet.id).then(() => setLoading(false));
  }, [sheet.id, fetchEntries]);

  const handleLockAttempt = () => {
    const errors = validateBeforeLock(entries);
    if (errors.length > 0) { setValidationErrors(errors); return; }
    setLockConfirmOpen(true);
  };

  const handleLock = async () => {
    setLocking(true);
    await onLock();
    setCurrentStatus("locked");
    setLocking(false);
  };

  const handleSubmitForApproval = async () => {
    const errors = validateBeforeLock(entries);
    if (errors.length > 0) { setValidationErrors(errors); return; }
    setSubmitting(true);
    const ok = await submitForFinanceApproval(sheet.id);
    if (ok) { setCurrentStatus("hr_approved"); onStatusChange?.(); }
    setSubmitting(false);
  };

  const handleFinanceApprove = async () => {
    setSubmitting(true);
    const ok = await financeApprove(sheet.id);
    if (ok) { setCurrentStatus("finance_approved"); onStatusChange?.(); }
    setSubmitting(false);
  };

  const handleFinanceRequestChanges = async () => {
    setSubmitting(true);
    const ok = await financeRequestChanges(sheet.id);
    if (ok) { setCurrentStatus("draft"); onStatusChange?.(); }
    setSubmitting(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAttendanceData(sheet.id, sheet.month, sheet.year);
    setRefreshing(false);
  };

  const handleEditSave = async (entryId: string, updates: Partial<SalarySheetEntry>) => {
    return await updateEntry(entryId, updates, sheet.id);
  };

  const generatePayslip = async (entry: SalarySheetEntry) => {
    setGeneratingId(entry.id);
    try {
      const { data: emp } = await supabase.from("employees").select("designation, department").eq("id", entry.employee_id).single();
      const blob = getPayslipBlob({ entry, month: sheet.month, year: sheet.year, department: (emp as any)?.department || undefined, designation: (emp as any)?.designation || undefined });
      const fileName = `${entry.employee_id}/payslip_${sheet.month}_${sheet.year}.pdf`;
      const { error: uploadError } = await supabase.storage.from("payslips").upload(fileName, blob, { upsert: true, contentType: "application/pdf" });
      if (uploadError) { toast.error(`Failed to upload payslip for ${entry.employee_name}`); return; }
      const { data: urlData } = supabase.storage.from("payslips").getPublicUrl(fileName);
      await supabase.from("employee_payslips").upsert({ employee_id: entry.employee_id, salary_sheet_id: sheet.id, month: sheet.month, year: sheet.year, pdf_url: urlData.publicUrl, generated_by: user?.id, generated_by_name: profile?.name || "Unknown" } as any, { onConflict: "employee_id,salary_sheet_id" });
      if (user) recordAuditLog(user.id, profile?.name || "", { action: "PAYSLIP_GENERATED", details: { employee_id: entry.employee_id, employee_name: entry.employee_name, month: sheet.month, year: sheet.year } });
      toast.success(`Payslip generated for ${entry.employee_name}`);
    } catch (e) { toast.error(`Failed to generate payslip for ${entry.employee_name}`); }
    finally { setGeneratingId(null); }
  };

  const generateAllPayslips = async () => {
    setGeneratingAll(true);
    let count = 0;
    for (const entry of entries) {
      try {
        const { data: emp } = await supabase.from("employees").select("designation, department").eq("id", entry.employee_id).single();
        const blob = getPayslipBlob({ entry, month: sheet.month, year: sheet.year, department: (emp as any)?.department || undefined, designation: (emp as any)?.designation || undefined });
        const fileName = `${entry.employee_id}/payslip_${sheet.month}_${sheet.year}.pdf`;
        await supabase.storage.from("payslips").upload(fileName, blob, { upsert: true, contentType: "application/pdf" });
        const { data: urlData } = supabase.storage.from("payslips").getPublicUrl(fileName);
        await supabase.from("employee_payslips").upsert({ employee_id: entry.employee_id, salary_sheet_id: sheet.id, month: sheet.month, year: sheet.year, pdf_url: urlData.publicUrl, generated_by: user?.id, generated_by_name: profile?.name || "Unknown" } as any, { onConflict: "employee_id,salary_sheet_id" });
        count++;
      } catch (e) { console.error("Failed for", entry.employee_name, e); }
    }
    if (user) recordAuditLog(user.id, profile?.name || "", { action: "PAYSLIP_GENERATED", details: { bulk: true, count, month: sheet.month, year: sheet.year } });
    toast.success(`${count} payslips generated`);
    setGeneratingAll(false);
  };

  const handleDownloadPayslip = async (entry: SalarySheetEntry) => {
    const { data: emp } = await supabase.from("employees").select("designation, department").eq("id", entry.employee_id).single();
    downloadPayslipPDF({ entry, month: sheet.month, year: sheet.year, department: (emp as any)?.department || undefined, designation: (emp as any)?.designation || undefined });
    if (user) recordAuditLog(user.id, profile?.name || "", { action: "PAYSLIP_DOWNLOADED", details: { employee_id: entry.employee_id, month: sheet.month, year: sheet.year } });
  };

  const exportToExcel = () => {
    const data = entries.map((e, idx) => ({
      "SN": idx + 1, "Name of Employee": e.employee_name, "LWD": e.last_working_date || "", "Salary": e.salary, "Bank Account": e.bank_account || "", "IFSC Code": e.ifsc_code || "",
      "WFH Days": e.wfh_days, "Unpaid Leaves": e.unpaid_leaves, "EL": e.el_leaves, "SL": e.sl_leaves,
      "Deductions": e.deductions, "Pending": e.pending_amount, "TDS": e.tds, "Tax": e.tax, "Reimbursements": e.reimbursements,
      "Total Earnings": calculateEarnings(e), "Total Deductions": calculateTotalDeductions(e), "Net Pay": calculateNetPay(e), "Remarks": e.remarks || "",
    }));
    data.push({
      "SN": 0, "Name of Employee": "TOTAL", "LWD": "", "Salary": entries.reduce((s, e) => s + Number(e.salary), 0), "Bank Account": "", "IFSC Code": "",
      "WFH Days": 0, "Unpaid Leaves": 0, "EL": 0, "SL": 0,
      "Deductions": entries.reduce((s, e) => s + Number(e.deductions), 0), "Pending": entries.reduce((s, e) => s + Number(e.pending_amount), 0),
      "TDS": entries.reduce((s, e) => s + Number(e.tds), 0), "Tax": entries.reduce((s, e) => s + Number(e.tax), 0),
      "Reimbursements": entries.reduce((s, e) => s + Number(e.reimbursements), 0),
      "Total Earnings": entries.reduce((s, e) => s + calculateEarnings(e), 0), "Total Deductions": entries.reduce((s, e) => s + calculateTotalDeductions(e), 0),
      "Net Pay": entries.reduce((s, e) => s + calculateNetPay(e), 0), "Remarks": "",
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Salary ${MONTH_NAMES[sheet.month]} ${sheet.year}`);
    XLSX.writeFile(wb, `Salary_Sheet_${MONTH_NAMES[sheet.month]}_${sheet.year}.xlsx`);
    toast.success("Exported to Excel");
  };

  const fmt = (val: number | null | undefined) => val === null || val === undefined ? "—" : Number(val).toLocaleString("en-IN");
  const fmtCurrency = (val: number | null | undefined) => val === null || val === undefined ? "—" : Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
            <CardTitle className="text-lg">{MONTH_NAMES[sheet.month]} {sheet.year} — Salary Sheet</CardTitle>
            <Badge variant={isLocked ? "secondary" : "outline"} className={STATUS_COLORS[currentStatus]}>
              {STATUS_LABELS[currentStatus]}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Refreshing..." : "Refresh Attendance"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-1" /> Add Employees
                </Button>
              </>
            )}
            {isLocked && entries.length > 0 && (
              <Button variant="outline" size="sm" onClick={generateAllPayslips} disabled={generatingAll}>
                <FileText className="h-4 w-4 mr-1" /> {generatingAll ? "Generating..." : "Generate All Payslips"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportToExcel}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>

            {/* Workflow buttons */}
            {isDraft && isHROrAdmin && (
              <Button size="sm" onClick={handleSubmitForApproval} disabled={submitting}>
                <Send className="h-4 w-4 mr-1" /> {submitting ? "Submitting..." : "Submit for Finance Approval"}
              </Button>
            )}
            {isHrApproved && isFinance && (
              <>
                <Button size="sm" onClick={handleFinanceApprove} disabled={submitting}>
                  <CheckCircle className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button variant="outline" size="sm" onClick={handleFinanceRequestChanges} disabled={submitting}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Request Changes
                </Button>
              </>
            )}
            {isFinanceApproved && isHROrAdmin && (
              <Button variant="destructive" size="sm" onClick={handleLockAttempt} disabled={locking}>
                <Lock className="h-4 w-4 mr-1" /> {locking ? "Locking..." : "Lock Sheet"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Payroll Summary */}
        <PayrollSummaryPanel entries={entries} />

        {/* Bank Transfer File Generator - only for locked sheets */}
        {isLocked && entries.length > 0 && (
          <BankTransferFileGenerator sheet={sheet} entries={entries} />
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No employees added yet. Click "Add Employees" to populate the sheet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">SN</TableHead>
                  <TableHead className="min-w-[140px]">Name</TableHead>
                  <TableHead>LWD</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Bank Acc.</TableHead>
                  <TableHead>IFSC</TableHead>
                  <TableHead>WFH</TableHead>
                  <TableHead>Unpaid</TableHead>
                  <TableHead>EL</TableHead>
                  <TableHead>SL</TableHead>
                  <TableHead>Ded.</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>TDS</TableHead>
                  <TableHead>Tax</TableHead>
                  <TableHead>Reimb.</TableHead>
                  <TableHead className="text-emerald-600 dark:text-emerald-400">Earnings</TableHead>
                  <TableHead className="text-red-600 dark:text-red-400">Ded. Total</TableHead>
                  <TableHead className="font-bold text-primary">Net Pay</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, idx) => {
                  const earnings = calculateEarnings(entry);
                  const totalDed = calculateTotalDeductions(entry);
                  const netPay = calculateNetPay(entry);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{entry.employee_name}</TableCell>
                      <TableCell className="text-xs">{entry.last_working_date ? new Date(entry.last_working_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}</TableCell>
                      <TableCell>{fmt(entry.salary)}</TableCell>
                      <TableCell className="text-xs">{entry.bank_account || "—"}</TableCell>
                      <TableCell className="text-xs">{entry.ifsc_code || "—"}</TableCell>
                      <TableCell>{fmt(entry.wfh_days)}</TableCell>
                      <TableCell>{fmt(entry.unpaid_leaves)}</TableCell>
                      <TableCell>{fmt(entry.el_leaves)}</TableCell>
                      <TableCell>{fmt(entry.sl_leaves)}</TableCell>
                      <TableCell>{fmt(entry.deductions)}</TableCell>
                      <TableCell>{fmt(entry.pending_amount)}</TableCell>
                      <TableCell>{fmt(entry.tds)}</TableCell>
                      <TableCell>{fmt(entry.tax)}</TableCell>
                      <TableCell>{fmt(entry.reimbursements)}</TableCell>
                      <TableCell className="text-emerald-600 dark:text-emerald-400 font-medium">{fmtCurrency(earnings)}</TableCell>
                      <TableCell className="text-red-600 dark:text-red-400 font-medium">{fmtCurrency(totalDed)}</TableCell>
                      <TableCell className="font-bold text-primary">{fmtCurrency(netPay)}</TableCell>
                      <TableCell className="text-xs">{entry.remarks || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {isLocked ? (
                            <>
                              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownloadPayslip(entry)}><Download className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent>Download Payslip</TooltipContent></Tooltip></TooltipProvider>
                              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => generatePayslip(entry)} disabled={generatingId === entry.id}>
                                  <FileText className={`h-3.5 w-3.5 ${generatingId === entry.id ? "animate-pulse" : ""}`} />
                                </Button>
                              </TooltipTrigger><TooltipContent>Generate Payslip</TooltipContent></Tooltip></TooltipProvider>
                            </>
                          ) : canEdit ? (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditEntry(entry); setEditOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteEntry(entry.id, sheet.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={2} className="text-right">Grand Total</TableCell>
                  <TableCell>{entries.reduce((s, e) => s + Number(e.salary), 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell colSpan={6}></TableCell>
                  <TableCell>{entries.reduce((s, e) => s + Number(e.deductions), 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell>{entries.reduce((s, e) => s + Number(e.pending_amount), 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell>{entries.reduce((s, e) => s + Number(e.tds), 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell>{entries.reduce((s, e) => s + Number(e.tax), 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell>{entries.reduce((s, e) => s + Number(e.reimbursements), 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-emerald-600 dark:text-emerald-400">{entries.reduce((s, e) => s + calculateEarnings(e), 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-red-600 dark:text-red-400">{entries.reduce((s, e) => s + calculateTotalDeductions(e), 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-primary">{entries.reduce((s, e) => s + calculateNetPay(e), 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell colSpan={2}></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <SalaryAddEmployeesDialog open={addOpen} onOpenChange={setAddOpen} sheetId={sheet.id} existingEmployeeIds={entries.map((e) => e.employee_id)}
        onAdd={async (employees) => { const ok = await addEmployeesToSheet(sheet.id, employees, sheet.month, sheet.year); if (ok) setAddOpen(false); }} />

      <SalaryEntryEditDialog open={editOpen} onOpenChange={setEditOpen} entry={editEntry} onSave={handleEditSave} month={sheet.month} year={sheet.year} />

      <AlertDialog open={lockConfirmOpen} onOpenChange={setLockConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lock Salary Sheet?</AlertDialogTitle>
            <AlertDialogDescription>Once locked, this salary sheet will become read-only and no further edits will be allowed. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { setLockConfirmOpen(false); await handleLock(); }}>Yes, Lock Sheet</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={validationErrors.length > 0} onOpenChange={(open) => { if (!open) setValidationErrors([]); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> Validation Errors</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Please fix the following issues:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-destructive">{validationErrors.map((err, i) => <li key={i}>{err}</li>)}</ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Close</AlertDialogCancel></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
