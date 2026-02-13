import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useKPIManagement, EmployeeKPIRecord } from "@/hooks/useKPIManagement";
import { useHR } from "@/hooks/useHR";
import { KPIFormDialog } from "./KPIFormDialog";
import { KPITable } from "./KPITable";
import { KPIProgressDialog } from "./KPIProgressDialog";
import { KPIAnalyticsDashboard } from "./KPIAnalyticsDashboard";
import { RolesResponsibilitiesPanel } from "./RolesResponsibilitiesPanel";
import { Plus, BarChart3, Target, Briefcase } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function KPIManagementPanel() {
  const {
    kpis,
    progressHistory,
    rolesResponsibilities,
    loading,
    isHROrAdmin,
    createKPI,
    updateKPI,
    deleteKPI,
    updateProgress,
    fetchProgressHistory,
    createRoleResponsibility,
    deleteRoleResponsibility,
    getAnalytics,
  } = useKPIManagement();

  const { employees } = useHR();

  const [activeTab, setActiveTab] = useState("kpis");
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingKPI, setEditingKPI] = useState<EmployeeKPIRecord | null>(null);
  const [progressKPI, setProgressKPI] = useState<EmployeeKPIRecord | null>(null);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);

  const handleEdit = (kpi: EmployeeKPIRecord) => {
    setEditingKPI(kpi);
    setFormDialogOpen(true);
  };

  const handleViewProgress = (kpi: EmployeeKPIRecord) => {
    setProgressKPI(kpi);
    setProgressDialogOpen(true);
  };

  const handleCloseForm = (open: boolean) => {
    setFormDialogOpen(open);
    if (!open) setEditingKPI(null);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">KPI Management</h2>
        {isHROrAdmin && (
          <Button onClick={() => { setEditingKPI(null); setFormDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Create KPI
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="kpis" className="gap-1">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">KPIs</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1">
            <Briefcase className="h-4 w-4" />
            <span className="hidden sm:inline">Roles & Responsibilities</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kpis">
          <KPITable
            kpis={kpis}
            employees={employees}
            isAdmin={isHROrAdmin}
            onEdit={isHROrAdmin ? handleEdit : undefined}
            onDelete={isHROrAdmin ? deleteKPI : undefined}
            onViewProgress={handleViewProgress}
          />
        </TabsContent>

        <TabsContent value="analytics">
          <KPIAnalyticsDashboard
            kpis={kpis}
            employees={employees}
            getAnalytics={getAnalytics}
            isAdmin={isHROrAdmin}
          />
        </TabsContent>

        <TabsContent value="roles">
          <RolesResponsibilitiesPanel
            roles={rolesResponsibilities}
            employees={employees}
            isAdmin={isHROrAdmin}
            onCreate={createRoleResponsibility}
            onDelete={deleteRoleResponsibility}
          />
        </TabsContent>
      </Tabs>

      <KPIFormDialog
        open={formDialogOpen}
        onOpenChange={handleCloseForm}
        employees={employees}
        onSubmit={createKPI}
        editingKPI={editingKPI}
        onUpdate={updateKPI}
      />

      <KPIProgressDialog
        open={progressDialogOpen}
        onOpenChange={setProgressDialogOpen}
        kpi={progressKPI}
        progressHistory={progressHistory}
        onUpdateProgress={updateProgress}
        onFetchProgress={fetchProgressHistory}
        readOnly={isHROrAdmin && false}
      />
    </div>
  );
}
