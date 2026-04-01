import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useEmployeeTrainings, TrainingAssignment } from "@/hooks/useEmployeeTrainings";
import { AssignTrainingDialog } from "./AssignTrainingDialog";
import { TrainingDetailDialog } from "./TrainingDetailDialog";
import { GroupedTrainingCard } from "./GroupedTrainingCard";
import { Plus, Search, GraduationCap, Clock, CheckCircle2, AlertTriangle, Loader2, BookOpen, Users } from "lucide-react";

export function EmployeeTrainingPanel() {
  const { user, profile } = useAuth();
  const { assignments, groupedTrainings, loading, isHrOrAdmin, assignTraining, deleteAssignment, uploadTrainingFile } = useEmployeeTrainings();
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<TrainingAssignment | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const filtered = useMemo(() => {
    return groupedTrainings.filter(g => {
      const matchesSearch =
        g.training_title.toLowerCase().includes(search.toLowerCase()) ||
        g.assignments.some(a => a.employee_name?.toLowerCase().includes(search.toLowerCase())) ||
        g.description?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || g.grouped_status === statusFilter;
      const matchesPriority = priorityFilter === "all" || g.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [groupedTrainings, search, statusFilter, priorityFilter]);

  const stats = useMemo(() => ({
    totalTrainings: groupedTrainings.length,
    totalAssignments: assignments.length,
    inProgress: groupedTrainings.filter(g => g.grouped_status === "in_progress").length,
    completed: groupedTrainings.filter(g => g.grouped_status === "completed").length,
    overdue: groupedTrainings.filter(g => g.grouped_status === "overdue").length,
  }), [groupedTrainings, assignments]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Trainings</span></div>
            <p className="text-2xl font-bold mt-1">{stats.totalTrainings}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Assignments</span></div>
            <p className="text-2xl font-bold mt-1">{stats.totalAssignments}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">In Progress</span></div>
            <p className="text-2xl font-bold mt-1">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Completed</span></div>
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
          <Input placeholder="Search by title or employee..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
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

      {/* Grouped List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No trainings found</h3>
            <p className="text-muted-foreground">
              {search || statusFilter !== "all" || priorityFilter !== "all" ? "Try adjusting your filters" : "No trainings have been assigned yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(group => (
            <GroupedTrainingCard
              key={group.key}
              group={group}
              isHrOrAdmin={isHrOrAdmin}
              onAssignmentClick={setSelectedAssignment}
              onDeleteAssignment={deleteAssignment}
            />
          ))}
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
