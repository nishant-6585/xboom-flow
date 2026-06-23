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
import { Wallet, Gift, CalendarDays } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCompOff } from "@/hooks/useCompOff";
import { format, parseISO } from "date-fns";

interface LeaveApplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    leave_type: LeaveType;
    start_date: string;
    end_date: string;
    reason?: string;
    compoff?: {
      earned_date: string;
      earned_type: 'holiday' | 'weekend';
      holiday_id?: string | null;
      holiday_name?: string | null;
    };
  }) => Promise<boolean>;
}

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'EL', label: 'Earned Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'half_day_EL', label: 'Half Day Earned Leave' },
  { value: 'half_day_sick', label: 'Half Day Sick Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
  { value: 'half_day_unpaid', label: 'Half Day Unpaid Leave' },
  { value: 'compoff', label: 'Compensatory Off (CompOff)' },
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

  // CompOff-specific state
  const { balance: compoffBalance, holidays, claimedEarnedDates, refetch: refetchCompoff } = useCompOff();
  const [earnedTab, setEarnedTab] = useState<'holiday' | 'weekend'>('holiday');
  const [selectedHolidayId, setSelectedHolidayId] = useState<string>('');
  const [weekendDate, setWeekendDate] = useState<string>('');
  const [compoffLeaveDate, setCompoffLeaveDate] = useState<string>('');
  const [compoffError, setCompoffError] = useState<string>('');

  const isCompOff = leaveType === 'compoff';
  const holidayDateSet = new Set(holidays.map(h => h.holiday_date));
  const availableHolidays = holidays.filter(h => !claimedEarnedDates.has(h.holiday_date) && h.holiday_date <= new Date().toISOString().split('T')[0]);
  const selectedHoliday = holidays.find(h => h.id === selectedHolidayId);
  const earnedDate = earnedTab === 'holiday' ? selectedHoliday?.holiday_date ?? '' : weekendDate;

  const validateWeekend = (d: string) => {
    if (!d) return 'Pick a Saturday or Sunday you worked on.';
    const day = new Date(d).getDay();
    if (day !== 0 && day !== 6) return 'Selected date must be a Saturday or Sunday.';
    if (d > new Date().toISOString().split('T')[0]) return 'Cannot pick a future date.';
    if (claimedEarnedDates.has(d)) return 'This date is already claimed.';
    return '';
  };

  const validateCompoffLeaveDate = (d: string) => {
    if (!d) return 'Pick your CompOff leave date.';
    const day = new Date(d).getDay();
    if (day === 0 || day === 6) return 'CompOff leave must be on a working day.';
    if (holidayDateSet.has(d)) return 'CompOff leave cannot fall on a holiday.';
    // Allow past dates up to 60 days back (e.g., to claim CompOff for a leave already taken)
    const earliest = new Date();
    earliest.setDate(earliest.getDate() - 60);
    if (new Date(d) < earliest) return 'CompOff leave date cannot be older than 60 days.';
    return '';
  };

  // Fetch balance for the selected leave type
  useEffect(() => {
    if (!open || !user) return;
    if (leaveType === 'compoff') { setLeaveBalance(null); return; }
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
    if (isCompOff) {
      if (!earnedDate) { setCompoffError('Select the day you worked extra.'); return; }
      if (earnedTab === 'weekend') {
        const e = validateWeekend(weekendDate);
        if (e) { setCompoffError(e); return; }
      }
      const e2 = validateCompoffLeaveDate(compoffLeaveDate);
      if (e2) { setCompoffError(e2); return; }
    } else if (!startDate || !endDate) return;

    setSubmitting(true);
    const success = await onSubmit(
      isCompOff
        ? {
            leave_type: 'compoff',
            start_date: compoffLeaveDate,
            end_date: compoffLeaveDate,
            reason: reason || undefined,
            compoff: {
              earned_date: earnedDate,
              earned_type: earnedTab,
              holiday_id: earnedTab === 'holiday' ? selectedHolidayId : null,
              holiday_name: earnedTab === 'holiday' ? selectedHoliday?.name ?? null : null,
            },
          }
        : {
            leave_type: leaveType,
            start_date: startDate,
            end_date: endDate,
            reason: reason || undefined,
          }
    );

    setSubmitting(false);
    if (success) {
      onOpenChange(false);
      resetForm();
      refetchCompoff();
    }
  };

  const resetForm = () => {
    setStep(1);
    setLeaveType('EL');
    setStartDate('');
    setEndDate('');
    setReason('');
    setSelectedHolidayId('');
    setWeekendDate('');
    setCompoffLeaveDate('');
    setCompoffError('');
    setEarnedTab('holiday');
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

              {leaveBalance !== null && !isCompOff && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Available Balance:</span>
                  <Badge variant={leaveBalance > 0 ? "default" : "destructive"} className="text-sm">
                    {leaveBalance} day(s)
                  </Badge>
                </div>
              )}

              {isCompOff && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Gift className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">CompOff Balance:</span>
                  <Badge variant={compoffBalance > 0 ? "default" : "secondary"} className="text-sm">
                    {compoffBalance} day(s)
                  </Badge>
                </div>
              )}

              <Button className="w-full" onClick={() => { setCompoffError(''); setStep(2); }}>
                Next
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {!isCompOff && (
              <>
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
              </>
              )}

              {isCompOff && (
                <div className="space-y-4 animate-in fade-in-50 slide-in-from-top-2">
                  <div className="space-y-2">
                    <Label>Select the day you worked extra</Label>
                    <Tabs value={earnedTab} onValueChange={(v) => { setEarnedTab(v as any); setCompoffError(''); }}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="holiday">Worked on a Holiday</TabsTrigger>
                        <TabsTrigger value="weekend">Worked on a Weekend</TabsTrigger>
                      </TabsList>
                      <TabsContent value="holiday" className="space-y-2 pt-3">
                        {availableHolidays.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No unclaimed past holidays available.</p>
                        ) : (
                          <Select value={selectedHolidayId} onValueChange={setSelectedHolidayId}>
                            <SelectTrigger><SelectValue placeholder="Pick a holiday you worked on" /></SelectTrigger>
                            <SelectContent>
                              {availableHolidays.map(h => (
                                <SelectItem key={h.id} value={h.id}>
                                  {h.name} — {format(parseISO(h.holiday_date), 'MMM d, yyyy')}
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
                          max={new Date().toISOString().split('T')[0]}
                          onChange={(e) => {
                            setWeekendDate(e.target.value);
                            setCompoffError(validateWeekend(e.target.value));
                          }}
                        />
                        {weekendDate && !compoffError && (
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(weekendDate), 'EEEE, MMM d, yyyy')}
                          </p>
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> Select CompOff Date</Label>
                    <Input
                      type="date"
                      value={compoffLeaveDate}
                      min={new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0]}
                      onChange={(e) => {
                        setCompoffLeaveDate(e.target.value);
                        setCompoffError(validateCompoffLeaveDate(e.target.value));
                      }}
                    />
                    {earnedDate && (
                      <p className="text-xs text-muted-foreground">
                        You are applying CompOff earned by working on {format(parseISO(earnedDate), 'MMM d, yyyy')}
                        {earnedTab === 'holiday' && selectedHoliday ? ` (${selectedHoliday.name})` : ''}.
                      </p>
                    )}
                  </div>

                  {compoffError && (
                    <p className="text-sm text-destructive">{compoffError}</p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  className="flex-1"
                  disabled={
                    isCompOff
                      ? !earnedDate || !compoffLeaveDate || !!compoffError
                      : !startDate || !endDate
                  }
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
                {isCompOff ? (
                  <>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Earned by working on:</span>{' '}
                      {earnedTab === 'holiday' && selectedHoliday
                        ? `${selectedHoliday.name} (${format(parseISO(selectedHoliday.holiday_date), 'MMM d, yyyy')})`
                        : weekendDate ? format(parseISO(weekendDate), 'EEEE, MMM d, yyyy') : '—'}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">CompOff Leave Date:</span>{' '}
                      {compoffLeaveDate ? format(parseISO(compoffLeaveDate), 'MMM d, yyyy') : '—'}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Status:</span> Pending Approval
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Duration:</span>{' '}
                      {calculateDays()} day(s)
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Dates:</span>{' '}
                      {startDate} to {endDate}
                    </p>
                  </>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  className="flex-1"
                  disabled={submitting || (!isCompOff && leaveBalance !== null && leaveBalance <= 0)}
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </Button>
              </div>

              {!isCompOff && leaveBalance !== null && leaveBalance <= 0 && (
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
