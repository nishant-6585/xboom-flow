import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertTriangle, Clock, UserX, Zap, ChevronDown, ChevronRight,
  Shield, Info, Eye, Pencil, Filter,
} from 'lucide-react';
import { format } from 'date-fns';
import { AttendanceLog, Employee } from '@/hooks/useHR';
import { cn } from '@/lib/utils';

interface AttendanceAlertsPanelProps {
  logs: AttendanceLog[];
  employees: Employee[];
  selectedDate: Date;
  onViewEmployee?: (employeeId: string) => void;
  onCorrectCheckout?: (log: AttendanceLog) => void;
}

interface Alert {
  employeeName: string;
  employeeId: string;
  department: string;
  type: AlertType;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  log: AttendanceLog | null;
}

type AlertType = 'missing_checkout' | 'excessive_hours' | 'late_checkin' | 'early_checkin' | 'provisional';

const ALERT_CONFIG: Record<AlertType, {
  icon: typeof Clock;
  label: string;
  severity: 'critical' | 'warning' | 'info';
}> = {
  missing_checkout: { icon: UserX, label: 'Missing Checkout', severity: 'critical' },
  excessive_hours: { icon: Clock, label: 'Excess Work Hours', severity: 'critical' },
  late_checkin: { icon: Clock, label: 'Late Check-in', severity: 'warning' },
  early_checkin: { icon: Zap, label: 'Early Check-in', severity: 'info' },
  provisional: { icon: AlertTriangle, label: 'Provisional Checkout', severity: 'warning' },
};

