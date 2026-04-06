import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { CreditCard, CCStatement } from '@/hooks/useCreditCards';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  statement: CCStatement;
  card?: CreditCard;
  onUpdateStatement: (id: string, updates: any) => Promise<{ success: boolean; error?: string }>;
  onUpdateCard: (id: string, updates: any) => Promise<{ success: boolean; error?: string }>;
}

export function CCEditStatementDialog({ open, onClose, statement, card, onUpdateStatement, onUpdateCard }: Props) {
  const [saving, setSaving] = useState(false);

  // Card fields
  const [bankName, setBankName] = useState('');
  const [cardName, setCardName] = useState('');
  const [creditLimit, setCreditLimit] = useState('');

  // Statement fields
  const [billingMonth, setBillingMonth] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [totalDue, setTotalDue] = useState('');
  const [minimumDue, setMinimumDue] = useState('');
  const [availableCreditLimit, setAvailableCreditLimit] = useState('');
  const [interestCharged, setInterestCharged] = useState('');
  const [lateFee, setLateFee] = useState('');

  useEffect(() => {
    if (card) {
      setBankName(card.bank_name);
      setCardName(card.card_name);
      setCreditLimit(String(card.credit_limit));
    }
    setBillingMonth(statement.billing_month);
    setDueDate(statement.due_date);
    setTotalDue(String(statement.total_due));
    setMinimumDue(String(statement.minimum_due));
    setAvailableCreditLimit(String(statement.available_credit_limit));
    setInterestCharged(String(statement.interest_charged));
    setLateFee(String(statement.late_fee));
  }, [statement, card]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update card if changed
      if (card) {
        const cardUpdates: any = {};
        if (bankName !== card.bank_name) cardUpdates.bank_name = bankName.trim();
        if (cardName !== card.card_name) cardUpdates.card_name = cardName.trim();
        if (Number(creditLimit) !== card.credit_limit) cardUpdates.credit_limit = Number(creditLimit);
        if (Object.keys(cardUpdates).length > 0) {
          const res = await onUpdateCard(card.id, cardUpdates);
          if (!res.success) {
            toast.error(res.error || 'Failed to update card');
            setSaving(false);
            return;
          }
        }
      }

      // Update statement
      const stmtUpdates: any = {};
      if (billingMonth !== statement.billing_month) stmtUpdates.billing_month = billingMonth;
      if (dueDate !== statement.due_date) stmtUpdates.due_date = dueDate;
      if (Number(totalDue) !== statement.total_due) stmtUpdates.total_due = Number(totalDue);
      if (Number(minimumDue) !== statement.minimum_due) stmtUpdates.minimum_due = Number(minimumDue);
      if (Number(availableCreditLimit) !== statement.available_credit_limit) stmtUpdates.available_credit_limit = Number(availableCreditLimit);
      if (Number(interestCharged) !== statement.interest_charged) stmtUpdates.interest_charged = Number(interestCharged);
      if (Number(lateFee) !== statement.late_fee) stmtUpdates.late_fee = Number(lateFee);

      // Recalculate outstanding_balance = credit_limit - available_credit_limit
      const cl = Number(creditLimit);
      const acl = Number(availableCreditLimit);
      stmtUpdates.outstanding_balance = cl - acl;

      if (Object.keys(stmtUpdates).length > 0) {
        const res = await onUpdateStatement(statement.id, stmtUpdates);
        if (!res.success) {
          toast.error(res.error || 'Failed to update statement');
          setSaving(false);
          return;
        }
      }

      toast.success('Statement updated successfully');
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4" /> Edit Statement Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Card Info */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Card Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Bank Name</Label>
                <Input className="h-8 text-xs" value={bankName} onChange={e => setBankName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Card Name</Label>
                <Input className="h-8 text-xs" value={cardName} onChange={e => setCardName(e.target.value)} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Credit Limit (₹)</Label>
                <Input className="h-8 text-xs" type="number" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Statement Info */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Statement Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Billing Month</Label>
                <Input className="h-8 text-xs" value={billingMonth} onChange={e => setBillingMonth(e.target.value)} placeholder="e.g. Jan 2025" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due Date</Label>
                <Input className="h-8 text-xs" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Total Due (₹)</Label>
                <Input className="h-8 text-xs" type="number" value={totalDue} onChange={e => setTotalDue(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Minimum Due (₹)</Label>
                <Input className="h-8 text-xs" type="number" value={minimumDue} onChange={e => setMinimumDue(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Available Credit Limit (₹)</Label>
                <Input className="h-8 text-xs" type="number" value={availableCreditLimit} onChange={e => setAvailableCreditLimit(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Outstanding (₹)</Label>
                <Input className="h-8 text-xs bg-muted" readOnly value={Number(creditLimit) - Number(availableCreditLimit)} />
                <p className="text-[10px] text-muted-foreground">Auto: Credit Limit − Available Limit</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Interest Charged (₹)</Label>
                <Input className="h-8 text-xs" type="number" value={interestCharged} onChange={e => setInterestCharged(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Late Fee (₹)</Label>
                <Input className="h-8 text-xs" type="number" value={lateFee} onChange={e => setLateFee(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
