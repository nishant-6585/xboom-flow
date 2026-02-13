import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RoleResponsibility } from "@/hooks/useKPIManagement";
import { Employee } from "@/hooks/useHR";
import { Plus, Trash2, Briefcase } from "lucide-react";
import { format } from "date-fns";

interface RolesResponsibilitiesPanelProps {
  roles: RoleResponsibility[];
  employees: Employee[];
  isAdmin: boolean;
  onCreate: (data: { employee_id: string; role_title: string; responsibilities: string; effective_date: string }) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export function RolesResponsibilitiesPanel({ roles, employees, isAdmin, onCreate, onDelete }: RolesResponsibilitiesPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    employee_id: "",
    role_title: "",
    responsibilities: "",
    effective_date: new Date().toISOString().split("T")[0],
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.employee_id || !form.role_title || !form.responsibilities) return;
    setSubmitting(true);
    const success = await onCreate(form);
    setSubmitting(false);
    if (success) {
      setDialogOpen(false);
      setForm({ employee_id: "", role_title: "", responsibilities: "", effective_date: new Date().toISOString().split("T")[0] });
    }
  };

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Define Role & Responsibilities
        </Button>
      )}

      {roles.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No roles & responsibilities defined yet
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map(r => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base">{r.role_title}</CardTitle>
                    {isAdmin && <p className="text-xs text-muted-foreground">{r.employee_name}</p>}
                  </div>
                  {isAdmin && (
                    <Button size="icon" variant="ghost" onClick={() => onDelete(r.id)} className="text-destructive h-7 w-7">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{r.responsibilities}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Effective: {format(new Date(r.effective_date), "dd MMM yyyy")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Define Role & Responsibilities</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role Title *</Label>
              <Input value={form.role_title} onChange={e => setForm(p => ({ ...p, role_title: e.target.value }))} placeholder="e.g. Senior Sales Executive" />
            </div>
            <div className="space-y-2">
              <Label>Responsibilities *</Label>
              <Textarea value={form.responsibilities} onChange={e => setForm(p => ({ ...p, responsibilities: e.target.value }))} rows={4} placeholder="List key responsibilities..." />
            </div>
            <div className="space-y-2">
              <Label>Effective Date</Label>
              <Input type="date" value={form.effective_date} onChange={e => setForm(p => ({ ...p, effective_date: e.target.value }))} />
            </div>
            <Button onClick={handleSubmit} disabled={submitting || !form.employee_id || !form.role_title || !form.responsibilities} className="w-full">
              {submitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
