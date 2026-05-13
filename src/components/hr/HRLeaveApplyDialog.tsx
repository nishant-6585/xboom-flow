import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LeaveType, Employee } from "@/hooks/useHR";
import { UserPlus, AlertCircle, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface HRLeaveApplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  onSubmit: (data: {
    employee_id: string;
    leave_type: LeaveType;
    start_date: string;
    end_date: string;
    reason?: string;
  }) => Promise<boolean>;
}

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "EL", label: "Earned Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "half_day_EL", label: "Half Day Earned Leave" },
  { value: "half_day_sick", label: "Half Day Sick Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
  { value: "half_day_unpaid", label: "Half Day Unpaid Leave" },
];

export function HRLeaveApplyDialog({
  open,
  onOpenChange,
  employees,
  onSubmit,
}: HRLeaveApplyDialogProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState<LeaveType>("EL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [leaveBalance, setLeaveBalance] = useState<number | null>(null);

  // Fetch balance when employee or leave type changes
  useEffect(() => {
    if (!employeeId || !open) { setLeaveBalance(null); return; }
    const baseType = leaveType.replace('half_day_', '');
    const year = new Date().getFullYear();
    supabase
      .from('leave_balances')
      .select('balance')
      .eq('employee_id', employeeId)
      .eq('leave_type', baseType)
      .eq('year', year)
      .maybeSingle()
      .then(({ data }) => setLeaveBalance(data?.balance ?? 0));
  }, [employeeId, leaveType, open]);

  const activeEmployees = employees.filter((e) => e.is_active);
  const filteredEmployees = searchTerm
    ? activeEmployees.filter(
        (e) =>
          e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.department.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : activeEmployees;

  const selectedEmployee = employees.find((e) => e.id === employeeId);

  const resetForm = () => {
    setEmployeeId("");
    setLeaveType("EL");
    setStartDate("");
    setEndDate("");
    setReason("");
    setSearchTerm("");
  };

  const calculateDays = () => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(
      0,
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    );
    // Half day types count as 0.5
    if (leaveType.startsWith("half_day")) return 0.5;
    return days;
  };

  const handleSubmit = async () => {
    if (!employeeId || !startDate || !endDate) return;

    setSubmitting(true);
    const success = await onSubmit({
      employee_id: employeeId,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      reason: reason || undefined,
    });

    setSubmitting(false);
    if (success) {
      onOpenChange(false);
      resetForm();
    }
  };

  const isHalfDay = leaveType.startsWith("half_day");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Apply Leave for Employee
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Employee Selection */}
          <div className="space-y-2">
            <Label>Employee *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee..." />
              </SelectTrigger>
              <SelectContent>
                {activeEmployees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name} — {emp.department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedEmployee && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{selectedEmployee.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Department</span>
                  <span>{selectedEmployee.department}</span>
                </div>
              </div>
            )}
          </div>

          {/* Leave Type */}
          <div className="space-y-2">
            <Label>Leave Type *</Label>
            <Select
              value={leaveType}
              onValueChange={(v) => setLeaveType(v as LeaveType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {employeeId && leaveBalance !== null && (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <Wallet className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">Available Balance:</span>
                <Badge variant={leaveBalance > 0 ? "default" : "destructive"} className="text-sm">
                  {leaveBalance} day(s)
                </Badge>
              </div>
            )}
          </div>

          {employeeId && leaveBalance !== null && leaveBalance <= 0 && (
            <div className="p-3 bg-destructive/10 rounded-lg text-sm text-destructive font-medium text-center">
              Insufficient leave balance for the selected type. Cannot apply leave.
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (isHalfDay) setEndDate(e.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date *</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                disabled={isHalfDay}
              />
            </div>
          </div>

          {startDate && endDate && (
            <div className="text-center p-3 bg-primary/10 rounded-lg">
              <span className="text-lg font-bold text-primary">
                {calculateDays()} day(s)
              </span>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              placeholder="e.g. Employee informed HR but forgot to apply leave"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          {/* Info Banner */}
          <div className="flex items-start gap-2 p-3 bg-accent/50 rounded-lg text-sm">
            <AlertCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Auto-Approved</p>
              <p className="text-muted-foreground">
                Leave applied by HR will be automatically marked as{" "}
                <Badge
                  variant="outline"
                  className="bg-green-600/10 text-green-700 border-green-300 text-xs"
                >
                  Approved
                </Badge>{" "}
                and attendance will be updated accordingly.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                onOpenChange(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={
                submitting || !employeeId || !startDate || !endDate || !reason || (leaveBalance !== null && leaveBalance <= 0)
              }
            >
              {submitting ? "Applying..." : "Apply Leave"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
