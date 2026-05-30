import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useCrmActivities, CrmActivityFormData } from '@/hooks/useCrmActivities';
import { useFollowups } from '@/hooks/useFollowups';
import { Prospect } from '@/hooks/useProspects';
import { format, formatDistanceToNow, isBefore } from 'date-fns';
import {
  Phone, Mail, MessageCircle, Users, Building2, MapPin, Package,
  Plus, CheckCircle2, Clock, AlertTriangle, Calendar, Send
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CallButton } from '@/components/calls/CallButton';
import { LeadSourceBadge, normalizeSource } from '@/components/LeadSourceBadge';

const ACTIVITY_TYPES = [
  { value: 'call', label: 'Call', icon: Phone, color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  { value: 'email', label: 'Email', icon: Mail, color: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  { value: 'meeting', label: 'Meeting', icon: Users, color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
];

const OUTCOMES = [
  { value: 'connected', label: 'Connected' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'follow_up_needed', label: 'Follow-up Needed' },
];

interface Props {
  prospect: Prospect | null;
  open: boolean;
  onClose: () => void;
}

export function CrmContactDetail({ prospect, open, onClose }: Props) {
  const { activities, loading, createActivity, creatingActivity, completeFollowup } = useCrmActivities(prospect?.id);
  const { followups } = useFollowups();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<CrmActivityFormData>>({
    activity_type: 'call',
    subject: '',
    notes: '',
    outcome: '',
    followup_date: '',
  });

  if (!prospect) return null;

  const prospectFollowups = followups.filter(f => f.source_id === prospect.id && f.source_type === 'prospect');
  const now = new Date();

  const handleSubmit = async () => {
    if (!form.subject?.trim()) return;
    await createActivity({
      prospect_id: prospect.id,
      activity_type: form.activity_type || 'call',
      subject: form.subject!,
      notes: form.notes || undefined,
      outcome: form.outcome || undefined,
      followup_date: form.followup_date || null,
    });
    setForm({ activity_type: 'call', subject: '', notes: '', outcome: '', followup_date: '' });
    setShowForm(false);
  };

  const getActivityMeta = (type: string) => ACTIVITY_TYPES.find(a => a.value === type) || ACTIVITY_TYPES[0];

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b bg-muted/30">
          <SheetTitle className="text-xl">{prospect.customer_name}</SheetTitle>
          <div className="flex flex-wrap gap-2 mt-1">
            <LeadSourceBadge source={prospect.source_type} size="sm" />
            {prospect.lead_source && normalizeSource(prospect.lead_source) !== normalizeSource(prospect.source_type) && (
              <LeadSourceBadge source={prospect.lead_source} size="sm" />
            )}
            <Badge variant="outline" className="text-xs gap-1"><Building2 className="h-3 w-3" />{prospect.company || 'N/A'}</Badge>
            {prospect.city && <Badge variant="outline" className="text-xs gap-1"><MapPin className="h-3 w-3" />{prospect.city}</Badge>}
            {prospect.product_name && <Badge variant="outline" className="text-xs gap-1"><Package className="h-3 w-3" />{prospect.product_name}</Badge>}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {/* Contact Info */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {prospect.phone_number && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
                <Phone className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate flex-1">{prospect.phone_number}</span>
                <CallButton
                  phoneNumber={prospect.phone_number}
                  entityType="prospect"
                  entityId={prospect.id}
                  iconOnly
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                />
              </div>
            )}
            {prospect.email && (
              <a href={`mailto:${prospect.email}`} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-sm">
                <Mail className="h-4 w-4 text-primary" />
                <span className="truncate">{prospect.email}</span>
              </a>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="text-2xl font-bold text-primary">{activities.length}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Activities</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <div className="text-2xl font-bold text-amber-600">{prospectFollowups.filter(f => f.status === 'pending').length}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Pending F/U</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
              <div className="text-2xl font-bold text-emerald-600">{prospectFollowups.filter(f => f.status === 'completed').length}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Completed</div>
            </div>
          </div>

          <Separator className="mb-4" />

          {/* Log Activity Button */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Activity Timeline</h3>
            <Button size="sm" onClick={() => setShowForm(!showForm)} variant={showForm ? 'secondary' : 'default'} className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Log Activity
            </Button>
          </div>

          {/* Log Activity Form */}
          {showForm && (
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 mb-4 space-y-3">
              <div className="flex gap-2">
                {ACTIVITY_TYPES.map(t => (
                  <Button
                    key={t.value}
                    size="sm"
                    variant={form.activity_type === t.value ? 'default' : 'outline'}
                    className="gap-1.5 text-xs flex-1"
                    onClick={() => setForm(f => ({ ...f, activity_type: t.value }))}
                  >
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </Button>
                ))}
              </div>
              <div>
                <Label className="text-xs">Subject *</Label>
                <Input
                  value={form.subject || ''}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="e.g., Discussed pricing for DJI Matrice"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={form.notes || ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Details of the interaction..."
                  className="mt-1 min-h-[60px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Outcome</Label>
                  <Select value={form.outcome || ''} onValueChange={v => setForm(f => ({ ...f, outcome: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {OUTCOMES.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Schedule Follow-up</Label>
                  <Input
                    type="datetime-local"
                    value={form.followup_date || ''}
                    onChange={e => setForm(f => ({ ...f, followup_date: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <Button onClick={handleSubmit} disabled={creatingActivity || !form.subject?.trim()} className="w-full gap-2">
                <Send className="h-4 w-4" />
                {creatingActivity ? 'Saving...' : 'Log Activity'}
              </Button>
            </div>
          )}

          {/* Timeline */}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading activities...</div>
          ) : activities.length === 0 && prospectFollowups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No activities yet. Click "Log Activity" to start tracking interactions.
            </div>
          ) : (
            <div className="relative ml-4 border-l-2 border-border/60 space-y-0">
              {/* Merge activities + followups into timeline */}
              {[
                ...activities.map(a => ({ type: 'activity' as const, date: a.activity_date, data: a })),
                ...prospectFollowups.map(f => ({ type: 'followup' as const, date: f.followup_at, data: f })),
              ]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((item, idx) => {
                  if (item.type === 'activity') {
                    const a = item.data;
                    const meta = getActivityMeta(a.activity_type);
                    const Icon = meta.icon;
                    return (
                      <div key={`a-${a.id}`} className="relative pl-6 pb-4">
                        <div className={cn('absolute -left-[11px] top-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-background', meta.color)}>
                          <Icon className="h-2.5 w-2.5" />
                        </div>
                        <div className="p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium">{a.subject}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {format(new Date(a.activity_date), 'dd MMM yyyy, hh:mm a')} · {a.performed_by_name}
                              </div>
                            </div>
                            {a.outcome && (
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {OUTCOMES.find(o => o.value === a.outcome)?.label || a.outcome}
                              </Badge>
                            )}
                          </div>
                          {a.notes && <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">{a.notes}</p>}
                          {a.followup_date && !a.followup_completed && (
                            <div className="flex items-center justify-between mt-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                              <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                                <Calendar className="h-3 w-3" />
                                Follow-up: {format(new Date(a.followup_date), 'dd MMM, hh:mm a')}
                                {isBefore(new Date(a.followup_date), now) && <AlertTriangle className="h-3 w-3 text-red-500" />}
                              </div>
                              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => completeFollowup(a.id)}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Done
                              </Button>
                            </div>
                          )}
                          {a.followup_completed && (
                            <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" />
                              Follow-up completed {a.followup_completed_at && formatDistanceToNow(new Date(a.followup_completed_at), { addSuffix: true })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  } else {
                    const f = item.data;
                    const isOverdue = isBefore(new Date(f.followup_at), now) && f.status === 'pending';
                    return (
                      <div key={`f-${f.id}`} className="relative pl-6 pb-4">
                        <div className={cn(
                          'absolute -left-[11px] top-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-background',
                          f.status === 'completed' ? 'bg-emerald-500/20 text-emerald-600' : isOverdue ? 'bg-red-500/20 text-red-600' : 'bg-amber-500/20 text-amber-600'
                        )}>
                          <Clock className="h-2.5 w-2.5" />
                        </div>
                        <div className={cn('p-3 rounded-lg border', f.status === 'completed' ? 'bg-emerald-500/5 border-emerald-500/20' : isOverdue ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20')}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">Scheduled Follow-up</span>
                            <Badge variant="outline" className="text-[10px]">{f.source_type}</Badge>
                            {f.status === 'completed' && <Badge className="bg-emerald-500/20 text-emerald-700 border-0 text-[10px]">✅ Done</Badge>}
                            {isOverdue && <Badge className="bg-red-500/20 text-red-700 border-0 text-[10px]">⏰ Overdue</Badge>}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {format(new Date(f.followup_at), 'dd MMM yyyy, hh:mm a')} · by {f.created_by_name}
                          </div>
                          {f.remark && <p className="text-xs text-muted-foreground mt-1">{f.remark}</p>}
                        </div>
                      </div>
                    );
                  }
                })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
