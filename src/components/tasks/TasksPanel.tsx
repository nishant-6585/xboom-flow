import { useState, useMemo } from "react";
import { useTasks, Task, TaskStatus, TASK_STATUSES, TASK_TYPES, TaskType } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ListTodo,
  Play,
  Pause,
  Search,
  User,
  Calendar,
  Flag,
  Building,
  CheckSquare,
  XSquare,
  Plus,
  Filter,
  RefreshCw,
  Trash2,
  Eye,
  MoreHorizontal,
} from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { TaskFormDialog } from "./TaskFormDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function TasksPanel() {
  const { user, role } = useAuth();
  const { tasks, myTasks, taskCounts, loading, updateTask, deleteTask, completeSupplierValidation, refetch } = useTasks();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [supplierValidationDialogOpen, setSupplierValidationDialogOpen] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const filteredTasks = useMemo(() => {
    let filtered = role === "admin" ? tasks : myTasks;

    // Filter out completed unless showing them
    if (!showCompletedTasks) {
      filtered = filtered.filter((t) => t.status !== "completed");
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(searchLower) ||
          t.description?.toLowerCase().includes(searchLower) ||
          t.assigned_to_name.toLowerCase().includes(searchLower)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((t) => t.status === statusFilter);
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter((t) => t.task_type === typeFilter);
    }

    return filtered;
  }, [tasks, myTasks, role, search, statusFilter, typeFilter, showCompletedTasks]);

  const getStatusBadge = (status: TaskStatus) => {
    const statusConfig = TASK_STATUSES.find((s) => s.value === status);
    return (
      <Badge
        variant="outline"
        className={`${statusConfig?.color} text-white border-0`}
      >
        {statusConfig?.label}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: number | null) => {
    switch (priority) {
      case 1:
        return <Badge variant="destructive">High</Badge>;
      case 2:
        return <Badge variant="secondary" className="bg-yellow-500 text-white">Medium</Badge>;
      default:
        return <Badge variant="outline">Low</Badge>;
    }
  };

  const getTaskTypeLabel = (type: string) => {
    return TASK_TYPES.find((t) => t.value === type)?.label || type;
  };

  const handleStatusChange = async (task: Task, newStatus: TaskStatus) => {
    // Special handling for supplier validation tasks
    if (task.task_type === "supplier_validation" && newStatus === "completed") {
      setSelectedTask(task);
      setSupplierValidationDialogOpen(true);
      return;
    }

    await updateTask(task.id, { status: newStatus });
  };

  const handleSupplierValidationComplete = async (supplierExists: boolean, flagNew: boolean = false) => {
    if (!selectedTask) return;
    await completeSupplierValidation(selectedTask.id, supplierExists, flagNew, completionNotes);
    setSupplierValidationDialogOpen(false);
    setSelectedTask(null);
    setCompletionNotes("");
  };

  const openTaskDetails = (task: Task) => {
    setSelectedTask(task);
    setTaskDialogOpen(true);
  };

  const handleDeleteClick = (task: Task) => {
    setTaskToDelete(task);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!taskToDelete) return;
    await deleteTask(taskToDelete.id);
    setDeleteDialogOpen(false);
    setTaskToDelete(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Create Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ListTodo className="w-6 h-6" />
            {role === "admin" ? "All Tasks" : "My Tasks"}
          </h2>
          <p className="text-muted-foreground text-sm">
            Manage and track your assigned tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Create Task
          </Button>
        </div>
      </div>

      {/* Task Stats */}
      {taskCounts && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <ListTodo className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{taskCounts.total_tasks}</p>
                <p className="text-xs text-muted-foreground">Total Tasks</p>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Clock className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{taskCounts.new_tasks}</p>
                <p className="text-xs text-muted-foreground">New</p>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Play className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{taskCounts.in_progress_tasks}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Pause className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{taskCounts.awaiting_approval_tasks}</p>
                <p className="text-xs text-muted-foreground">Awaiting</p>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{taskCounts.overdue_tasks}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {TASK_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Task Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {TASK_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={showCompletedTasks ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowCompletedTasks(!showCompletedTasks)}
              className="whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              {showCompletedTasks ? "Hide Completed" : "Show Completed"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Task List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ListTodo className="w-5 h-5" />
              Tasks ({filteredTasks.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">No tasks found</p>
              <p className="text-sm">
                {search || statusFilter !== "all" || typeFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Create a new task to get started"}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Create Task
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className={`p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group ${
                    task.due_date && isPast(new Date(task.due_date)) && task.status !== "completed"
                      ? "border-red-500/50 bg-red-500/5"
                      : ""
                  } ${task.status === "completed" ? "opacity-60" : ""}`}
                  onClick={() => openTaskDetails(task)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium truncate">{task.title}</h4>
                        {getPriorityBadge(task.priority)}
                        {getStatusBadge(task.status)}
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Flag className="w-3 h-3" />
                          {getTaskTypeLabel(task.task_type)}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {task.assigned_to_name}
                        </span>
                        {task.due_date && (
                          <span
                            className={`flex items-center gap-1 ${
                              isPast(new Date(task.due_date)) && task.status !== "completed"
                                ? "text-red-500 font-medium"
                                : ""
                            }`}
                          >
                            <Calendar className="w-3 h-3" />
                            {formatDistanceToNow(new Date(task.due_date), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {task.status === "new" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(task, "in_progress");
                          }}
                        >
                          <Play className="w-4 h-4 mr-1" />
                          Start
                        </Button>
                      )}
                      {task.status === "in_progress" && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(task, "completed");
                          }}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Complete
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            openTaskDetails(task);
                          }}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(task);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Task
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Task Dialog */}
      <TaskFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* Task Details Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedTask?.title}</DialogTitle>
            <DialogDescription>
              {getTaskTypeLabel(selectedTask?.task_type || "")}
            </DialogDescription>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedTask.status)}
                {getPriorityBadge(selectedTask.priority)}
              </div>

              <div>
                <Label className="text-muted-foreground">Description</Label>
                <p className="mt-1 whitespace-pre-wrap">{selectedTask.description || "No description"}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Assigned To</Label>
                  <p className="mt-1 flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {selectedTask.assigned_to_name}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Role</Label>
                  <p className="mt-1 capitalize">{selectedTask.assigned_role}</p>
                </div>
              </div>

              {selectedTask.due_date && (
                <div>
                  <Label className="text-muted-foreground">Due Date</Label>
                  <p className={`mt-1 flex items-center gap-1 ${
                    isPast(new Date(selectedTask.due_date)) && selectedTask.status !== "completed"
                      ? "text-red-500"
                      : ""
                  }`}>
                    <Calendar className="w-4 h-4" />
                    {format(new Date(selectedTask.due_date), "PPp")}
                  </p>
                </div>
              )}

              {selectedTask.completion_notes && (
                <div>
                  <Label className="text-muted-foreground">Completion Notes</Label>
                  <p className="mt-1">{selectedTask.completion_notes}</p>
                </div>
              )}

              <div className="text-xs text-muted-foreground border-t pt-3">
                Created: {format(new Date(selectedTask.created_at), "PPp")}
                {selectedTask.completed_at && (
                  <> • Completed: {format(new Date(selectedTask.completed_at), "PPp")}</>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedTask?.status === "new" && (
              <Button onClick={() => {
                handleStatusChange(selectedTask, "in_progress");
                setTaskDialogOpen(false);
              }}>
                <Play className="w-4 h-4 mr-2" />
                Start Task
              </Button>
            )}
            {selectedTask?.status === "in_progress" && (
              <Button onClick={() => {
                handleStatusChange(selectedTask, "completed");
                setTaskDialogOpen(false);
              }}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark Complete
              </Button>
            )}
            <Button variant="outline" onClick={() => setTaskDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Validation Dialog */}
      <Dialog open={supplierValidationDialogOpen} onOpenChange={setSupplierValidationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              Supplier Validation
            </DialogTitle>
            <DialogDescription>
              Does the supplier exist for this enquiry?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Completion Notes (optional)</Label>
              <Textarea
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="Add any notes about the supplier validation..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
              onClick={() => handleSupplierValidationComplete(false, true)}
            >
              <XSquare className="w-4 h-4 mr-2" />
              Flag as New Supplier
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => handleSupplierValidationComplete(true, false)}
            >
              <CheckSquare className="w-4 h-4 mr-2" />
              Supplier Verified
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{taskToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
