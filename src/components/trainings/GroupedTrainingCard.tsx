import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { GroupedTraining, TrainingAssignment } from "@/hooks/useEmployeeTrainings";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Users, Trash2, CheckCircle2, Clock, AlertTriangle, User, UserPlus } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  assigned: { label: "Assigned", variant: "outline" },
  in_progress: { label: "In Progress", variant: "secondary" },
  completed: { label: "Completed", variant: "default" },
  overdue: { label: "Overdue", variant: "destructive" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "text-muted-foreground" },
  medium: { label: "Medium", color: "text-yellow-600 dark:text-yellow-400" },
  high: { label: "High", color: "text-destructive" },
};

const EMP_STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  in_progress: <Clock className="h-3.5 w-3.5 text-yellow-500" />,
  assigned: <User className="h-3.5 w-3.5 text-muted-foreground" />,
  overdue: <AlertTriangle className="h-3.5 w-3.5 text-destructive" />,
};

interface GroupedTrainingCardProps {
  group: GroupedTraining;
  isHrOrAdmin: boolean;
  onAssignmentClick: (assignment: TrainingAssignment) => void;
  onDeleteAssignment: (id: string) => void;
  onAddEmployees?: (group: GroupedTraining) => void;
}

export function GroupedTrainingCard({ group, isHrOrAdmin, onAssignmentClick, onDeleteAssignment, onAddEmployees }: GroupedTrainingCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const statusCfg = STATUS_CONFIG[group.grouped_status] || STATUS_CONFIG.assigned;
  const priorityCfg = PRIORITY_CONFIG[group.priority] || PRIORITY_CONFIG.medium;

  const getInitials = (name: string) => {
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  };

  const getEmployeeStatus = (a: TrainingAssignment): string => {
    if (a.status === "completed") return "completed";
    if (new Date(a.due_date) < new Date()) return "overdue";
    return a.status;
  };

  return (
    <Card className="transition-colors hover:border-primary/30">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm line-clamp-2">{group.training_title}</h3>
              {group.description && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{group.description}</p>
              )}
            </div>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>

          {/* Meta row */}
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              <span>{group.total_employees} Employee{group.total_employees !== 1 ? "s" : ""}</span>
            </div>
            <span className={priorityCfg.color}>{priorityCfg.label} Priority</span>
            <span>Due: {format(new Date(group.due_date), "dd MMM yyyy")}</span>
            {group.teams.length > 0 && (
              <span className="truncate max-w-[200px]">{group.teams.join(", ")}</span>
            )}
          </div>

          {/* Status summary chips */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            {group.completed_count > 0 && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" /> {group.completed_count} done
              </span>
            )}
            {group.in_progress_count > 0 && (
              <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                <Clock className="h-3 w-3" /> {group.in_progress_count} in progress
              </span>
            )}
            {group.assigned_count > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <User className="h-3 w-3" /> {group.assigned_count} pending
              </span>
            )}
            {group.overdue_count > 0 && (
              <span className="flex items-center gap-1 text-destructive">
                <AlertTriangle className="h-3 w-3" /> {group.overdue_count} overdue
              </span>
            )}
          </div>

          {/* Overall progress */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">{group.overall_progress}%</span>
            </div>
            <Progress value={group.overall_progress} className="h-2" />
          </div>

          {/* Employee avatars + expand trigger */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <div className="flex -space-x-2">
                {group.assignments.slice(0, 5).map(a => (
                  <div
                    key={a.id}
                    className="h-7 w-7 rounded-full bg-primary/10 border-2 border-background flex items-center justify-center"
                    title={a.employee_name || "Unknown"}
                  >
                    <span className="text-[10px] font-medium text-primary">
                      {getInitials(a.employee_name || "?")}
                    </span>
                  </div>
                ))}
                {group.total_employees > 5 && (
                  <div className="h-7 w-7 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      +{group.total_employees - 5}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {isOpen ? "Collapse" : "View Employees"}
              </Button>
            </CollapsibleTrigger>
          </div>

          {/* Expanded employee list */}
          <CollapsibleContent>
            <div className="border rounded-md divide-y mt-1">
              {group.assignments.map(a => {
                const empStatus = getEmployeeStatus(a);
                const empStatusCfg = STATUS_CONFIG[empStatus] || STATUS_CONFIG.assigned;

                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 p-3 hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => onAssignmentClick(a)}
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-primary">
                        {getInitials(a.employee_name || "?")}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{a.employee_name || "Unknown"}</span>
                        {a.employee_department && (
                          <span className="text-xs text-muted-foreground">({a.employee_department})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Progress value={a.progress_percentage} className="h-1.5 flex-1 max-w-[120px]" />
                        <span className="text-xs text-muted-foreground">{Math.round(a.progress_percentage)}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {EMP_STATUS_ICON[empStatus]}
                      <Badge variant={empStatusCfg.variant} className="text-[10px] px-1.5 py-0">
                        {empStatusCfg.label}
                      </Badge>
                      {isHrOrAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={e => { e.stopPropagation(); onDeleteAssignment(a.id); }}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
