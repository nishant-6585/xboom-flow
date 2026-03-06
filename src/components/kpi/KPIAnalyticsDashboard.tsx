import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KPIAnalytics, EmployeeKPIRecord } from "@/hooks/useKPIManagement";
import { Employee } from "@/hooks/useHR";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Download, TrendingUp, Target, AlertTriangle, CheckCircle, Users, UserCheck } from "lucide-react";
import * as XLSX from "xlsx";

interface KPIAnalyticsDashboardProps {
  kpis: EmployeeKPIRecord[];
  employees: Employee[];
  getAnalytics: (month?: number, year?: number, employeeId?: string, department?: string, source?: string) => KPIAnalytics;
  isAdmin: boolean;
}

const MONTHS_OPTIONS = [
  { value: "0", label: "All Months" },
  { value: "1", label: "January" }, { value: "2", label: "February" }, { value: "3", label: "March" },
  { value: "4", label: "April" }, { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" }, { value: "9", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];

const PIE_COLORS = ["#22c55e", "#eab308", "#ef4444", "#94a3b8"];

export function KPIAnalyticsDashboard({ kpis, employees, getAnalytics, isAdmin }: KPIAnalyticsDashboardProps) {
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<string>("0");
  const [filterYear, setFilterYear] = useState<string>(String(now.getFullYear()));
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");

  const analytics = getAnalytics(
    filterMonth !== "0" ? parseInt(filterMonth) : undefined,
    parseInt(filterYear),
    filterEmployee !== "all" ? filterEmployee : undefined,
    filterDepartment !== "all" ? filterDepartment : undefined,
    filterSource !== "all" ? filterSource : undefined,
  );

  const departments = [...new Set(employees.map(e => e.department))];

  const pieData = [
    { name: "Green", value: analytics.greenCount },
    { name: "Amber", value: analytics.amberCount },
    { name: "Red", value: analytics.redCount },
    { name: "Not Started", value: analytics.notStartedCount },
  ].filter(d => d.value > 0);

  const getScoreCategory = (score: number) => {
    if (score >= 90) return { label: "Excellent", color: "text-green-600" };
    if (score >= 70) return { label: "Good", color: "text-blue-600" };
    if (score >= 50) return { label: "Needs Improvement", color: "text-yellow-600" };
    return { label: "Critical", color: "text-red-600" };
  };

  const scoreCategory = getScoreCategory(analytics.overallScore);

  const handleExportExcel = () => {
    const data = kpis.map(k => ({
      Employee: k.employee_name || "",
      Title: k.title,
      Owner: k.kpi_source === 'employee' ? 'Self Created' : 'HR Assigned',
      "Workflow Status": k.workflow_status,
      Month: k.month,
      Year: k.year,
      Target: k.target_value,
      Achieved: k.achieved_value,
      "Achievement %": (k.achievement_percentage || 0).toFixed(1),
      Weightage: k.weightage,
      Status: k.status,
      Priority: k.priority,
      "Due Date": k.due_date,
      "Last Updated": k.updated_at,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KPI Report");
    XLSX.writeFile(wb, "KPI_Report.xlsx");
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS_OPTIONS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="KPI Owner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Owners</SelectItem>
            <SelectItem value="hr">HR Assigned</SelectItem>
            <SelectItem value="employee">Self Created</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && (
          <>
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Employee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterDepartment} onValueChange={setFilterDepartment}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
        <Button variant="outline" size="sm" onClick={handleExportExcel}>
          <Download className="h-4 w-4 mr-1" /> Excel
        </Button>
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Target className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{analytics.totalKPIs}</p>
            <p className="text-xs text-muted-foreground">Total KPIs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className={`text-2xl font-bold ${scoreCategory.color}`}>{analytics.overallScore.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">{scoreCategory.label}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-600" />
            <p className="text-2xl font-bold text-green-600">{analytics.greenCount}</p>
            <p className="text-xs text-muted-foreground">On Track</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-yellow-600" />
            <p className="text-2xl font-bold text-yellow-600">{analytics.amberCount}</p>
            <p className="text-xs text-muted-foreground">At Risk</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-red-600" />
            <p className="text-2xl font-bold text-red-600">{analytics.redCount}</p>
            <p className="text-xs text-muted-foreground">Critical</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-purple-600" />
            <p className="text-2xl font-bold text-purple-600">{analytics.hrCreatedCount}</p>
            <p className="text-xs text-muted-foreground">HR Assigned</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <UserCheck className="h-5 w-5 mx-auto mb-1 text-blue-600" />
            <p className="text-2xl font-bold text-blue-600">{analytics.employeeCreatedCount}</p>
            <p className="text-xs text-muted-foreground">Self Created</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">KPI Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        {isAdmin && analytics.departmentStats.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Department Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.departmentStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="avg" fill="hsl(var(--primary))" name="Avg Achievement %" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {analytics.monthlyTrends.length > 1 && (
          <Card className={isAdmin ? "" : "md:col-span-2"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Monthly Performance Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={analytics.monthlyTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="avg" stroke="hsl(var(--primary))" strokeWidth={2} name="Avg Achievement %" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
