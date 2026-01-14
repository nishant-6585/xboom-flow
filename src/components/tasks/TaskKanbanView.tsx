import { Task, TaskStage, TASK_STAGES, PRIORITY_OPTIONS } from "@/hooks/useTasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskTimer, formatTimeSpent } from "./TaskTimer";
import { User, Calendar, Flag, Timer } from "lucide-react";
import { format, isPast } from "date-fns";

interface TaskKanbanViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onStartTimer: (taskId: string) => void;
  onPauseTimer: (taskId: string) => void;
  onStageChange: (taskId: string, stage: TaskStage) => void;
}

export function TaskKanbanView({
  tasks,
  onTaskClick,
  onStartTimer,
  onPauseTimer,
  onStageChange,
}: TaskKanbanViewProps) {
  const getTasksByStage = (stage: TaskStage) => {
    return tasks.filter((t) => (t.stage || 'new') === stage);
  };

  const getPriorityColor = (priority: number | null) => {
    const config = PRIORITY_OPTIONS.find(p => p.value === priority);
    return config?.color || 'bg-muted';
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("taskId", taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, stage: TaskStage) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) {
      onStageChange(taskId, stage);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto pb-4">
      {TASK_STAGES.map((stage) => (
        <div
          key={stage.value}
          className="min-w-[280px]"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, stage.value)}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                  {stage.label}
                </div>
                <Badge variant="secondary" className="text-xs">
                  {getTasksByStage(stage.value).length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
              {getTasksByStage(stage.value).map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onClick={() => onTaskClick(task)}
                  className={`p-3 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer ${
                    task.due_date && isPast(new Date(task.due_date)) && task.stage !== "completed"
                      ? "border-red-500/50 bg-red-500/5"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-medium text-sm line-clamp-2">{task.title}</h4>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${getPriorityColor(task.priority)}`} />
                  </div>
                  
                  {task.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {task.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1 mb-2">
                    <Badge variant="outline" className="text-xs">
                      <User className="w-3 h-3 mr-1" />
                      {task.assigned_to_name?.split(' ')[0]}
                    </Badge>
                    {task.assigned_by_name && (
                      <Badge variant="secondary" className="text-xs">
                        by {task.assigned_by_name.split(' ')[0]}
                      </Badge>
                    )}
                    {task.due_date && (
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${
                          isPast(new Date(task.due_date)) && task.stage !== "completed"
                            ? "border-red-500 text-red-500"
                            : ""
                        }`}
                      >
                        <Calendar className="w-3 h-3 mr-1" />
                        {format(new Date(task.due_date), "MMM d")}
                      </Badge>
                    )}
                  </div>

                  {task.stage !== 'completed' ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <TaskTimer
                        task={task}
                        onStart={() => onStartTimer(task.id)}
                        onPause={() => onPauseTimer(task.id)}
                        compact
                      />
                    </div>
                  ) : (task.time_spent_seconds || 0) > 0 ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Timer className="w-3 h-3" />
                      {formatTimeSpent(task.time_spent_seconds || 0)}
                    </div>
                  ) : null}
                </div>
              ))}
              {getTasksByStage(stage.value).length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No tasks
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
