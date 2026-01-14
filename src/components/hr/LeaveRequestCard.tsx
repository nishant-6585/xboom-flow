import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, User } from "lucide-react";
import { format } from "date-fns";
import { LeaveRequest, LeaveStatus, LeaveType } from "@/hooks/useHR";

interface LeaveRequestCardProps {
  leave: LeaveRequest;
  showEmployee?: boolean;
  onView?: () => void;
}

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  casual: 'Casual',
  sick: 'Sick',
  paid: 'Paid',
  unpaid: 'Unpaid',
  half_day: 'Half Day',
};

const STATUS_COLORS: Record<LeaveStatus, string> = {
  draft: 'bg-gray-500',
  submitted: 'bg-blue-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
  cancelled: 'bg-gray-400',
};

export function LeaveRequestCard({ leave, showEmployee, onView }: LeaveRequestCardProps) {
  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onView}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <Badge className={STATUS_COLORS[leave.status]}>
              {leave.status.charAt(0).toUpperCase() + leave.status.slice(1)}
            </Badge>
            <Badge variant="outline" className="ml-2">
              {LEAVE_TYPE_LABELS[leave.leave_type]}
            </Badge>
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
