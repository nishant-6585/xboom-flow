import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, CheckCircle, XCircle, Phone, PhoneMissed } from 'lucide-react';
import { startOfDay, startOfWeek, startOfMonth } from 'date-fns';

interface SalespersonCallStatsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs: any[];
  dateRange?: { start: Date | undefined; end: Date | undefined };
  department?: 'sales' | 'support';
}

function normalizeNumber(num: string | null | undefined): string {
  return (num || '').replace(/\D/g, '').slice(-10);
}

export function SalespersonCallStats({ open, onOpenChange, logs, dateRange, department = 'sales' }: SalespersonCallStatsProps) {
  const [periodFilter, setPeriodFilter] = useState<'all' | 'day' | 'week' | 'month'>('all');

  const filteredLogs = useMemo(() => {
    let result = logs;
    // Apply date range
    if (dateRange?.start) {
      const s = startOfDay(dateRange.start);
      result = result.filter(l => new Date(l.start_time || l.created_at) >= s);
    }
    if (dateRange?.end) {
      const e = new Date(dateRange.end);
      e.setHours(23, 59, 59, 999);
      result = result.filter(l => new Date(l.start_time || l.created_at) <= e);
    }
    // Apply period filter
    const now = new Date();
    if (periodFilter === 'day') {
      const s = startOfDay(now);
      result = result.filter(l => new Date(l.start_time || l.created_at) >= s);
    } else if (periodFilter === 'week') {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      result = result.filter(l => new Date(l.start_time || l.created_at) >= s);
    } else if (periodFilter === 'month') {
      const s = startOfMonth(now);
      result = result.filter(l => new Date(l.start_time || l.created_at) >= s);
    }
    // Only include sales department calls
    result = result.filter(l => l.department?.toLowerCase() === department);
    return result;
  }, [logs, dateRange?.start?.getTime(), dateRange?.end?.getTime(), periodFilter, department]);

  // Dedupe by unique caller number per salesperson
  const stats = useMemo(() => {
    const spMap = new Map<string, {
      totalCalls: number;
      uniqueNumbers: Set<string>;
      updated: number; // has outcall_info
      notUpdated: number; // no outcall_info
      answered: number;
      missed: number;
      updatedNumbers: Set<string>;
      notUpdatedNumbers: Set<string>;
    }>();

    for (const log of filteredLogs) {
      const sp = department === 'support'
        ? (log.assigned_agent_name || 'Unassigned')
        : (log.sales_person_name || 'Unassigned');
      if (!spMap.has(sp)) {
        spMap.set(sp, {
          totalCalls: 0,
          uniqueNumbers: new Set(),
          updated: 0,
          notUpdated: 0,
          answered: 0,
          missed: 0,
          updatedNumbers: new Set(),
          notUpdatedNumbers: new Set(),
        });
      }
      const entry = spMap.get(sp)!;
      entry.totalCalls++;
      const num = normalizeNumber(log.caller_number);
      if (num) entry.uniqueNumbers.add(num);

      // Determine call status
      const payload = log.raw_payload as Record<string, unknown> | null;
      const legs = (payload?._ld && Array.isArray(payload._ld)) ? payload._ld : [];
      const isAnswered = legs.length > 0
        ? legs.some((l: any) => l._ac === 'received')
        : log.call_status?.toLowerCase().includes('answer');
      if (isAnswered) entry.answered++;
      else entry.missed++;

      // Track outcall_info per unique number
      if (num) {
        if (log.outcall_info && log.outcall_info.trim()) {
          entry.updatedNumbers.add(num);
        } else {
          entry.notUpdatedNumbers.add(num);
        }
      }
    }

    // Calculate updated/not-updated from unique numbers
    const result: Array<{
      name: string;
      totalCalls: number;
      uniqueCount: number;
      updated: number;
      notUpdated: number;
      answered: number;
      missed: number;
      updateRate: number;
    }> = [];

    spMap.forEach((data, name) => {
      // A number is "updated" if at least one log for it has outcall_info
      const updatedCount = data.updatedNumbers.size;
      const notUpdatedCount = data.uniqueNumbers.size - updatedCount;
      result.push({
        name,
        totalCalls: data.totalCalls,
        uniqueCount: data.uniqueNumbers.size,
        updated: updatedCount,
        notUpdated: Math.max(0, notUpdatedCount),
        answered: data.answered,
        missed: data.missed,
        updateRate: data.uniqueNumbers.size > 0 ? Math.round((updatedCount / data.uniqueNumbers.size) * 100) : 0,
      });
    });

    return result
      .filter(s => s.name !== 'Unassigned')
      .sort((a, b) => b.uniqueCount - a.uniqueCount);
  }, [filteredLogs]);

  const totals = useMemo(() => {
    return stats.reduce((acc, s) => ({
      totalCalls: acc.totalCalls + s.totalCalls,
      uniqueCount: acc.uniqueCount + s.uniqueCount,
      updated: acc.updated + s.updated,
      notUpdated: acc.notUpdated + s.notUpdated,
    }), { totalCalls: 0, uniqueCount: 0, updated: 0, notUpdated: 0 });
  }, [stats]);

  const COLORS = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
    'hsl(24, 70%, 50%)',
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {department === 'support' ? 'Support' : 'Sales'} Call Statistics
          </DialogTitle>
        </DialogHeader>

        {/* Period filter */}
        <div className="flex gap-1 flex-wrap">
          {([
            { key: 'all', label: 'All Data' },
            { key: 'day', label: 'Today' },
            { key: 'week', label: 'This Week' },
            { key: 'month', label: 'This Month' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriodFilter(key)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                periodFilter === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-lg font-bold">{totals.totalCalls}</p>
              <p className="text-[10px] text-muted-foreground">Total Calls</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border-indigo-500/20">
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-lg font-bold">{totals.uniqueCount}</p>
              <p className="text-[10px] text-muted-foreground">Unique Numbers</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-lg font-bold">{totals.updated}</p>
              <p className="text-[10px] text-muted-foreground">Updated</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-lg font-bold">{totals.notUpdated}</p>
              <p className="text-[10px] text-muted-foreground">Not Updated</p>
            </CardContent>
          </Card>
        </div>

        {/* Per-salesperson breakdown */}
        <ScrollArea className="max-h-[45vh]">
          <div className="space-y-3 pr-2">
            {stats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No assigned calls found</p>
            ) : (
              stats.map((sp, i) => (
                <Card key={sp.name} className="border-border/50">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      >
                        {sp.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm truncate">{sp.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {sp.updateRate}% updated
                          </Badge>
                        </div>

                        {/* Stats row */}
                        <div className="flex gap-3 mt-1.5 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{sp.totalCalls} calls</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{sp.uniqueCount} unique</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-green-500" />
                            <span className="text-xs text-green-600">{sp.updated} updated</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <XCircle className="h-3 w-3 text-red-500" />
                            <span className="text-xs text-red-500">{sp.notUpdated} pending</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <PhoneMissed className="h-3 w-3 text-orange-500" />
                            <span className="text-xs text-orange-500">{sp.missed} missed</span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all bg-green-500"
                            style={{ width: `${sp.updateRate}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
