import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import type { EmployeeRecord } from "./EmployeesPanel";
import { useState, useEffect } from "react";
import { EditHistoryPanel } from "@/components/EditHistoryPanel";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employee: EmployeeRecord;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

export function EmployeeDetailDialog({ open, onOpenChange, employee }: Props) {
  const formatDate = (d: string | null) => d ? format(new Date(d), "dd MMM yyyy") : null;
  const formatType = (t: string | null) => t ? t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {employee.name}
            <Badge variant="outline" className="text-xs font-mono">{employee.employee_number}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Basic Information */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-3">Basic Information</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="Employee ID" value={employee.employee_number} />
              <Field label="Name" value={employee.name} />
              <Field label="Gender" value={employee.gender} />
              <Field label="Date of Birth" value={formatDate(employee.date_of_birth)} />
              <Field label="Phone" value={employee.phone} />
              <Field label="Personal Email" value={employee.personal_email} />
              <Field label="Xboom Email" value={employee.xboom_email} />
            </div>
          </div>

          <Separator />

          {/* Employment Details */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-3">Employment Details</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="Joining Date" value={formatDate(employee.joining_date)} />
              <Field label="Designation" value={employee.designation} />
              <Field label="Department" value={employee.department} />
              <Field label="Employee Type" value={formatType(employee.employee_type)} />
              <Field label="Mode" value={employee.work_location} />
              <Field label="State" value={employee.state} />
              <Field label="City" value={employee.city} />
              <Field label="Status" value={formatType(employee.employment_status)} />
            </div>
          </div>

          <Separator />

          {/* Emergency Contact */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-3">Emergency Contact</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="Relative Name" value={employee.emergency_contact_name} />
              <Field label="Relation" value={employee.emergency_contact_relation} />
              <Field label="Contact Details" value={employee.emergency_contact_phone} />
            </div>
          </div>

          <Separator />

          {/* Change History */}
          <div>
            <h4 className="text-sm font-semibold text-primary mb-3">Change History</h4>
            <EditHistoryPanel tableName="employees" recordId={employee.id} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
