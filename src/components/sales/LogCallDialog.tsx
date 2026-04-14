import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Phone, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface LogCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadSource: 'myoperator' | 'interakt' | 'prospect' | 'pipeline';
  leadId: string;
  leadName: string;
  leadPhone: string;
  leadCompany?: string;
  onCallLogged?: () => void;
}

const OUTCOMES = [
  { value: 'connected', label: 'Connected' },
  { value: 'not_answered', label: 'Not Answered' },
  { value: 'busy', label: 'Busy' },
  { value: 'callback', label: 'Callback Requested' },
  { value: 'voicemail', label: 'Voicemail' },
];

export function LogCallDialog({
  open, onOpenChange, leadSource, leadId, leadName, leadPhone, leadCompany, onCallLogged
}: LogCallDialogProps) {
  const { user, profile } = useAuth();
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('connected');
  const [duration, setDuration] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user || !profile) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('outbound_call_logs').insert({
        lead_source: leadSource,
        lead_id: leadId,
        lead_name: leadName,
        lead_phone: leadPhone,
        lead_company: leadCompany || null,
        called_by: user.id,
        called_by_name: profile.name || user.email || 'Unknown',
        call_notes: notes || null,
        call_outcome: outcome,
        call_duration_seconds: parseInt(duration) || 0,
      });
      if (error) throw error;
      toast.success('Call logged successfully');
      setNotes('');
      setOutcome('connected');
      setDuration('');
      onOpenChange(false);
      onCallLogged?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to log call');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Log Call — {leadName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            <span className="font-mono">{leadPhone}</span>
            {leadCompany && <span>• {leadCompany}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Duration (seconds)</Label>
              <Input
                type="number"
                placeholder="e.g. 120"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Call Notes / Order Info</Label>
            <Textarea
              placeholder="Enter call notes, order details, follow-up required..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Phone className="h-4 w-4 mr-1" />}
            Log Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}