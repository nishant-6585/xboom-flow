import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrainingAssignment, TrainingResource, TrainingResourceTracking } from "@/hooks/useEmployeeTrainings";
import { ResourcePreviewDialog } from "./ResourcePreviewDialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Youtube, Video, FileText, Link, StickyNote, MonitorPlay, CheckCircle2, Circle,
  ExternalLink, Play, Loader2, Calendar, User, AlertTriangle, Edit2, Save, X, Trash2
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

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
  assignments: TrainingAssignment[];
  fetchAssignmentDetails: (assignmentId: string) => Promise<{ resources: TrainingResource[]; tracking: TrainingResourceTracking[] }>;
  markResourceViewed: (assignmentId: string, resourceId: string, employeeId: string) => Promise<void>;
  markCompleted: (assignmentId: string) => Promise<void>;
  isHrOrAdmin: boolean;
  refetch: () => Promise<void>;
}

export function TrainingDetailDialog({
  assignment: assignmentProp,
  open,
  onOpenChange,
  assignments,
  fetchAssignmentDetails,
  markResourceViewed,
  markCompleted,
  isHrOrAdmin,
  refetch,
}: Props) {
  const { user } = useAuth();
  const [resources, setResources] = useState<TrainingResource[]>([]);
  const [tracking, setTracking] = useState<TrainingResourceTracking[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  // Always use the freshest assignment data from the hook's state
  const assignment = assignmentProp
    ? assignments.find(a => a.id === assignmentProp.id) || assignmentProp
    : null;

  // Edit state (metadata only)
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPriority, setEditPriority] = useState<"low" | "medium" | "high">("medium");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Resource preview state
  const [previewResource, setPreviewResource] = useState<TrainingResource | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (assignmentProp && open) {
      setLoadingDetails(true);
      setIsEditing(false);
      fetchAssignmentDetails(assignmentProp.id).then(({ resources: r, tracking: t }) => {
        setResources(r);
        setTracking(t);
        setLoadingDetails(false);
      });

      supabase
        .from("employees")
        .select("id")
        .eq("user_id", user?.id || "")
        .single()
        .then(({ data }) => setEmployeeId(data?.id || null));
    }
  }, [assignmentProp?.id, open]);

  if (!assignment) return null;

  const isOverdue = assignment.status !== "completed" && new Date(assignment.due_date) < new Date();
  const isResourceViewed = (resourceId: string) =>
    tracking.some(t => t.resource_id === resourceId && t.is_viewed);
  const viewedCount = tracking.filter(t => t.is_viewed).length;
  const canComplete = viewedCount > 0 && assignment.progress_percentage < 100 && assignment.status !== "completed";
  const isOwner = assignment.employee_id === employeeId;

  const startEditing = () => {
    setEditTitle(assignment.training_title);
    setEditDescription(assignment.description || "");
    setEditDueDate(assignment.due_date?.split("T")[0] || "");
    setEditPriority(assignment.priority as "low" | "medium" | "high");
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      // Update master training metadata
      if (assignment.training_id) {
        await supabase
          .from("employee_trainings")
          .update({
            title: editTitle,
            description: editDescription || null,
            priority: editPriority,
          })
          .eq("id", assignment.training_id);
      }

      // Update all assignments under this training_id
      await supabase
        .from("training_assignments")
        .update({
          training_title: editTitle,
          description: editDescription || null,
          due_date: editDueDate,
          priority: editPriority,
        })
        .eq("training_id", assignment.training_id);

      toast.success("Training updated successfully");
      setIsEditing(false);
      refetch();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update training");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!assignment) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("training_assignments")
        .delete()
        .eq("id", assignment.id);
      if (error) throw error;
      toast.success("Training assignment deleted successfully");
      refetch();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete training");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenResource = (resource: TrainingResource) => {
    setPreviewResource(resource);
    setPreviewOpen(true);
  };

  const handleMarkResourceViewed = async () => {
    if (!previewResource || !employeeId || !assignment) return;
    await markResourceViewed(assignment.id, previewResource.id, employeeId);
    // Refresh tracking and resources to get updated view counts
    const { tracking: t, resources: r } = await fetchAssignmentDetails(assignment.id);
    setTracking(t);
    setResources(r);
  };

  const handleMarkCompleted = async () => {
    if (!assignment) return;
    await markCompleted(assignment.id);
    // Refetch tracking so dialog shows updated state
    const { tracking: t } = await fetchAssignmentDetails(assignment.id);
    setTracking(t);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="pr-2">
              {isEditing ? "Edit Training" : assignment.training_title}
            </DialogTitle>
            {isHrOrAdmin && !isEditing && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Edit2 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive border-destructive/50 hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Training</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this training assignment and all its resources. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </DialogHeader>
        <ScrollArea className="flex-1 max-h-[calc(90vh-80px)]">
          <div className="space-y-5 pb-4 px-1 pr-5">
            {isEditing ? (
              /* Edit Form — metadata only */
              <div className="space-y-4">
                <div>
                  <Label>Training Title *</Label>
                  <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Due Date *</Label>
                    <Input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select value={editPriority} onValueChange={(v: any) => setEditPriority(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  To add or remove employees, use the "+ Add" button on the training card.
                </p>

                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button onClick={handleSaveEdit} disabled={isSaving || !editTitle || !editDueDate}>
                    {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Save Changes
                  </Button>
                </div>
              </div>
            ) : (
              /* View Mode */
              <>
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
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>

      <ResourcePreviewDialog
        resource={previewResource}
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreviewResource(null);
        }}
        isViewed={previewResource ? isResourceViewed(previewResource.id) : false}
        isOwner={isOwner}
        onMarkViewed={handleMarkResourceViewed}
      />
    </>
  );
}