import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Check, User, X, Gift } from "lucide-react";
import { format } from "date-fns";
import { LeaveRequest, LeaveType } from "@/hooks/useHR";
import { supabase } from "@/integrations/supabase/client";

interface LeaveApprovalCardProps {
  leave: LeaveRequest;
  onApprove: (leaveId: string, approve: boolean, comments?: string) => Promise<boolean>;
  /** Optional bulk-selection wiring (controlled from parent). */
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (id: string, selected: boolean) => void;
}

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  casual: 'Earned (Casual)',
  sick: 'Sick',
  paid: 'Earned Leave',
  EL: 'Earned Leave',
  unpaid: 'Unpaid',
  half_day: 'Half Day',
  half_day_casual: 'Half Day Earned',
  half_day_sick: 'Half Day Sick',
  half_day_paid: 'Half Day Earned',
  half_day_EL: 'Half Day Earned',
  half_day_unpaid: 'Half Day Unpaid',
  wfh: 'Work from Home',
  compoff: 'Compensatory Off',
  maternity: 'Maternity',
};

export function LeaveApprovalCard({
  leave,
  onApprove,
  selectable = false,
  selected = false,
  onSelectChange,
}: LeaveApprovalCardProps) {
  const [showActions, setShowActions] = useState(false);
  const [comments, setComments] = useState('');
  const [processing, setProcessing] = useState(false);
  const [compoffMeta, setCompoffMeta] = useState<{
    earned_date: string;
    earned_type: string;
    holiday_name: string | null;
    approval_status: 'pending' | 'approved' | 'rejected';
    expires_at: string;
  } | null>(null);

  useEffect(() => {
    if (leave.leave_type !== 'compoff') return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('compoff_ledger')
        .select('earned_date, earned_type, holiday_name, approval_status, expires_at')
        .eq('leave_request_id', leave.id)
        .maybeSingle();
      if (!cancelled && data) setCompoffMeta(data as any);
    })();
    return () => { cancelled = true; };
  }, [leave.id, leave.leave_type]);

  const handleAction = async (approve: boolean) => {
    setProcessing(true);
    await onApprove(leave.id, approve, comments || undefined);
    setProcessing(false);
    setShowActions(false);
    setComments('');
  };

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {selectable && (
              <Checkbox
                checked={selected}
                onCheckedChange={(v) => onSelectChange?.(leave.id, v === true)}
                aria-label={`Select leave request from ${leave.employee_name}`}
              />
            )}
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{leave.employee_name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {leave.leave_type === 'compoff' && (
              <Badge className="gap-1 bg-amber-500 hover:bg-amber-500/90 text-white">
                <Gift className="h-3 w-3" /> CompOff
              </Badge>
            )}
            <Badge variant="outline">
              {LEAVE_TYPE_LABELS[leave.leave_type]}
            </Badge>
          </div>
        </div>

        {leave.leave_type === 'compoff' ? (
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Applying leave on: <span className="font-medium text-foreground">{format(new Date(leave.start_date), 'MMM dd, yyyy')}</span></span>
            </div>
            {compoffMeta && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <Gift className="h-4 w-4 mt-0.5" />
                {compoffMeta.approval_status === 'approved' ? (
                  <span>
                    Using approved credit from{' '}
                    <span className="font-medium text-foreground">
                      {format(new Date(compoffMeta.earned_date), 'MMM dd, yyyy')}
                    </span>
                    {compoffMeta.holiday_name ? ` — ${compoffMeta.holiday_name}` : ` (${compoffMeta.earned_type})`}
                  </span>
                ) : (
                  <span>
                    Worked{' '}
                    <span className="font-medium text-foreground">
                      {format(new Date(compoffMeta.earned_date), 'EEE dd MMM')}
                    </span>{' '}
                    ({compoffMeta.holiday_name ?? compoffMeta.earned_type}) · credit pending approval · expires{' '}
                    {format(new Date(compoffMeta.expires_at), 'dd MMM yyyy')}
                  </span>
                )}
              </div>
            )}
            {!compoffMeta && (
              <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                <Gift className="h-4 w-4 mt-0.5" />
                <span className="text-xs font-medium">
                  ⚠ No earned credit linked to this request — approving will not redeem any credit. Ask the employee to relink or contact HR.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              {format(new Date(leave.start_date), 'MMM dd')} - {format(new Date(leave.end_date), 'MMM dd')}
            </span>
            <Badge variant="secondary">{leave.total_days} day(s)</Badge>
          </div>
        )}

        {leave.reason && (
          <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
            {leave.reason}
          </p>
        )}

        {!showActions ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowActions(true)}
          >
            Review Request
          </Button>
        ) : (
          <div className="space-y-3 pt-2 border-t">
            <Textarea
              placeholder="Comments (optional)..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => handleAction(false)}
                disabled={processing}
              >
                <X className="mr-1 h-4 w-4" />
                Reject
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={() => handleAction(true)}
                disabled={processing}
              >
                <Check className="mr-1 h-4 w-4" />
                {leave.leave_type === 'compoff' && compoffMeta?.approval_status === 'pending'
                  ? 'Approve leave + credit'
                  : 'Approve'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
