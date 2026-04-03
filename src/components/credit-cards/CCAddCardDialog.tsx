import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => Promise<boolean>;
}

export function CCAddCardDialog({ open, onOpenChange, onSubmit }: Props) {
  const [form, setForm] = useState({ card_name: '', bank_name: '', credit_limit: '', billing_cycle_start_date: '1', due_days_after_statement: '20' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await onSubmit({
      card_name: form.card_name,
      bank_name: form.bank_name,
      credit_limit: Number(form.credit_limit),
      billing_cycle_start_date: Number(form.billing_cycle_start_date),
      due_days_after_statement: Number(form.due_days_after_statement),
    });
    setSaving(false);
    if (ok) { onOpenChange(false); setForm({ card_name: '', bank_name: '', credit_limit: '', billing_cycle_start_date: '1', due_days_after_statement: '20' }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Credit Card</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Card Name</Label><Input required value={form.card_name} onChange={e => setForm(p => ({ ...p, card_name: e.target.value }))} placeholder="e.g. HDFC Business Card" /></div>
          <div><Label>Bank Name</Label><Input required value={form.bank_name} onChange={e => setForm(p => ({ ...p, bank_name: e.target.value }))} placeholder="e.g. HDFC Bank" /></div>
          <div><Label>Credit Limit (₹)</Label><Input required type="number" min="0" value={form.credit_limit} onChange={e => setForm(p => ({ ...p, credit_limit: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Billing Cycle Start Day</Label><Input type="number" min="1" max="31" value={form.billing_cycle_start_date} onChange={e => setForm(p => ({ ...p, billing_cycle_start_date: e.target.value }))} /></div>
            <div><Label>Due Days After Statement</Label><Input type="number" min="1" value={form.due_days_after_statement} onChange={e => setForm(p => ({ ...p, due_days_after_statement: e.target.value }))} /></div>
          </div>
          <Button type="submit" disabled={saving} className="w-full">{saving ? 'Saving...' : 'Add Card'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
