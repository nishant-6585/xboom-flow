import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface LeaveBalanceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  employeeId: string;
  balances: { leave_type: string; label: string; balance: number }[];
  onSave: (adjustments: { leave_type: string; new_balance: number }[], reason: string) => Promise<void>;
}

export function LeaveBalanceEditDialog({
  open, onOpenChange, employeeName, balances, onSave,
}: LeaveBalanceEditDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      balances.forEach(b => { initial[b.leave_type] = String(b.balance); });
      setValues(initial);
      setReason('');
    }
    onOpenChange(isOpen);
  };

  const handleSave = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason for the adjustment');
      return;
    }

    const adjustments: { leave_type: string; new_balance: number }[] = [];
    for (const b of balances) {
      const newVal = parseFloat(values[b.leave_type] || '0');
      if (isNaN(newVal)) {
        toast.error(`Invalid value for ${b.label}`);
        return;
      }
      if (newVal < 0) {
        toast.error(`${b.label} balance cannot be negative`);
        return;
      }
      if (newVal !== b.balance) {
        adjustments.push({ leave_type: b.leave_type, new_balance: newVal });
      }
    }

    if (adjustments.length === 0) {
      toast.info('No changes detected');
      return;
    }

    setSaving(true);
    try {
      await onSave(adjustments, reason.trim());
      onOpenChange(false);
    } catch {
      toast.error('Failed to update balances');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Leave Balances — {employeeName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {balances.map(b => (
            <div key={b.leave_type} className="grid grid-cols-2 items-center gap-3">
              <Label className="text-sm">{b.label}</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12 text-right">was {b.balance}</span>
                <Input
                  type="number"
                  step="0.25"
                  min="0"
                  value={values[b.leave_type] ?? ''}
                  onChange={e => setValues(prev => ({ ...prev, [b.leave_type]: e.target.value }))}
                  className="w-24"
                />
              </div>
            </div>
          ))}

          <div className="space-y-1.5 pt-2">
            <Label className="text-sm font-medium">Reason <span className="text-destructive">*</span></Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Annual leave allocation adjustment"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
