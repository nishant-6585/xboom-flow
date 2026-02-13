import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { EmployeeKPIRecord } from "@/hooks/useKPIManagement";
import { Employee } from "@/hooks/useHR";
import { Edit, Trash2, Eye, Search, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";

interface KPITableProps {
  kpis: EmployeeKPIRecord[];
  employees: Employee[];
  isAdmin: boolean;
  onEdit?: (kpi: EmployeeKPIRecord) => void;
  onDelete?: (id: string) => void;
  onViewProgress: (kpi: EmployeeKPIRecord) => void;
}

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function KPITable({ kpis, employees, isAdmin, onEdit, onDelete, onViewProgress }: KPITableProps) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("due_date");
  const [sortAsc, setSortAsc] = useState(true);

  let filtered = kpis.filter(k => {
    const matchesSearch = k.title.toLowerCase().includes(search.toLowerCase()) ||
      (k.employee_name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" || k.status === filterStatus;
    const matchesEmployee = filterEmployee === "all" || k.employee_id === filterEmployee;
    const matchesPriority = filterPriority === "all" || k.priority === filterPriority;
    return matchesSearch && matchesStatus && matchesEmployee && matchesPriority;
  });

  filtered.sort((a, b) => {
    let cmp = 0;
    if (sortField === "due_date") cmp = a.due_date.localeCompare(b.due_date);
    else if (sortField === "achievement") cmp = (a.achievement_percentage || 0) - (b.achievement_percentage || 0);
    else if (sortField === "priority") {
      const order = { high: 0, medium: 1, low: 2 };
      cmp = (order[a.priority] || 1) - (order[b.priority] || 1);
    }
    return sortAsc ? cmp : -cmp;
  });

  const getStatusBadge = (status: string) => {
    const map: Record<string, { className: string; label: string }> = {
      green: { className: "bg-green-500/10 text-green-700 border-green-200", label: "🟢 On Track" },
      amber: { className: "bg-yellow-500/10 text-yellow-700 border-yellow-200", label: "🟡 At Risk" },
      red: { className: "bg-red-500/10 text-red-700 border-red-200", label: "🔴 Critical" },
      not_started: { className: "bg-muted text-muted-foreground", label: "⚪ Not Started" },
    };
    const s = map[status] || map.not_started;
    return <Badge variant="outline" className={s.className}>{s.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const map: Record<string, string> = { high: "destructive", medium: "secondary", low: "outline" };
    return <Badge variant={map[priority] as any || "outline"}>{priority}</Badge>;
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search KPIs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="green">Green</SelectItem>
            <SelectItem value="amber">Amber</SelectItem>
            <SelectItem value="red">Red</SelectItem>
            <SelectItem value="not_started">Not Started</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={filterEmployee} onValueChange={setFilterEmployee}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Employee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && <TableHead>Employee</TableHead>}
              <TableHead>KPI Title</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("priority")}>
                Priority <ArrowUpDown className="inline h-3 w-3" />
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("achievement")}>
                Progress <ArrowUpDown className="inline h-3 w-3" />
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("due_date")}>
                Due Date <ArrowUpDown className="inline h-3 w-3" />
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">
                  No KPIs found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(kpi => (
                <TableRow key={kpi.id}>
                  {isAdmin && <TableCell className="font-medium">{kpi.employee_name}</TableCell>}
                  <TableCell>
                    <div>
                      <p className="font-medium">{kpi.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Target: {kpi.target_value} | Weight: {kpi.weightage}%
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{MONTHS[kpi.month]} {kpi.year}</TableCell>
                  <TableCell>{getPriorityBadge(kpi.priority)}</TableCell>
                  <TableCell>
                    <div className="w-24">
                      <div className="flex justify-between text-xs mb-1">
                        <span>{kpi.achieved_value || 0}/{kpi.target_value}</span>
                        <span>{(kpi.achievement_percentage || 0).toFixed(0)}%</span>
                      </div>
                      <Progress value={Math.min(kpi.achievement_percentage || 0, 100)} className="h-2" />
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(kpi.status)}</TableCell>
                  <TableCell>{format(new Date(kpi.due_date), "dd MMM")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => onViewProgress(kpi)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isAdmin && onEdit && (
                        <Button size="icon" variant="ghost" onClick={() => onEdit(kpi)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {isAdmin && onDelete && (
                        <Button size="icon" variant="ghost" onClick={() => onDelete(kpi.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
