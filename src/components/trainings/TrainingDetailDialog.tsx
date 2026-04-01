import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrainingAssignment, TrainingResource, TrainingResourceTracking, useEmployeeTrainings } from "@/hooks/useEmployeeTrainings";
import { ResourcePreviewDialog } from "./ResourcePreviewDialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Youtube, Video, FileText, Link, StickyNote, MonitorPlay, CheckCircle2, Circle,
  ExternalLink, Play, Loader2, Calendar, User, AlertTriangle, Edit2, Save, X, Trash2, Users
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
}

export function TrainingDetailDialog({ assignment, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { markResourceViewed, markCompleted, fetchAssignmentDetails, isHrOrAdmin, refetch, assignTraining } = useEmployeeTrainings();
  const [resources, setResources] = useState<TrainingResource[]>([]);
  const [tracking, setTracking] = useState<TrainingResourceTracking[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPriority, setEditPriority] = useState<"low" | "medium" | "high">("medium");
  const [editStatus, setEditStatus] = useState("assigned");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Employee/Team selection for edit
  const [allEmployees, setAllEmployees] = useState<{ id: string; name: string; department: string }[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectionTab, setSelectionTab] = useState<"team" | "employee">("team");
  const [existingAssignedIds, setExistingAssignedIds] = useState<string[]>([]);

  useEffect(() => {
    if (assignment && open) {
      setLoadingDetails(true);
      setIsEditing(false);
      fetchAssignmentDetails(assignment.id).then(({ resources: r, tracking: t }) => {
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
  }, [assignment?.id, open]);

  // Fetch employees when editing starts
  useEffect(() => {
    if (isEditing && assignment) {
      supabase
        .from("employees")
        .select("id, name, department")
        .eq("is_active", true)
        .order("name")
        .then(({ data }) => setAllEmployees(data || []));

      // Find all employees who already have this same training title assigned
      supabase
        .from("training_assignments")
        .select("employee_id")
        .eq("training_title", assignment.training_title)
        .then(({ data }) => {
          const ids = (data || []).map(d => d.employee_id);
          setExistingAssignedIds(ids);
          setSelectedEmployeeIds(ids);
        });
    }
  }, [isEditing, assignment?.training_title]);

  const teams = useMemo(() => {
    const deptMap = new Map<string, number>();
    allEmployees.forEach(e => {
      const dept = e.department || "General";
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    });
    return Array.from(deptMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEmployees]);

  if (!assignment) return null;

  const getTeamEmployees = (team: string) =>
    allEmployees.filter(e => (e.department || "General") === team);

  const toggleTeam = (teamName: string) => {
    const teamEmpIds = getTeamEmployees(teamName).map(e => e.id);
    const isSelected = selectedTeams.includes(teamName);

    if (isSelected) {
      setSelectedTeams(prev => prev.filter(t => t !== teamName));
      setSelectedEmployeeIds(prev => prev.filter(id => !teamEmpIds.includes(id)));
    } else {
      setSelectedTeams(prev => [...prev, teamName]);
      setSelectedEmployeeIds(prev => [...new Set([...prev, ...teamEmpIds])]);
    }
  };

  const toggleEmployee = (empId: string) => {
    setSelectedEmployeeIds(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
    // Sync team selection state
    const emp = allEmployees.find(e => e.id === empId);
    if (emp) {
      const dept = emp.department || "General";
      const teamEmpIds = getTeamEmployees(dept).map(e => e.id);
      const updatedSelection = selectedEmployeeIds.includes(empId)
        ? selectedEmployeeIds.filter(id => id !== empId)
        : [...selectedEmployeeIds, empId];
      const allSelected = teamEmpIds.every(id => updatedSelection.includes(id));
      if (allSelected && !selectedTeams.includes(dept)) {
        setSelectedTeams(prev => [...prev, dept]);
      } else if (!allSelected && selectedTeams.includes(dept)) {
        setSelectedTeams(prev => prev.filter(t => t !== dept));
      }
    }
  };

  const isOverdue = assignment.status !== "completed" && new Date(assignment.due_date) < new Date();
  const isResourceViewed = (resourceId: string) =>
    tracking.some(t => t.resource_id === resourceId && t.is_viewed);
  const viewedCount = tracking.filter(t => t.is_viewed).length;
  const canComplete = viewedCount > 0 && assignment.status !== "completed";
  const isOwner = assignment.employee_id === employeeId;

  const startEditing = () => {
    setEditTitle(assignment.training_title);
    setEditDescription(assignment.description || "");
    setEditDueDate(assignment.due_date);
    setEditPriority(assignment.priority as "low" | "medium" | "high");
    setEditStatus(assignment.status);
    setSelectedTeams([]);
    setSelectionTab("team");
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      // Update existing assignment
      const { error } = await supabase
        .from("training_assignments")
        .update({
          training_title: editTitle,
          description: editDescription || null,
          due_date: editDueDate,
          priority: editPriority,
          status: editStatus,
        })
        .eq("id", assignment.id);

      if (error) throw error;

      // Also update all other assignments with the same original title
      if (editTitle !== assignment.training_title || editDescription !== (assignment.description || "") || editDueDate !== assignment.due_date || editPriority !== assignment.priority) {
        await supabase
          .from("training_assignments")
          .update({
            training_title: editTitle,
            description: editDescription || null,
            due_date: editDueDate,
            priority: editPriority,
          })
          .eq("training_title", assignment.training_title)
          .neq("id", assignment.id);
      }

      // Find new employees to assign (not in existingAssignedIds)
      const newEmployeeIds = selectedEmployeeIds.filter(id => !existingAssignedIds.includes(id));

      // Get resources from current assignment to duplicate
      const { data: currentResources } = await supabase
        .from("training_resources")
        .select("*")
        .eq("training_assignment_id", assignment.id)
        .order("resource_order");

      // Create new assignments for new employees
      for (const empId of newEmployeeIds) {
        const { data: newAssignment, error: assignError } = await supabase
          .from("training_assignments")
          .insert({
            employee_id: empId,
            training_title: editTitle,
            description: editDescription || null,
            due_date: editDueDate,
            priority: editPriority,
            assigned_by: user.id,
            assigned_by_name: assignment.assigned_by_name,
            status: "assigned",
            progress_percentage: 0,
          })
          .select()
          .single();

        if (assignError) throw assignError;

        // Duplicate resources
        if (currentResources && currentResources.length > 0 && newAssignment) {
          const resourceRows = currentResources.map((r: any) => ({
            training_assignment_id: newAssignment.id,
            resource_type: r.resource_type,
            title: r.title,
            url_or_file_path: r.url_or_file_path,
            description: r.description,
            resource_order: r.resource_order,
          }));

          await supabase.from("training_resources").insert(resourceRows);
        }
      }

      const addedCount = newEmployeeIds.length;
      const message = addedCount > 0
        ? `Training updated and assigned to ${addedCount} additional employee${addedCount > 1 ? 's' : ''}`
        : "Training updated successfully";

      toast.success(message);
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
      await supabase.from("training_resource_tracking" as any).delete().eq("assignment_id", assignment.id);
      await supabase.from("training_resources" as any).delete().eq("assignment_id", assignment.id);
      const { error } = await supabase.from("training_assignments" as any).delete().eq("id", assignment.id);
      if (error) throw error;
      toast.success("Training deleted successfully");
      refetch();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete training");
    } finally {
      setIsDeleting(false);
    }
  };

  // Resource preview state
  const [previewResource, setPreviewResource] = useState<TrainingResource | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleOpenResource = (resource: TrainingResource) => {
    setPreviewResource(resource);
    setPreviewOpen(true);
  };

  const handleMarkResourceViewed = async () => {
    if (!previewResource || !employeeId) return;
    await markResourceViewed(assignment.id, previewResource.id, employeeId);
    const { tracking: t } = await fetchAssignmentDetails(assignment.id);
    setTracking(t);
    refetch();
  };

  const handleMarkCompleted = async () => {
    await markCompleted(assignment.id);
    onOpenChange(false);
  };

  const newEmployeeCount = selectedEmployeeIds.filter(id => !existingAssignedIds.includes(id)).length;

  return (
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
              /* Edit Form */
              <div className="space-y-4">
                <div>
                  <Label>Training Title *</Label>
                  <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                  <div>
                    <Label>Status</Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Add Employees/Teams */}
                <Separator />
                <div>
                  <Label className="text-base font-semibold mb-2 block">Add More Employees / Teams</Label>
                  <Tabs value={selectionTab} onValueChange={(v) => setSelectionTab(v as "team" | "employee")}>
                    <TabsList className="grid w-full grid-cols-2 mb-3">
                      <TabsTrigger value="team" className="gap-2">
                        <Users className="h-4 w-4" /> Team
                      </TabsTrigger>
                      <TabsTrigger value="employee" className="gap-2">
                        <User className="h-4 w-4" /> Employee
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {selectionTab === "team" ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                      {teams.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No teams found.</p>
                      ) : teams.map(t => {
                        const teamEmpIds = getTeamEmployees(t.name).map(e => e.id);
                        const allSelected = teamEmpIds.every(id => selectedEmployeeIds.includes(id));
                        const someSelected = teamEmpIds.some(id => selectedEmployeeIds.includes(id));
                        const alreadyAssignedCount = teamEmpIds.filter(id => existingAssignedIds.includes(id)).length;

                        return (
                          <div key={t.name} className="flex items-center gap-3 py-1.5 px-1 rounded hover:bg-accent/50">
                            <Checkbox
                              checked={allSelected}
                              // @ts-ignore
                              indeterminate={someSelected && !allSelected}
                              onCheckedChange={() => toggleTeam(t.name)}
                            />
                            <div className="flex-1">
                              <span className="text-sm font-medium">{t.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                ({t.count} {t.count === 1 ? 'member' : 'members'})
                              </span>
                            </div>
                            {alreadyAssignedCount > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {alreadyAssignedCount} assigned
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-3">
                      {allEmployees.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No employees found.</p>
                      ) : allEmployees.map(e => {
                        const isAlreadyAssigned = existingAssignedIds.includes(e.id);
                        return (
                          <div key={e.id} className="flex items-center gap-3 py-1.5 px-1 rounded hover:bg-accent/50">
                            <Checkbox
                              checked={selectedEmployeeIds.includes(e.id)}
                              onCheckedChange={() => toggleEmployee(e.id)}
                            />
                            <div className="flex-1">
                              <span className="text-sm">{e.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">({e.department || "General"})</span>
                            </div>
                            {isAlreadyAssigned && (
                              <Badge variant="secondary" className="text-xs">Assigned</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedEmployeeIds.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {selectedEmployeeIds.length} employee{selectedEmployeeIds.length > 1 ? 's' : ''} selected
                      {newEmployeeCount > 0 && (
                        <span className="text-primary font-medium"> · {newEmployeeCount} new</span>
                      )}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button onClick={handleSaveEdit} disabled={isSaving || !editTitle || !editDueDate}>
                    {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    {newEmployeeCount > 0
                      ? `Save & Assign ${newEmployeeCount} New`
                      : "Save Changes"
                    }
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
  );
}
