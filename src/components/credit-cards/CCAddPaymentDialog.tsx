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

export function CCAddPaymentDialog({ open, onOpenChange, onSubmit, cards }: Props) {
  const [form, setForm] = useState({ card_id: '', billing_month: '', amount_paid: '', payment_date: new Date().toISOString().split('T')[0], payment_type: 'FULL', notes: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await onSubmit({
      card_id: form.card_id,
      billing_month: form.billing_month,
      amount_paid: Number(form.amount_paid),
      payment_date: form.payment_date,
      payment_type: form.payment_type,
      notes: form.notes || null,
    });
    setSaving(false);
    if (ok) { onOpenChange(false); setForm({ card_id: '', billing_month: '', amount_paid: '', payment_date: new Date().toISOString().split('T')[0], payment_type: 'FULL', notes: '' }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
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
            <div><Label>Payment Date</Label><Input required type="date" value={form.payment_date} onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Amount Paid (₹)</Label><Input required type="number" min="0" value={form.amount_paid} onChange={e => setForm(p => ({ ...p, amount_paid: e.target.value }))} /></div>
            <div>
              <Label>Payment Type</Label>
              <Select value={form.payment_type} onValueChange={v => setForm(p => ({ ...p, payment_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL">Full Payment</SelectItem>
                  <SelectItem value="MINIMUM">Minimum Due</SelectItem>
                  <SelectItem value="PARTIAL">Partial Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" /></div>
          <Button type="submit" disabled={saving || !form.card_id} className="w-full">{saving ? 'Saving...' : 'Record Payment'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
