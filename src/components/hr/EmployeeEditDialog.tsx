import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEditHistory } from "@/hooks/useEditHistory";
import { toast } from "sonner";
import type { EmployeeRecord } from "./EmployeesPanel";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employee: EmployeeRecord;
  onSaved: () => void;
}

const GENDER_OPTIONS = ["Male", "Female", "Other"];
const TYPE_OPTIONS = [
  { value: "full_time", label: "Full-time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
  { value: "part_time", label: "Part-time" },
];
const MODE_OPTIONS = ["Office", "Remote", "Hybrid", "Field"];
const RELATION_OPTIONS = ["Father", "Mother", "Spouse", "Sibling", "Other"];

export function EmployeeEditDialog({ open, onOpenChange, employee, onSaved }: Props) {
  const { profile } = useAuth();
  const { recordChanges } = useEditHistory();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    phone: "",
    personal_email: "",
    gender: "",
    date_of_birth: "",
    designation: "",
    department: "",
    employee_type: "",
    work_location: "",
    state: "",
    city: "",
    emergency_contact_name: "",
    emergency_contact_relation: "",
    emergency_contact_phone: "",
  });

  useEffect(() => {
    if (open && employee) {
      setForm({
        phone: employee.phone || "",
        personal_email: employee.personal_email || "",
        gender: employee.gender || "",
        date_of_birth: employee.date_of_birth || "",
        designation: employee.designation || "",
        department: employee.department || "",
        employee_type: employee.employee_type || "full_time",
        work_location: employee.work_location || "",
        state: employee.state || "",
        city: employee.city || "",
        emergency_contact_name: employee.emergency_contact_name || "",
        emergency_contact_relation: employee.emergency_contact_relation || "",
        emergency_contact_phone: employee.emergency_contact_phone || "",
      });
    }
  }, [open, employee]);

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    // Validation
    if (form.personal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.personal_email)) {
      toast.error("Invalid personal email format");
      return;
    }
    if (form.phone && !/^[+\d\s()-]{7,20}$/.test(form.phone)) {
      toast.error("Invalid phone number");
      return;
    }
    if (form.emergency_contact_phone && !/^[+\d\s()-]{7,20}$/.test(form.emergency_contact_phone)) {
      toast.error("Invalid emergency contact number");
      return;
    }

    setSaving(true);
    try {
      // Build changes for audit
      const changes: Record<string, { old: any; new: any }> = {};
      const fieldMap: Record<string, string> = {
        phone: "Phone", personal_email: "Personal Email", gender: "Gender",
        date_of_birth: "Date of Birth", designation: "Designation", department: "Department",
        employee_type: "Employee Type", work_location: "Mode", state: "State", city: "City",
        emergency_contact_name: "Emergency Contact Name", emergency_contact_relation: "Emergency Contact Relation",
        emergency_contact_phone: "Emergency Contact Phone",
      };

      for (const [key, label] of Object.entries(fieldMap)) {
        const oldVal = (employee as any)[key] || "";
        const newVal = (form as any)[key] || "";
        if (oldVal !== newVal) {
          changes[label] = { old: oldVal || null, new: newVal || null };
        }
      }

      if (Object.keys(changes).length === 0) {
        toast.info("No changes detected");
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from("employees")
        .update({
          phone: form.phone || null,
          personal_email: form.personal_email || null,
          gender: form.gender || null,
          date_of_birth: form.date_of_birth || null,
          designation: form.designation || null,
          department: form.department || "",
          employee_type: form.employee_type || null,
          work_location: form.work_location || null,
          state: form.state || null,
          city: form.city || null,
          emergency_contact_name: form.emergency_contact_name || null,
          emergency_contact_relation: form.emergency_contact_relation || null,
          emergency_contact_phone: form.emergency_contact_phone || null,
        })
        .eq("id", employee.id);

      if (error) throw error;

      // Record audit trail
      await recordChanges("employees", employee.id, changes, profile?.name || "HR");

      toast.success("Employee updated successfully");
      onSaved();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to update employee");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Employee — {employee.name} ({employee.employee_number})</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Contact Information */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-3">Contact Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={form.phone} onChange={e => update("phone", e.target.value)} placeholder="+91 9876543210" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Personal Email</Label>
                <Input type="email" value={form.personal_email} onChange={e => update("personal_email", e.target.value)} placeholder="user@gmail.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Gender</Label>
                <Select value={form.gender} onValueChange={v => update("gender", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{GENDER_OPTIONS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date of Birth</Label>
                <Input type="date" value={form.date_of_birth} onChange={e => update("date_of_birth", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Employment Information */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-3">Employment Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Designation</Label>
                <Input value={form.designation} onChange={e => update("designation", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Department</Label>
                <Input value={form.department} onChange={e => update("department", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Employee Type</Label>
                <Select value={form.employee_type} onValueChange={v => update("employee_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{TYPE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mode</Label>
                <Select value={form.work_location} onValueChange={v => update("work_location", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{MODE_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">State</Label>
                <Input value={form.state} onChange={e => update("state", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">City</Label>
                <Input value={form.city} onChange={e => update("city", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-3">Emergency Contact</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Relative Name</Label>
                <Input value={form.emergency_contact_name} onChange={e => update("emergency_contact_name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Relation</Label>
                <Select value={form.emergency_contact_relation} onValueChange={v => update("emergency_contact_relation", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{RELATION_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Contact Number</Label>
                <Input value={form.emergency_contact_phone} onChange={e => update("emergency_contact_phone", e.target.value)} placeholder="+91 9876543210" />
              </div>
            </div>
          </div>

          {/* Non-editable info */}
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <p><strong>Protected fields:</strong> Employee ID, Joining Date, and Xboom Email are system-managed and cannot be edited here.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
