import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CreditCard } from '@/hooks/useCreditCards';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => Promise<boolean>;
  cards: CreditCard[];
}

const defaultForm = {
  card_id: '', billing_month: '', outstanding_balance: '', total_due: '',
  minimum_due: '', due_date: '', available_credit_limit: '', interest_charged: '0',
  last_statement_due: '0', amount_paid: '0', payment_date: '', late_fee: '0', notes: '',
};

export function CCAddStatementDialog({ open, onOpenChange, onSubmit, cards }: Props) {
  const [form, setForm] = useState({ ...defaultForm });
  const [saving, setSaving] = useState(false);

  const set = (key: string, value: string) => setForm(p => ({ ...p, [key]: value }));

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
      last_statement_due: Number(form.last_statement_due),
      amount_paid: Number(form.amount_paid),
      payment_date: form.payment_date || null,
      late_fee: Number(form.late_fee),
      notes: form.notes || null,
    });
    setSaving(false);
    if (ok) { onOpenChange(false); setForm({ ...defaultForm }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader><DialogTitle>Add Monthly Statement</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Card</Label>
              <Select value={form.card_id} onValueChange={v => set('card_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select card" /></SelectTrigger>
                <SelectContent>{cards.map(c => <SelectItem key={c.id} value={c.id}>{c.card_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Billing Month</Label><Input required placeholder="e.g. Apr-2026" value={form.billing_month} onChange={e => set('billing_month', e.target.value)} /></div>
              <div><Label>Due Date</Label><Input required type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} /></div>
            </div>
            <div>
              <Label>Available Credit Limit (₹)</Label>
              <Input type="number" min="0" value={form.available_credit_limit} onChange={e => set('available_credit_limit', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Outstanding Balance (₹)</Label><Input required type="number" min="0" value={form.outstanding_balance} onChange={e => set('outstanding_balance', e.target.value)} /></div>
              <div><Label>Last Statement Due (₹)</Label><Input type="number" min="0" value={form.last_statement_due} onChange={e => set('last_statement_due', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Total Due (₹)</Label><Input required type="number" min="0" value={form.total_due} onChange={e => set('total_due', e.target.value)} /></div>
              <div><Label>Minimum Due (₹)</Label><Input required type="number" min="0" value={form.minimum_due} onChange={e => set('minimum_due', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Amount Paid (₹)</Label><Input type="number" min="0" value={form.amount_paid} onChange={e => set('amount_paid', e.target.value)} /></div>
              <div><Label>Payment Date</Label><Input type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Interest Charged (₹)</Label><Input type="number" min="0" value={form.interest_charged} onChange={e => set('interest_charged', e.target.value)} /></div>
              <div><Label>Late Fee (₹)</Label><Input type="number" min="0" value={form.late_fee} onChange={e => set('late_fee', e.target.value)} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional remarks" rows={2} /></div>
            <Button type="submit" disabled={saving || !form.card_id} className="w-full">{saving ? 'Saving...' : 'Add Statement'}</Button>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
