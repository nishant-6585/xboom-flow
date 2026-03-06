import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SalarySheetEntry, calculateTotal } from "@/hooks/useSalarySheets";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: SalarySheetEntry | null;
  onSave: (entryId: string, updates: Partial<SalarySheetEntry>) => Promise<boolean>;
}

const CURRENCY_FIELDS = ["salary", "deductions", "pending_amount", "tds", "tax", "reimbursements"] as const;
const INTEGER_FIELDS = ["wfh_days", "unpaid_leaves", "el_leaves", "sl_leaves"] as const;

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

export function SalaryEntryEditDialog({ open, onOpenChange, entry, onSave }: Props) {
  const [form, setForm] = useState<FormData>(initForm(null));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && entry) setForm(initForm(entry));
  }, [open, entry]);

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
    // Allow empty or valid numeric input
    if (value === "" || value === "-") { setField(field, value); return; }
    if (intOnly) {
      if (/^\d*$/.test(value)) setField(field, value);
    } else {
      if (/^\d*\.?\d*$/.test(value)) setField(field, value);
    }
  };

  const handleSave = async () => {
    if (!entry) return;
    if (isNegative) return;

    setSaving(true);
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
    };

    const ok = await onSave(entry.id, updates);
    setSaving(false);
    if (ok) onOpenChange(false);
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

              {/* Integer leave fields */}
              <div>
                <Label htmlFor="wfh_days">WFH Days</Label>
                <Input id="wfh_days" value={form.wfh_days} onChange={e => handleNumericChange("wfh_days", e.target.value, true)} />
              </div>
              <div>
                <Label htmlFor="unpaid_leaves">Unpaid Leaves</Label>
                <Input id="unpaid_leaves" value={form.unpaid_leaves} onChange={e => handleNumericChange("unpaid_leaves", e.target.value, true)} />
              </div>
              <div>
                <Label htmlFor="el_leaves">EL Leaves</Label>
                <Input id="el_leaves" value={form.el_leaves} onChange={e => handleNumericChange("el_leaves", e.target.value, true)} />
              </div>
              <div>
                <Label htmlFor="sl_leaves">SL Leaves</Label>
                <Input id="sl_leaves" value={form.sl_leaves} onChange={e => handleNumericChange("sl_leaves", e.target.value, true)} />
              </div>

              {/* Deduction fields */}
              <div>
                <Label htmlFor="deductions">Deductions (₹)</Label>
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
