import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeeKPIRecord, KPIFormData, KPIMeasurementUnit, KPIPriority } from "@/hooks/useKPIManagement";
import { Employee } from "@/hooks/useHR";

interface KPIFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  onSubmit: (data: KPIFormData) => Promise<boolean>;
  editingKPI?: EmployeeKPIRecord | null;
  onUpdate?: (id: string, data: Partial<KPIFormData>) => Promise<boolean>;
}

const MONTHS = [
  { value: 1, label: "January" }, { value: 2, label: "February" }, { value: 3, label: "March" },
  { value: 4, label: "April" }, { value: 5, label: "May" }, { value: 6, label: "June" },
  { value: 7, label: "July" }, { value: 8, label: "August" }, { value: 9, label: "September" },
  { value: 10, label: "October" }, { value: 11, label: "November" }, { value: 12, label: "December" },
];

const UNITS: { value: KPIMeasurementUnit; label: string }[] = [
  { value: "percentage", label: "Percentage (%)" },
  { value: "numeric", label: "Numeric" },
  { value: "currency", label: "Currency (₹)" },
  { value: "count", label: "Count" },
  { value: "rating", label: "Rating (1-5)" },
  { value: "boolean", label: "Yes/No" },
];

export function KPIFormDialog({ open, onOpenChange, employees, onSubmit, editingKPI, onUpdate }: KPIFormDialogProps) {
  const now = new Date();
  const [form, setForm] = useState<KPIFormData>({
    employee_id: "",
    title: "",
    description: "",
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    target_value: 100,
    measurement_unit: "percentage",
    weightage: 10,
    department: "",
    priority: "medium",
    due_date: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0],
    green_threshold: 90,
    amber_threshold: 70,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingKPI) {
      setForm({
        employee_id: editingKPI.employee_id,
        title: editingKPI.title,
        description: editingKPI.description || "",
        month: editingKPI.month,
        year: editingKPI.year,
        target_value: editingKPI.target_value,
        measurement_unit: editingKPI.measurement_unit,
        weightage: editingKPI.weightage,
        department: editingKPI.department || "",
        priority: editingKPI.priority,
        due_date: editingKPI.due_date,
        green_threshold: editingKPI.green_threshold,
        amber_threshold: editingKPI.amber_threshold,
      });
    } else if (open) {
      setForm({
        employee_id: "",
        title: "",
        description: "",
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        target_value: 100,
        measurement_unit: "percentage",
        weightage: 10,
        department: "",
        priority: "medium",
        due_date: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0],
        green_threshold: 90,
        amber_threshold: 70,
      });
    }
  }, [editingKPI, open]);

  const handleSubmit = async () => {
    if (!form.employee_id || !form.title || !form.due_date) return;
    setSubmitting(true);
    let success = false;
    if (editingKPI && onUpdate) {
      success = await onUpdate(editingKPI.id, form);
    } else {
      success = await onSubmit(form);
    }
    setSubmitting(false);
    if (success) onOpenChange(false);
  };

  // Auto-set department when employee changes
  useEffect(() => {
    if (form.employee_id) {
      const emp = employees.find(e => e.id === form.employee_id);
      if (emp) setForm(prev => ({ ...prev, department: emp.department }));
    }
  }, [form.employee_id, employees]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingKPI ? "Edit KPI" : "Create New KPI"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name} ({emp.department})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Input value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>KPI Title *</Label>
            <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Monthly Sales Target" />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the KPI objectives..." rows={2} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Month *</Label>
              <Select value={String(form.month)} onValueChange={v => setForm(p => ({ ...p, month: parseInt(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year *</Label>
              <Input type="number" value={form.year} onChange={e => setForm(p => ({ ...p, year: parseInt(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Target Value *</Label>
              <Input type="number" value={form.target_value} onChange={e => setForm(p => ({ ...p, target_value: parseFloat(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={form.measurement_unit} onValueChange={v => setForm(p => ({ ...p, measurement_unit: v as KPIMeasurementUnit }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Weightage (%)</Label>
              <Input type="number" min={1} max={100} value={form.weightage} onChange={e => setForm(p => ({ ...p, weightage: parseFloat(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v as KPIPriority }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Green ≥ (%)</Label>
              <Input type="number" value={form.green_threshold} onChange={e => setForm(p => ({ ...p, green_threshold: parseFloat(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Amber ≥ (%)</Label>
              <Input type="number" value={form.amber_threshold} onChange={e => setForm(p => ({ ...p, amber_threshold: parseFloat(e.target.value) }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Due Date *</Label>
            <Input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
          </div>

          <Button onClick={handleSubmit} disabled={submitting || !form.employee_id || !form.title} className="w-full">
            {submitting ? "Saving..." : editingKPI ? "Update KPI" : "Create KPI"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
