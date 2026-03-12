import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Eye, Pencil, Users } from "lucide-react";
import { EmployeeDetailDialog } from "./EmployeeDetailDialog";
import { EmployeeEditDialog } from "./EmployeeEditDialog";
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
  const [editOpen, setEditOpen] = useState(false);

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
    setEmployees((data as unknown as EmployeeRecord[]) || []);
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
    return employees.filter(e => {
      const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.employee_number || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.designation || "").toLowerCase().includes(search.toLowerCase());
      const matchDept = deptFilter === "all" || e.department === deptFilter;
      const matchType = typeFilter === "all" || e.employee_type === typeFilter;
      return matchSearch && matchDept && matchType;
    });
  }, [employees, search, deptFilter, typeFilter]);

  const formatType = (t: string | null) => {
    if (!t) return "—";
    return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
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
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">DOB</TableHead>
                <TableHead className="hidden lg:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">Gender</TableHead>
                <TableHead className="hidden xl:table-cell">Email</TableHead>
                <TableHead className="hidden xl:table-cell">Xboom Email</TableHead>
                <TableHead className="hidden md:table-cell">Joining Date</TableHead>
                <TableHead className="hidden lg:table-cell">State</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead className="hidden lg:table-cell">Type</TableHead>
                <TableHead className="hidden xl:table-cell">Mode</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((emp, idx) => (
                <TableRow key={emp.id}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-xs">{emp.employee_number || "—"}</TableCell>
                  <TableCell className="font-medium">{emp.name}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{emp.date_of_birth ? format(new Date(emp.date_of_birth), "dd MMM yyyy") : "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{emp.phone || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{emp.gender || "—"}</TableCell>
                  <TableCell className="hidden xl:table-cell text-sm">{emp.personal_email || "—"}</TableCell>
                  <TableCell className="hidden xl:table-cell text-sm">{emp.xboom_email || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{emp.joining_date ? format(new Date(emp.joining_date), "dd MMM yyyy") : "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{emp.state || "—"}</TableCell>
                  <TableCell className="text-sm">{emp.designation || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="outline" className="text-xs">{formatType(emp.employee_type)}</Badge>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm">{emp.work_location || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedEmployee(emp); setViewOpen(true); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isHROrAdmin && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedEmployee(emp); setEditOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedEmployee && (
        <>
          <EmployeeDetailDialog open={viewOpen} onOpenChange={setViewOpen} employee={selectedEmployee} />
          {isHROrAdmin && (
            <EmployeeEditDialog
              open={editOpen}
              onOpenChange={setEditOpen}
              employee={selectedEmployee}
              onSaved={() => { fetchEmployees(); setEditOpen(false); }}
            />
          )}
        </>
      )}
    </div>
  );
}
