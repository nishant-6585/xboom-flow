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
  onCreated?: (newEmployee: FinancialEmployee) => void;
  canEdit: boolean;
  createMode?: boolean;
  existingEmployeeIds?: string[];
}

const validateBank = (val: string) => /^\d{9,18}$/.test(val);
const validateIfsc = (val: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(val.toUpperCase());

export function FinancialDetailEditDialog({
  employeeId,
  open,
  onOpenChange,
  onSaved,
  onCreated,
  canEdit,
  createMode = false,
  existingEmployeeIds = [],
}: FinancialDetailEditDialogProps) {
  const { user, profile } = useAuth();
  const [employee, setEmployee] = useState<FinancialEmployee | null>(null);
  const [history, setHistory] = useState<SalaryHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Create mode state
  const [availableEmployees, setAvailableEmployees] = useState<{ id: string; name: string; department: string; employee_number: string | null }[]>([]);
  const [selectedCreateEmpId, setSelectedCreateEmpId] = useState("");
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  // Form state
  const [formSalary, setFormSalary] = useState("");
  const [formBank, setFormBank] = useState("");
  const [formIfsc, setFormIfsc] = useState("");
  const [formPan, setFormPan] = useState("");
  const [formTaxRegime, setFormTaxRegime] = useState("");
  const [salaryEffective, setSalaryEffective] = useState("");
  const [salaryReason, setSalaryReason] = useState("");

  // Load employees without financial details for create mode
  const loadAvailableEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    const { data } = await supabase
      .from("employees")
      .select("id, name, department, employee_number, bank_account, ifsc_code, pan_number, monthly_salary")
      .eq("is_active", true)
      .order("name");

    if (data) {
      const withoutFinancials = (data as any[]).filter(
        (e) =>
          !existingEmployeeIds.includes(e.id) &&
          !e.bank_account &&
          !e.ifsc_code &&
          !e.pan_number &&
          (!e.monthly_salary || e.monthly_salary === 0)
      );
      setAvailableEmployees(withoutFinancials);
    }
    setLoadingEmployees(false);
  }, [existingEmployeeIds]);

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

  const resetCreateForm = () => {
    setFormSalary("");
    setFormBank("");
    setFormIfsc("");
    setFormPan("");
    setFormTaxRegime("");
    setSalaryEffective(format(new Date(), "yyyy-MM-dd"));
    setSalaryReason("");
    setSelectedCreateEmpId("");
    setHasChanges(false);
  };

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setHasChanges(false);
      setSelectedCreateEmpId("");
      return;
    }
    if (createMode) {
      setEditing(true);
      setEmployee(null);
      setHistory([]);
      resetCreateForm();
      loadAvailableEmployees();
    } else if (employeeId) {
      setEditing(false);
      loadEmployee(employeeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employeeId, createMode]);

  // Track changes
  useEffect(() => {
    if (createMode && open) {
      const changed = !!(formSalary || formBank || formIfsc || formPan || formTaxRegime);
      setHasChanges(changed);
      return;
    }
    if (!employee || !editing) return;
    const changed =
      formSalary !== String(employee.monthly_salary ?? "") ||
      formBank !== (employee.bank_account || "") ||
      formIfsc !== (employee.ifsc_code || "") ||
      formPan !== (employee.pan_number || "") ||
      formTaxRegime !== (employee.tax_regime || "");
    setHasChanges(changed);
  }, [formSalary, formBank, formIfsc, formPan, formTaxRegime, employee, editing, createMode, open]);

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
      if (createMode) {
        onOpenChange(false);
      } else {
        setEditing(false);
        resetForm(employee);
      }
    }
  };

  const handleDiscardConfirm = () => {
    setConfirmDiscard(false);
    setEditing(false);
    if (createMode) {
      resetCreateForm();
    } else {
      resetForm(employee);
    }
    onOpenChange(false);
  };

  const handleCreate = async () => {
    if (!user || !selectedCreateEmpId) {
      toast.error("Please select an employee");
      return;
    }
    setSaving(true);

    const newSalary = parseFloat(formSalary) || 0;
    if (newSalary <= 0) { toast.error("Monthly salary is required and must be positive"); setSaving(false); return; }
    if (!formBank) { toast.error("Bank account number is required"); setSaving(false); return; }
    if (!validateBank(formBank)) { toast.error("Account number must be 9-18 digits"); setSaving(false); return; }
    if (!formIfsc) { toast.error("IFSC code is required"); setSaving(false); return; }
    if (!validateIfsc(formIfsc)) { toast.error("IFSC format: 4 letters + 0 + 6 alphanumeric"); setSaving(false); return; }
    if (formPan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(formPan.toUpperCase())) { toast.error("PAN format: ABCDE1234F"); setSaving(false); return; }

    // Check for duplicate
    const { data: existing } = await supabase
      .from("employees")
      .select("bank_account, monthly_salary")
      .eq("id", selectedCreateEmpId)
      .single();

    if (existing && (existing.bank_account || (existing.monthly_salary && (existing.monthly_salary as number) > 0))) {
      toast.error("Financial details already exist for this employee");
      setSaving(false);
      return;
    }

    const updates: Record<string, any> = {
      monthly_salary: newSalary,
      bank_account: formBank,
      ifsc_code: formIfsc.toUpperCase(),
      pan_number: formPan ? formPan.toUpperCase() : null,
      tax_regime: formTaxRegime || null,
    };

    const { error } = await supabase.from("employees").update(updates as any).eq("id", selectedCreateEmpId);
    if (error) { toast.error("Failed to create financial details"); setSaving(false); return; }

    // Create initial salary history
    await supabase.from("salary_history").insert({
      employee_id: selectedCreateEmpId,
      effective_from: salaryEffective || format(new Date(), "yyyy-MM-dd"),
      salary: newSalary,
      notes: "Initial salary entry",
      created_by: user.id,
      created_by_name: profile?.name || "Unknown",
    } as any);

    recordAuditLog(user.id, profile?.name || "", {
      action: "FINANCIAL_DETAILS_CREATED",
      targetUserId: selectedCreateEmpId,
      details: { salary: newSalary },
    });

    // Build new employee object for optimistic update
    const selectedEmp = availableEmployees.find(e => e.id === selectedCreateEmpId);
    const newEmployee: FinancialEmployee = {
      id: selectedCreateEmpId,
      employee_number: selectedEmp?.employee_number || null,
      name: selectedEmp?.name || "",
      department: selectedEmp?.department || "",
      designation: null,
      bank_account: updates.bank_account || null,
      ifsc_code: updates.ifsc_code || null,
      pan_number: updates.pan_number || null,
      monthly_salary: updates.monthly_salary || null,
      tax_regime: updates.tax_regime || null,
    };

    toast.success("Financial details created successfully");
    setSaving(false);
    onCreated?.(newEmployee);
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (createMode) {
      await handleCreate();
      return;
    }
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

  const isCreateMode = createMode && open;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto pr-14">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              {isCreateMode
                ? "Add Financial Details"
                : employee
                  ? `${employee.name} — Financial Details`
                  : "Financial Details"}
            </DialogTitle>
            {!isCreateMode && employee && (
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
          ) : isCreateMode ? (
            <div className="space-y-5">
              {/* Employee selection */}
              <div>
                <Label className="text-xs text-muted-foreground">Select Employee *</Label>
                {loadingEmployees ? (
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading employees…
                  </div>
                ) : availableEmployees.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-1">All employees already have financial details.</p>
                ) : (
                  <Select value={selectedCreateEmpId} onValueChange={setSelectedCreateEmpId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Choose an employee without financial records" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableEmployees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name} — {e.department}
                          {e.employee_number ? ` (${e.employee_number})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Financial Fields - always editable in create mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Monthly Salary (₹) *</Label>
                  <Input
                    value={formSalary}
                    onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setFormSalary(e.target.value); }}
                    placeholder="e.g. 25000"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Bank Account Number *</Label>
                  <Input
                    value={formBank}
                    onChange={e => { if (/^\d*$/.test(e.target.value)) setFormBank(e.target.value); }}
                    maxLength={18}
                    placeholder="9-18 digit account number"
                  />
                  {formBank && !validateBank(formBank) && <p className="text-xs text-destructive mt-1">Must be 9-18 digits</p>}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">IFSC Code *</Label>
                  <Input
                    value={formIfsc}
                    onChange={e => setFormIfsc(e.target.value.toUpperCase())}
                    maxLength={11}
                    placeholder="e.g. SBIN0001234"
                  />
                  {formIfsc && !validateIfsc(formIfsc) && <p className="text-xs text-destructive mt-1">Format: 4 letters + 0 + 6 chars</p>}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">PAN Number</Label>
                  <Input
                    value={formPan}
                    onChange={e => setFormPan(e.target.value.toUpperCase())}
                    maxLength={10}
                    placeholder="e.g. ABCDE1234F"
                  />
                  {formPan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(formPan.toUpperCase()) && <p className="text-xs text-destructive mt-1">Format: ABCDE1234F</p>}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tax Regime</Label>
                  <Select value={formTaxRegime} onValueChange={setFormTaxRegime}>
                    <SelectTrigger><SelectValue placeholder="Select regime" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Old Regime">Old Regime</SelectItem>
                      <SelectItem value="New Regime">New Regime</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Salary Effective From</Label>
                  <Input type="date" value={salaryEffective} onChange={e => setSalaryEffective(e.target.value)} />
                </div>
              </div>
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
          {isCreateMode ? (
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !selectedCreateEmpId || !formSalary || !formBank}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                {saving ? "Creating..." : "Create Financial Details"}
              </Button>
            </DialogFooter>
          ) : employee && !loading && (
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
            <AlertDialogTitle>{createMode ? "Discard entered details?" : "Discard unsaved changes?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {createMode
                ? "You have entered financial details that haven't been saved. Discard them?"
                : "You have unsaved changes. Are you sure you want to discard them?"}
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
