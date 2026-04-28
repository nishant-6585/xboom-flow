import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Loader2, Youtube, Video, FileText, Link, StickyNote, MonitorPlay, Users, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AssignTrainingData, TrainingResource } from "@/hooks/useEmployeeTrainings";

interface ResourceInput {
  resource_type: TrainingResource["resource_type"];
  title: string;
  url_or_file_path: string;
  description: string;
  file?: File;
}

const RESOURCE_TYPE_OPTIONS: { value: TrainingResource["resource_type"]; label: string; icon: React.ReactNode }[] = [
  { value: "youtube", label: "YouTube Video", icon: <Youtube className="h-4 w-4" /> },
  { value: "zoom", label: "Zoom Recording", icon: <MonitorPlay className="h-4 w-4" /> },
  { value: "gmeet", label: "Google Meet Recording", icon: <Video className="h-4 w-4" /> },
  { value: "upload_video", label: "Upload Video", icon: <Video className="h-4 w-4" /> },
  { value: "document", label: "Document (PDF/PPT)", icon: <FileText className="h-4 w-4" /> },
  { value: "link", label: "External Link", icon: <Link className="h-4 w-4" /> },
  { value: "note", label: "Notes", icon: <StickyNote className="h-4 w-4" /> },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AssignTrainingData, userId: string, userName: string) => Promise<any>;
  uploadFile: (file: File, assignmentId: string) => Promise<string | null>;
}

type SelectionMode = "individual" | "team";

