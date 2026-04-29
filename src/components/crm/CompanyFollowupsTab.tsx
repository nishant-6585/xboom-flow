import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Clock, CheckCircle2, XCircle, AlertCircle, Calendar, User as UserIcon, ExternalLink } from 'lucide-react';
import { format, isPast, formatDistanceToNow } from 'date-fns';
import { useCompanyFollowups } from '@/hooks/useCompanyFollowups';
import { useFollowups } from '@/hooks/useFollowups';
import { FollowupScheduleDialog } from '@/components/sales/FollowupScheduleDialog';
import { useQueryClient } from '@tanstack/react-query';
import type { Company } from '@/hooks/useCompanies';
import { cn } from '@/lib/utils';

interface Props {
  company: Company;
}

const STATUS_META: Record<string, { label: string; cls: string; Icon: any }> = {
  pending: { label: 'Pending', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30', Icon: Clock },
  completed: { label: 'Done', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30', Icon: CheckCircle2 },
  missed: { label: 'Missed', cls: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30', Icon: AlertCircle },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30', Icon: XCircle },
};

const SOURCE_META: Record<string, { label: string; cls: string; route?: (id: string) => string }> = {
  prospect: { label: 'Prospect', cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30', route: (id) => `/sales?tab=crm&prospect=${id}` },
  pipeline: { label: 'Pipeline', cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30', route: (id) => `/sales?tab=pipeline&pipeline=${id}` },
  enquiry:  { label: 'Enquiry',  cls: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30', route: (id) => `/sales?tab=enquiries&enquiry=${id}` },
  company:  { label: 'Company',  cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
  lead:     { label: 'Lead',     cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30', route: (id) => `/leads?lead=${id}` },
};

export function CompanyFollowupsTab({ company }: Props) {
  const { followups, refetch } = useCompanyFollowups(company.id);
  const { completeFollowup, cancelFollowup } = useFollowups();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showSchedule, setShowSchedule] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [remark, setRemark] = useState('');

  const handleComplete = async (id: string) => {
    const ok = await completeFollowup(id, remark || 'Completed');
    if (ok) {
      setCompletingId(null);
      setRemark('');
      refetch();
      qc.invalidateQueries({ queryKey: ['all-company-followups'] });
    }
  };

  const handleCancel = async (id: string) => {
    const ok = await cancelFollowup(id);
    if (ok) {
      refetch();
      qc.invalidateQueries({ queryKey: ['all-company-followups'] });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {followups.filter(f => f.status === 'pending').length} pending · {followups.length} total
        </div>
        <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => setShowSchedule(true)}>
          <Plus className="h-3 w-3" /> Schedule Follow-up
        </Button>
      </div>

      {followups.length === 0 ? (
        <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border/40 rounded-lg">
          No follow-ups scheduled yet for this company.
        </div>
      ) : (
        <div className="space-y-2">
          {followups.map(f => {
            const meta = STATUS_META[f.status] || STATUS_META.pending;
            const Icon = meta.Icon;
            const overdue = f.status === 'pending' && isPast(new Date(f.followup_at));
            const src = SOURCE_META[f.source_type] || SOURCE_META.company;
            return (
              <Card key={f.id} className={cn('border-border/50', overdue && 'border-red-500/40')}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', overdue ? 'text-red-500' : '')} />
                      <span className="text-xs font-medium truncate">{f.customer_name}</span>
                      {f.is_a_category && <Badge className="text-[9px] h-4 px-1 bg-amber-500/20 text-amber-700">A</Badge>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {src.route ? (
                        <button
                          type="button"
                          onClick={() => navigate(src.route!(f.source_id))}
                          className={cn('text-[10px] border rounded px-1.5 py-0.5 inline-flex items-center gap-1 hover:opacity-80 transition', src.cls)}
                          title={`Open ${src.label}`}
                        >
                          {src.label}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      ) : (
                        <Badge className={cn('text-[10px] border', src.cls)}>{src.label}</Badge>
                      )}
                      <Badge className={cn('text-[10px] border', meta.cls)}>{meta.label}</Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(f.followup_at), 'd MMM, h:mm a')}
                    </span>
                    {f.status === 'pending' && (
                      <span className={cn(overdue && 'text-red-500 font-medium')}>
                        {overdue ? `Overdue by ${formatDistanceToNow(new Date(f.followup_at))}` : `in ${formatDistanceToNow(new Date(f.followup_at))}`}
                      </span>
                    )}
                    {f.created_by_name && (
                      <span className="flex items-center gap-1 ml-auto">
                        <UserIcon className="h-3 w-3" />{f.created_by_name}
                      </span>
                    )}
                  </div>

                  {f.remark && (
                    <div className="text-[11px] text-foreground/80 bg-muted/40 rounded px-2 py-1 italic">"{f.remark}"</div>
                  )}

                  {f.status === 'pending' && (
                    completingId === f.id ? (
                      <div className="space-y-1.5">
                        <Textarea
                          value={remark}
                          onChange={(e) => setRemark(e.target.value)}
                          placeholder="What was the outcome?"
                          className="text-xs min-h-[50px]"
                        />
                        <div className="flex gap-1">
                          <Button size="sm" className="h-6 text-[11px] flex-1" onClick={() => handleComplete(f.id)}>Mark Done</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => { setCompletingId(null); setRemark(''); }}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-6 text-[11px] flex-1 gap-1" onClick={() => setCompletingId(f.id)}>
                          <CheckCircle2 className="h-3 w-3" /> Complete
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] text-muted-foreground" onClick={() => handleCancel(f.id)}>
                          Cancel
                        </Button>
                      </div>
                    )
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <FollowupScheduleDialog
        open={showSchedule}
        onOpenChange={setShowSchedule}
        sourceType={'company' as any}
        sourceId={company.id}
        customerName={company.name}
        customerCompany={company.name}
        phone={company.phone}
        email={company.email}
        onScheduled={() => {
          refetch();
          qc.invalidateQueries({ queryKey: ['all-company-followups'] });
        }}
      />
    </div>
  );
}