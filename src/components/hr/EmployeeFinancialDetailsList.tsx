import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Users, ArrowUpDown, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FinancialDetailEditDialog } from "./FinancialDetailEditDialog";

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
  is_active: boolean | null;
}

type SortField = "employee_number" | "name" | "department" | "monthly_salary";
type SortDir = "asc" | "desc";

function maskAccount(val: string | null): string {
  if (!val || val.length < 5) return val || "—";
  return "••••" + val.slice(-4);
}

export function EmployeeFinancialDetailsList() {
  const { roles } = useAuth();
  const [employees, setEmployees] = useState<FinancialEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Dialog state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const isHROrAdmin = roles?.some((r: string) => r === "admin" || r === "hr") ?? false;

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("id, employee_number, name, department, designation, bank_account, ifsc_code, pan_number, monthly_salary, tax_regime, is_active")
      .eq("is_active", true)
      .order("name");

    if (!error && data) {
      const filtered = (data as unknown as FinancialEmployee[]).filter(
        (e) => e.bank_account || e.ifsc_code || e.pan_number || (e.monthly_salary != null && e.monthly_salary > 0)
      );
      setEmployees(filtered);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const departments = useMemo(() => {
    const set = new Set(employees.map((e) => e.department));
    return Array.from(set).sort();
  }, [employees]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let list = employees;
    if (deptFilter !== "all") list = list.filter((e) => e.department === deptFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.employee_number && e.employee_number.toLowerCase().includes(q)) ||
          (e.department && e.department.toLowerCase().includes(q))
      );
    }
    list = [...list].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortField === "monthly_salary") { av = a.monthly_salary ?? 0; bv = b.monthly_salary ?? 0; }
      else { av = (a[sortField] ?? "").toString().toLowerCase(); bv = (b[sortField] ?? "").toString().toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [employees, search, deptFilter, sortField, sortDir]);

  const handleRowClick = (empId: string) => {
    setSelectedEmployeeId(empId);
    setDialogOpen(true);
  };

  const handleSaved = (updatedEmp: any) => {
    // Optimistic row update without full refetch
    setEmployees(prev => prev.map(e =>
      e.id === updatedEmp.id
        ? { ...e, ...updatedEmp }
        : e
    ));
  };

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => toggleSort(field)}
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortField === field ? "text-foreground" : "text-muted-foreground/50"}`} />
    </button>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Employee Financial Details — All
          </CardTitle>
          <p className="text-xs text-muted-foreground">Click any row to view or edit details</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, ID, or department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Users className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground font-medium">
                {employees.length === 0
                  ? "No employees with financial details found"
                  : "No results match your search or filter"}
              </p>
              <p className="text-xs text-muted-foreground">
                {employees.length === 0
                  ? "Financial details will appear here once entered in employee profiles."
                  : "Try adjusting your search or clearing the department filter."}
              </p>
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">
                Showing {filtered.length} of {employees.length} employee{employees.length !== 1 ? "s" : ""}
              </div>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap"><SortButton field="employee_number" label="Emp ID" /></TableHead>
                      <TableHead className="whitespace-nowrap"><SortButton field="name" label="Name" /></TableHead>
                      <TableHead className="whitespace-nowrap"><SortButton field="department" label="Dept / Designation" /></TableHead>
                      <TableHead className="whitespace-nowrap">Account No.</TableHead>
                      <TableHead className="whitespace-nowrap">IFSC</TableHead>
                      <TableHead className="whitespace-nowrap">PAN</TableHead>
                      <TableHead className="whitespace-nowrap"><SortButton field="monthly_salary" label="Monthly Salary" /></TableHead>
                      <TableHead className="whitespace-nowrap">Tax Regime</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((emp) => (
                      <TableRow
                        key={emp.id}
                        className="group cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleRowClick(emp.id)}
                      >
                        <TableCell className="font-medium tabular-nums">
                          {emp.employee_number || "—"}
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{emp.name}</TableCell>
                        <TableCell>
                          <span>{emp.department}</span>
                          {emp.designation && (
                            <span className="block text-xs text-muted-foreground">{emp.designation}</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">{maskAccount(emp.bank_account)}</TableCell>
                        <TableCell className="font-mono text-xs">{emp.ifsc_code || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{emp.pan_number || "—"}</TableCell>
                        <TableCell className="tabular-nums">
                          {emp.monthly_salary != null
                            ? `₹${Number(emp.monthly_salary).toLocaleString("en-IN")}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {emp.tax_regime ? (
                            <Badge variant="outline" className="text-xs capitalize">{emp.tax_regime}</Badge>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <FinancialDetailEditDialog
        employeeId={selectedEmployeeId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
        canEdit={isHROrAdmin}
      />
    </>
  );
}
