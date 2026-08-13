import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { CalendarCheck, Package, User } from 'lucide-react';
import { FOLLOWUP_NOTE_OPTIONS } from '@/lib/followupNotes';
import {
  FOLLOWUP_MODES,
  FOLLOWUP_OUTCOMES,
  ordinal,
  useLogProspectFollowup,
  type ProspectFollowupRow,
} from '@/hooks/useProspectFollowupTracker';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ProspectFollowupRow | null;
  /** pending follow-up id being completed (optional) */
  completeId?: string | null;
  onLogged?: () => void;
}

export function LogProspectFollowupDialog({ open, onOpenChange, row, completeId, onLogged }: Props) {
  const { logFollowup } = useLogProspectFollowup();
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [mode, setMode] = useState<string>('call');
  const [outcome, setOutcome] = useState<string>('');
  const [remark, setRemark] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('10:00');

  useEffect(() => {
    if (open) {
      const now = new Date();
      setDate(format(now, 'yyyy-MM-dd'));
      setTime(format(now, 'HH:mm'));
      setMode('call');
      setOutcome('');
      setRemark('');
      setNextDate('');
      setNextTime('10:00');
    }
  }, [open]);

  if (!row) return null;

  const seq = (row.last_sequence_no || row.followup_count || 0) + 1;

  const handleSubmit = async () => {
    if (!date || !time || !remark.trim()) return;
    setSaving(true);
    try {
      const ok = await logFollowup({
        row,
        completeId: completeId || null,
        followupAt: new Date(`${date}T${time}:00`).toISOString(),
        mode,
        outcome: outcome || null,
        remark: remark.trim(),
        nextFollowupAt: nextDate ? new Date(`${nextDate}T${nextTime || '10:00'}:00`).toISOString() : null,
      });
      if (ok) {
        onOpenChange(false);
        onLogged?.();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CalendarCheck className="w-5 h-5 text-primary" />
            Log {ordinal(seq)} follow-up
          </DialogTitle>
          <DialogDescription>
            Record what happened, then optionally schedule the next follow-up so the chain never breaks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-xl bg-muted/50 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              {row.customer_company || row.customer_name}
              <Badge variant="outline" className="text-[10px]">{ordinal(seq)}</Badge>
            </div>
            {row.product_name && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Package className="w-3 h-3" /> {row.product_name}
              </div>
            )}
            {row.owner_name && (
              <div className="text-[10px] text-muted-foreground/70">Lead owner: {row.owner_name}</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 rounded-lg" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Time</Label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-9 rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FOLLOWUP_MODES.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger className="h-9 rounded-lg"><SelectValue placeholder="Select outcome" /></SelectTrigger>
                <SelectContent>
                  {FOLLOWUP_OUTCOMES.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Notes *</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {FOLLOWUP_NOTE_OPTIONS.map(n => (
                <Button
                  key={n}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] rounded-lg"
                  onClick={() => setRemark(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
            <Textarea
              value={remark}
              onChange={e => setRemark(e.target.value)}
              placeholder="What was discussed? Next steps?"
              className="min-h-[80px] rounded-lg"
            />
          </div>

          <div className="rounded-xl border p-3 space-y-2">
            <Label className="text-xs font-medium">Schedule next follow-up (optional)</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={nextDate}
                min={format(new Date(), 'yyyy-MM-dd')}
                onChange={e => setNextDate(e.target.value)}
                className="h-9 rounded-lg"
              />
              <Input
                type="time"
                value={nextTime}
                onChange={e => setNextTime(e.target.value)}
                className="h-9 rounded-lg"
                disabled={!nextDate}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving || !remark.trim() || !date || !time}>
            {saving ? 'Saving…' : `Save ${ordinal(seq)} follow-up`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
