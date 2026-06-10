import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfDay, startOfWeek, startOfMonth, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
import { Phone, PhoneOutgoing, Users, Loader2, RefreshCw, CheckCircle, XCircle, PhoneMissed } from 'lucide-react';

interface OutboundLog {
  id: string;
  lead_source: string;
  lead_id: string;
  lead_name: string | null;
  lead_phone: string;
  lead_company: string | null;
  called_by: string;
  called_by_name: string;
  call_notes: string | null;
  call_outcome: string;
  call_duration_seconds: number | null;
  created_at: string;
  lead_created_at: string | null;
  scheduled_followup_at: string | null;
}

const OUTCOME_COLORS: Record<string, string> = {
  connected: 'bg-green-500/10 text-green-600 border-green-500/30',
  not_answered: 'bg-red-500/10 text-red-500 border-red-500/30',
  busy: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
  callback: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  voicemail: 'bg-purple-500/10 text-purple-500 border-purple-500/30',
};

const OUTCOME_LABELS: Record<string, string> = {
  connected: 'Connected',
  not_answered: 'Not Answered',
  busy: 'Busy',
  callback: 'Callback',
  voicemail: 'Voicemail',
};

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatResponseTime(log: OutboundLog): { text: string; color: string } | null {
  const callTime = new Date(log.created_at);
  let refTime: Date | null = null;
  let label = '';

  if ((log.lead_source === 'prospect' || log.lead_source === 'pipeline') && log.scheduled_followup_at) {
    refTime = new Date(log.scheduled_followup_at);
    label = 'from follow-up';
  } else if ((log.lead_source === 'myoperator' || log.lead_source === 'interakt' || log.lead_source === 'q_form') && log.lead_created_at) {
    refTime = new Date(log.lead_created_at);
    label = 'from lead';
  }

  if (!refTime) return null;

  const diffMins = differenceInMinutes(callTime, refTime);
  const absMins = Math.abs(diffMins);
  const isEarly = diffMins < 0;

  let text: string;
  if (absMins < 60) {
    text = `${absMins}m`;
  } else if (absMins < 1440) {
    const hrs = differenceInHours(callTime, refTime);
    text = `${Math.abs(hrs)}h`;
  } else {
    const days = differenceInDays(callTime, refTime);
    text = `${Math.abs(days)}d`;
  }

  if (isEarly) text = `-${text}`;

  // Color coding: <30m green, 30m-2h yellow, >2h red
  let color = 'text-green-600';
  if (absMins > 120) color = 'text-red-500';
  else if (absMins > 30) color = 'text-yellow-600';

  return { text, color };
}

