import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Wallet, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { recordAuditLog } from "@/lib/auditLog";

interface Employee {
  id: string;
  name: string;
  department: string;
  designation: string | null;
  monthly_salary: number | null;
  bank_account: string | null;
  ifsc_code: string | null;
}

interface SalaryHistoryEntry {
  id: string;
  effective_from: string;
  salary: number;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

export function EmployeeFinancialDetailsPanel() {
  const { user, profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [history, setHistory] = useState<SalaryHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formSalary, setFormSalary] = useState("");
  const [formBank, setFormBank] = useState("");
  const [formIfsc, setFormIfsc] = useState("");
  const [salaryReason, setSalaryReason] = useState("");
  const [salaryEffective, setSalaryEffective] = useState("");

  useEffect(() => {
    supabase
      .from("employees")
      .select("id, name, department, designation, monthly_salary, bank_account, ifsc_code")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setEmployees((data as unknown as Employee[]) || []));
  }, []);

  const loadEmployee = useCallback(async (empId: string) => {
    setLoading(true);
    const { data: emp } = await supabase
      .from("employees")
      .select("id, name, department, designation, monthly_salary, bank_account, ifsc_code")
      .eq("id", empId)
      .single();

    const empData = emp as unknown as Employee;
    setEmployee(empData);
    setFormSalary(String(empData?.monthly_salary || ""));
    setFormBank(empData?.bank_account || "");
    setFormIfsc(empData?.ifsc_code || "");
    setSalaryReason("");
    setSalaryEffective(format(new Date(), "yyyy-MM-dd"));

    const { data: hist } = await supabase
      .from("salary_history")
      .select("*")
      .eq("employee_id", empId)
      .order("effective_from", { ascending: false });
    setHistory((hist as unknown as SalaryHistoryEntry[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) loadEmployee(selectedId);
  }, [selectedId, loadEmployee]);

  const validateBank = (val: string) => /^\d{9,18}$/.test(val);
  const validateIfsc = (val: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(val.toUpperCase());

  const handleSave = async () => {
    if (!user || !employee) return;
    setSaving(true);

    const newSalary = parseFloat(formSalary) || 0;
    if (newSalary < 0) { toast.error("Salary cannot be negative"); setSaving(false); return; }
    if (formBank && !validateBank(formBank)) { toast.error("Account number must be 9-18 digits"); setSaving(false); return; }
    if (formIfsc && !validateIfsc(formIfsc)) { toast.error("IFSC format: 4 letters + 0 + 6 alphanumeric"); setSaving(false); return; }

    const updates: Record<string, any> = {};
    const oldSalary = employee.monthly_salary || 0;
    const salaryChanged = Math.abs(newSalary - oldSalary) > 0.01;

    if (salaryChanged) {
      if (!salaryEffective) { toast.error("Please set salary effective date"); setSaving(false); return; }
      updates.monthly_salary = newSalary;

      // Create salary history record
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
    if (formIfsc.toUpperCase() !== (employee.ifsc_code || "")) {
      updates.ifsc_code = formIfsc.toUpperCase() || null;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from("employees").update(updates as any).eq("id", employee.id);
      if (error) { toast.error("Failed to save"); setSaving(false); return; }
    }

    toast.success("Financial details updated");
    await loadEmployee(employee.id);
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Wallet className="h-5 w-5" /> Employee Financial Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="max-w-sm">
          <Label>Select Employee</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
            <SelectContent>
              {employees.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.name} — {e.department}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}

        {employee && !loading && (
          <>
            <div className="rounded-lg border p-4 space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Financial Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fin-salary">Monthly Salary (₹)</Label>
                  <Input id="fin-salary" value={formSalary} onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setFormSalary(e.target.value); }} />
                </div>
                <div>
                  <Label htmlFor="fin-bank">Bank Account Number</Label>
                  <Input id="fin-bank" value={formBank} onChange={e => { if (/^\d*$/.test(e.target.value)) setFormBank(e.target.value); }} maxLength={18} />
                  {formBank && !validateBank(formBank) && <p className="text-xs text-destructive mt-1">Must be 9-18 digits</p>}
                </div>
                <div>
                  <Label htmlFor="fin-ifsc">IFSC Code</Label>
                  <Input id="fin-ifsc" value={formIfsc} onChange={e => setFormIfsc(e.target.value.toUpperCase())} maxLength={11} placeholder="e.g. SBIN0001234" />
                  {formIfsc && !validateIfsc(formIfsc) && <p className="text-xs text-destructive mt-1">Format: 4 letters + 0 + 6 chars</p>}
                </div>
              </div>

              {/* Show salary change fields if salary is different */}
              {Math.abs((parseFloat(formSalary) || 0) - (employee.monthly_salary || 0)) > 0.01 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-3">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Salary change detected — this will create a salary history record</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="sal-effective">Effective From</Label>
                      <Input id="sal-effective" type="date" value={salaryEffective} onChange={e => setSalaryEffective(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="sal-reason">Reason (optional)</Label>
                      <Input id="sal-reason" value={salaryReason} onChange={e => setSalaryReason(e.target.value)} placeholder="e.g. Annual appraisal" />
                    </div>
                  </div>
                </div>
              )}

              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>

            {/* Salary History */}
            {history.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <History className="h-4 w-4" /> Salary History
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Effective From</TableHead>
                      <TableHead>Monthly (₹)</TableHead>
                      <TableHead>Annual (₹)</TableHead>
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
                        <TableCell className="text-muted-foreground">₹{(Number(h.salary) * 12).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-xs">{h.notes || "—"}</TableCell>
                        <TableCell className="text-xs">{h.created_by_name || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
