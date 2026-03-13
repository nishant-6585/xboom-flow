import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock, UserX, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { AttendanceLog, Employee } from '@/hooks/useHR';
import { cn } from '@/lib/utils';

interface AttendanceAnomalyPanelProps {
  logs: AttendanceLog[];
  employees: Employee[];
  selectedDate: Date;
}

interface Anomaly {
  employeeName: string;
  employeeId: string;
  type: 'excessive_hours' | 'missing_checkout' | 'early_checkin' | 'consecutive_absence' | 'provisional';
  description: string;
  severity: 'warning' | 'critical';
}

const ANOMALY_CONFIG = {
  excessive_hours: { icon: Clock, label: 'Excessive Hours', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  missing_checkout: { icon: UserX, label: 'Missing Checkout', color: 'text-red-700 bg-red-50 border-red-200' },
  early_checkin: { icon: Zap, label: 'Early Check-in', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  consecutive_absence: { icon: UserX, label: 'Consecutive Absence', color: 'text-red-700 bg-red-50 border-red-200' },
  provisional: { icon: AlertTriangle, label: 'Provisional', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
};

export function AttendanceAnomalyPanel({ logs, employees, selectedDate }: AttendanceAnomalyPanelProps) {
  const employeeMap = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach(e => { map[e.id] = e.name; });
    return map;
  }, [employees]);

  const anomalies = useMemo<Anomaly[]>(() => {
    const results: Anomaly[] = [];

    const today = format(new Date(), 'yyyy-MM-dd');

    for (const log of logs) {
      const empName = employeeMap[log.employee_id] || 'Unknown';
      const logDate = log.date;

      // All anomalies only for past days
      if (logDate >= today) continue;

      // Excessive hours (> 12h)
      if (log.working_hours && log.working_hours > 12) {
        results.push({
          employeeName: empName,
          employeeId: log.employee_id,
          type: 'excessive_hours',
          description: `Worked ${log.working_hours.toFixed(1)}h — exceeds 12h threshold`,
          severity: log.working_hours > 16 ? 'critical' : 'warning',
        });
      }

      // Missing checkout
      if (log.check_in_time && !log.check_out_time && !log.is_provisional_checkout) {
        results.push({
          employeeName: empName,
          employeeId: log.employee_id,
          type: 'missing_checkout',
          description: `Checked in at ${format(new Date(log.check_in_time), 'hh:mm a')} but no checkout`,
          severity: 'critical',
        });
      }

      // Early check-in (before 5 AM)
      if (log.check_in_time) {
        const checkInHour = new Date(log.check_in_time).getHours();
        if (checkInHour < 5) {
          results.push({
            employeeName: empName,
            employeeId: log.employee_id,
            type: 'early_checkin',
            description: `Check-in at ${format(new Date(log.check_in_time), 'hh:mm a')} — before 5:00 AM`,
            severity: 'warning',
          });
        }
      }

      // Provisional checkout
      if (log.is_provisional_checkout) {
        results.push({
          employeeName: empName,
          employeeId: log.employee_id,
          type: 'provisional',
          description: `Auto-checkout applied — needs manual verification`,
          severity: 'warning',
        });
      }
    }

    return results;
  }, [logs, employeeMap]);

  if (anomalies.length === 0) return null;

  const criticalCount = anomalies.filter(a => a.severity === 'critical').length;

  return (
    <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-800">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          Attendance Anomalies — {format(selectedDate, 'dd MMM yyyy')}
          <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
            {anomalies.length} detected
          </Badge>
          {criticalCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {criticalCount} critical
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="space-y-2">
          {anomalies.map((anomaly, idx) => {
            const config = ANOMALY_CONFIG[anomaly.type];
            const Icon = config.icon;
            return (
              <div
                key={`${anomaly.employeeId}-${anomaly.type}-${idx}`}
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
                  config.color,
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{anomaly.employeeName}</span>
                  <span className="mx-1">—</span>
                  <span>{anomaly.description}</span>
                </div>
                {anomaly.severity === 'critical' && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">Critical</Badge>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
