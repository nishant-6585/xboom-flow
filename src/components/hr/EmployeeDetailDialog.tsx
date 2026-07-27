import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import type { EmployeeRecord } from "./EmployeesPanel";
import { useState, useEffect } from "react";
import { EditHistoryPanel } from "@/components/EditHistoryPanel";
import { EmploymentHistoryPanel } from "./EmploymentHistoryPanel";
import { BankAuditHistoryPanel } from "./BankAuditHistoryPanel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEditHistory } from "@/hooks/useEditHistory";
import { useOrgRoles, useOrgDepartments } from "@/hooks/useOrgRolesAndDepartments";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employee: EmployeeRecord;
  isHROrAdmin?: boolean;
  onSaved?: () => void;
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

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

export function EmployeeDetailDialog({ open, onOpenChange, employee, isHROrAdmin, onSaved }: Props) {
  const { profile } = useAuth();
  const { recordChanges } = useEditHistory();
  const { roles: orgRoles } = useOrgRoles();
  const { departments: orgDepartments } = useOrgDepartments();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("employees")
        .update({ is_active: false, employment_status: "terminated", updated_at: new Date().toISOString() })
        .eq("id", employee.id);
      if (error) throw error;

      // Log the deletion in edit history
      await recordChanges("employees", employee.id, {
        is_active: { old: "true", new: "false" },
        employment_status: { old: employee.employment_status, new: "terminated" },
      }, profile?.name || "Unknown");

      toast.success(`Employee "${employee.name}" has been removed`);
      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to delete employee");
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (d: string | null) => d ? format(new Date(d), "dd MMM yyyy") : null;
  const formatType = (t: string | null) => t ? t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : null;

  const [form, setForm] = useState({
    employee_number: "",
    phone: "", personal_email: "", xboom_email: "", gender: "", date_of_birth: "",
    designation: "", department: "", employee_type: "", work_location: "",
    state: "", city: "", joining_date: "",
    emergency_contact_name: "", emergency_contact_relation: "", emergency_contact_phone: "",
  });

  const [prevOpen, setPrevOpen] = useState(false);
  useEffect(() => {
    if (open && !prevOpen) {
      setEditing(false);
    }
    setPrevOpen(open);
  }, [open]);

  // Always sync form state when the employee prop changes (e.g. after refetch)
  useEffect(() => {
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id, employee.updated_at]);

  const resetForm = () => {
    setForm({
      employee_number: employee.employee_number || "",
      phone: employee.phone || "",
      personal_email: employee.personal_email || "",
      xboom_email: employee.xboom_email || "",
      gender: employee.gender || "",
      date_of_birth: employee.date_of_birth || "",
      designation: employee.designation || "",
      department: employee.department || "",
      employee_type: employee.employee_type || "full_time",
      work_location: employee.work_location || "",
      state: employee.state || "",
      city: employee.city || "",
      joining_date: employee.joining_date || "",
      emergency_contact_name: employee.emergency_contact_name || "",
      emergency_contact_relation: employee.emergency_contact_relation || "",
      emergency_contact_phone: employee.emergency_contact_phone || "",
    });
  };

  const [dateErrors, setDateErrors] = useState({ date_of_birth: "", joining_date: "" });

  const update = (key: string, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    if (key === "date_of_birth") {
      setDateErrors(prev => ({
        ...prev,
        date_of_birth: validateDob(value),
        joining_date: validateDoj(form.joining_date, value),
      }));
    } else if (key === "joining_date") {
      setDateErrors(prev => ({
        ...prev,
        joining_date: validateDoj(value, form.date_of_birth),
      }));
    }
  };

  const validateDob = (val: string): string => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "Invalid date of birth";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d > today) return "Date of birth cannot be in the future";
    const min = new Date("1900-01-01");
    if (d < min) return "Date of birth cannot be before 1900";
    return "";
  };

  const validateDoj = (val: string, dobVal: string): string => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "Invalid joining date";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d > today) return "Joining date cannot be in the future";
    if (dobVal) {
      const dob = new Date(dobVal);
      if (!isNaN(dob.getTime()) && d < dob) return "Joining date cannot be before date of birth";
    }
    return "";
  };

  const startEditing = () => { resetForm(); setDateErrors({ date_of_birth: "", joining_date: "" }); setEditing(true); };
  const handleCancel = () => { setEditing(false); resetForm(); };

  const handleSave = async () => {
    if (!form.employee_number.trim()) {
      toast.error("Employee ID is required"); return;
    }
    const empNum = form.employee_number.trim();
    if (!/^\d+$/.test(empNum) || parseInt(empNum, 10) < 1) {
      toast.error("Employee ID must be a number ≥ 1"); return;
    }
    if (form.personal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.personal_email)) {
      toast.error("Invalid personal email format"); return;
    }
    if (form.xboom_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.xboom_email)) {
      toast.error("Invalid Xboom email format"); return;
    }
    if (form.phone && !/^[+\d\s()-]{7,20}$/.test(form.phone)) {
      toast.error("Invalid phone number"); return;
    }
    if (form.emergency_contact_phone && !/^[+\d\s()-]{7,20}$/.test(form.emergency_contact_phone)) {
      toast.error("Invalid emergency contact number"); return;
    }

    const dobError = validateDob(form.date_of_birth);
    const dojError = validateDoj(form.joining_date, form.date_of_birth);
    setDateErrors({ date_of_birth: dobError, joining_date: dojError });
    if (dobError || dojError) {
      toast.error("Please fix the date errors before saving"); return;
    }

    // Check xboom_email uniqueness
    if (form.xboom_email) {
      const { data: existing } = await supabase
        .from("employees")
        .select("id")
        .eq("xboom_email", form.xboom_email)
        .neq("id", employee.id)
        .limit(1);
      if (existing && existing.length > 0) {
        toast.error("Xboom Email is already assigned to another employee"); return;
      }
    }

    // Check employee_number uniqueness
    if (form.employee_number && form.employee_number !== (employee.employee_number || "")) {
      const { data: existingEmpNum } = await supabase
        .from("employees")
        .select("id")
        .eq("employee_number", form.employee_number)
        .neq("id", employee.id)
        .limit(1);
      if (existingEmpNum && existingEmpNum.length > 0) {
        toast.error("Employee ID already exists. Please use a unique ID."); return;
      }
    }

    setSaving(true);
    try {
      const canEditJoiningDate = !employee.joining_date;
      const fieldMap: Record<string, string> = {
        employee_number: "Employee ID",
        phone: "Phone", personal_email: "Personal Email", xboom_email: "Xboom Email",
        gender: "Gender", date_of_birth: "Date of Birth", designation: "Role",
        department: "Department", employee_type: "Employee Type", work_location: "Mode",
        state: "State", city: "City",
        emergency_contact_name: "Emergency Contact Name",
        emergency_contact_relation: "Emergency Contact Relation",
        emergency_contact_phone: "Emergency Contact Phone",
      };

      if (canEditJoiningDate) {
        fieldMap.joining_date = "Joining Date";
      }

      const changes: Record<string, { old: any; new: any }> = {};
      for (const [key, label] of Object.entries(fieldMap)) {
        const oldVal = (employee as any)[key] || "";
        const newVal = (form as any)[key] || "";
        if (oldVal !== newVal) {
          changes[label] = { old: oldVal || null, new: newVal || null };
        }
      }

      if (Object.keys(changes).length === 0) {
        toast.info("No changes detected"); setSaving(false); return;
      }

      // Build a PATCH payload containing ONLY fields the user actually changed.
      // This prevents accidentally wiping other columns (e.g. when HR only edits
      // the Employee ID, we must not null out phone/email/etc.).
      const labelToColumn: Record<string, string> = Object.fromEntries(
        Object.entries(fieldMap).map(([col, label]) => [label, col])
      );
      const updatePayload: Record<string, string | null> = {};
      for (const label of Object.keys(changes)) {
        const col = labelToColumn[label];
        if (!col) continue;
        const newVal = (form as any)[col];
        if (col === "department") {
          updatePayload[col] = newVal || "";
        } else {
          updatePayload[col] = newVal ? newVal : null;
        }
      }

      const { data: updatedRows, error } = await supabase
        .from("employees")
        .update(updatePayload)
        .eq("id", employee.id)
        .select("id");

      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error("Update failed — no rows were affected. You may not have permission.");
      }

      await recordChanges("employees", employee.id, changes, profile?.name || "HR");
      toast.success("Employee updated successfully");
      setEditing(false);
      onSaved?.();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to update employee");
    } finally {
      setSaving(false);
    }
  };

  const renderEditableField = ({ label, fieldKey, type = "text", placeholder = "", error }: { label: string; fieldKey: string; type?: string; placeholder?: string; error?: string }) => {
    if (!editing) return <ReadOnlyField label={label} value={(employee as any)[fieldKey]} />;
    return (
      <div className="space-y-1">
        <Label className="text-xs">{label}</Label>
        <Input
          type={type}
          value={(form as any)[fieldKey]}
          onChange={(e) => update(fieldKey, e.target.value)}
          placeholder={placeholder}
          className={`h-8 text-sm ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
          aria-invalid={error ? "true" : "false"}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  };

  const renderEditableSelect = ({ label, fieldKey, options }: { label: string; fieldKey: string; options: string[] | { value: string; label: string }[] }) => {
    if (!editing) {
      const raw = (employee as any)[fieldKey];
      return <ReadOnlyField label={label} value={formatType(raw)} />;
    }
    const opts = typeof options[0] === "string"
      ? (options as string[]).map((o) => ({ value: o, label: o }))
      : (options as { value: string; label: string }[]);
    return (
      <div className="space-y-1">
        <Label className="text-xs">{label}</Label>
        <Select value={(form as any)[fieldKey]} onValueChange={(v) => update(fieldKey, v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>{opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="flex items-center gap-2">
              {employee.name}
              <Badge variant="outline" className="text-xs font-mono">{employee.employee_number}</Badge>
            </DialogTitle>
            {isHROrAdmin && !editing && (
              <div className="flex items-center gap-2 ml-4">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={startEditing}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="gap-1.5" disabled={deleting}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Employee</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to remove <strong>{employee.name}</strong> from the system? This will deactivate their account and mark them as terminated. This action can be reversed by an admin.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {deleting ? "Deleting..." : "Yes, Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Basic Information */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-3">Basic Information</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {editing && isHROrAdmin
                ? renderEditableField({ label: "Employee ID", fieldKey: "employee_number", placeholder: "e.g. 1" })
                : <ReadOnlyField label="Employee ID" value={employee.employee_number || "—"} />
              }
              <ReadOnlyField label="Name" value={employee.name} />
              {renderEditableSelect({ label: "Gender", fieldKey: "gender", options: GENDER_OPTIONS })}
              {editing ? (
                renderEditableField({ label: "Date of Birth", fieldKey: "date_of_birth", type: "date", error: dateErrors.date_of_birth })
              ) : (
                <ReadOnlyField label="Date of Birth" value={formatDate(employee.date_of_birth)} />
              )}
              {renderEditableField({ label: "Phone", fieldKey: "phone", placeholder: "+91 9876543210" })}
              {renderEditableField({ label: "Personal Email", fieldKey: "personal_email", type: "email", placeholder: "user@gmail.com" })}
              {renderEditableField({ label: "Xboom Email", fieldKey: "xboom_email", type: "email", placeholder: "user@xboom.in" })}
            </div>
          </div>

          <Separator />

          {/* Employment Details */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-3">Employment Details</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {editing && !employee.joining_date ? (
                renderEditableField({ label: "Joining Date", fieldKey: "joining_date", type: "date", error: dateErrors.joining_date })
              ) : (
                <ReadOnlyField label="Joining Date" value={formatDate(employee.joining_date || form.joining_date)} />
              )}
              {renderEditableField({ label: "Designation", fieldKey: "designation" })}
              {renderEditableSelect({ label: "Department", fieldKey: "department", options: orgDepartments.map(d => ({ value: d.name, label: d.name })) })}
              {renderEditableSelect({ label: "Employee Type", fieldKey: "employee_type", options: TYPE_OPTIONS })}
              {renderEditableSelect({ label: "Mode", fieldKey: "work_location", options: MODE_OPTIONS })}
              {renderEditableField({ label: "State", fieldKey: "state" })}
              {renderEditableField({ label: "City", fieldKey: "city" })}
              <ReadOnlyField label="Status" value={formatType(employee.employment_status)} />
            </div>
          </div>

          <Separator />

          {/* Emergency Contact */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-3">Emergency Contact</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {renderEditableField({ label: "Relative Name", fieldKey: "emergency_contact_name" })}
              {renderEditableSelect({ label: "Relation", fieldKey: "emergency_contact_relation", options: RELATION_OPTIONS })}
              {renderEditableField({ label: "Contact Details", fieldKey: "emergency_contact_phone", placeholder: "+91 9876543210" })}
            </div>
          </div>

          {editing && (
            <>
              <Separator />
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <strong>Note:</strong> Employee ID must be unique. New employees auto-receive sequential IDs starting from 1.
              </div>
            </>
          )}

          <Separator />

          {/* Employment History */}
          <EmploymentHistoryPanel
            employeeId={employee.id}
            employeeName={employee.name}
            isHROrAdmin={isHROrAdmin}
          />

          <Separator />

          {/* Bank Change Audit (HR/Admin/Finance only — component hides itself otherwise) */}
          {isHROrAdmin && (
            <>
              <BankAuditHistoryPanel employeeId={employee.id} />
              <Separator />
            </>
          )}

          {/* Change History */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-3">Change History</h4>
            <EditHistoryPanel tableName="employees" recordId={employee.id} />
          </div>
        </div>

        {editing && (
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
