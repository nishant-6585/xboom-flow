import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Lock, Download, UserPlus, Trash2, Loader2, Pencil, RefreshCw } from "lucide-react";
import { SalarySheet, SalarySheetEntry, useSalarySheets } from "@/hooks/useSalarySheets";
import { SalaryAddEmployeesDialog } from "./SalaryAddEmployeesDialog";
import { SalaryEntryEditDialog } from "./SalaryEntryEditDialog";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Props {
  sheet: SalarySheet;
  onBack: () => void;
  onLock: () => Promise<void>;
}

export function SalarySheetView({ sheet, onBack, onLock }: Props) {
  const { entries, fetchEntries, updateEntry, addEmployeesToSheet, deleteEntry, refreshAttendanceData } = useSalarySheets();
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editEntry, setEditEntry] = useState<SalarySheetEntry | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);

  const isLocked = sheet.status === "locked";

  useEffect(() => {
    setLoading(true);
    fetchEntries(sheet.id).then(() => setLoading(false));
  }, [sheet.id, fetchEntries]);

  const handleLock = async () => {
    setLocking(true);
    await onLock();
    setLocking(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshAttendanceData(sheet.id, sheet.month, sheet.year);
    setRefreshing(false);
  };

  const handleEditSave = async (entryId: string, updates: Partial<SalarySheetEntry>) => {
    return await updateEntry(entryId, updates, sheet.id);
  };

  const exportToExcel = () => {
    const data = entries.map((e, idx) => ({
      "SN": idx + 1,
      "Name of Employee": e.employee_name,
      "Salary": e.salary,
      "Bank Account": e.bank_account || "",
      "IFSC Code": e.ifsc_code || "",
      "WFH Days": e.wfh_days,
      "Unpaid Leaves": e.unpaid_leaves,
      "EL": e.el_leaves,
      "SL": e.sl_leaves,
      "Deductions": e.deductions,
      "Pending": e.pending_amount,
      "TDS": e.tds,
      "Tax": e.tax,
      "Reimbursements": e.reimbursements,
      "Total": e.total,
      "Remarks": e.remarks || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Salary ${MONTH_NAMES[sheet.month]} ${sheet.year}`);
    XLSX.writeFile(wb, `Salary_Sheet_${MONTH_NAMES[sheet.month]}_${sheet.year}.xlsx`);
    toast.success("Exported to Excel");
  };

  const fmt = (val: number | null | undefined) =>
    val === null || val === undefined ? "—" : Number(val).toLocaleString("en-IN");

  const fmtCurrency = (val: number | null | undefined) =>
    val === null || val === undefined ? "—" : Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  const LockedTooltipWrapper = ({ children }: { children: React.ReactNode }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>Sheet is locked and cannot be modified.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-lg">
              {MONTH_NAMES[sheet.month]} {sheet.year} — Salary Sheet
            </CardTitle>
            <Badge variant={isLocked ? "secondary" : "outline"} className={isLocked ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : ""}>
              {isLocked ? "Locked" : "Draft"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {!isLocked && (
              <>
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Refreshing..." : "Refresh Attendance"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-1" /> Add Employees
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={exportToExcel}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
            {!isLocked && (
              <Button variant="destructive" size="sm" onClick={() => setLockConfirmOpen(true)} disabled={locking}>
                <Lock className="h-4 w-4 mr-1" /> {locking ? "Locking..." : "Lock Sheet"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No employees added yet. Click "Add Employees" to populate the sheet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">SN</TableHead>
                  <TableHead className="min-w-[140px]">Name</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Bank Account</TableHead>
                  <TableHead>IFSC</TableHead>
                  <TableHead>WFH</TableHead>
                  <TableHead>Unpaid</TableHead>
                  <TableHead>EL</TableHead>
                  <TableHead>SL</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>TDS</TableHead>
                  <TableHead>Tax</TableHead>
                  <TableHead>Reimb.</TableHead>
                  <TableHead className="font-bold">Total</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, idx) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{entry.employee_name}</TableCell>
                    <TableCell>{fmt(entry.salary)}</TableCell>
                    <TableCell>{entry.bank_account || "—"}</TableCell>
                    <TableCell>{entry.ifsc_code || "—"}</TableCell>
                    <TableCell>{fmt(entry.wfh_days)}</TableCell>
                    <TableCell>{fmt(entry.unpaid_leaves)}</TableCell>
                    <TableCell>{fmt(entry.el_leaves)}</TableCell>
                    <TableCell>{fmt(entry.sl_leaves)}</TableCell>
                    <TableCell>{fmt(entry.deductions)}</TableCell>
                    <TableCell>{fmt(entry.pending_amount)}</TableCell>
                    <TableCell>{fmt(entry.tds)}</TableCell>
                    <TableCell>{fmt(entry.tax)}</TableCell>
                    <TableCell>{fmt(entry.reimbursements)}</TableCell>
                    <TableCell className="font-bold text-primary">
                      {fmtCurrency(entry.total)}
                    </TableCell>
                    <TableCell>{entry.remarks || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {isLocked ? (
                          <>
                            <LockedTooltipWrapper>
                              <span><Button variant="ghost" size="icon" className="h-7 w-7" disabled><Pencil className="h-3.5 w-3.5" /></Button></span>
                            </LockedTooltipWrapper>
                            <LockedTooltipWrapper>
                              <span><Button variant="ghost" size="icon" className="h-7 w-7" disabled><Trash2 className="h-3.5 w-3.5" /></Button></span>
                            </LockedTooltipWrapper>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditEntry(entry); setEditOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteEntry(entry.id, sheet.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={2} className="text-right">Grand Total</TableCell>
                  <TableCell>{entries.reduce((s, e) => s + Number(e.salary), 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell colSpan={6}></TableCell>
                  <TableCell>{entries.reduce((s, e) => s + Number(e.deductions), 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell>{entries.reduce((s, e) => s + Number(e.pending_amount), 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell>{entries.reduce((s, e) => s + Number(e.tds), 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell>{entries.reduce((s, e) => s + Number(e.tax), 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell>{entries.reduce((s, e) => s + Number(e.reimbursements), 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-primary">
                    {entries.reduce((s, e) => s + Number(e.total), 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell colSpan={2}></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <SalaryAddEmployeesDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        sheetId={sheet.id}
        existingEmployeeIds={entries.map((e) => e.employee_id)}
        onAdd={async (employees) => {
          const ok = await addEmployeesToSheet(sheet.id, employees, sheet.month, sheet.year);
          if (ok) setAddOpen(false);
        }}
      />

      <SalaryEntryEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        entry={editEntry}
        onSave={handleEditSave}
        month={sheet.month}
        year={sheet.year}
      />

      <AlertDialog open={lockConfirmOpen} onOpenChange={setLockConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lock Salary Sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              Once locked, this salary sheet will become read-only and no further edits will be allowed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              setLockConfirmOpen(false);
              await handleLock();
            }}>
              Yes, Lock Sheet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
