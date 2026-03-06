import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SalarySheetEntry, calculateTotal, calculateDeduction, calculateAttendanceData, AttendanceSummary } from "@/hooks/useSalarySheets";
import { AlertTriangle, Calendar, Info } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: SalarySheetEntry | null;
  onSave: (entryId: string, updates: Partial<SalarySheetEntry>) => Promise<boolean>;
  month: number;
  year: number;
}

type FormData = {
  salary: string;
  bank_account: string;
  ifsc_code: string;
  wfh_days: string;
  unpaid_leaves: string;
  el_leaves: string;
  sl_leaves: string;
  deductions: string;
  pending_amount: string;
  tds: string;
  tax: string;
  reimbursements: string;
  remarks: string;
};

function initForm(entry: SalarySheetEntry | null): FormData {
  if (!entry) return {
    salary: "0", bank_account: "", ifsc_code: "",
    wfh_days: "0", unpaid_leaves: "0", el_leaves: "0", sl_leaves: "0",
    deductions: "0", pending_amount: "0", tds: "0", tax: "0", reimbursements: "0",
    remarks: "",
  };
  return {
    salary: String(entry.salary ?? 0),
    bank_account: entry.bank_account ?? "",
    ifsc_code: entry.ifsc_code ?? "",
    wfh_days: String(entry.wfh_days ?? 0),
    unpaid_leaves: String(entry.unpaid_leaves ?? 0),
    el_leaves: String(entry.el_leaves ?? 0),
    sl_leaves: String(entry.sl_leaves ?? 0),
    deductions: String(entry.deductions ?? 0),
    pending_amount: String(entry.pending_amount ?? 0),
    tds: String(entry.tds ?? 0),
    tax: String(entry.tax ?? 0),
    reimbursements: String(entry.reimbursements ?? 0),
    remarks: entry.remarks ?? "",
  };
}

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function SalaryEntryEditDialog({ open, onOpenChange, entry, onSave, month, year }: Props) {
  const [form, setForm] = useState<FormData>(initForm(null));
  const [saving, setSaving] = useState(false);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    if (open && entry) {
      setForm(initForm(entry));
      // Fetch attendance summary
      setLoadingSummary(true);
      calculateAttendanceData(entry.employee_id, month, year)
        .then(setAttendanceSummary)
        .catch(() => setAttendanceSummary(null))
        .finally(() => setLoadingSummary(false));
    }
  }, [open, entry, month, year]);

  const isFirstEntry = entry && entry.salary === 0 && entry.total === 0;

  const liveTotal = useMemo(() => calculateTotal({
    salary: parseFloat(form.salary) || 0,
    deductions: parseFloat(form.deductions) || 0,
    pending_amount: parseFloat(form.pending_amount) || 0,
    tds: parseFloat(form.tds) || 0,
    tax: parseFloat(form.tax) || 0,
    reimbursements: parseFloat(form.reimbursements) || 0,
  }), [form.salary, form.deductions, form.pending_amount, form.tds, form.tax, form.reimbursements]);

  const rawTotal = (parseFloat(form.salary) || 0)
    - (parseFloat(form.deductions) || 0)
    - (parseFloat(form.pending_amount) || 0)
    - (parseFloat(form.tds) || 0)
    - (parseFloat(form.tax) || 0)
    + (parseFloat(form.reimbursements) || 0);

  const isNegative = rawTotal < 0;

  const setField = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleNumericChange = (field: keyof FormData, value: string, intOnly = false) => {
    if (value === "" || value === "-") { setField(field, value); return; }
    if (intOnly) {
      if (/^\d*$/.test(value)) setField(field, value);
    } else {
      if (/^\d*\.?\d*$/.test(value)) setField(field, value);
    }
  };

  // Determine override status for each field
  const getOverrideInfo = (field: "wfh_days" | "unpaid_leaves" | "el_leaves" | "sl_leaves" | "deductions") => {
    if (!entry) return null;
    const overrideKey = `${field}_override` as keyof SalarySheetEntry;
    const isOverridden = entry[overrideKey] as boolean;
    return isOverridden;
  };

  // Check if current form value differs from auto-calculated
  const isFieldModified = (field: "wfh_days" | "unpaid_leaves" | "el_leaves" | "sl_leaves", formValue: string) => {
    if (!attendanceSummary) return false;
    const autoValue = attendanceSummary[field];
    const currentValue = parseFloat(formValue) || 0;
    return currentValue !== autoValue;
  };

  const handleSave = async () => {
    if (!entry) return;
    if (isNegative) return;

    setSaving(true);

    // Determine override flags
    const wfh_days_override = entry.wfh_days_override || isFieldModified("wfh_days", form.wfh_days);
    const unpaid_leaves_override = entry.unpaid_leaves_override || isFieldModified("unpaid_leaves", form.unpaid_leaves);
    const el_leaves_override = entry.el_leaves_override || isFieldModified("el_leaves", form.el_leaves);
    const sl_leaves_override = entry.sl_leaves_override || isFieldModified("sl_leaves", form.sl_leaves);

    // Deduction override: if HR changed it manually from the auto-calc value
    const autoDeduction = calculateDeduction(parseFloat(form.salary) || 0, parseInt(form.unpaid_leaves) || 0);
    const manualDeduction = parseFloat(form.deductions) || 0;
    const deductions_override = entry.deductions_override || Math.abs(manualDeduction - autoDeduction) > 0.01;

    const updates: Partial<SalarySheetEntry> = {
      salary: parseFloat(form.salary) || 0,
      bank_account: form.bank_account || null,
      ifsc_code: form.ifsc_code || null,
      wfh_days: parseInt(form.wfh_days) || 0,
      unpaid_leaves: parseInt(form.unpaid_leaves) || 0,
      el_leaves: parseInt(form.el_leaves) || 0,
      sl_leaves: parseInt(form.sl_leaves) || 0,
      deductions: parseFloat(form.deductions) || 0,
      pending_amount: parseFloat(form.pending_amount) || 0,
      tds: parseFloat(form.tds) || 0,
      tax: parseFloat(form.tax) || 0,
      reimbursements: parseFloat(form.reimbursements) || 0,
      remarks: form.remarks || null,
      wfh_days_override,
      unpaid_leaves_override,
      el_leaves_override,
      sl_leaves_override,
      deductions_override,
    };

    const ok = await onSave(entry.id, updates);
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  const OverrideLabel = ({ field }: { field: "wfh_days" | "unpaid_leaves" | "el_leaves" | "sl_leaves" | "deductions" }) => {
    const isOverridden = getOverrideInfo(field);
    if (isOverridden === null) return null;
    return (
      <span className={`text-[10px] font-medium ${isOverridden ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
        {isOverridden ? "Manual override" : "Auto calculated"}
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Salary Details</DialogTitle>
        </DialogHeader>

        {entry && (
          <div className="space-y-4">
            {/* Employee name read-only */}
            <div>
              <Label className="text-muted-foreground">Employee Name</Label>
              <div className="mt-1 font-medium text-foreground">{entry.employee_name}</div>
            </div>

            {/* Attendance Summary */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Attendance Summary — {MONTH_NAMES[month]} {year}
              </div>
              {loadingSummary ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : attendanceSummary ? (
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="rounded bg-background p-2 text-center">
                    <div className="font-bold text-foreground">{attendanceSummary.wfh_days}</div>
                    <div className="text-muted-foreground">WFH</div>
                  </div>
                  <div className="rounded bg-background p-2 text-center">
                    <div className="font-bold text-foreground">{attendanceSummary.el_leaves}</div>
                    <div className="text-muted-foreground">EL</div>
                  </div>
                  <div className="rounded bg-background p-2 text-center">
                    <div className="font-bold text-foreground">{attendanceSummary.sl_leaves}</div>
                    <div className="text-muted-foreground">SL</div>
                  </div>
                  <div className="rounded bg-background p-2 text-center">
                    <div className="font-bold text-foreground">{attendanceSummary.unpaid_leaves}</div>
                    <div className="text-muted-foreground">Unpaid</div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No attendance data available</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Currency fields */}
              <div>
                <Label htmlFor="salary">Salary (₹)</Label>
                <Input id="salary" value={form.salary} onChange={e => handleNumericChange("salary", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="bank_account">Bank Account</Label>
                <Input id="bank_account" value={form.bank_account} onChange={e => setField("bank_account", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ifsc_code">IFSC Code</Label>
                <Input id="ifsc_code" value={form.ifsc_code} onChange={e => setField("ifsc_code", e.target.value)} />
              </div>

              {/* Integer leave fields with override labels */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="wfh_days">WFH Days</Label>
                  <OverrideLabel field="wfh_days" />
                </div>
                <Input id="wfh_days" value={form.wfh_days} onChange={e => handleNumericChange("wfh_days", e.target.value, true)} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="unpaid_leaves">Unpaid Leaves</Label>
                  <OverrideLabel field="unpaid_leaves" />
                </div>
                <Input id="unpaid_leaves" value={form.unpaid_leaves} onChange={e => handleNumericChange("unpaid_leaves", e.target.value, true)} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="el_leaves">EL Leaves</Label>
                  <OverrideLabel field="el_leaves" />
                </div>
                <Input id="el_leaves" value={form.el_leaves} onChange={e => handleNumericChange("el_leaves", e.target.value, true)} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="sl_leaves">SL Leaves</Label>
                  <OverrideLabel field="sl_leaves" />
                </div>
                <Input id="sl_leaves" value={form.sl_leaves} onChange={e => handleNumericChange("sl_leaves", e.target.value, true)} />
              </div>

              {/* Deduction fields */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="deductions">Deductions (₹)</Label>
                  <OverrideLabel field="deductions" />
                </div>
                <Input id="deductions" value={form.deductions} onChange={e => handleNumericChange("deductions", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pending_amount">Pending Amount (₹)</Label>
                <Input id="pending_amount" value={form.pending_amount} onChange={e => handleNumericChange("pending_amount", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="tds">TDS (₹)</Label>
                <Input id="tds" value={form.tds} onChange={e => handleNumericChange("tds", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="tax">Tax (₹)</Label>
                <Input id="tax" value={form.tax} onChange={e => handleNumericChange("tax", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="reimbursements">Reimbursements (₹)</Label>
                <Input id="reimbursements" value={form.reimbursements} onChange={e => handleNumericChange("reimbursements", e.target.value)} />
              </div>
            </div>

            {/* Remarks */}
            <div>
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea id="remarks" value={form.remarks} onChange={e => setField("remarks", e.target.value)} rows={2} className="mt-1" />
            </div>

            {/* Live total */}
            <div className="rounded-lg border bg-muted/50 p-3 flex items-center justify-between">
              <span className="font-medium">Total</span>
              <span className={`text-lg font-bold ${isNegative ? "text-destructive" : "text-primary"}`}>
                ₹{liveTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {isNegative && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Total cannot be negative. Please adjust deductions.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || isNegative}>
            {saving ? "Saving..." : isFirstEntry ? "Save Details" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
