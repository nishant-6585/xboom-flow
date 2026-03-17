import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TrainingAssignment, TrainingResource, TrainingResourceTracking, useEmployeeTrainings } from "@/hooks/useEmployeeTrainings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Youtube, Video, FileText, Link, StickyNote, MonitorPlay, CheckCircle2, Circle,
  ExternalLink, Play, Loader2, Calendar, User, AlertTriangle
} from "lucide-react";

const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  youtube: <Youtube className="h-5 w-5 text-red-500" />,
  zoom: <MonitorPlay className="h-5 w-5 text-blue-500" />,
  gmeet: <Video className="h-5 w-5 text-green-500" />,
  upload_video: <Play className="h-5 w-5 text-purple-500" />,
  document: <FileText className="h-5 w-5 text-orange-500" />,
  link: <Link className="h-5 w-5 text-blue-400" />,
  note: <StickyNote className="h-5 w-5 text-yellow-500" />,
};

interface Props {
  assignment: TrainingAssignment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrainingDetailDialog({ assignment, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { markResourceViewed, markCompleted, fetchAssignmentDetails, isHrOrAdmin } = useEmployeeTrainings();
  const [resources, setResources] = useState<TrainingResource[]>([]);
  const [tracking, setTracking] = useState<TrainingResourceTracking[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    if (assignment && open) {
      setLoadingDetails(true);
      fetchAssignmentDetails(assignment.id).then(({ resources: r, tracking: t }) => {
        setResources(r);
        setTracking(t);
        setLoadingDetails(false);
      });

      // Get employee_id for current user
      supabase
        .from("employees")
        .select("id")
        .eq("user_id", user?.id || "")
        .single()
        .then(({ data }) => setEmployeeId(data?.id || null));
    }
  }, [assignment?.id, open]);

  if (!assignment) return null;

  const isOverdue = assignment.status !== "completed" && new Date(assignment.due_date) < new Date();
  const isResourceViewed = (resourceId: string) =>
    tracking.some(t => t.resource_id === resourceId && t.is_viewed);
  const viewedCount = tracking.filter(t => t.is_viewed).length;
  const canComplete = viewedCount > 0 && assignment.status !== "completed";
  const isOwner = assignment.employee_id === employeeId;

  const handleOpenResource = async (resource: TrainingResource) => {
    if (isOwner && employeeId && !isResourceViewed(resource.id)) {
      await markResourceViewed(assignment.id, resource.id, employeeId);
      // Refresh tracking
      const { tracking: t } = await fetchAssignmentDetails(assignment.id);
      setTracking(t);
    }

    if (resource.resource_type === "note") return;
    if (resource.url_or_file_path) {
      window.open(resource.url_or_file_path, "_blank");
    }
  };

  const handleMarkCompleted = async () => {
    await markCompleted(assignment.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="pr-6">{assignment.training_title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-100px)] pr-4">
          <div className="space-y-5 pb-4">
            {/* Meta */}
            <div className="flex flex-wrap gap-2">
              <Badge variant={isOverdue ? "destructive" : assignment.status === "completed" ? "default" : "secondary"}>
                {isOverdue ? "Overdue" : assignment.status.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
              </Badge>
              <Badge variant="outline" className={
                assignment.priority === "high" ? "border-destructive text-destructive" :
                assignment.priority === "medium" ? "border-yellow-500 text-yellow-500" :
                "border-muted-foreground text-muted-foreground"
              }>
                {assignment.priority.charAt(0).toUpperCase() + assignment.priority.slice(1)} Priority
              </Badge>
            </div>

            {assignment.description && (
              <p className="text-sm text-muted-foreground">{assignment.description}</p>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4" />
                <span>Assigned by: {assignment.assigned_by_name}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Due: {format(new Date(assignment.due_date), "dd MMM yyyy")}</span>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Progress</span>
                <span>{Math.round(assignment.progress_percentage)}%</span>
              </div>
              <Progress value={assignment.progress_percentage} className="h-3" />
              <p className="text-xs text-muted-foreground">
                {viewedCount} of {resources.length} resources viewed
              </p>
            </div>

            <Separator />

            {/* Resources */}
            <div>
              <h3 className="font-semibold mb-3">Training Resources</h3>
              {loadingDetails ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : resources.length === 0 ? (
                <p className="text-sm text-muted-foreground">No resources attached to this training.</p>
              ) : (
                <div className="space-y-2">
                  {resources.map(r => {
                    const viewed = isResourceViewed(r.id);
                    return (
                      <Card
                        key={r.id}
                        className={`cursor-pointer transition-colors ${viewed ? "border-green-500/30 bg-green-500/5" : "hover:border-primary/50"}`}
                        onClick={() => handleOpenResource(r)}
                      >
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className="shrink-0">{RESOURCE_ICONS[r.resource_type] || <Link className="h-5 w-5" />}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{r.title}</p>
                            {r.description && <p className="text-xs text-muted-foreground truncate">{r.description}</p>}
                            {r.resource_type === "note" && r.url_or_file_path && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">{r.url_or_file_path}</p>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            {viewed ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : (
                              <Circle className="h-5 w-5 text-muted-foreground" />
                            )}
                            {r.resource_type !== "note" && r.url_or_file_path && (
                              <ExternalLink className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            {isOwner && canComplete && (
              <div className="pt-2">
                <Button onClick={handleMarkCompleted} className="w-full">
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Completed
                </Button>
              </div>
            )}

            {isOverdue && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertTriangle className="h-4 w-4" />
                This training is overdue. Please complete it as soon as possible.
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
