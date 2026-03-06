import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, History, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { recordAuditLog } from "@/lib/auditLog";

interface SalaryHistoryEntry {
  id: string;
  employee_id: string;
  effective_from: string;
  salary: number;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

interface Employee {
  id: string;
  name: string;
  monthly_salary: number;
  department: string;
}

export function SalaryHistoryPanel() {
  const { user, profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [history, setHistory] = useState<SalaryHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formSalary, setFormSalary] = useState("");
  const [formEffectiveFrom, setFormEffectiveFrom] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("employees")
      .select("id, name, monthly_salary, department")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        setEmployees((data as unknown as Employee[]) || []);
      });
  }, []);

  const fetchHistory = useCallback(async (empId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("salary_history")
      .select("*")
      .eq("employee_id", empId)
      .order("effective_from", { ascending: false });
    setHistory((data as unknown as SalaryHistoryEntry[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedEmployee) fetchHistory(selectedEmployee);
  }, [selectedEmployee, fetchHistory]);

  const handleAdd = async () => {
    if (!user || !selectedEmployee) return;
    setSaving(true);

    const salary = parseFloat(formSalary);
    if (!salary || salary <= 0) {
      toast.error("Please enter a valid salary");
      setSaving(false);
      return;
    }
    if (!formEffectiveFrom) {
      toast.error("Please select an effective date");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("salary_history").insert({
      employee_id: selectedEmployee,
      effective_from: formEffectiveFrom,
      salary,
      notes: formNotes || null,
      created_by: user.id,
      created_by_name: profile?.name || "Unknown",
    } as any);

    if (error) {
      toast.error("Failed to add salary record");
    } else {
      // Also update employee's current monthly_salary
      await supabase
        .from("employees")
        .update({ monthly_salary: salary } as any)
        .eq("id", selectedEmployee);

      recordAuditLog(user.id, profile?.name || "", {
        action: "SALARY_HISTORY_ADDED",
        details: { employee_id: selectedEmployee, salary, effective_from: formEffectiveFrom },
      });

      toast.success("Salary record added");
      setDialogOpen(false);
      setFormSalary("");
      setFormEffectiveFrom("");
      setFormNotes("");
      fetchHistory(selectedEmployee);
    }
    setSaving(false);
  };

  const selectedEmpName = employees.find(e => e.id === selectedEmployee)?.name || "";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="h-5 w-5" />
          Salary History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label>Select Employee</Label>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name} — {emp.department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedEmployee && (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Salary Record
            </Button>
          )}
        </div>

        {selectedEmployee && (
          loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No salary history for this employee. Add one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective From</TableHead>
                  <TableHead>Monthly Salary (₹)</TableHead>
                  <TableHead>Annual (₹)</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Added By</TableHead>
                  <TableHead>Added On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h, idx) => (
                  <TableRow key={h.id} className={idx === 0 ? "bg-primary/5" : ""}>
                    <TableCell className="font-medium">
                      {format(new Date(h.effective_from), "MMM yyyy")}
                      {idx === 0 && <span className="ml-2 text-xs text-primary">(Current)</span>}
                    </TableCell>
                    <TableCell>₹{Number(h.salary).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-muted-foreground">₹{(Number(h.salary) * 12).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-xs">{h.notes || "—"}</TableCell>
                    <TableCell className="text-xs">{h.created_by_name || "—"}</TableCell>
                    <TableCell className="text-xs">{format(new Date(h.created_at), "dd MMM yyyy")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Salary Record — {selectedEmpName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="salary-amount">Monthly Salary (₹)</Label>
              <Input
                id="salary-amount"
                value={formSalary}
                onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setFormSalary(e.target.value); }}
                placeholder="e.g. 50000"
              />
            </div>
            <div>
              <Label htmlFor="effective-date">Effective From</Label>
              <Input
                id="effective-date"
                type="date"
                value={formEffectiveFrom}
                onChange={e => setFormEffectiveFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="salary-notes">Notes (optional)</Label>
              <Input
                id="salary-notes"
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="e.g. Annual revision"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