const SEVERITY_STYLE = {
  critical: { bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-400', badge: 'bg-red-100 text-red-700 border-red-200' },
  warning: { bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-400', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  info: { bg: 'bg-blue-50 dark:bg-blue-950/20', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-400', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
};

export function AttendanceAlertsPanel({ logs, employees, selectedDate, onViewEmployee, onCorrectCheckout }: AttendanceAlertsPanelProps) {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  const employeeMap = useMemo(() => {
    const map: Record<string, Employee> = {};
    employees.forEach(e => { map[e.id] = e; });
    return map;
  }, [employees]);

  const departments = useMemo(() => [...new Set(employees.map(e => e.department))].sort(), [employees]);

  const alerts = useMemo<Alert[]>(() => {
    const results: Alert[] = [];
    const today = format(new Date(), 'yyyy-MM-dd');

    for (const log of logs) {
      const emp = employeeMap[log.employee_id];
      const empName = emp?.name || 'Unknown';
      const dept = emp?.department || 'Unknown';
      const logDate = log.date; // 'yyyy-MM-dd' string

      if (log.working_hours && log.working_hours > 12) {
        results.push({
          employeeName: empName, employeeId: log.employee_id, department: dept,
          type: 'excessive_hours',
          description: `Worked ${log.working_hours.toFixed(1)}h — exceeds 12h threshold`,
          severity: log.working_hours > 16 ? 'critical' : 'critical',
          log,
        });
      }

      // Missing checkout: only show for past days, never for today
      if (log.check_in_time && !log.check_out_time && !log.is_provisional_checkout && logDate < today) {
        results.push({
          employeeName: empName, employeeId: log.employee_id, department: dept,
          type: 'missing_checkout',
          description: `Checked in at ${format(new Date(log.check_in_time), 'hh:mm a')} — no checkout recorded`,
          severity: 'critical',
          log,
        });
      }

      if (log.check_in_time) {
        const h = new Date(log.check_in_time).getHours();
        const m = new Date(log.check_in_time).getMinutes();
        if (h < 5) {
          results.push({
            employeeName: empName, employeeId: log.employee_id, department: dept,
            type: 'early_checkin',
            description: `Check-in at ${format(new Date(log.check_in_time), 'hh:mm a')} — before 5:00 AM`,
            severity: 'info',
            log,
          });
        }
        if (h >= 10 || (h === 9 && m > 45)) {
          results.push({
            employeeName: empName, employeeId: log.employee_id, department: dept,
            type: 'late_checkin',
            description: `Check-in at ${format(new Date(log.check_in_time), 'hh:mm a')}`,
            severity: 'warning',
            log,
          });
        }
      }

      // Provisional checkout: only show for past days
      if (log.is_provisional_checkout && logDate < today) {
        results.push({
          employeeName: empName, employeeId: log.employee_id, department: dept,
          type: 'provisional',
          description: 'Auto-checkout applied — needs manual verification',
          severity: 'warning',
          log,
        });
      }
    }
    return results;
  }, [logs, employeeMap]);

  // Apply filters
  const filtered = useMemo(() => alerts.filter(a => {
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
    if (typeFilter !== 'all' && a.type !== typeFilter) return false;
    if (deptFilter !== 'all' && a.department !== deptFilter) return false;
    return true;
  }), [alerts, severityFilter, typeFilter, deptFilter]);

  // Group by type
  const grouped = useMemo(() => {
    const groups: Record<AlertType, Alert[]> = {
      missing_checkout: [], excessive_hours: [], late_checkin: [], early_checkin: [], provisional: [],
    };
    filtered.forEach(a => groups[a.type].push(a));
    return groups;
  }, [filtered]);

  const counts = {
    total: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning: alerts.filter(a => a.severity === 'warning').length,
    info: alerts.filter(a => a.severity === 'info').length,
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Total Alerts', value: counts.total, icon: AlertTriangle, color: 'text-foreground', bg: 'bg-muted/50' },
          { label: 'Critical', value: counts.critical, icon: Shield, color: 'text-red-600', bg: 'bg-red-500/10' },
          { label: 'Warnings', value: counts.warning, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-500/10' },
          { label: 'Info', value: counts.info, icon: Info, color: 'text-blue-600', bg: 'bg-blue-500/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={cn('flex flex-col items-start gap-1 rounded-xl px-3 py-2.5', bg)}>
            <div className="flex items-center gap-1.5">
              <Icon className={cn('h-4 w-4', color)} />
              <p className={cn('text-2xl font-bold leading-none', color)}>{value}</p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Daily Summary Banner */}
      {alerts.length > 0 && (
        <Card className="border-muted">
          <CardContent className="px-4 py-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Today's Alerts Summary</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {(Object.entries(grouped) as [AlertType, Alert[]][])
                .filter(([, items]) => items.length > 0)
                .sort((a, b) => {
                  const order: AlertType[] = ['missing_checkout', 'excessive_hours', 'provisional', 'late_checkin', 'early_checkin'];
                  return order.indexOf(a[0]) - order.indexOf(b[0]);
                })
                .map(([type, items]) => {
                  const config = ALERT_CONFIG[type];
                  const Icon = config.icon;
                  const style = SEVERITY_STYLE[config.severity];
                  return (
                    <div key={type} className="flex items-center gap-1.5 text-xs">
                      <Icon className={cn('h-3.5 w-3.5', style.text)} />
                      <span className="text-muted-foreground">{config.label}:</span>
                      <span className={cn('font-bold', style.text)}>{items.length}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Alert Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(ALERT_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        {(severityFilter !== 'all' || typeFilter !== 'all' || deptFilter !== 'all') && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSeverityFilter('all'); setTypeFilter('all'); setDeptFilter('all'); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Grouped Alerts */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No attendance alerts for {format(selectedDate, 'dd MMM yyyy')}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(Object.entries(grouped) as [AlertType, Alert[]][])
            .filter(([, items]) => items.length > 0)
            .sort((a, b) => {
              const order: AlertType[] = ['missing_checkout', 'excessive_hours', 'provisional', 'late_checkin', 'early_checkin'];
              return order.indexOf(a[0]) - order.indexOf(b[0]);
            })
            .map(([type, items]) => {
              const config = ALERT_CONFIG[type];
              const Icon = config.icon;
              const style = SEVERITY_STYLE[config.severity];
              return (
                <AlertGroup
                  key={type}
                  icon={Icon}
                  label={config.label}
                  count={items.length}
                  style={style}
                  items={items}
                  onViewEmployee={onViewEmployee}
                  onCorrectCheckout={onCorrectCheckout}
                />
              );
            })}
        </div>
      )}
    </div>
  );
}

function AlertGroup({ icon: Icon, label, count, style, items, onViewEmployee, onCorrectCheckout }: {
  icon: typeof Clock;
  label: string;
  count: number;
  style: typeof SEVERITY_STYLE.critical;
  items: Alert[];
  onViewEmployee?: (id: string) => void;
  onCorrectCheckout?: (log: AttendanceLog) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn('border', style.border, style.bg)}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-0 pt-3 px-4 cursor-pointer hover:opacity-80 transition-opacity">
            <CardTitle className={cn('text-sm flex items-center gap-2', style.text)}>
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Icon className="h-4 w-4" />
              {label}
              <Badge variant="outline" className={cn('text-xs ml-1', style.badge)}>{count}</Badge>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 pb-3 pt-2">
            <div className="space-y-1.5">
              {items.map((alert, idx) => (
                <div
                  key={`${alert.employeeId}-${idx}`}
                  className="flex items-center gap-3 rounded-lg border bg-background/60 px-3 py-2 text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{alert.employeeName}</span>
                    <span className="text-muted-foreground mx-1.5">·</span>
                    <span className="text-muted-foreground">{alert.department}</span>
                    <p className="text-muted-foreground mt-0.5">{alert.description}</p>
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0', SEVERITY_STYLE[alert.severity].badge)}>
                    {alert.severity}
                  </Badge>
                  <div className="flex items-center gap-1 shrink-0">
                    {onViewEmployee && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="View Record" onClick={() => onViewEmployee(alert.employeeId)}>
                        <Eye className="h-3 w-3" />
                      </Button>
                    )}
                    {(alert.type === 'missing_checkout' || alert.type === 'provisional') && alert.log && onCorrectCheckout && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        onClick={() => onCorrectCheckout(alert.log!)}
                      >
                        <Pencil className="h-2.5 w-2.5" />
                        Correct
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// Small indicator for use in the Overview tab
export function AttendanceAlertIndicator({ alertCount, onNavigate }: { alertCount: number; onNavigate: () => void }) {
  if (alertCount === 0) return null;
  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800 cursor-pointer hover:shadow-sm transition-shadow" onClick={onNavigate}>
      <CardContent className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
            ⚠ {alertCount} attendance alert{alertCount !== 1 ? 's' : ''} detected
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-700 hover:text-amber-800">
          View alerts →
        </Button>
      </CardContent>
    </Card>
  );
}
