import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { type RecurringExpense } from '@/hooks/useRecurringExpenses';
import { type ReconciliationAccount, type ReconciliationSubaccount } from '@/hooks/useBankReconciliation';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (data: Partial<RecurringExpense>) => Promise<boolean>;
  accounts: ReconciliationAccount[];
  subaccounts: ReconciliationSubaccount[];
  editData?: RecurringExpense | null;
}

export function RecurringExpenseForm({ open, onOpenChange, onSave, accounts, subaccounts, editData }: Props) {
  const { user, profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    expense_name: editData?.expense_name || '',
    vendor_name: editData?.vendor_name || '',
    account_id: editData?.account_id || '',
    subaccount_id: editData?.subaccount_id || '',
    default_amount: editData?.default_amount?.toString() || '',
    frequency: editData?.frequency || 'monthly',
    start_date: editData?.start_date || new Date().toISOString().slice(0, 10),
    end_date: editData?.end_date || '',
    due_day: editData?.due_day?.toString() || '',
    notes: editData?.notes || '',
  });

  const filteredSubs = subaccounts.filter(s => s.account_id === form.account_id);

  const handleSave = async () => {
    if (!form.expense_name || !form.default_amount) return;
    setSaving(true);
    const ok = await onSave({
      expense_name: form.expense_name,
      vendor_name: form.vendor_name || null,
      account_id: form.account_id || null,
      subaccount_id: form.subaccount_id || null,
      default_amount: parseFloat(form.default_amount) || 0,
      frequency: form.frequency as any,
      start_date: form.start_date,
      end_date: form.end_date || null,
      due_day: form.due_day ? parseInt(form.due_day) : null,
      notes: form.notes || null,
      is_active: true,
      created_by: user?.id || '',
      created_by_name: profile?.full_name || '',
    });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  const update = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{editData ? 'Edit' : 'Add'} Recurring Expense</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Expense Name *</Label>
            <Input value={form.expense_name} onChange={e => update('expense_name', e.target.value)} placeholder="e.g. Office Rent" className="mt-1" />
          </div>
          <div>
            <Label>Vendor / Payee</Label>
            <Input value={form.vendor_name} onChange={e => update('vendor_name', e.target.value)} placeholder="e.g. ABC Properties" className="mt-1" />
          </div>
          <div>
            <Label>Amount (₹) *</Label>
            <Input type="number" value={form.default_amount} onChange={e => update('default_amount', e.target.value)} placeholder="50000" className="mt-1" />
          </div>
          <div>
            <Label>Account</Label>
            <Select value={form.account_id} onValueChange={v => { update('account_id', v); update('subaccount_id', ''); }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Subaccount</Label>
            <Select value={form.subaccount_id} onValueChange={v => update('subaccount_id', v)} disabled={!form.account_id}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{filteredSubs.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Frequency</Label>
            <Select value={form.frequency} onValueChange={v => update('frequency', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Due Day (1-31)</Label>
            <Input type="number" min={1} max={31} value={form.due_day} onChange={e => update('due_day', e.target.value)} placeholder="1" className="mt-1" />
          </div>
          <div>
            <Label>Start Date</Label>
            <Input type="date" value={form.start_date} onChange={e => update('start_date', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>End Date (optional)</Label>
            <Input type="date" value={form.end_date} onChange={e => update('end_date', e.target.value)} className="mt-1" />
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={2} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.expense_name || !form.default_amount}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {editData ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
