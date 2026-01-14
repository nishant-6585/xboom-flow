import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Clock, Calendar, Award } from "lucide-react";
import { EmployeeKPI } from "@/hooks/useHR";

interface KPICardProps {
  kpi: EmployeeKPI | null;
  loading?: boolean;
}

export function KPICard({ kpi, loading }: KPICardProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-8 bg-muted rounded w-1/4" />
            <div className="h-2 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!kpi) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No KPI data available
        </CardContent>
      </Card>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          Monthly KPI Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center p-4 bg-primary/10 rounded-lg">
          <span className={`text-4xl font-bold ${getScoreColor(kpi.kpi_score)}`}>
            {kpi.kpi_score.toFixed(1)}
          </span>
          <span className="text-xl text-muted-foreground">/100</span>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Attendance
              </span>
              <span className="font-medium">{kpi.attendance_percentage}%</span>
            </div>
            <Progress value={kpi.attendance_percentage} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {kpi.present_days} present / {kpi.total_working_days} working days
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Hours Fulfilment
              </span>
              <span className="font-medium">{kpi.hours_fulfilment_percentage}%</span>
            </div>
            <Progress value={Math.min(kpi.hours_fulfilment_percentage, 100)} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {kpi.total_working_hours.toFixed(1)}h / {kpi.target_hours}h target
            </p>
          </div>

          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-sm flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              Leave Days
            </span>
            <span className="font-medium">{kpi.leave_days}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
