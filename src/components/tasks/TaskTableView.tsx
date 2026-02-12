import { Task, TaskStage, TASK_STAGES, TASK_TYPES, PRIORITY_OPTIONS } from "@/hooks/useTasks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskTimer, formatTimeSpent } from "./TaskTimer";
import { TaskStageBadge } from "./TaskStageSelect";
import { Eye, Trash2, Calendar, Timer } from "lucide-react";
import { format, isPast, formatDistanceToNow } from "date-fns";

interface TeamMember {
  user_id: string;
  name: string;
  role: 'sales' | 'supply_chain' | 'admin' | 'finance' | 'it' | 'marketing' | 'hr';
}

interface TaskTableViewProps {
  tasks: Task[];
  teamMembers: TeamMember[];
  onTaskClick: (task: Task) => void;
  onDeleteClick: (task: Task) => void;
  onStartTimer: (taskId: string) => void;
  onPauseTimer: (taskId: string) => void;
  onStageChange: (taskId: string, stage: TaskStage) => void;
  onAssigneeChange: (taskId: string, userId: string, userName: string, userRole: string) => void;
  onPriorityChange: (taskId: string, priority: number) => void;
}

export function TaskTableView({
  tasks,
  teamMembers,
  onTaskClick,
  onDeleteClick,
  onStartTimer,
  onPauseTimer,
  onStageChange,
  onAssigneeChange,
  onPriorityChange,
}: TaskTableViewProps) {
  const getTaskTypeLabel = (type: string) => {
    return TASK_TYPES.find((t) => t.value === type)?.label || type;
  };

  const getPriorityBadge = (priority: number | null) => {
    const config = PRIORITY_OPTIONS.find(p => p.value === priority);
    if (config) {
      return (
        <Badge variant="outline" className={`${config.color} text-white border-0 text-xs`}>
          P{config.value}
        </Badge>
      );
    }
    return <Badge variant="outline" className="text-xs">P3</Badge>;
  };

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[220px]">Task</TableHead>
            <TableHead className="w-[90px]">Priority</TableHead>
            <TableHead className="w-[110px]">Stage</TableHead>
            <TableHead className="w-[130px]">Assigned To</TableHead>
            <TableHead className="w-[130px]">Assigned By</TableHead>
            <TableHead className="w-[100px]">Due Date</TableHead>
            <TableHead className="w-[120px]">Timer</TableHead>
            <TableHead className="w-[90px]">Time Spent</TableHead>
            <TableHead className="w-[70px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                No tasks found
              </TableCell>
            </TableRow>
          ) : (
            tasks.map((task) => (
              <TableRow 
                key={task.id}
                className={`${
                  task.due_date && isPast(new Date(task.due_date)) && task.stage !== "completed"
                    ? "bg-red-500/5"
                    : ""
                } ${task.stage === "completed" ? "opacity-60" : ""}`}
              >
                <TableCell>
                  <div 
                    className="cursor-pointer hover:text-primary"
                    onClick={() => onTaskClick(task)}
                  >
                    <div className="font-medium line-clamp-1">{task.title}</div>
                    <div className="text-xs text-muted-foreground">{getTaskTypeLabel(task.task_type)}</div>
                  </div>
                </TableCell>
                <TableCell>
                  {task.stage !== 'completed' ? (
                    <Select
                      value={task.priority?.toString() || "3"}
                      onValueChange={(v) => onPriorityChange(task.id, parseInt(v))}
                    >
                      <SelectTrigger className="h-7 w-[70px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value.toString()}>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${opt.color}`} />
                              P{opt.value}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    getPriorityBadge(task.priority)
                  )}
                </TableCell>
                <TableCell>
                  {task.stage !== 'completed' ? (
                    <Select
                      value={task.stage || 'new'}
                      onValueChange={(v) => onStageChange(task.id, v as TaskStage)}
                    >
                      <SelectTrigger className="h-7 w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
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
                  ) : (
                    <TaskStageBadge stage={task.stage} />
                  )}
                </TableCell>
                <TableCell>
                  {task.stage !== 'completed' ? (
                    <Select
                      value={task.assigned_to}
                      onValueChange={(userId) => {
                        const member = teamMembers.find(m => m.user_id === userId);
                        if (member) {
                          onAssigneeChange(task.id, member.user_id, member.name, member.role);
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm">{task.assigned_to_name}</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {task.assigned_by_name || "System"}
                  </span>
                </TableCell>
                <TableCell>
                  {task.due_date ? (
                    <div className={`flex items-center gap-1 text-xs ${
                      isPast(new Date(task.due_date)) && task.stage !== "completed"
                        ? "text-red-500 font-medium"
                        : "text-muted-foreground"
                    }`}>
                      <Calendar className="w-3 h-3" />
                      {formatDistanceToNow(new Date(task.due_date), { addSuffix: true })}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {task.stage !== 'completed' ? (
                    <TaskTimer
                      task={task}
                      onStart={() => onStartTimer(task.id)}
                      onPause={() => onPauseTimer(task.id)}
                      compact
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {(task.time_spent_seconds || 0) > 0 ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Timer className="w-3 h-3" />
                      {formatTimeSpent(task.time_spent_seconds || 0)}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onTaskClick(task)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-500 hover:text-red-600"
                      onClick={() => onDeleteClick(task)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
