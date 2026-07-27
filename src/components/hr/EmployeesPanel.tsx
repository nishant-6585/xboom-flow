import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Eye, Users } from "lucide-react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { EmployeeDetailDialog } from "./EmployeeDetailDialog";
import { toast } from "sonner";
import { format } from "date-fns";

export interface EmployeeRecord {
  id: string;
  employee_number: string | null;
  user_id: string | null;
  name: string;
  department: string;
  designation: string | null;
  joining_date: string | null;
  date_of_birth: string | null;
  phone: string | null;
  gender: string | null;
  personal_email: string | null;
  xboom_email: string | null;
  employee_type: string | null;
  work_location: string | null;
  state: string | null;
  city: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_phone: string | null;
  employment_status: string;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  user_roles?: string[];
}

export function EmployeesPanel() {
  const { role } = useAuth();
  const isHROrAdmin = role === "admin" || role === "hr";

  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  type SortKey = "employee_number" | "name" | "department" | "role" | "date_of_birth" | "joining_date";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  };
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-50" />
      : sortDir === "asc" ? <ArrowUp className="inline h-3 w-3 ml-1" />
      : <ArrowDown className="inline h-3 w-3 ml-1" />;

  const fetchEmployees = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("id, employee_number, user_id, name, department, designation, joining_date, date_of_birth, phone, gender, personal_email, xboom_email, employee_type, work_location, state, city, emergency_contact_name, emergency_contact_relation, emergency_contact_phone, employment_status, is_active, created_at, updated_at")
      .eq("is_active", true)
      .order("name");
    if (error) {
      console.error(error);
      toast.error("Failed to load employees");
    }

    const emps = (data as unknown as EmployeeRecord[]) || [];

    // Fetch roles from user_roles for all employees with user_id
    const userIds = emps.map(e => e.user_id).filter(Boolean) as string[];
    if (userIds.length > 0) {
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      if (rolesData) {
        const roleMap: Record<string, string[]> = {};
        for (const r of rolesData) {
          if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
          roleMap[r.user_id].push(r.role);
        }
        for (const emp of emps) {
          emp.user_roles = emp.user_id ? roleMap[emp.user_id] || [] : [];
        }
      }
    }

    setEmployees(emps);

    // Update selectedEmployee with fresh data so the detail dialog reflects changes
    setSelectedEmployee(prev => {
      if (!prev) return prev;
      const updated = emps.find(e => e.id === prev.id);
      return updated || prev;
    });

    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const departments = useMemo(() => {
    const set = new Set(employees.map(e => e.department));
    return Array.from(set).sort();
  }, [employees]);

  const employeeTypes = useMemo(() => {
    const set = new Set(employees.map(e => e.employee_type).filter(Boolean));
    return Array.from(set).sort();
  }, [employees]);

  const filtered = useMemo(() => {
    const result = employees.filter(e => {
      const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.employee_number || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.designation || "").toLowerCase().includes(search.toLowerCase());
      const matchDept = deptFilter === "all" || e.department === deptFilter;
      const matchType = typeFilter === "all" || e.employee_type === typeFilter;
      return matchSearch && matchDept && matchType;
    });
    if (!sortKey) return result;
    const getVal = (e: EmployeeRecord): string | number => {
      if (sortKey === "employee_number") {
        const n = parseInt(e.employee_number || "", 10);
        return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
      }
      if (sortKey === "name") return (e.name || "").toLowerCase();
      if (sortKey === "department") return (e.department || "").toLowerCase();
      if (sortKey === "role") return (e.user_roles?.[0] || "").toLowerCase();
      if (sortKey === "date_of_birth") return e.date_of_birth || "9999-12-31";
      if (sortKey === "joining_date") return e.joining_date || "9999-12-31";
      return "";
    };
    const sorted = [...result].sort((a, b) => {
      const av = getVal(a), bv = getVal(b);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [employees, search, deptFilter, typeFilter, sortKey, sortDir]);

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try {
      return format(new Date(d), "dd MMM yyyy");
    } catch {
      return "—";
    }
  };

  const formatType = (t: string | null) => {
    if (!t) return "—";
    return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  const statusBadge = (status: string) => {
    const variant = status === "active" ? "default" : status === "on_notice" ? "secondary" : "destructive";
    return <Badge variant={variant} className="text-xs">{formatType(status)}</Badge>;
  };

  const openEmployee = (emp: EmployeeRecord) => {
    setSelectedEmployee(emp);
    setViewOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, ID, or designation..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {employeeTypes.map(t => <SelectItem key={t!} value={t!}>{formatType(t!)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-muted-foreground">{filtered.length} employee{filtered.length !== 1 ? "s" : ""}</div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No employees found</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("employee_number")}>Employee ID<SortIcon k="employee_number" /></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>Name<SortIcon k="name" /></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("department")}>Department<SortIcon k="department" /></TableHead>
                <TableHead className="hidden md:table-cell cursor-pointer select-none" onClick={() => toggleSort("role")}>Role<SortIcon k="role" /></TableHead>
                <TableHead className="hidden lg:table-cell cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort("date_of_birth")}>DOB<SortIcon k="date_of_birth" /></TableHead>
                <TableHead className="hidden lg:table-cell cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort("joining_date")}>DOJ<SortIcon k="joining_date" /></TableHead>
                <TableHead className="hidden lg:table-cell">Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp, idx) => (
                <TableRow key={emp.id} className="cursor-pointer" onClick={() => openEmployee(emp)}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-xs">{emp.employee_number || "—"}</TableCell>
                  <TableCell className="font-medium">{emp.name}</TableCell>
                  <TableCell className="text-sm">{emp.department}</TableCell>
                   <TableCell className="hidden md:table-cell text-sm">{emp.user_roles && emp.user_roles.length > 0 ? emp.user_roles.map(r => formatType(r)).join(", ") : "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm whitespace-nowrap">{formatDate(emp.date_of_birth)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm whitespace-nowrap">{formatDate(emp.joining_date)}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="outline" className="text-xs">{formatType(emp.employee_type)}</Badge>
                  </TableCell>
                  <TableCell>{statusBadge(emp.employment_status)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEmployee(emp); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedEmployee && (
        <EmployeeDetailDialog
          open={viewOpen}
          onOpenChange={setViewOpen}
          employee={selectedEmployee}
          isHROrAdmin={isHROrAdmin}
          onSaved={fetchEmployees}
        />
      )}
    </div>
  );
}
