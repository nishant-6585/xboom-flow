import { useState, useMemo, useEffect } from "react";
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthFilter } from "@/components/MonthFilter";
import { useDateFilter } from "@/hooks/useDateFilter";
import { useAuth } from "@/hooks/useAuth";
import { useDroneOperations, DroneOperationFormData, DroneOperation } from "@/hooks/useDroneOperations";
import { OperationsTable } from "@/components/drone-operations/OperationsTable";
import { OperationsKanban } from "@/components/drone-operations/OperationsKanban";
import { OperationFormDialog } from "@/components/drone-operations/OperationFormDialog";
import { OperationDetailDialog } from "@/components/drone-operations/OperationDetailDialog";
import { recordAuditLog } from "@/lib/auditLog";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Cpu, Presentation, GraduationCap, Wrench, CheckCircle, Clock, Download, Loader2, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function DroneOperations() {
  const { user, profile, role } = useAuth();
  const { operations, loading, createOperation, updateOperation, deleteOperation } = useDroneOperations();

  const [showForm, setShowForm] = useState(false);
  const [editingOp, setEditingOp] = useState<DroneOperation | null>(null);
  const [viewingOp, setViewingOp] = useState<DroneOperation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const dateFilter = useDateFilter("current_month");
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);

  const canEdit = ["admin", "supply_chain", "hr"].includes(role || "");

  useEffect(() => {
    supabase.from("employees").select("id, name").eq("is_active", true).order("name").then(({ data }) => {
      if (data) setEmployees(data);
    });
  }, []);

  const employeeMap = useMemo(() => {
    const m: Record<string, string> = {};
    employees.forEach(e => { m[e.id] = e.name; });
    return m;
  }, [employees]);

  const filtered = useMemo(() => {
    return operations.filter(op => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!op.project_name.toLowerCase().includes(q) && !op.client_name.toLowerCase().includes(q) && !(op.location || "").toLowerCase().includes(q)) return false;
      }
      if (typeFilter !== "all" && op.activity_type !== typeFilter) return false;
      if (statusFilter !== "all" && op.status !== statusFilter) return false;
      if (!dateFilter.inRange(op.activity_datetime)) return false;
      return true;
    });
  }, [operations, searchQuery, typeFilter, statusFilter, dateFilter.startDate, dateFilter.endDate]);

  const stats = useMemo(() => ({
    total: filtered.length,
    demos: filtered.filter(o => o.activity_type === "Demo").length,
    trainings: filtered.filter(o => o.activity_type === "Training").length,
    fieldWork: filtered.filter(o => o.activity_type === "Field Work").length,
    completed: filtered.filter(o => o.status === "Completed").length,
    pending: filtered.filter(o => o.status === "Planned" || o.status === "In Progress").length,
    totalRevenue: filtered
      .filter(o => o.status === "Completed")
      .reduce((sum, o: any) => sum + (Number(o.service_fee) || 0), 0),
  }), [filtered]);

  const handleSubmit = async (data: DroneOperationFormData, file?: File): Promise<boolean> => {
    let reportUrl: string | undefined;
    if (file) {
      const path = `${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("drone-operation-reports").upload(path, file);
      if (uploadErr) {
        toast.error("File upload failed: " + uploadErr.message);
        return false;
      }
      const { data: urlData } = supabase.storage.from("drone-operation-reports").getPublicUrl(path);
      reportUrl = urlData.publicUrl;
    }

    if (editingOp) {
      const updateData: any = { ...data };
      if (reportUrl) updateData.report_file_url = reportUrl;
      const ok = await updateOperation(editingOp.id, updateData);
      if (ok && data.status === "Completed" && editingOp.status !== "Completed") {
        recordAuditLog(user!.id, profile?.name || "", {
          action: "drone_operation_completed",
          details: { operation_id: editingOp.id, project: data.project_name },
        });
      }
      return ok;
    } else {
      const createData: any = { ...data };
      if (reportUrl) createData.report_file_url = reportUrl;
      return createOperation(createData, user!.id);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this operation?")) return;
    await deleteOperation(id);
  };

  const handleDownloadReport = (url: string) => {
    window.open(url, "_blank");
  };

  const exportToExcel = () => {
    const data = filtered.map(op => ({
      "Date & Time": new Date(op.activity_datetime).toLocaleString(),
      "Activity Type": op.activity_type,
      "Project": op.project_name,
      "Client": op.client_name,
      "Location": op.location || "",
      "Equipment": op.equipment_used.map(e => `${e.type}: ${e.model}`).join(", "),
      "Team": op.team_members.map(id => employeeMap[id] || id).join(", "),
      "Status": op.status,
      "Description": op.work_description || "",
      "Remarks": op.remarks || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Operations");
    XLSX.writeFile(wb, "drone_operations.xlsx");
    toast.success("Exported to Excel");
  };

  const kpiCards = [
    { label: dateFilter.preset === "custom" ? "Revenue (Period)" : "Total Revenue", value: `₹${stats.totalRevenue.toLocaleString()}`, icon: IndianRupee, color: "text-primary" },
    { label: "Total Activities", value: stats.total, icon: Cpu, color: "text-primary" },
    { label: "Demos", value: stats.demos, icon: Presentation, color: "text-purple-600" },
    { label: "Trainings", value: stats.trainings, icon: GraduationCap, color: "text-orange-600" },
    { label: "Field Work", value: stats.fieldWork, icon: Wrench, color: "text-teal-600" },
    { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-green-600" },
    { label: "Pending", value: stats.pending, icon: Clock, color: "text-yellow-600" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 pb-24 sm:pb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Demo & Trainings Operations</h1>
            <p className="text-muted-foreground text-sm">Track demos, training, and field work activities</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportToExcel}><Download className="h-4 w-4 mr-2" />Export</Button>
            {canEdit && (
              <Button size="sm" onClick={() => { setEditingOp(null); setShowForm(true); }}>
                <Plus className="h-4 w-4 mr-2" />Add Operation
              </Button>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
          {kpiCards.map(kpi => (
            <Card key={kpi.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <kpi.icon className={`h-8 w-8 ${kpi.color}`} />
                <div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search project, client, location..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Activity Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Demo">Demo</SelectItem>
              <SelectItem value="Training">Training</SelectItem>
              <SelectItem value="Field Work">Field Work</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Planned">Planned</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <MonthFilter filter={dateFilter} />
        </div>

        {/* Table / Kanban Tabs */}
        <Tabs defaultValue="table">
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
          </TabsList>
          <TabsContent value="table">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <OperationsTable
                operations={filtered}
                employeeMap={employeeMap}
                canEdit={canEdit}
                onView={op => setViewingOp(op)}
                onEdit={op => { setEditingOp(op); setShowForm(true); }}
                onDelete={handleDelete}
                onDownloadReport={handleDownloadReport}
              />
            )}
          </TabsContent>
          <TabsContent value="kanban">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <OperationsKanban operations={filtered} employeeMap={employeeMap} onView={op => setViewingOp(op)} />
            )}
          </TabsContent>
        </Tabs>
      </main>

      <OperationFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        operation={editingOp}
        onSubmit={handleSubmit}
        employees={employees}
      />

      <OperationDetailDialog
        open={!!viewingOp}
        onOpenChange={open => { if (!open) setViewingOp(null); }}
        operation={viewingOp}
        employeeMap={employeeMap}
        onDownloadReport={handleDownloadReport}
        canEdit={canEdit}
        onEdit={op => { setViewingOp(null); setEditingOp(op); setShowForm(true); }}
      />

      <MobileBottomNav />
    </div>
  );
}
