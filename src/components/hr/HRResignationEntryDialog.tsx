import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Loader2, UserPlus } from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Employee {
  id: string;
  name: string;
  employee_number: string | null;
  department: string;
  employment_status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    employee_id: string;
    resignation_date: string;
    proposed_lwd: string;
    reason: string;
    hr_notes?: string;
    status: string;
  }) => Promise<void>;
}

export function HRResignationEntryDialog({ open, onOpenChange, onSubmit }: Props) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [resignationDate, setResignationDate] = useState<Date | undefined>();
  const [lwdDate, setLwdDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("");
  const [hrNotes, setHrNotes] = useState("");
  const [status, setStatus] = useState("approved");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchActiveEmployees();
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setSelectedEmployeeId("");
    setResignationDate(undefined);
    setLwdDate(undefined);
    setReason("");
    setHrNotes("");
    setStatus("approved");
  };

  const fetchActiveEmployees = async () => {
    setLoadingEmployees(true);
    const { data } = await supabase
      .from("employees")
      .select("id, name, employee_number, department, employment_status")
      .eq("is_active", true)
      .eq("employment_status", "active")
      .order("name");
    setEmployees(data || []);
    setLoadingEmployees(false);
  };

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  const isValid =
    selectedEmployeeId &&
    resignationDate &&
    lwdDate &&
    reason.trim().length > 0 &&
    !isBefore(startOfDay(lwdDate), startOfDay(resignationDate));

  const handleSubmit = async () => {
    if (!isValid || !resignationDate || !lwdDate) return;

    if (isBefore(startOfDay(lwdDate), startOfDay(resignationDate))) {
      toast({ title: "Validation Error", description: "Last Working Day must be on or after Resignation Date.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        employee_id: selectedEmployeeId,
        resignation_date: format(resignationDate, "yyyy-MM-dd"),
        proposed_lwd: format(lwdDate, "yyyy-MM-dd"),
        reason: reason.trim(),
        hr_notes: hrNotes.trim() || undefined,
        status,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Resignation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* Employee Selection */}
          <div className="space-y-2">
            <Label>Employee *</Label>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger className={cn(!selectedEmployeeId && "text-muted-foreground")}>
                <SelectValue placeholder={loadingEmployees ? "Loading..." : "Select employee"} />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name} {emp.employee_number ? `(${emp.employee_number})` : ""} — {emp.department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedEmployee && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="font-medium">{selectedEmployee.name}</p>
              <p className="text-muted-foreground">
                {selectedEmployee.employee_number} • {selectedEmployee.department}
              </p>
            </div>
          )}

          {/* Resignation Date */}
          <div className="space-y-2">
            <Label>Resignation Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !resignationDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {resignationDate ? format(resignationDate, "PPP") : "Select resignation date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={resignationDate}
                  onSelect={setResignationDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Last Working Day */}
          <div className="space-y-2">
            <Label>Last Working Day *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !lwdDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {lwdDate ? format(lwdDate, "PPP") : "Select last working day"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={lwdDate}
                  onSelect={setLwdDate}
                  disabled={resignationDate ? (d) => isBefore(startOfDay(d), startOfDay(resignationDate)) : undefined}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {lwdDate && resignationDate && isBefore(startOfDay(lwdDate), startOfDay(resignationDate)) && (
              <p className="text-xs text-destructive">Last Working Day must be on or after Resignation Date.</p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason for Resignation *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Personal reasons, better opportunity, relocation..."
              rows={3}
              maxLength={1000}
            />
          </div>

          {/* HR Notes */}
          <div className="space-y-2">
            <Label>HR Notes (optional)</Label>
            <Textarea
              value={hrNotes}
              onChange={(e) => setHrNotes(e.target.value)}
              placeholder="Internal notes..."
              rows={2}
              maxLength={1000}
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {status === "approved"
                ? "Employee status will be set to Resigned and offboarding checklist will be created."
                : status === "pending"
                  ? "Will appear in pending reviews for further action."
                  : "Record will be saved as rejected."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !isValid}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Add Resignation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
