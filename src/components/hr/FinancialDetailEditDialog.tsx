import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Pencil, Save, X, History, Wallet, Building2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { recordAuditLog } from "@/lib/auditLog";

interface FinancialEmployee {
  id: string;
  employee_number: string | null;
  name: string;
  department: string;
  designation: string | null;
  bank_account: string | null;
  ifsc_code: string | null;
  pan_number: string | null;
  monthly_salary: number | null;
  tax_regime: string | null;
}

interface SalaryHistoryEntry {
  id: string;
  effective_from: string;
  salary: number;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

interface FinancialDetailEditDialogProps {
  employeeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (updatedEmployee: FinancialEmployee) => void;
  canEdit: boolean;
}

const validateBank = (val: string) => /^\d{9,18}$/.test(val);
const validateIfsc = (val: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(val.toUpperCase());

export function FinancialDetailEditDialog({ employeeId, open, onOpenChange, onSaved, canEdit }: FinancialDetailEditDialogProps) {
  const { user, profile } = useAuth();
  const [employee, setEmployee] = useState<FinancialEmployee | null>(null);
  const [history, setHistory] = useState<SalaryHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [formSalary, setFormSalary] = useState("");
  const [formBank, setFormBank] = useState("");
  const [formIfsc, setFormIfsc] = useState("");
  const [formPan, setFormPan] = useState("");
  const [formTaxRegime, setFormTaxRegime] = useState("");
  const [salaryEffective, setSalaryEffective] = useState("");
  const [salaryReason, setSalaryReason] = useState("");

  const loadEmployee = useCallback(async (empId: string) => {
    setLoading(true);
    const [{ data: emp }, { data: hist }] = await Promise.all([
      supabase
        .from("employees")
        .select("id, employee_number, name, department, designation, bank_account, ifsc_code, pan_number, monthly_salary, tax_regime")
        .eq("id", empId)
        .single(),
      supabase
        .from("salary_history")
        .select("*")
        .eq("employee_id", empId)
        .order("effective_from", { ascending: false }),
    ]);

    const empData = emp as unknown as FinancialEmployee;
    setEmployee(empData);
    setHistory((hist as unknown as SalaryHistoryEntry[]) || []);
    resetForm(empData);
    setLoading(false);
  }, []);

  const resetForm = (emp: FinancialEmployee | null) => {
    setFormSalary(String(emp?.monthly_salary ?? ""));
    setFormBank(emp?.bank_account || "");
    setFormIfsc(emp?.ifsc_code || "");
    setFormPan(emp?.pan_number || "");
    setFormTaxRegime(emp?.tax_regime || "");
    setSalaryEffective(format(new Date(), "yyyy-MM-dd"));
    setSalaryReason("");
    setHasChanges(false);
  };

  useEffect(() => {
    if (open && employeeId) {
      setEditing(false);
      loadEmployee(employeeId);
    }
    if (!open) {
      setEditing(false);
      setHasChanges(false);
    }
  }, [open, employeeId, loadEmployee]);

  // Track changes
  useEffect(() => {
    if (!employee || !editing) return;
    const changed =
      formSalary !== String(employee.monthly_salary ?? "") ||
      formBank !== (employee.bank_account || "") ||
      formIfsc !== (employee.ifsc_code || "") ||
      formPan !== (employee.pan_number || "") ||
      formTaxRegime !== (employee.tax_regime || "");
    setHasChanges(changed);
  }, [formSalary, formBank, formIfsc, formPan, formTaxRegime, employee, editing]);

  const handleClose = (openState: boolean) => {
    if (!openState && hasChanges && editing) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(openState);
  };

  const handleCancelEdit = () => {
    if (hasChanges) {
      setConfirmDiscard(true);
    } else {
      setEditing(false);
      resetForm(employee);
    }
  };

  const handleDiscardConfirm = () => {
    setConfirmDiscard(false);
    setEditing(false);
    resetForm(employee);
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (!user || !employee) return;
    setSaving(true);

    const newSalary = parseFloat(formSalary) || 0;
    if (newSalary < 0) { toast.error("Salary cannot be negative"); setSaving(false); return; }
    if (formBank && !validateBank(formBank)) { toast.error("Account number must be 9-18 digits"); setSaving(false); return; }
    if (formIfsc && !validateIfsc(formIfsc)) { toast.error("IFSC format: 4 letters + 0 + 6 alphanumeric"); setSaving(false); return; }
    if (formPan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(formPan.toUpperCase())) { toast.error("PAN format: ABCDE1234F"); setSaving(false); return; }

    const updates: Record<string, any> = {};
    const oldSalary = employee.monthly_salary || 0;
    const salaryChanged = Math.abs(newSalary - oldSalary) > 0.01;

    if (salaryChanged) {
      if (!salaryEffective) { toast.error("Please set salary effective date"); setSaving(false); return; }
      updates.monthly_salary = newSalary;

      await supabase.from("salary_history").insert({
        employee_id: employee.id,
        effective_from: salaryEffective,
        salary: newSalary,
        notes: salaryReason || `Changed from ₹${oldSalary.toLocaleString("en-IN")} to ₹${newSalary.toLocaleString("en-IN")}`,
        created_by: user.id,
        created_by_name: profile?.name || "Unknown",
      } as any);

      recordAuditLog(user.id, profile?.name || "", {
        action: "SALARY_UPDATED",
        targetUserId: employee.id,
        details: { employee_name: employee.name, old_salary: oldSalary, new_salary: newSalary, effective_from: salaryEffective },
      });
    }

    if (formBank !== (employee.bank_account || "")) {
      updates.bank_account = formBank || null;
      recordAuditLog(user.id, profile?.name || "", {
        action: "BANK_DETAILS_UPDATED",
        targetUserId: employee.id,
        details: { employee_name: employee.name, field: "bank_account" },
      });
    }
    if (formIfsc.toUpperCase() !== (employee.ifsc_code || "")) updates.ifsc_code = formIfsc.toUpperCase() || null;
    if (formPan.toUpperCase() !== (employee.pan_number || "")) updates.pan_number = formPan.toUpperCase() || null;
    if (formTaxRegime !== (employee.tax_regime || "")) updates.tax_regime = formTaxRegime || null;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from("employees").update(updates as any).eq("id", employee.id);
      if (error) { toast.error("Failed to save changes"); setSaving(false); return; }
    }

    toast.success("Financial details updated");

    // Build updated employee for optimistic row update
    const updatedEmployee: FinancialEmployee = {
      ...employee,
      monthly_salary: newSalary,
      bank_account: formBank || null,
      ifsc_code: formIfsc.toUpperCase() || null,
      pan_number: formPan.toUpperCase() || null,
      tax_regime: formTaxRegime || null,
    };

    setEmployee(updatedEmployee);
    setEditing(false);
    setHasChanges(false);
    setSaving(false);
    onSaved?.(updatedEmployee);
    onOpenChange(false);
  };

  const hasNoData = employee && !employee.bank_account && !employee.ifsc_code && !employee.pan_number && (!employee.monthly_salary || employee.monthly_salary === 0);

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto pr-14">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              {employee ? `${employee.name} — Financial Details` : "Financial Details"}
            </DialogTitle>
            {employee && (
              <p className="text-sm text-muted-foreground">
                {employee.department}{employee.designation ? ` • ${employee.designation}` : ""}
                {employee.employee_number ? ` • ID: ${employee.employee_number}` : ""}
              </p>
            )}
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !employee ? (
            <p className="text-center py-8 text-muted-foreground">Employee not found</p>
          ) : hasNoData && !editing ? (
            <div className="text-center py-8 space-y-3">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground font-medium">No financial details available</p>
              {canEdit && (
                <Button onClick={() => setEditing(true)} variant="outline">
                  <Plus className="h-4 w-4 mr-1" /> Add Details
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Financial Fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Monthly Salary (₹)</Label>
                    {editing ? (
                      <Input
                        value={formSalary}
                        onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setFormSalary(e.target.value); }}
                        placeholder="0"
                      />
                    ) : (
                      <p className="text-lg font-bold mt-1">
                        {employee.monthly_salary != null ? `₹${Number(employee.monthly_salary).toLocaleString("en-IN")}` : "—"}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Bank Account Number</Label>
                    {editing ? (
                      <>
                        <Input
                          value={formBank}
                          onChange={e => { if (/^\d*$/.test(e.target.value)) setFormBank(e.target.value); }}
                          maxLength={18}
                          placeholder="9-18 digit account number"
                        />
                        {formBank && !validateBank(formBank) && <p className="text-xs text-destructive mt-1">Must be 9-18 digits</p>}
                      </>
                    ) : (
                      <p className="font-mono font-medium mt-1">{employee.bank_account || "—"}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">IFSC Code</Label>
                    {editing ? (
                      <>
                        <Input
                          value={formIfsc}
                          onChange={e => setFormIfsc(e.target.value.toUpperCase())}
                          maxLength={11}
                          placeholder="e.g. SBIN0001234"
                        />
                        {formIfsc && !validateIfsc(formIfsc) && <p className="text-xs text-destructive mt-1">Format: 4 letters + 0 + 6 chars</p>}
                      </>
                    ) : (
                      <p className="font-mono font-medium mt-1">{employee.ifsc_code || "—"}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">PAN Number</Label>
                    {editing ? (
                      <>
                        <Input
                          value={formPan}
                          onChange={e => setFormPan(e.target.value.toUpperCase())}
                          maxLength={10}
                          placeholder="e.g. ABCDE1234F"
                        />
                        {formPan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(formPan.toUpperCase()) && <p className="text-xs text-destructive mt-1">Format: ABCDE1234F</p>}
                      </>
                    ) : (
                      <p className="font-mono font-medium mt-1">{employee.pan_number || "—"}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Tax Regime</Label>
                    {editing ? (
                      <Select value={formTaxRegime} onValueChange={setFormTaxRegime}>
                        <SelectTrigger><SelectValue placeholder="Select regime" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Old Regime">Old Regime</SelectItem>
                          <SelectItem value="New Regime">New Regime</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-medium mt-1">
                        {employee.tax_regime ? (
                          <Badge variant="outline" className="text-xs capitalize">{employee.tax_regime}</Badge>
                        ) : "—"}
                      </p>
                    )}
                  </div>
                </div>

                {/* Salary change fields */}
                {editing && Math.abs((parseFloat(formSalary) || 0) - (employee.monthly_salary || 0)) > 0.01 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-3">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Salary change detected — this will create a salary history record
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="popup-sal-effective">Effective From</Label>
                        <Input id="popup-sal-effective" type="date" value={salaryEffective} onChange={e => setSalaryEffective(e.target.value)} />
                      </div>
                      <div>
                        <Label htmlFor="popup-sal-reason">Reason (optional)</Label>
                        <Input id="popup-sal-reason" value={salaryReason} onChange={e => setSalaryReason(e.target.value)} placeholder="e.g. Annual appraisal" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Salary History */}
              {history.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <History className="h-4 w-4" /> Salary History
                  </h3>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Effective From</TableHead>
                          <TableHead>Monthly (₹)</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead>Updated By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((h, idx) => (
                          <TableRow key={h.id} className={idx === 0 ? "bg-primary/5" : ""}>
                            <TableCell className="font-medium">
                              {format(new Date(h.effective_from), "MMM yyyy")}
                              {idx === 0 && <Badge variant="outline" className="ml-2 text-xs">Current</Badge>}
                            </TableCell>
                            <TableCell>₹{Number(h.salary).toLocaleString("en-IN")}</TableCell>
                            <TableCell className="text-xs max-w-[150px] truncate">{h.notes || "—"}</TableCell>
                            <TableCell className="text-xs">{h.created_by_name || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer actions */}
          {employee && !loading && (
            <DialogFooter className="gap-2 sm:gap-0">
              {editing ? (
                <>
                  <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving || !hasChanges}>
                    {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              ) : (
                canEdit && !hasNoData && (
                  <Button onClick={() => setEditing(true)} variant="outline">
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                )
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Unsaved changes confirmation */}
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardConfirm}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
