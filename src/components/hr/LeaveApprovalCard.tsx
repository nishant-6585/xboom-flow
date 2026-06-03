import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Check, User, X } from "lucide-react";
import { format } from "date-fns";
import { LeaveRequest, LeaveType } from "@/hooks/useHR";

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
          <Badge variant="outline">
            {LEAVE_TYPE_LABELS[leave.leave_type]}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>
            {format(new Date(leave.start_date), 'MMM dd')} - {format(new Date(leave.end_date), 'MMM dd')}
          </span>
          <Badge variant="secondary">{leave.total_days} day(s)</Badge>
        </div>

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
                Approve
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
