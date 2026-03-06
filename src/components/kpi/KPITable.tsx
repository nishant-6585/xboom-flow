import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { EmployeeKPIRecord, KPIWorkflowStatus } from "@/hooks/useKPIManagement";
import { Employee } from "@/hooks/useHR";
import { Edit, Trash2, Eye, Search, ArrowUpDown, TrendingUp, CheckCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface KPITableProps {
  kpis: EmployeeKPIRecord[];
  employees: Employee[];
  isAdmin: boolean;
  myEmployeeId?: string | null;
  onEdit?: (kpi: EmployeeKPIRecord) => void;
  onEmployeeEdit?: (kpi: EmployeeKPIRecord) => void;
  onDelete?: (id: string) => void;
  onEmployeeDelete?: (id: string) => void;
  onViewProgress: (kpi: EmployeeKPIRecord) => void;
  onUpdateWorkflowStatus?: (id: string, status: KPIWorkflowStatus) => Promise<boolean>;
  canEmployeeEdit: (kpi: EmployeeKPIRecord) => boolean;
  canEmployeeDelete: (kpi: EmployeeKPIRecord) => boolean;
}

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function KPITable({ kpis, employees, isAdmin, myEmployeeId, onEdit, onEmployeeEdit, onDelete, onEmployeeDelete, onViewProgress, onUpdateWorkflowStatus, canEmployeeEdit, canEmployeeDelete }: KPITableProps) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("due_date");
  const [sortAsc, setSortAsc] = useState(true);

  let filtered = kpis.filter(k => {
    const matchesSearch = k.title.toLowerCase().includes(search.toLowerCase()) ||
      (k.employee_name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" || k.status === filterStatus;
    const matchesEmployee = filterEmployee === "all" || k.employee_id === filterEmployee;
    const matchesPriority = filterPriority === "all" || k.priority === filterPriority;
    const matchesSource = filterSource === "all" || k.kpi_source === filterSource;
    return matchesSearch && matchesStatus && matchesEmployee && matchesPriority && matchesSource;
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

  const getSourceBadge = (source: string) => {
    if (source === 'employee') {
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-200 text-[10px]">Self</Badge>;
    }
    return <Badge variant="outline" className="bg-purple-500/10 text-purple-700 border-purple-200 text-[10px]">HR</Badge>;
  };

  const getWorkflowBadge = (status: string) => {
    const map: Record<string, { className: string; label: string }> = {
      draft: { className: "bg-muted text-muted-foreground", label: "Draft" },
      active: { className: "bg-green-500/10 text-green-700 border-green-200", label: "Active" },
      completed: { className: "bg-blue-500/10 text-blue-700 border-blue-200", label: "Completed" },
      reviewed: { className: "bg-purple-500/10 text-purple-700 border-purple-200", label: "Reviewed" },
    };
    const s = map[status] || map.draft;
    return <Badge variant="outline" className={`${s.className} text-[10px]`}>{s.label}</Badge>;
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
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Owner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Owners</SelectItem>
            <SelectItem value="hr">HR Assigned</SelectItem>
            <SelectItem value="employee">Self Created</SelectItem>
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
              <TableHead>Owner</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("priority")}>
                Priority <ArrowUpDown className="inline h-3 w-3" />
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("achievement")}>
                Progress <ArrowUpDown className="inline h-3 w-3" />
              </TableHead>
              <TableHead>RAG</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("due_date")}>
                Due <ArrowUpDown className="inline h-3 w-3" />
              </TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 11 : 10} className="text-center py-8 text-muted-foreground">
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
                  <TableCell>{getSourceBadge(kpi.kpi_source)}</TableCell>
                  <TableCell className="text-sm">{MONTHS[kpi.month]} {kpi.year}</TableCell>
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
                  <TableCell>
                    {isAdmin && onUpdateWorkflowStatus ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="cursor-pointer">{getWorkflowBadge(kpi.workflow_status)}</button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => onUpdateWorkflowStatus(kpi.id, 'draft')}>
                            <Clock className="h-3 w-3 mr-2" /> Draft
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onUpdateWorkflowStatus(kpi.id, 'active')}>
                            <TrendingUp className="h-3 w-3 mr-2" /> Active
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onUpdateWorkflowStatus(kpi.id, 'completed')}>
                            <CheckCircle className="h-3 w-3 mr-2" /> Completed
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onUpdateWorkflowStatus(kpi.id, 'reviewed')}>
                            <Eye className="h-3 w-3 mr-2" /> Reviewed
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      getWorkflowBadge(kpi.workflow_status)
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{format(new Date(kpi.due_date), "dd MMM")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(kpi.updated_at), "dd MMM")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => onViewProgress(kpi)} title="Update Progress">
                        <TrendingUp className="h-4 w-4" />
                      </Button>
                      {isAdmin && onEdit && (
                        <Button size="icon" variant="ghost" onClick={() => onEdit(kpi)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {!isAdmin && onEmployeeEdit && canEmployeeEdit(kpi) && (
                        <Button size="icon" variant="ghost" onClick={() => onEmployeeEdit(kpi)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {isAdmin && onDelete && (
                        <Button size="icon" variant="ghost" onClick={() => onDelete(kpi.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {!isAdmin && onEmployeeDelete && canEmployeeDelete(kpi) && (
                        <Button size="icon" variant="ghost" onClick={() => onEmployeeDelete(kpi.id)} className="text-destructive">
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
