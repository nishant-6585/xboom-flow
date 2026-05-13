import { useState, useEffect, forwardRef } from "react";
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
import { LeaveType } from "@/hooks/useHR";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";

interface LeaveApplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    leave_type: LeaveType;
    start_date: string;
    end_date: string;
    reason?: string;
  }) => Promise<boolean>;
}

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'EL', label: 'Earned Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'half_day_EL', label: 'Half Day Earned Leave' },
  { value: 'half_day_sick', label: 'Half Day Sick Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
  { value: 'half_day_unpaid', label: 'Half Day Unpaid Leave' },
];

export const LeaveApplyDialog = forwardRef<HTMLDivElement, LeaveApplyDialogProps>(({ open, onOpenChange, onSubmit }, ref) => {
  const [step, setStep] = useState(1);
  const [leaveType, setLeaveType] = useState<LeaveType>('EL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [leaveBalance, setLeaveBalance] = useState<number | null>(null);
  const { user } = useAuth();

  // Fetch balance for the selected leave type
  useEffect(() => {
    if (!open || !user) return;
    const fetchBalance = async () => {
      // Get employee id for current user
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!emp) { setLeaveBalance(null); return; }
      // Unpaid leave has no balance requirement
      const baseType = leaveType.replace('half_day_', '');
      if (baseType === 'unpaid') { setLeaveBalance(null); return; }
      const year = new Date().getFullYear();
      const { data } = await supabase
        .from('leave_balances')
        .select('balance')
        .eq('employee_id', emp.id)
        .eq('leave_type', baseType)
        .eq('year', year)
        .maybeSingle();
      setLeaveBalance(data?.balance ?? 0);
    };
    fetchBalance();
  }, [open, user, leaveType]);

  const handleSubmit = async () => {
    if (!startDate || !endDate) return;
    
    setSubmitting(true);
    const success = await onSubmit({
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

  const resetForm = () => {
    setStep(1);
    setLeaveType('EL');
    setStartDate('');
    setEndDate('');
    setReason('');
  };

  const calculateDays = () => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Apply for Leave
            <span className="ml-2 text-sm text-muted-foreground">
              Step {step} of 3
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Leave Type</Label>
                <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
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
              </div>

              {leaveBalance !== null && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Available Balance:</span>
                  <Badge variant={leaveBalance > 0 ? "default" : "destructive"} className="text-sm">
                    {leaveBalance} day(s)
                  </Badge>
                </div>
              )}

              <Button className="w-full" onClick={() => setStep(2)}>
                Next
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || new Date().toISOString().split('T')[0]}
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

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  className="flex-1"
                  disabled={!startDate || !endDate}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Reason (Optional)</Label>
                <Textarea
                  placeholder="Brief reason for leave..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <h4 className="font-medium">Summary</h4>
                <p className="text-sm">
                  <span className="text-muted-foreground">Type:</span>{' '}
                  {LEAVE_TYPES.find((t) => t.value === leaveType)?.label}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Duration:</span>{' '}
                  {calculateDays()} day(s)
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Dates:</span>{' '}
                  {startDate} to {endDate}
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  className="flex-1"
                  disabled={submitting || (leaveBalance !== null && leaveBalance <= 0)}
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </Button>
              </div>

              {leaveBalance !== null && leaveBalance <= 0 && (
                <div className="p-3 bg-destructive/10 rounded-lg text-sm text-destructive font-medium text-center">
                  Insufficient leave balance. You cannot apply for this leave type.
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});

LeaveApplyDialog.displayName = "LeaveApplyDialog";