export function OutboundCallTracker() {
  const [logs, setLogs] = useState<OutboundLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'myoperator' | 'interakt' | 'prospect' | 'pipeline' | 'q_form'>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'day' | 'week' | 'month'>('all');

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('outbound_call_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (!error && data) setLogs(data as OutboundLog[]);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const filteredLogs = useMemo(() => {
    let result = logs;

    if (sourceFilter !== 'all') {
      result = result.filter(l => l.lead_source === sourceFilter);
    }

    const now = new Date();
    if (periodFilter === 'day') {
      const s = startOfDay(now);
      result = result.filter(l => new Date(l.created_at) >= s);
    } else if (periodFilter === 'week') {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      result = result.filter(l => new Date(l.created_at) >= s);
    } else if (periodFilter === 'month') {
      const s = startOfMonth(now);
      result = result.filter(l => new Date(l.created_at) >= s);
    }

    return result;
  }, [logs, sourceFilter, periodFilter]);

  // Salesperson stats
  const spStats = useMemo(() => {
    const map = new Map<string, {
      name: string;
      total: number;
      connected: number;
      notAnswered: number;
      myoperator: number;
      interakt: number;
      prospect: number;
      pipeline: number;
    }>();

    for (const log of filteredLogs) {
      const name = log.called_by_name;
      if (!map.has(name)) {
        map.set(name, { name, total: 0, connected: 0, notAnswered: 0, myoperator: 0, interakt: 0, prospect: 0, pipeline: 0 });
      }
      const entry = map.get(name)!;
      entry.total++;
      if (log.call_outcome === 'connected') entry.connected++;
      else entry.notAnswered++;
      if (log.lead_source === 'myoperator') entry.myoperator++;
      else if (log.lead_source === 'interakt') entry.interakt++;
      else if (log.lead_source === 'prospect') entry.prospect++;
      else if (log.lead_source === 'pipeline') entry.pipeline++;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredLogs]);

  const totalConnected = filteredLogs.filter(l => l.call_outcome === 'connected').length;
  const totalNotConnected = filteredLogs.length - totalConnected;
  const prospectCount = filteredLogs.filter(l => l.lead_source === 'prospect').length;
  const pipelineCount = filteredLogs.filter(l => l.lead_source === 'pipeline').length;
  const myoperatorCount = filteredLogs.filter(l => l.lead_source === 'myoperator').length;
  const interaktCount = filteredLogs.filter(l => l.lead_source === 'interakt').length;
  const qformCount = filteredLogs.filter(l => l.lead_source === 'q_form').length;

  const COLORS = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
    'hsl(24, 70%, 50%)',
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold">{filteredLogs.length}</p>
            <p className="text-xs text-muted-foreground">Total Calls</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold text-green-600">{totalConnected}</p>
            <p className="text-xs text-muted-foreground">Connected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold">{myoperatorCount}</p>
            <p className="text-xs text-muted-foreground">MyOperator</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold">{interaktCount}</p>
            <p className="text-xs text-muted-foreground">Interakt</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold">{prospectCount}</p>
            <p className="text-xs text-muted-foreground">Prospects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-bold">{pipelineCount}</p>
            <p className="text-xs text-muted-foreground">Pipeline</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {([
            { key: 'all', label: 'All Time' },
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
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md">
            <Button variant={sourceFilter === 'all' ? 'secondary' : 'ghost'} size="sm" onClick={() => setSourceFilter('all')} className="rounded-r-none text-xs px-3">All</Button>
            <Button variant={sourceFilter === 'myoperator' ? 'secondary' : 'ghost'} size="sm" onClick={() => setSourceFilter('myoperator')} className="rounded-none border-x text-xs px-2">MO</Button>
            <Button variant={sourceFilter === 'interakt' ? 'secondary' : 'ghost'} size="sm" onClick={() => setSourceFilter('interakt')} className="rounded-none border-r text-xs px-2">IK</Button>
            <Button variant={sourceFilter === 'prospect' ? 'secondary' : 'ghost'} size="sm" onClick={() => setSourceFilter('prospect')} className="rounded-none border-r text-xs px-2">Prospect</Button>
            <Button variant={sourceFilter === 'pipeline' ? 'secondary' : 'ghost'} size="sm" onClick={() => setSourceFilter('pipeline')} className="rounded-none border-r text-xs px-2">Pipeline</Button>
            <Button variant={sourceFilter === 'q_form' ? 'secondary' : 'ghost'} size="sm" onClick={() => setSourceFilter('q_form')} className="rounded-l-none text-xs px-2">Q-Form</Button>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Salesperson Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Salesperson Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {spStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No call data yet</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {spStats.map((sp, i) => (
                <div key={sp.name} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  >
                    {sp.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{sp.name}</p>
                    <div className="flex gap-2 mt-1 text-[10px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-0.5">
                        <Phone className="h-2.5 w-2.5" /> {sp.total} calls
                      </span>
                      <span className="flex items-center gap-0.5 text-green-600">
                        <CheckCircle className="h-2.5 w-2.5" /> {sp.connected}
                      </span>
                      <span className="flex items-center gap-0.5 text-red-500">
                        <XCircle className="h-2.5 w-2.5" /> {sp.notAnswered}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                      <span>MO: {sp.myoperator}</span>
                      <span>IK: {sp.interakt}</span>
                      <span>PR: {sp.prospect}</span>
                      <span>PL: {sp.pipeline}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Call Logs Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PhoneOutgoing className="h-4 w-4" />
            Call Log ({filteredLogs.length})
          </CardTitle>
          <CardDescription>Calls made to MyOperator and Interakt leads</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PhoneOutgoing className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No outbound calls logged yet</p>
              <p className="text-sm">Use the call icon on Interakt leads to log a call</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Source</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Called By</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Response Time</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${
                          log.lead_source === 'myoperator' ? 'border-blue-500/40 text-blue-500' 
                          : log.lead_source === 'interakt' ? 'border-emerald-500/40 text-emerald-500'
                          : log.lead_source === 'prospect' ? 'border-amber-500/40 text-amber-500'
                          : log.lead_source === 'q_form' ? 'border-cyan-500/40 text-cyan-500'
                          : 'border-purple-500/40 text-purple-500'
                        }`}>
                          {log.lead_source === 'myoperator' ? 'MyOperator' 
                           : log.lead_source === 'interakt' ? 'Interakt'
                           : log.lead_source === 'prospect' ? 'Prospect'
                           : log.lead_source === 'q_form' ? 'Q-Form'
                           : 'Pipeline'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{log.lead_name || '—'}</p>
                        {log.lead_company && <p className="text-[10px] text-muted-foreground">{log.lead_company}</p>}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono">{log.lead_phone}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{log.called_by_name}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${OUTCOME_COLORS[log.call_outcome] || ''}`}>
                          {OUTCOME_LABELS[log.call_outcome] || log.call_outcome}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatDuration(log.call_duration_seconds || 0)}</span>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const rt = formatResponseTime(log);
                          if (!rt) return <span className="text-xs text-muted-foreground">—</span>;
                          return (
                            <span className={`text-xs font-medium ${rt.color}`} title={
                              (log.lead_source === 'prospect' || log.lead_source === 'pipeline')
                                ? `Follow-up was at ${log.scheduled_followup_at ? format(new Date(log.scheduled_followup_at), 'dd MMM hh:mm a') : '—'}`
                                : `Lead created at ${log.lead_created_at ? format(new Date(log.lead_created_at), 'dd MMM hh:mm a') : '—'}`
                            }>
                              {rt.text}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm max-w-[200px] truncate" title={log.call_notes || ''}>
                          {log.call_notes || '—'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          <p>{format(new Date(log.created_at), 'hh:mm a')}</p>
                          <p>{format(new Date(log.created_at), 'dd MMM yyyy')}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}