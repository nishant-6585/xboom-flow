import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { useCompOff, CompOffRequestInfo } from '@/hooks/useCompOff';
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompOffHistoryTableProps {
  employeeId?: string;
}

function StatusTimeline({ request }: { request?: CompOffRequestInfo }) {
  if (!request) {
    return (
      <div className="text-xs text-muted-foreground">
        This credit has not been redeemed against any leave request yet.
      </div>
    );
  }
  const steps: Array<{
    key: string;
    label: string;
    done: boolean;
    active?: boolean;
    at?: string | null;
    by?: string | null;
    tone: 'neutral' | 'success' | 'danger';
  }> = [
    {
      key: 'submitted',
      label: 'Submitted',
      done: true,
      at: request.created_at,
      tone: 'neutral',
    },
    request.status === 'rejected'
      ? {
          key: 'rejected',
          label: 'Rejected',
          done: true,
          at: request.approved_rejected_at,
          by: request.approver_name,
          tone: 'danger',
        }
      : {
          key: 'approved',
          label: request.status === 'approved' ? 'Approved' : 'Pending HR approval',
          done: request.status === 'approved',
          active: request.status === 'submitted',
          at: request.approved_rejected_at,
          by: request.approver_name,
          tone: request.status === 'approved' ? 'success' : 'neutral',
        },
  ];

  return (
    <div className="space-y-2">
      <ol className="relative border-l-2 border-muted pl-4 space-y-3">
        {steps.map(s => {
          const Icon =
            s.tone === 'success' ? CheckCircle2 : s.tone === 'danger' ? XCircle : Clock;
          return (
            <li key={s.key} className="relative">
              <span
                className={cn(
                  'absolute -left-[22px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background',
                  s.tone === 'success' && 'text-green-600',
                  s.tone === 'danger' && 'text-red-600',
                  s.tone === 'neutral' && (s.done ? 'text-primary' : 'text-muted-foreground'),
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{s.label}</span>
                {s.at && (
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(s.at), 'MMM d, yyyy • h:mm a')}
                  </span>
                )}
                {s.by && (
                  <span className="text-xs text-muted-foreground">by {s.by}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {request.comments && (
        <div className="text-xs text-muted-foreground pl-1">
          <span className="font-medium text-foreground">Comment:</span> {request.comments}
        </div>
      )}
    </div>
  );
}

export function CompOffHistoryTable({ employeeId }: CompOffHistoryTableProps) {
  const { ledger, loading, requestsByLedger, stats } = useCompOff(employeeId);
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading) return <div className="h-24 bg-muted rounded-lg animate-pulse" />;

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Available</div>
          <div className="text-xl font-bold text-primary">{stats.available}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Pending HR</div>
          <div className="text-xl font-bold text-amber-600">{stats.pending}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Redeemed</div>
          <div className="text-xl font-bold">{stats.redeemed}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Expired</div>
          <div className="text-xl font-bold text-muted-foreground">{stats.expired}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Next expiry
          </div>
          <div className="text-sm font-semibold">
            {stats.nextExpiry ? format(parseISO(stats.nextExpiry), 'MMM d, yyyy') : '—'}
          </div>
        </Card>
      </div>

      {ledger.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No CompOff entries yet</p>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60">
                <TableHead className="w-8"></TableHead>
                <TableHead>Earned Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Redeemed On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.map(r => {
                const req = requestsByLedger[r.id];
                const isOpen = openId === r.id;
                const isExpiringSoon =
                  r.status === 'available' &&
                  r.approval_status === 'approved' &&
                  r.expires_at >= today &&
                  differenceInCalendarDays(parseISO(r.expires_at), new Date()) <= 14;
                let effectiveStatus: string = r.status;
                if (r.approval_status === 'pending') effectiveStatus = 'pending';
                else if (r.approval_status === 'rejected') effectiveStatus = 'rejected';
                else if (r.status === 'available' && r.expires_at < today) effectiveStatus = 'expired';
                return (
                  <>
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => setOpenId(isOpen ? null : r.id)}
                    >
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="text-sm">{format(parseISO(r.earned_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-sm">
                        {r.earned_type === 'holiday' ? `${r.holiday_name ?? 'Holiday'} (Holiday)` : 'Weekend'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            effectiveStatus === 'available'
                              ? 'default'
                              : effectiveStatus === 'redeemed'
                                ? 'secondary'
                                : effectiveStatus === 'pending'
                                  ? 'outline'
                                  : 'destructive'
                          }
                          className={cn(
                            'capitalize',
                            effectiveStatus === 'pending' && 'border-amber-500 text-amber-700 bg-amber-50',
                          )}
                        >
                          {effectiveStatus === 'pending' ? 'Pending HR' : effectiveStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn('text-xs', isExpiringSoon && 'text-amber-600 font-medium')}>
                        {format(parseISO(r.expires_at), 'MMM d, yyyy')}
                        {isExpiringSoon && ' • soon'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.redeemed_on ? format(parseISO(r.redeemed_on), 'MMM d, yyyy') : '—'}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={r.id + '_details'} className="bg-muted/30 hover:bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell colSpan={5} className="py-4">
                          <div className="space-y-3">
                            <div className="rounded border bg-background p-3 space-y-1 text-xs">
                              <div className="text-sm font-medium mb-1">Credit approval</div>
                              {r.approval_status === 'pending' && (
                                <div className="text-amber-700">Awaiting HR review — this credit does not count toward your available balance yet.</div>
                              )}
                              {r.approval_status === 'approved' && (
                                <div className="text-green-700">
                                  Approved{r.approved_by_name ? ` by ${r.approved_by_name}` : ''}
                                  {r.approved_at ? ` on ${format(parseISO(r.approved_at), 'MMM d, yyyy • h:mm a')}` : ''}
                                  {r.approval_comment ? ` — “${r.approval_comment}”` : ''}
                                </div>
                              )}
                              {r.approval_status === 'rejected' && (
                                <div className="text-red-700">
                                  Rejected{r.approved_by_name ? ` by ${r.approved_by_name}` : ''}
                                  {r.approved_at ? ` on ${format(parseISO(r.approved_at), 'MMM d, yyyy • h:mm a')}` : ''}
                                  {r.rejection_reason ? ` — Reason: ${r.rejection_reason}` : ''}
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="text-sm font-medium mb-1">Leave redemption</div>
                          <StatusTimeline request={req} />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}