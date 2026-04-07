import { useState, useMemo } from 'react';
import { format, eachDayOfInterval, isWeekend, isFuture, isToday, parseISO } from 'date-fns';
import { CalendarDays, Clock, Users, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface Employee {
  id: string;
  name: string;
  department?: string | null;
  joining_date?: string | null;
}

interface BulkAttendanceEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  onSaved: () => void;
}

type BulkStatus = 'present' | 'half_day';

export function BulkAttendanceEntryDialog({
  open,
  onOpenChange,
  employees,
  onSaved,
}: BulkAttendanceEntryDialogProps) {
  const { user, profile } = useAuth();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [checkInTime, setCheckInTime] = useState('09:30');
  const [checkOutTime, setCheckOutTime] = useState('18:30');
  const [status, setStatus] = useState<BulkStatus>('present');
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<{ date: string; success: boolean; message: string }[] | null>(null);

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);

  const datesToProcess = useMemo(() => {
    if (!fromDate || !toDate || fromDate > toDate) return [];
    const allDays = eachDayOfInterval({ start: fromDate, end: toDate });
    return allDays.filter(d => {
      if (isFuture(d) && !isToday(d)) return false;
      if (skipWeekends && isWeekend(d)) return false;
      if (selectedEmployee?.joining_date && format(d, 'yyyy-MM-dd') < selectedEmployee.joining_date) return false;
      return true;
    });
  }, [fromDate, toDate, skipWeekends, selectedEmployee]);

  const resetForm = () => {
    setSelectedEmployeeId('');
    setFromDate(undefined);
    setToDate(undefined);
    setCheckInTime('09:30');
    setCheckOutTime('18:30');
    setStatus('present');
    setSkipWeekends(true);
    setNotes('');
    setResults(null);
  };

  const handleSubmit = async () => {
    if (!user || !profile || !selectedEmployeeId || datesToProcess.length === 0) return;

    setSubmitting(true);
    setResults(null);
    const batchResults: { date: string; success: boolean; message: string }[] = [];

    // Check for existing attendance logs for these dates
    const dateStrings = datesToProcess.map(d => format(d, 'yyyy-MM-dd'));
    const { data: existingLogs } = await supabase
      .from('attendance_logs')
      .select('date, id, check_in_time')
      .eq('employee_id', selectedEmployeeId)
      .in('date', dateStrings);

    const existingDates = new Set((existingLogs || []).filter(l => l.check_in_time).map(l => l.date));

    for (const day of datesToProcess) {
      const dateStr = format(day, 'yyyy-MM-dd');
      
      if (existingDates.has(dateStr)) {
        batchResults.push({ date: dateStr, success: false, message: 'Record already exists' });
        continue;
      }

      const checkIn = `${dateStr}T${checkInTime}:00+05:30`;
      const checkOut = `${dateStr}T${checkOutTime}:00+05:30`;

      // Check if a stub log exists (from correction requests)
      const stubLog = (existingLogs || []).find(l => l.date === dateStr && !l.check_in_time);

      try {
        if (stubLog) {
          // Update existing stub
          const { error } = await supabase
            .from('attendance_logs')
            .update({
              check_in_time: checkIn,
              check_out_time: checkOut,
              status,
              source: 'hr_bulk_entry',
              notes: notes || `Bulk entry by ${profile.name}`,
              approved_by: user.id,
              approved_by_name: profile.name,
              reconciliation_status: 'approved',
            })
            .eq('id', stubLog.id);
          
          if (error) throw error;
        } else {
          // Insert new record
          const { error } = await supabase
            .from('attendance_logs')
            .insert({
              employee_id: selectedEmployeeId,
              date: dateStr,
              check_in_time: checkIn,
              check_out_time: checkOut,
              status,
              source: 'hr_bulk_entry',
              notes: notes || `Bulk entry by ${profile.name}`,
              approved_by: user.id,
              approved_by_name: profile.name,
              reconciliation_status: 'approved',
            });
          
          if (error) throw error;
        }

        batchResults.push({ date: dateStr, success: true, message: 'Created' });
      } catch (err: any) {
        batchResults.push({ date: dateStr, success: false, message: err.message || 'Failed' });
      }
    }

    setResults(batchResults);
    setSubmitting(false);

    const successCount = batchResults.filter(r => r.success).length;
    const failCount = batchResults.filter(r => !r.success).length;

    if (successCount > 0) {
      toast.success(`Bulk attendance: ${successCount} day(s) created${failCount > 0 ? `, ${failCount} skipped/failed` : ''}`);
      onSaved();
    } else {
      toast.error('No attendance records were created');
    }
  };

  const canSubmit = selectedEmployeeId && fromDate && toDate && fromDate <= toDate && datesToProcess.length > 0 && checkInTime && checkOutTime;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Backfill Attendance
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-4 py-2">
            {/* Employee Selection */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Employee *</Label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger>
                  <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.filter(e => (e as any).is_active !== false).sort((a, b) => a.name.localeCompare(b.name)).map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name} {emp.department ? `(${emp.department})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">From Date *</Label>
                <Popover open={fromOpen} onOpenChange={setFromOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !fromDate && "text-muted-foreground")}>
                      <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                      {fromDate ? format(fromDate, 'dd MMM yyyy') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={fromDate} onSelect={(d) => { setFromDate(d); setFromOpen(false); }} disabled={(d) => isFuture(d) && !isToday(d)} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">To Date *</Label>
                <Popover open={toOpen} onOpenChange={setToOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !toDate && "text-muted-foreground")}>
                      <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                      {toDate ? format(toDate, 'dd MMM yyyy') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={toDate} onSelect={(d) => { setToDate(d); setToOpen(false); }} disabled={(d) => (isFuture(d) && !isToday(d)) || (fromDate ? d < fromDate : false)} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Skip Weekends */}
            <div className="flex items-center gap-2">
              <Checkbox id="skip-weekends" checked={skipWeekends} onCheckedChange={(v) => setSkipWeekends(!!v)} />
              <Label htmlFor="skip-weekends" className="text-sm cursor-pointer">Skip weekends (Sat & Sun)</Label>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as BulkStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Check-in Time</Label>
                <div className="relative">
                  <Clock className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} className="pl-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Check-out Time</Label>
                <div className="relative">
                  <Clock className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} className="pl-8 text-sm" />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Notes / Reason</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Employee was on an event for the month" className="text-sm resize-none" rows={2} />
            </div>

            <Separator />

            {/* Summary */}
            {datesToProcess.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-sm font-medium">Summary</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{selectedEmployee?.name}</Badge>
                  <Badge variant="outline">{datesToProcess.length} day(s)</Badge>
                  <Badge variant="outline">{checkInTime} – {checkOutTime}</Badge>
                  <Badge variant="outline" className="capitalize">{status.replace('_', ' ')}</Badge>
                </div>
                {datesToProcess.length <= 10 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {datesToProcess.map(d => (
                      <Badge key={d.toISOString()} variant="secondary" className="text-[10px] font-normal">
                        {format(d, 'dd MMM')}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {fromDate && toDate && datesToProcess.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                No eligible dates in the selected range (all may be weekends or future dates).
              </div>
            )}

            {/* Results */}
            {results && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Results</p>
                <ScrollArea className="max-h-40">
                  <div className="space-y-1">
                    {results.map(r => (
                      <div key={r.date} className={cn("flex items-center gap-2 text-xs px-2 py-1 rounded", r.success ? "bg-green-50 dark:bg-green-950/20" : "bg-destructive/5")}>
                        {r.success ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                        <span className="font-mono">{r.date}</span>
                        <span className="text-muted-foreground">{r.message}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
            {results ? 'Close' : 'Cancel'}
          </Button>
          {!results && (
            <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {submitting ? `Processing ${datesToProcess.length} days...` : `Mark ${datesToProcess.length} Day(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
