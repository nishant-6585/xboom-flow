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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LeaveType, Employee } from "@/hooks/useHR";
import { useCompOff } from "@/hooks/useCompOff";
import { UserPlus, AlertCircle, Wallet, CalendarDays, AlertTriangle, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { addMonths, isAfter, differenceInMonths, format, parseISO } from "date-fns";

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
    compoff?: {
      earned_date: string;
      earned_type: 'holiday' | 'weekend';
      holiday_id?: string | null;
    };
  }) => Promise<boolean>;
}

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "EL", label: "Earned Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "half_day_EL", label: "Half Day Earned Leave" },
  { value: "half_day_sick", label: "Half Day Sick Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
  { value: "half_day_unpaid", label: "Half Day Unpaid Leave" },
  { value: "compoff", label: "Compensatory Off (CompOff)" },
  { value: "maternity", label: "Maternity Leave" },
];

// Leave types that carry no balance requirement and no deduction.
const NO_BALANCE_TYPES = ["unpaid", "maternity", "compoff"];

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

  // Comp-off specific state (HR raising it on someone's behalf).
  const { holidays } = useCompOff();
  const [earnedTab, setEarnedTab] = useState<"holiday" | "weekend">("holiday");
  const [selectedHolidayId, setSelectedHolidayId] = useState("");
  const [weekendDate, setWeekendDate] = useState("");
  const [compoffLeaveDate, setCompoffLeaveDate] = useState("");
  const isCompOff = leaveType === "compoff";
  const selectedHoliday = holidays.find((h) => h.id === selectedHolidayId);
  const earnedDate = earnedTab === "holiday" ? selectedHoliday?.holiday_date ?? "" : weekendDate;

  const todayStr = new Date().toISOString().split("T")[0];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

  // Only past holidays within the 90-day claim window can be compensated.
  const availableHolidays = holidays.filter(
    (h) => h.holiday_date <= todayStr && h.holiday_date >= ninetyDaysAgo,
  );

  const compoffError = (() => {
    if (!isCompOff) return "";
    if (earnedTab === "weekend" && weekendDate) {
      const dow = new Date(`${weekendDate}T00:00:00`).getDay();
      if (dow !== 0 && dow !== 6) return "The worked date must be a Saturday or Sunday.";
      if (weekendDate > todayStr) return "The worked date cannot be in the future.";
      if (weekendDate < ninetyDaysAgo) return "The worked date is more than 90 days old.";
    }
    if (compoffLeaveDate && earnedDate && compoffLeaveDate < earnedDate)
      return "The comp-off date must be on or after the day worked.";
    return "";
  })();

  // Fetch balance when employee or leave type changes
  useEffect(() => {
    if (!employeeId || !open) { setLeaveBalance(null); return; }
    const baseType = leaveType.replace('half_day_', '');
    // Unpaid, maternity & comp-off carry no leave_balances requirement
    if (NO_BALANCE_TYPES.includes(baseType)) { setLeaveBalance(null); return; }
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
    setEarnedTab("holiday");
    setSelectedHolidayId("");
    setWeekendDate("");
    setCompoffLeaveDate("");
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
    if (!employeeId) return;
    if (isCompOff) {
      if (!earnedDate || !compoffLeaveDate || compoffError) return;
    } else if (!startDate || !endDate) return;

    setSubmitting(true);
    const success = await onSubmit(
      isCompOff
        ? {
            employee_id: employeeId,
            leave_type: "compoff",
            start_date: compoffLeaveDate,
            end_date: compoffLeaveDate,
            reason: reason || undefined,
            compoff: {
              earned_date: earnedDate,
              earned_type: earnedTab,
              holiday_id: earnedTab === "holiday" ? selectedHolidayId : null,
            },
          }
        : {
            employee_id: employeeId,
            leave_type: leaveType,
            start_date: startDate,
            end_date: endDate,
            reason: reason || undefined,
          },
    );

    setSubmitting(false);
    if (success) {
      onOpenChange(false);
      resetForm();
    }
  };

  const isHalfDay = leaveType.startsWith("half_day");
  const isMaternity = leaveType === "maternity";

  const maternityError = (() => {
    if (!isMaternity || !startDate || !endDate) return "";
    if (new Date(endDate) < new Date(startDate)) return "End date must be on or after the start date.";
    if (isAfter(new Date(endDate), addMonths(new Date(startDate), 6)))
      return "Maternity leave cannot exceed 6 months.";
    return "";
  })();

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

            {isMaternity ? (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-300 text-sm text-rose-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="font-medium">
                  Maternity Leave — paid, no balance deduction. Max 6 months.
                </span>
              </div>
            ) : isCompOff ? (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span>
                  Comp-Off — the employee must have an attendance record for the day
                  worked (a weekend or company holiday, within the last 90 days).
                </span>
              </div>
            ) : employeeId && leaveBalance !== null && (
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

          {isCompOff && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Day the employee worked extra *</Label>
                <Tabs value={earnedTab} onValueChange={(v) => setEarnedTab(v as "holiday" | "weekend")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="holiday">Worked on a Holiday</TabsTrigger>
                    <TabsTrigger value="weekend">Worked on a Weekend</TabsTrigger>
                  </TabsList>
                  <TabsContent value="holiday" className="space-y-2 pt-3">
                    {availableHolidays.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No holidays in the last 90 days.
                      </p>
                    ) : (
                      <Select value={selectedHolidayId} onValueChange={setSelectedHolidayId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick the holiday worked on" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableHolidays.map((h) => (
                            <SelectItem key={h.id} value={h.id}>
                              {h.name} — {format(parseISO(h.holiday_date), "MMM d, yyyy")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TabsContent>
                  <TabsContent value="weekend" className="space-y-2 pt-3">
                    <Input
                      type="date"
                      value={weekendDate}
                      max={todayStr}
                      min={ninetyDaysAgo}
                      onChange={(e) => setWeekendDate(e.target.value)}
                    />
                    {weekendDate && (
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(weekendDate), "EEEE, MMM d, yyyy")}
                      </p>
                    )}
                  </TabsContent>
                </Tabs>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" /> Comp-Off date *
                </Label>
                <Input
                  type="date"
                  value={compoffLeaveDate}
                  onChange={(e) => setCompoffLeaveDate(e.target.value)}
                />
                {earnedDate && (
                  <p className="text-xs text-muted-foreground">
                    Earned by working on {format(parseISO(earnedDate), "MMM d, yyyy")}
                    {earnedTab === "holiday" && selectedHoliday ? ` (${selectedHoliday.name})` : ""}.
                  </p>
                )}
              </div>

              {compoffError && (
                <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/40 bg-destructive/10 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{compoffError}</span>
                </div>
              )}
            </div>
          )}

          {/* Dates */}
          {!isCompOff && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (isHalfDay && !isMaternity) setEndDate(e.target.value);
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
                disabled={isHalfDay && !isMaternity}
              />
            </div>
          </div>
          )}

          {!isCompOff && startDate && endDate && (
            <div className="text-center p-3 bg-primary/10 rounded-lg">
              <span className="text-lg font-bold text-primary">
                {calculateDays()} day(s)
              </span>
              {isMaternity && (
                <div className="text-xs text-muted-foreground mt-1">
                  ≈ {differenceInMonths(new Date(endDate), new Date(startDate))} month(s)
                </div>
              )}
            </div>
          )}

          {maternityError && (
            <div className="p-3 bg-destructive/10 rounded-lg text-sm text-destructive font-medium text-center">
              {maternityError}
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
                submitting || !employeeId || !reason ||
                (isCompOff
                  ? !earnedDate || !compoffLeaveDate || !!compoffError
                  : !startDate || !endDate || !!maternityError || (leaveBalance !== null && leaveBalance <= 0))
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
