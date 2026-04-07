import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wallet, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Employee {
  id: string;
  name: string;
  department: string;
  designation: string | null;
  monthly_salary: number | null;
  bank_account: string | null;
  ifsc_code: string | null;
  pan_number: string | null;
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

export function EmployeeFinancialDetailsPanel() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [history, setHistory] = useState<SalaryHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("employees")
      .select("id, name, department, designation, monthly_salary, bank_account, ifsc_code, pan_number, tax_regime")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setEmployees((data as unknown as Employee[]) || []));
  }, []);

  const loadEmployee = useCallback(async (empId: string) => {
    setLoading(true);
    const [{ data: emp }, { data: hist }] = await Promise.all([
      supabase
        .from("employees")
        .select("id, name, department, designation, monthly_salary, bank_account, ifsc_code, pan_number, tax_regime")
        .eq("id", empId)
        .single(),
      supabase
        .from("salary_history")
        .select("*")
        .eq("employee_id", empId)
        .order("effective_from", { ascending: false }),
    ]);

    setEmployee(emp as unknown as Employee);
    setHistory((hist as unknown as SalaryHistoryEntry[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) loadEmployee(selectedId);
    else { setEmployee(null); setHistory([]); }
  }, [selectedId, loadEmployee]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Wallet className="h-5 w-5" /> Employee Financial Details
        </CardTitle>
        <p className="text-xs text-muted-foreground">Quick preview — to edit, click a row in the table below</p>
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
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Financial Details (Read-Only)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Monthly Salary (₹)</Label>
                  <p className="text-lg font-bold mt-1">
                    {employee.monthly_salary != null ? `₹${Number(employee.monthly_salary).toLocaleString("en-IN")}` : "—"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Bank Account Number</Label>
                  <p className="font-mono font-medium mt-1">{employee.bank_account || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">IFSC Code</Label>
                  <p className="font-mono font-medium mt-1">{employee.ifsc_code || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">PAN Number</Label>
                  <p className="font-mono font-medium mt-1">{employee.pan_number || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tax Regime</Label>
                  <p className="font-medium mt-1">
                    {employee.tax_regime ? <Badge variant="outline" className="text-xs capitalize">{employee.tax_regime}</Badge> : "—"}
                  </p>
                </div>
              </div>
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
                          {format(new Date(h.effective_from), "dd MMM yyyy")}
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
