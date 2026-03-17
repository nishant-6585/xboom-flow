import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useEmployeeTrainings, TrainingAssignment } from "@/hooks/useEmployeeTrainings";
import { AssignTrainingDialog } from "./AssignTrainingDialog";
import { TrainingDetailDialog } from "./TrainingDetailDialog";
import { Plus, Search, GraduationCap, Clock, CheckCircle2, AlertTriangle, Loader2, Trash2, BookOpen, Users } from "lucide-react";
import { format } from "date-fns";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  assigned: { label: "Assigned", variant: "outline" },
  in_progress: { label: "In Progress", variant: "secondary" },
  completed: { label: "Completed", variant: "default" },
  overdue: { label: "Overdue", variant: "destructive" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "text-muted-foreground" },
  medium: { label: "Medium", color: "text-yellow-500" },
  high: { label: "High", color: "text-destructive" },
};

export function EmployeeTrainingPanel() {
  const { user, profile } = useAuth();
  const { assignments, loading, isHrOrAdmin, assignTraining, deleteAssignment, uploadTrainingFile } = useEmployeeTrainings();
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<TrainingAssignment | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const filtered = useMemo(() => {
    return assignments.filter(a => {
      const matchesSearch =
        a.training_title.toLowerCase().includes(search.toLowerCase()) ||
        a.employee_name?.toLowerCase().includes(search.toLowerCase()) ||
        a.description?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || a.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || a.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [assignments, search, statusFilter, priorityFilter]);

  const stats = useMemo(() => ({
    total: assignments.length,
    assigned: assignments.filter(a => a.status === "assigned").length,
    inProgress: assignments.filter(a => a.status === "in_progress").length,
    completed: assignments.filter(a => a.status === "completed").length,
    overdue: assignments.filter(a => a.status === "overdue" || (a.status !== "completed" && new Date(a.due_date) < new Date())).length,
  }), [assignments]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Total</span></div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-blue-500" /><span className="text-sm text-muted-foreground">Assigned</span></div>
            <p className="text-2xl font-bold mt-1">{stats.assigned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-yellow-500" /><span className="text-sm text-muted-foreground">In Progress</span></div>
            <p className="text-2xl font-bold mt-1">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /><span className="text-sm text-muted-foreground">Completed</span></div>
            <p className="text-2xl font-bold mt-1">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /><span className="text-sm text-muted-foreground">Overdue</span></div>
            <p className="text-2xl font-bold mt-1">{stats.overdue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by title, employee..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        {isHrOrAdmin && (
          <Button onClick={() => setShowAssignDialog(true)}>
            <Plus className="h-4 w-4 mr-2" /> Assign Training
          </Button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No training assignments found</h3>
            <p className="text-muted-foreground">
              {search || statusFilter !== "all" || priorityFilter !== "all" ? "Try adjusting your filters" : "No trainings have been assigned yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(a => {
            const isOverdue = a.status !== "completed" && new Date(a.due_date) < new Date();
            const displayStatus = isOverdue ? "overdue" : a.status;
            const statusCfg = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.assigned;
            const priorityCfg = PRIORITY_CONFIG[a.priority] || PRIORITY_CONFIG.medium;

            return (
              <Card key={a.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedAssignment(a)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-sm line-clamp-2">{a.training_title}</h3>
                    <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                  </div>

                  {isHrOrAdmin && a.employee_name && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {a.employee_name} {a.employee_department ? `(${a.employee_department})` : ""}
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className={priorityCfg.color}>{priorityCfg.label} Priority</span>
                    <span>Due: {format(new Date(a.due_date), "dd MMM yyyy")}</span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{Math.round(a.progress_percentage)}%</span>
                    </div>
                    <Progress value={a.progress_percentage} className="h-2" />
                  </div>

                  {isHrOrAdmin && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={e => { e.stopPropagation(); deleteAssignment(a.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AssignTrainingDialog
        open={showAssignDialog}
        onOpenChange={setShowAssignDialog}
        onSubmit={assignTraining}
        uploadFile={uploadTrainingFile}
      />

      <TrainingDetailDialog
        assignment={selectedAssignment}
        open={!!selectedAssignment}
        onOpenChange={open => !open && setSelectedAssignment(null)}
      />
    </div>
  );
}
