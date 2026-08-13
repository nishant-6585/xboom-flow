import { Fragment, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, AlertTriangle, CalendarClock, CalendarDays, CircleOff, ChevronDown, ChevronRight } from 'lucide-react';
import { format, isToday, isBefore, startOfDay, endOfWeek } from 'date-fns';
import { PIPELINE_STATUSES } from '@/hooks/usePipelineOrders';
import {
  usePipelineFollowupTracker,
  modeLabel,
  outcomeLabel,
  ordinal,
  type PipelineFollowupRow,
} from '@/hooks/usePipelineFollowupTracker';
import { PipelineFollowupTimeline } from './PipelineFollowupTimeline';
import { LogPipelineFollowupDialog } from './LogPipelineFollowupDialog';

type Bucket = 'all' | 'overdue' | 'today' | 'upcoming' | 'none';

const inr = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function bucketOf(row: PipelineFollowupRow): Bucket {
  if (!row.next_followup_at) return 'none';
  const d = new Date(row.next_followup_at);
  if (isToday(d)) return 'today';
  if (isBefore(d, startOfDay(new Date()))) return 'overdue';
  return 'upcoming';
}

export function PipelineFollowupTracker() {
  const { rows, loading } = usePipelineFollowupTracker();
  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState('all');
  const [bucket, setBucket] = useState<Bucket>('all');
  const [status, setStatus] = useState('open');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialogRow, setDialogRow] = useState<PipelineFollowupRow | null>(null);
  const [completeId, setCompleteId] = useState<string | null>(null);

  const owners = useMemo(() => {
    const set = new Map<string, string>();
    rows.forEach(r => {
      if (r.sales_person_id && r.sales_person_name) set.set(r.sales_person_id, r.sales_person_name);
    });
    return Array.from(set, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => {
        if (status === 'open' && (r.pipeline_status === 'won' || r.pipeline_status === 'lost')) return false;
        if (status !== 'open' && status !== 'all' && r.pipeline_status !== status) return false;
        if (owner !== 'all' && r.sales_person_id !== owner) return false;
        if (bucket !== 'all' && bucketOf(r) !== bucket) return false;
        if (q) {
          const hay = `${r.customer_company ?? ''} ${r.customer_name} ${r.product_name ?? ''} ${r.sales_person_name ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const order: Record<Bucket, number> = { overdue: 0, today: 1, upcoming: 2, none: 3, all: 4 };
        const d = order[bucketOf(a)] - order[bucketOf(b)];
        if (d !== 0) return d;
        return (a.next_followup_at ?? '9999').localeCompare(b.next_followup_at ?? '9999');
      });
  }, [rows, search, owner, bucket, status]);

  const stats = useMemo(() => {
    const weekEnd = endOfWeek(new Date());
    let overdue = 0, today = 0, thisWeek = 0, none = 0;
    filtered.forEach(r => {
      const b = bucketOf(r);
      if (b === 'overdue') overdue++;
      if (b === 'today') today++;
      if (b === 'upcoming' && new Date(r.next_followup_at!) <= weekEnd) thisWeek++;
      if (r.followup_count === 0) none++;
    });
    return { overdue, today, thisWeek, none };
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const openLog = (row: PipelineFollowupRow, id?: string | null) => {
    setDialogRow(row);
    setCompleteId(id ?? null);
  };

  const nextCell = (r: PipelineFollowupRow) => {
    const b = bucketOf(r);
    if (b === 'none') return <span className="text-xs text-muted-foreground">Not scheduled</span>;
    const cls =
      b === 'overdue'
        ? 'text-destructive font-medium'
        : b === 'today'
        ? 'text-amber-600 dark:text-amber-400 font-medium'
        : 'text-green-600 dark:text-green-400';
    return (
      <span className={`text-xs ${cls}`}>
        {format(new Date(r.next_followup_at!), 'dd MMM, hh:mm a')}
        {b === 'overdue' && ' · overdue'}
      </span>
    );
  };

  const statCards = [
    { key: 'overdue' as Bucket, label: 'Overdue', value: stats.overdue, Icon: AlertTriangle, tone: 'text-destructive' },
    { key: 'today' as Bucket, label: 'Due today', value: stats.today, Icon: CalendarClock, tone: 'text-amber-500' },
    { key: 'upcoming' as Bucket, label: 'Due this week', value: stats.thisWeek, Icon: CalendarDays, tone: 'text-green-500' },
    { key: 'none' as Bucket, label: 'No follow-up yet', value: stats.none, Icon: CircleOff, tone: 'text-muted-foreground' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(c => (
          <Card
            key={c.label}
            className={`cursor-pointer transition-colors ${bucket === c.key ? 'border-primary' : ''}`}
            onClick={() => setBucket(bucket === c.key ? 'all' : c.key)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <c.Icon className={`h-3.5 w-3.5 ${c.tone}`} /> {c.label}
              </div>
              <div className="text-2xl font-semibold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search company, customer, product, owner…"
            className="pl-9 h-9 rounded-lg"
          />
        </div>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="h-9 w-[180px] rounded-lg"><SelectValue placeholder="Lead owner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lead owners</SelectItem>
            {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[190px] rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open deals only</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            {PIPELINE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={bucket} onValueChange={v => setBucket(v as Bucket)}>
          <SelectTrigger className="h-9 w-[170px] rounded-lg"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All follow-ups</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="today">Due today</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="none">Not scheduled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Company</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Lead owner</TableHead>
                <TableHead className="text-right">Deal value</TableHead>
                <TableHead>Follow-ups</TableHead>
                <TableHead>Latest follow-up</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                    No deals match these filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(r => {
                const isOpen = expanded === r.pipeline_id;
                return (
                  <Fragment key={r.pipeline_id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : r.pipeline_id)}
                    >
                      <TableCell className="w-8">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{r.customer_company || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.customer_name}</div>
                      </TableCell>
                      <TableCell className="text-sm max-w-[220px] truncate">{r.product_name || '—'}</TableCell>
                      <TableCell className="text-sm">{r.sales_person_name || '—'}</TableCell>
                      <TableCell className="text-right text-sm">{inr(r.expected_price)}</TableCell>
                      <TableCell>
                        {r.followup_count > 0 ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {ordinal(r.last_sequence_no || r.followup_count)} done
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">None</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        {r.last_followup_at ? (
                          <div className="text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{format(new Date(r.last_followup_at), 'dd MMM')}</span>
                              {r.last_followup_mode && (
                                <span className="text-muted-foreground">· {modeLabel(r.last_followup_mode)}</span>
                              )}
                              {r.last_followup_outcome && (
                                <Badge variant="outline" className="text-[10px]">{outcomeLabel(r.last_followup_outcome)}</Badge>
                              )}
                            </div>
                            {r.last_followup_remark && (
                              <div className="text-muted-foreground truncate">{r.last_followup_remark}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{nextCell(r)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-lg text-[11px]"
                          onClick={e => { e.stopPropagation(); openLog(r, r.next_followup_id); }}
                        >
                          Log follow-up
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={9} className="bg-muted/30">
                          <PipelineFollowupTimeline
                            pipelineId={r.pipeline_id}
                            onLogFollowup={id => openLog(r, id)}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LogPipelineFollowupDialog
        open={!!dialogRow}
        onOpenChange={o => { if (!o) { setDialogRow(null); setCompleteId(null); } }}
        row={dialogRow}
        completeId={completeId}
      />
    </div>
  );
}