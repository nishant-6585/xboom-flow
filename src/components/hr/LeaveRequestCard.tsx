import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, User, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { LeaveRequest, LeaveStatus, LeaveType } from "@/hooks/useHR";

interface LeaveRequestCardProps {
  leave: LeaveRequest;
  showEmployee?: boolean;
  onView?: () => void;
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

const STATUS_COLORS: Record<LeaveStatus, string> = {
  draft: 'bg-gray-500',
  submitted: 'bg-amber-500',
  approved: 'bg-green-600',
  rejected: 'bg-red-600',
  cancelled: 'bg-gray-400',
};

const STATUS_LABELS: Record<LeaveStatus, string> = {
  draft: 'Draft',
  submitted: 'Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export function LeaveRequestCard({ leave, showEmployee, onView }: LeaveRequestCardProps) {
  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onView}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex flex-wrap gap-1.5">
            <Badge className={STATUS_COLORS[leave.status]}>
              {STATUS_LABELS[leave.status]}
            </Badge>
            <Badge variant="outline">
              {LEAVE_TYPE_LABELS[leave.leave_type]}
            </Badge>
            {leave.is_hr_applied && (
              <Badge variant="outline" className="bg-accent text-accent-foreground border-primary/30 text-xs gap-1">
                <UserPlus className="h-3 w-3" />
                Applied by HR{leave.applied_by_name ? ` (${leave.applied_by_name})` : ''}
              </Badge>
            )}
          </div>
          <span className="text-sm font-medium">{leave.total_days} day(s)</span>
        </div>

        {showEmployee && leave.employee_name && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{leave.employee_name}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>
            {format(new Date(leave.start_date), 'MMM dd')} - {format(new Date(leave.end_date), 'MMM dd, yyyy')}
          </span>
        </div>

        {leave.reason && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {leave.reason}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
