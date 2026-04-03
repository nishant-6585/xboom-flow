import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CreditCard } from '@/hooks/useCreditCards';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => Promise<boolean>;
  cards: CreditCard[];
}

export function CCAddStatementDialog({ open, onOpenChange, onSubmit, cards }: Props) {
  const [form, setForm] = useState({
    card_id: '', billing_month: '', outstanding_balance: '', total_due: '',
    minimum_due: '', due_date: '', available_credit_limit: '', interest_charged: '0',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await onSubmit({
      card_id: form.card_id,
      billing_month: form.billing_month,
      outstanding_balance: Number(form.outstanding_balance),
      total_due: Number(form.total_due),
      minimum_due: Number(form.minimum_due),
      due_date: form.due_date,
      available_credit_limit: Number(form.available_credit_limit),
      interest_charged: Number(form.interest_charged),
    });
    setSaving(false);
    if (ok) { onOpenChange(false); setForm({ card_id: '', billing_month: '', outstanding_balance: '', total_due: '', minimum_due: '', due_date: '', available_credit_limit: '', interest_charged: '0' }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Monthly Statement</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Card</Label>
            <Select value={form.card_id} onValueChange={v => setForm(p => ({ ...p, card_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select card" /></SelectTrigger>
              <SelectContent>{cards.map(c => <SelectItem key={c.id} value={c.id}>{c.card_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Billing Month</Label><Input required placeholder="e.g. Apr-2026" value={form.billing_month} onChange={e => setForm(p => ({ ...p, billing_month: e.target.value }))} /></div>
            <div><Label>Due Date</Label><Input required type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Outstanding Balance (₹)</Label><Input required type="number" min="0" value={form.outstanding_balance} onChange={e => setForm(p => ({ ...p, outstanding_balance: e.target.value }))} /></div>
            <div><Label>Total Due (₹)</Label><Input required type="number" min="0" value={form.total_due} onChange={e => setForm(p => ({ ...p, total_due: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Minimum Due (₹)</Label><Input required type="number" min="0" value={form.minimum_due} onChange={e => setForm(p => ({ ...p, minimum_due: e.target.value }))} /></div>
            <div><Label>Available Credit (₹)</Label><Input type="number" min="0" value={form.available_credit_limit} onChange={e => setForm(p => ({ ...p, available_credit_limit: e.target.value }))} /></div>
          </div>
          <div><Label>Interest Charged (₹)</Label><Input type="number" min="0" value={form.interest_charged} onChange={e => setForm(p => ({ ...p, interest_charged: e.target.value }))} /></div>
          <Button type="submit" disabled={saving || !form.card_id} className="w-full">{saving ? 'Saving...' : 'Add Statement'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
