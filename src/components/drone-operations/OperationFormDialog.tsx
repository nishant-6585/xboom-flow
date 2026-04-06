import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { DroneOperation, DroneOperationFormData } from "@/hooks/useDroneOperations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation?: DroneOperation | null;
  onSubmit: (data: DroneOperationFormData, file?: File) => Promise<boolean>;
  employees: { id: string; name: string }[];
}

const ACTIVITY_TYPES = ["Demo", "Training", "Field Work"] as const;
const STATUSES = ["Planned", "In Progress", "Completed", "Cancelled"] as const;

export function OperationFormDialog({ open, onOpenChange, operation, onSubmit, employees }: Props) {
  const [saving, setSaving] = useState(false);
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [form, setForm] = useState<DroneOperationFormData>({
    activity_datetime: "",
    activity_type: "Demo",
    project_name: "",
    client_name: "",
    location: "",
    equipment_used: [{ type: "Drone", model: "" }],
    team_members: [],
    work_description: "",
    status: "Planned",
    remarks: "",
  });

  useEffect(() => {
    if (operation) {
      setForm({
        activity_datetime: operation.activity_datetime ? new Date(operation.activity_datetime).toISOString().slice(0, 16) : "",
        activity_type: operation.activity_type,
        project_name: operation.project_name,
        client_name: operation.client_name,
        location: operation.location || "",
        equipment_used: operation.equipment_used.length > 0 ? operation.equipment_used : [{ type: "Drone", model: "" }],
        team_members: operation.team_members || [],
        work_description: operation.work_description || "",
        status: operation.status,
        remarks: operation.remarks || "",
      });
    } else {
      setForm({
        activity_datetime: "",
        activity_type: "Demo",
        project_name: "",
        client_name: "",
        location: "",
        equipment_used: [{ type: "Drone", model: "" }],
        team_members: [],
        work_description: "",
        status: "Planned",
        remarks: "",
      });
    }
    setReportFile(null);
  }, [operation, open]);

  const addEquipment = () => setForm(f => ({ ...f, equipment_used: [...f.equipment_used, { type: "Drone", model: "" }] }));
  const removeEquipment = (i: number) => setForm(f => ({ ...f, equipment_used: f.equipment_used.filter((_, idx) => idx !== i) }));
  const updateEquipment = (i: number, field: "type" | "model", val: string) => {
    setForm(f => {
      const eq = [...f.equipment_used];
      eq[i] = { ...eq[i], [field]: val };
      return { ...f, equipment_used: eq };
    });
  };

  const toggleTeamMember = (id: string) => {
    setForm(f => ({
      ...f,
      team_members: f.team_members.includes(id) ? f.team_members.filter(m => m !== id) : [...f.team_members, id],
    }));
  };

  const handleSubmit = async () => {
    if (!form.activity_datetime || !form.project_name || !form.client_name) {
      toast.error("Please fill in required fields");
      return;
    }
    setSaving(true);
    const success = await onSubmit(form, reportFile || undefined);
    setSaving(false);
    if (success) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{operation ? "Edit Operation" : "Add Operation"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date & Time *</Label>
              <Input type="datetime-local" value={form.activity_datetime} onChange={e => setForm(f => ({ ...f, activity_datetime: e.target.value }))} />
            </div>
            <div>
              <Label>Activity Type *</Label>
              <Select value={form.activity_type} onValueChange={v => setForm(f => ({ ...f, activity_type: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACTIVITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Project Name *</Label>
              <Input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} />
            </div>
            <div>
              <Label>Client Name *</Label>
              <Input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Location</Label>
              <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Equipment */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Equipment Used</Label>
              <Button type="button" variant="outline" size="sm" onClick={addEquipment}><Plus className="h-3 w-3 mr-1" />Add</Button>
            </div>
            {form.equipment_used.map((eq, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Select value={eq.type} onValueChange={v => updateEquipment(i, "type", v)}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Drone">Drone</SelectItem>
                    <SelectItem value="Robot">Robot</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Model name" value={eq.model} onChange={e => updateEquipment(i, "model", e.target.value)} />
                {form.equipment_used.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeEquipment(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                )}
              </div>
            ))}
          </div>

          {/* Team Members */}
          <div>
            <Label>Team Members</Label>
            <div className="flex flex-wrap gap-2 mt-1 max-h-32 overflow-y-auto border rounded-md p-2">
              {employees.map(emp => (
                <Button
                  key={emp.id}
                  type="button"
                  variant={form.team_members.includes(emp.id) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleTeamMember(emp.id)}
                  className="text-xs"
                >
                  {emp.name}
                </Button>
              ))}
              {employees.length === 0 && <span className="text-xs text-muted-foreground">No employees found</span>}
            </div>
          </div>

          <div>
            <Label>Work Description</Label>
            <Textarea value={form.work_description} onChange={e => setForm(f => ({ ...f, work_description: e.target.value }))} rows={3} />
          </div>

          <div>
            <Label>Upload Report</Label>
            <Input type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.jpg,.png" onChange={e => setReportFile(e.target.files?.[0] || null)} />
            {operation?.report_file_url && !reportFile && <p className="text-xs text-muted-foreground mt-1">Existing report attached</p>}
          </div>

          <div>
            <Label>Remarks</Label>
            <Textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {operation ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
