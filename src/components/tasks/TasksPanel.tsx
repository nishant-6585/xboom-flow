import { useState, useMemo, useEffect } from "react";
import { useTasks, Task, TaskStatus, TaskStage, TASK_STATUSES, TASK_STAGES, TASK_TYPES, TaskType, PRIORITY_OPTIONS } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Edit,
  Save,
  UserCog,
  Timer,
  LayoutList,
  Table2,
  Kanban,
} from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { TaskFormDialog } from "./TaskFormDialog";
import { TaskTimer, formatTimeSpent } from "./TaskTimer";
import { TaskStageSelect, TaskStageBadge } from "./TaskStageSelect";
import { TaskKanbanView } from "./TaskKanbanView";
import { TaskTimeReport } from "./TaskTimeReport";
import { TaskTableView } from "./TaskTableView";
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
import { toast } from "sonner";

type ViewMode = 'list' | 'table' | 'kanban';

interface TeamMember {
  user_id: string;
  name: string;
  role: 'sales' | 'supply_chain' | 'admin' | 'finance';
}

export function TasksPanel() {
  const { user, role } = useAuth();
  const { tasks, myTasks, taskCounts, loading, updateTask, deleteTask, completeSupplierValidation, startTimer, pauseTimer, updateStage, refetch } = useTasks();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [supplierValidationDialogOpen, setSupplierValidationDialogOpen] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  
  // Edit mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editDueDate, setEditDueDate] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editPriority, setEditPriority] = useState<number>(3);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  // Fetch team members for reassignment
  useEffect(() => {
    const fetchTeamMembers = async () => {
      try {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, name")
          .eq("is_approved", true);

        if (profilesError) throw profilesError;

        const { data: roles, error: rolesError } = await supabase
          .from("user_roles")
          .select("user_id, role");

        if (rolesError) throw rolesError;

        const roleMap = new Map<string, string>();
        (roles || []).forEach((r: any) => {
          roleMap.set(r.user_id, r.role);
        });

        const members: TeamMember[] = (profiles || [])
          .filter((p: any) => roleMap.has(p.user_id))
          .map((p: any) => ({
            user_id: p.user_id,
            name: p.name,
            role: (roleMap.get(p.user_id) || "sales") as TeamMember["role"],
          }));

        setTeamMembers(members);
      } catch (error) {
        console.error("Error fetching team members:", error);
      }
    };

    fetchTeamMembers();
  }, []);

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

    if (stageFilter !== "all") {
      filtered = filtered.filter((t) => t.stage === stageFilter);
    }

    return filtered;
  }, [tasks, myTasks, role, search, statusFilter, stageFilter, showCompletedTasks]);

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
    const config = PRIORITY_OPTIONS.find(p => p.value === priority);
    if (config) {
      return (
        <Badge variant="outline" className={`${config.color} text-white border-0`}>
          {config.label}
        </Badge>
      );
    }
    return <Badge variant="outline">Priority 3</Badge>;
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
    setIsEditing(false);
    // Initialize edit fields with current values
    setEditDueDate(task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd'T'HH:mm") : "");
    setEditAssignee(task.assigned_to);
    setEditPriority(task.priority || 3);
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

  const handleStartEdit = () => {
    if (!selectedTask) return;
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (!selectedTask) return;
    setIsEditing(false);
    // Reset to original values
    setEditDueDate(selectedTask.due_date ? format(new Date(selectedTask.due_date), "yyyy-MM-dd'T'HH:mm") : "");
    setEditAssignee(selectedTask.assigned_to);
    setEditPriority(selectedTask.priority || 3);
  };

  const handleSaveEdit = async () => {
    if (!selectedTask) return;
    
    setSavingEdit(true);
    try {
      const assignee = teamMembers.find(m => m.user_id === editAssignee);
      
      const updates: Partial<Task> = {
        due_date: editDueDate ? new Date(editDueDate).toISOString() : null,
        priority: editPriority,
      };

      // Only update assignee if changed
      if (editAssignee !== selectedTask.assigned_to && assignee) {
        updates.assigned_to = assignee.user_id;
        updates.assigned_to_name = assignee.name;
        updates.assigned_role = assignee.role;
      }

      const success = await updateTask(selectedTask.id, updates);
      if (success) {
        setIsEditing(false);
        // Update selected task locally for immediate feedback
        setSelectedTask({
          ...selectedTask,
          ...updates,
          assigned_to_name: assignee?.name || selectedTask.assigned_to_name,
        });
        toast.success("Task updated successfully");
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const getFilteredTeamMembers = () => {
    return teamMembers;
  };

  // Handle inline assignee change from table/kanban
  const handleInlineAssigneeChange = async (taskId: string, userId: string, userName: string, userRole: string) => {
    await updateTask(taskId, {
      assigned_to: userId,
      assigned_to_name: userName,
      assigned_role: userRole as Task['assigned_role'],
    });
  };

  // Handle inline priority change
  const handleInlinePriorityChange = async (taskId: string, priority: number) => {
    await updateTask(taskId, { priority });
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
          <TaskTimeReport tasks={role === "admin" ? tasks : myTasks} />
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
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {TASK_STAGES.map((stage) => (
                  <SelectItem key={stage.value} value={stage.value}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                      {stage.label}
                    </div>
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
          
          {/* View Mode Toggles */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <span className="text-sm text-muted-foreground">
              {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
            </span>
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList className="h-8">
                <TabsTrigger value="list" className="h-7 px-3">
                  <LayoutList className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">List</span>
                </TabsTrigger>
                <TabsTrigger value="table" className="h-7 px-3">
                  <Table2 className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Table</span>
                </TabsTrigger>
                <TabsTrigger value="kanban" className="h-7 px-3">
                  <Kanban className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Kanban</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Task Views */}
      {viewMode === 'kanban' ? (
        <TaskKanbanView
          tasks={filteredTasks}
          onTaskClick={openTaskDetails}
          onStartTimer={startTimer}
          onPauseTimer={pauseTimer}
          onStageChange={updateStage}
        />
      ) : viewMode === 'table' ? (
        <TaskTableView
          tasks={filteredTasks}
          teamMembers={teamMembers}
          onTaskClick={openTaskDetails}
          onDeleteClick={handleDeleteClick}
          onStartTimer={startTimer}
          onPauseTimer={pauseTimer}
          onStageChange={updateStage}
          onAssigneeChange={handleInlineAssigneeChange}
          onPriorityChange={handleInlinePriorityChange}
        />
      ) : (
        /* List View */
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ListTodo className="w-5 h-5" />
              Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
          {filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">No tasks found</p>
              <p className="text-sm">
                {search || statusFilter !== "all" || stageFilter !== "all"
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
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium truncate">{task.title}</h4>
                        {getPriorityBadge(task.priority)}
                        <TaskStageBadge stage={task.stage || 'new'} />
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
                        {task.assigned_by_name && (
                          <span className="flex items-center gap-1">
                            <UserCog className="w-3 h-3" />
                            by {task.assigned_by_name}
                          </span>
                        )}
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
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Timer display */}
                      {task.stage !== 'completed' && (
                        <TaskTimer
                          task={task}
                          onStart={() => startTimer(task.id)}
                          onPause={() => pauseTimer(task.id)}
                          compact
                        />
                      )}
                      {task.stage === 'completed' && (task.time_spent_seconds || 0) > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Timer className="w-3 h-3" />
                          {formatTimeSpent(task.time_spent_seconds || 0)}
                        </div>
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
                          {TASK_STAGES.filter(s => s.value !== task.stage).map(stage => (
                            <DropdownMenuItem 
                              key={stage.value}
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStage(task.id, stage.value);
                              }}
                            >
                              <div className={`w-2 h-2 rounded-full ${stage.color} mr-2`} />
                              Move to {stage.label}
                            </DropdownMenuItem>
                          ))}
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
      )}
      {/* Create Task Dialog */}
      <TaskFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* Task Details Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={(open) => {
        setTaskDialogOpen(open);
        if (!open) setIsEditing(false);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{selectedTask?.title}</DialogTitle>
                <DialogDescription>
                  {getTaskTypeLabel(selectedTask?.task_type || "")}
                </DialogDescription>
              </div>
              {selectedTask?.status !== "completed" && !isEditing && (
                <Button variant="outline" size="sm" onClick={handleStartEdit}>
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              {/* Stage and Timer row */}
              <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Stage</Label>
                    {selectedTask.stage !== 'completed' ? (
                      <TaskStageSelect
                        value={selectedTask.stage || 'new'}
                        onChange={(stage) => updateStage(selectedTask.id, stage)}
                      />
                    ) : (
                      <TaskStageBadge stage={selectedTask.stage} />
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Time Spent</Label>
                  <div className="mt-1">
                    <TaskTimer
                      task={selectedTask}
                      onStart={() => startTimer(selectedTask.id)}
                      onPause={() => pauseTimer(selectedTask.id)}
                    />
                  </div>
                </div>
              </div>

              {/* Priority */}
              <div className="flex items-center gap-2">
                <Label className="text-muted-foreground">Priority:</Label>
                {isEditing ? (
                  <Select
                    value={editPriority.toString()}
                    onValueChange={(value) => setEditPriority(parseInt(value))}
                  >
                    <SelectTrigger className="w-[140px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value.toString()}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${opt.color}`} />
                            {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  getPriorityBadge(selectedTask.priority)
                )}
              </div>

              <div>
                <Label className="text-muted-foreground">Description</Label>
                <p className="mt-1 whitespace-pre-wrap">{selectedTask.description || "No description"}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground flex items-center gap-1">
                    <UserCog className="w-3 h-3" />
                    Assigned To
                  </Label>
                  {isEditing ? (
                    <Select
                      value={editAssignee}
                      onValueChange={setEditAssignee}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                      <SelectContent>
                        {getFilteredTeamMembers().map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            <span className="flex items-center gap-2">
                              {member.name}
                              <Badge variant="outline" className="text-xs capitalize">
                                {member.role.replace('_', ' ')}
                              </Badge>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="mt-1 flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {selectedTask.assigned_to_name}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-muted-foreground">Role</Label>
                  <p className="mt-1 capitalize">
                    {isEditing 
                      ? teamMembers.find(m => m.user_id === editAssignee)?.role?.replace('_', ' ') || selectedTask.assigned_role
                      : selectedTask.assigned_role?.replace('_', ' ')
                    }
                  </p>
                </div>
              </div>

              {/* Assigned By */}
              {selectedTask.assigned_by_name && (
                <div>
                  <Label className="text-muted-foreground flex items-center gap-1">
                    <UserCog className="w-3 h-3" />
                    Assigned By
                  </Label>
                  <p className="mt-1">{selectedTask.assigned_by_name}</p>
                </div>
              )}

              <div>
                <Label className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Due Date
                </Label>
                {isEditing ? (
                  <Input
                    type="datetime-local"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="mt-1"
                  />
                ) : selectedTask.due_date ? (
                  <p className={`mt-1 flex items-center gap-1 ${
                    isPast(new Date(selectedTask.due_date)) && selectedTask.status !== "completed"
                      ? "text-red-500"
                      : ""
                  }`}>
                    <Calendar className="w-4 h-4" />
                    {format(new Date(selectedTask.due_date), "PPp")}
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">No due date set</p>
                )}
              </div>

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
                {(selectedTask.time_spent_seconds || 0) > 0 && (
                  <> • Total time: {formatTimeSpent(selectedTask.time_spent_seconds || 0)}</>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={handleCancelEdit} disabled={savingEdit}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit} disabled={savingEdit}>
                  <Save className="w-4 h-4 mr-2" />
                  {savingEdit ? "Saving..." : "Save Changes"}
                </Button>
              </>
            ) : (
              <>
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
              </>
            )}
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