export function AssignTrainingDialog({ open, onOpenChange, onSubmit, uploadFile }: Props) {
  const { user, profile } = useAuth();
  const [employees, setEmployees] = useState<{ id: string; name: string; department: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const [selectionMode, setSelectionMode] = useState<SelectionMode>("team");
  const [employeeId, setEmployeeId] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [resources, setResources] = useState<ResourceInput[]>([{ resource_type: "document", title: "", url_or_file_path: "", description: "" }]);

  useEffect(() => {
    if (open) {
      supabase
        .from("employees")
        .select("id, name, department")
        .eq("is_active", true)
        .order("name")
        .then(({ data }) => setEmployees(data || []));
    }
  }, [open]);

  const teams = useMemo(() => {
    const deptMap = new Map<string, number>();
    employees.forEach(e => {
      const dept = e.department || "General";
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    });
    return Array.from(deptMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  const teamEmployees = useMemo(() => {
    if (!selectedTeam) return [];
    return employees.filter(e => (e.department || "General") === selectedTeam);
  }, [employees, selectedTeam]);

  const selectedEmployeeIds = useMemo(() => {
    if (selectionMode === "individual") {
      return employeeId ? [employeeId] : [];
    }
    return teamEmployees.map(e => e.id);
  }, [selectionMode, employeeId, teamEmployees]);

  const resetForm = () => {
    setSelectionMode("team");
    setEmployeeId("");
    setSelectedTeam("");
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("medium");
    setResources([{ resource_type: "document", title: "", url_or_file_path: "", description: "" }]);
  };

  const addResource = () => {
    setResources([...resources, { resource_type: "document", title: "", url_or_file_path: "", description: "" }]);
  };

  const updateResource = (index: number, field: keyof ResourceInput, value: any) => {
    const updated = [...resources];
    (updated[index] as any)[field] = value;
    setResources(updated);
  };

  const removeResource = (index: number) => {
    setResources(resources.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!user || !profile || selectedEmployeeIds.length === 0 || !title || !dueDate) return;
    setSaving(true);
    try {
      const resourceData = resources
        .map((r, i) => ({
          resource_type: r.resource_type,
          title: r.title || r.file?.name?.replace(/\.[^/.]+$/, "") || `Resource ${i + 1}`,
          url_or_file_path: r.resource_type === "upload_video" || r.resource_type === "document" ? "" : r.url_or_file_path,
          description: "",
        }));

      // The first call creates the master training + resources; subsequent calls reuse it
      let firstAssignment: any = null;
      for (const empId of selectedEmployeeIds) {
        const assignment = await onSubmit(
          { employee_id: empId, training_title: title, description, due_date: dueDate, priority, resources: resourceData },
          user.id,
          profile.name || "Unknown"
        );

        if (!firstAssignment) firstAssignment = assignment;

        // Upload files for first assignment only (master resources get the URL)
        if (assignment && empId === selectedEmployeeIds[0]) {
          for (let i = 0; i < resources.length; i++) {
            const r = resources[i];
            if ((r.resource_type === "upload_video" || r.resource_type === "document") && r.file) {
              const url = await uploadFile(r.file, assignment.id);
              if (url) {
                // Update master resource
                const { data: masterRes } = await supabase
                  .from("employee_training_resources")
                  .select("id")
                  .eq("training_id", assignment.training_id)
                  .eq("resource_order", i)
                  .single();

                if (masterRes) {
                  await supabase
                    .from("employee_training_resources")
                    .update({ url_or_file_path: url })
                    .eq("id", masterRes.id);
                }

                // Update all per-assignment resources with this URL
                const { data: allAssignments } = await supabase
                  .from("training_assignments")
                  .select("id")
                  .eq("training_id", assignment.training_id);

                if (allAssignments) {
                  for (const ta of allAssignments) {
                    const { data: resData } = await supabase
                      .from("training_resources")
                      .select("id")
                      .eq("training_assignment_id", ta.id)
                      .eq("resource_order", i)
                      .single();

                    if (resData) {
                      await supabase
                        .from("training_resources")
                        .update({ url_or_file_path: url })
                        .eq("id", resData.id);
                    }
                  }
                }
              }
            }
          }
        }
      }

      resetForm();
      onOpenChange(false);
    } catch (error) {
      // handled in hook
    } finally {
      setSaving(false);
    }
  };

  const needsUrl = (type: string) => !["upload_video", "document", "note"].includes(type);
  const needsFile = (type: string) => ["upload_video", "document"].includes(type);

  const isValid = selectedEmployeeIds.length > 0 && title && dueDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Assign Training to Employee</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          <div className="space-y-4 pb-4 px-1 pr-5">
            {/* Selection Mode Toggle */}
            <div>
              <Label className="mb-2 block">Assign To</Label>
              <Tabs value={selectionMode} onValueChange={(v) => {
                setSelectionMode(v as SelectionMode);
                setEmployeeId("");
                setSelectedTeam("");
              }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="team" className="gap-2">
                    <Users className="h-4 w-4" />
                    Team
                  </TabsTrigger>
                  <TabsTrigger value="individual" className="gap-2">
                    <User className="h-4 w-4" />
                    Employee
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Employee or Team Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {selectionMode === "individual" ? (
                <div>
                  <Label>Employee *</Label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger className="w-full text-left"><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {employees.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.name} ({e.department})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Team *</Label>
                  <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                    <SelectTrigger className="w-full text-left"><SelectValue placeholder="Select team" /></SelectTrigger>
                    <SelectContent>
                      {teams.map(t => (
                        <SelectItem key={t.name} value={t.name}>
                          {t.name} ({t.count} {t.count === 1 ? 'member' : 'members'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTeam && teamEmployees.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {teamEmployees.map(e => (
                        <Badge key={e.id} variant="secondary" className="text-xs">
                          {e.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div>
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Training Title *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Drone Operations Safety Training" />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what this training covers..." rows={3} />
            </div>

            <div>
              <Label>Due Date *</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>

            {/* Resources */}
            <div>
              <Label className="text-base font-semibold mb-2 block">Training Resources</Label>

              <div className="space-y-3">
                {resources.map((r, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Resource {i + 1}</span>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeResource(i)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>

                      <div>
                        <Label>Type</Label>
                        <Select value={r.resource_type} onValueChange={(v: any) => updateResource(i, "resource_type", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {RESOURCE_TYPE_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <span className="flex items-center gap-2">{opt.icon} {opt.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {needsUrl(r.resource_type) && (
                        <div>
                          <Label>URL</Label>
                          <Input value={r.url_or_file_path} onChange={e => updateResource(i, "url_or_file_path", e.target.value)} placeholder="https://..." />
                        </div>
                      )}

                      {needsFile(r.resource_type) && (
                        <div>
                          <Label>Upload File</Label>
                          <Input
                            type="file"
                            accept={r.resource_type === "upload_video" ? "video/*" : ".pdf,.ppt,.pptx,.doc,.docx"}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                updateResource(i, "file", file);
                                if (!r.title) {
                                  updateResource(i, "title", file.name.replace(/\.[^/.]+$/, ""));
                                }
                              }
                            }}
                          />
                        </div>
                      )}

                      {r.resource_type === "note" && (
                        <div>
                          <Label>Notes Content</Label>
                          <Textarea
                            value={r.url_or_file_path}
                            onChange={e => updateResource(i, "url_or_file_path", e.target.value)}
                            placeholder="Write training notes here..."
                            rows={4}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={addResource} className="w-full mt-2">
                <Plus className="h-4 w-4 mr-1" /> Add Resource
              </Button>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={saving || !isValid}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {selectionMode === "team" && selectedEmployeeIds.length > 1
                  ? `Assign to ${selectedEmployeeIds.length} Members`
                  : "Assign Training"
                }
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
