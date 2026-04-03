import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CreditCard } from '@/hooks/useCreditCards';

const CATEGORIES = ['Marketing', 'Tools', 'Infra', 'Misc', 'Travel', 'Subscription', 'Office Supplies'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => Promise<boolean>;
  cards: CreditCard[];
}

export function CCAddTransactionDialog({ open, onOpenChange, onSubmit, cards }: Props) {
  const [form, setForm] = useState({ card_id: '', transaction_date: new Date().toISOString().split('T')[0], amount: '', category: 'Misc', description: '', department: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await onSubmit({
      card_id: form.card_id,
      transaction_date: form.transaction_date,
      amount: Number(form.amount),
      category: form.category,
      description: form.description || null,
      department: form.department || null,
      campaign_id: null,
    });
    setSaving(false);
    if (ok) { onOpenChange(false); setForm({ card_id: '', transaction_date: new Date().toISOString().split('T')[0], amount: '', category: 'Misc', description: '', department: '' }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Card</Label>
            <Select value={form.card_id} onValueChange={v => setForm(p => ({ ...p, card_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select card" /></SelectTrigger>
              <SelectContent>{cards.map(c => <SelectItem key={c.id} value={c.id}>{c.card_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Date</Label><Input required type="date" value={form.transaction_date} onChange={e => setForm(p => ({ ...p, transaction_date: e.target.value }))} /></div>
            <div><Label>Amount (₹)</Label><Input required type="number" min="0" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Department</Label><Input value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} placeholder="Optional" /></div>
          </div>
          <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Transaction details" /></div>
          <Button type="submit" disabled={saving || !form.card_id} className="w-full">{saving ? 'Saving...' : 'Add Transaction'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
