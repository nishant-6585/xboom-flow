import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Lock, Download, UserPlus, Trash2, Loader2 } from "lucide-react";
import { SalarySheet, SalarySheetEntry, useSalarySheets, calculateTotal } from "@/hooks/useSalarySheets";
import { SalaryAddEmployeesDialog } from "./SalaryAddEmployeesDialog";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const NUMERIC_FIELDS: (keyof SalarySheetEntry)[] = [
  "salary", "wfh_days", "unpaid_leaves", "el_leaves", "sl_leaves",
  "deductions", "pending_amount", "tds", "tax", "reimbursements",
];

interface Props {
  sheet: SalarySheet;
  onBack: () => void;
  onLock: () => Promise<void>;
}

export function SalarySheetView({ sheet, onBack, onLock }: Props) {
  const { entries, fetchEntries, updateEntry, addEmployeesToSheet, deleteEntry } = useSalarySheets();
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [locking, setLocking] = useState(false);

  const isLocked = sheet.status === "locked";

  useEffect(() => {
    setLoading(true);
    fetchEntries(sheet.id).then(() => setLoading(false));
  }, [sheet.id, fetchEntries]);

  const startEdit = (entry: SalarySheetEntry, field: keyof SalarySheetEntry) => {
    if (isLocked) return;
    setEditingCell({ id: entry.id, field });
    setEditValue(String(entry[field] ?? ""));
  };

  const saveEdit = async (entry: SalarySheetEntry) => {
    if (!editingCell) return;
    const field = editingCell.field as keyof SalarySheetEntry;
    let newValue: any = editValue;

    if (NUMERIC_FIELDS.includes(field)) {
      const num = parseFloat(editValue);
      if (isNaN(num) || num < 0) {
        toast.error("Please enter a valid non-negative number");
        return;
      }
      newValue = num;
    }

    const updatedEntry = { ...entry, [field]: newValue };
    const total = calculateTotal(updatedEntry);
    await updateEntry(entry.id, { [field]: newValue, total } as any, sheet.id);
    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, entry: SalarySheetEntry) => {
    if (e.key === "Enter") saveEdit(entry);
    if (e.key === "Escape") setEditingCell(null);
  };

  const handleLock = async () => {
    setLocking(true);
    await onLock();
    setLocking(false);
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

  const renderCell = (entry: SalarySheetEntry, field: keyof SalarySheetEntry) => {
    const isEditing = editingCell?.id === entry.id && editingCell?.field === field;
    if (isEditing) {
      return (
        <Input
          className="h-8 w-24 text-xs"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => saveEdit(entry)}
          onKeyDown={(e) => handleKeyDown(e, entry)}
          autoFocus
        />
      );
    }
    const val = entry[field];
    return (
      <span
        className={!isLocked ? "cursor-pointer hover:bg-muted px-1 py-0.5 rounded" : ""}
        onClick={() => !isLocked && startEdit(entry, field)}
      >
        {val === null || val === undefined || val === "" ? "—" : String(val)}
      </span>
    );
  };

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
              <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                <UserPlus className="h-4 w-4 mr-1" /> Add Employees
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportToExcel}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
            {!isLocked && (
              <Button variant="destructive" size="sm" onClick={handleLock} disabled={locking}>
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
                  {!isLocked && <TableHead className="w-10"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, idx) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{entry.employee_name}</TableCell>
                    <TableCell>{renderCell(entry, "salary")}</TableCell>
                    <TableCell>{renderCell(entry, "bank_account")}</TableCell>
                    <TableCell>{renderCell(entry, "ifsc_code")}</TableCell>
                    <TableCell>{renderCell(entry, "wfh_days")}</TableCell>
                    <TableCell>{renderCell(entry, "unpaid_leaves")}</TableCell>
                    <TableCell>{renderCell(entry, "el_leaves")}</TableCell>
                    <TableCell>{renderCell(entry, "sl_leaves")}</TableCell>
                    <TableCell>{renderCell(entry, "deductions")}</TableCell>
                    <TableCell>{renderCell(entry, "pending_amount")}</TableCell>
                    <TableCell>{renderCell(entry, "tds")}</TableCell>
                    <TableCell>{renderCell(entry, "tax")}</TableCell>
                    <TableCell>{renderCell(entry, "reimbursements")}</TableCell>
                    <TableCell className="font-bold text-primary">
                      {entry.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>{renderCell(entry, "remarks")}</TableCell>
                    {!isLocked && (
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteEntry(entry.id, sheet.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
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
                  <TableCell colSpan={isLocked ? 1 : 2}></TableCell>
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
          const ok = await addEmployeesToSheet(sheet.id, employees);
          if (ok) setAddOpen(false);
        }}
      />
    </Card>
  );
}
