import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, Sparkles, Save, X } from 'lucide-react';
import { CreditCard } from '@/hooks/useCreditCards';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parsedData: any;
  cards: CreditCard[];
  selectedCardId: string;
  autoDetect: boolean;
  onSave: (data: any) => void;
  onCancel: () => void;
}

export function CCStatementPreview({ open, onOpenChange, parsedData, cards, selectedCardId, autoDetect, onSave, onCancel }: Props) {
  const [formData, setFormData] = useState<any>({});
  const [cardId, setCardId] = useState(selectedCardId);

  useEffect(() => {
    if (parsedData) {
      setFormData({ ...parsedData });
      // Try to auto-match card
      if (autoDetect && parsedData.detected_bank) {
        const match = cards.find(c =>
          c.bank_name.toLowerCase().includes(parsedData.detected_bank.toLowerCase()) ||
          c.card_name.toLowerCase().includes((parsedData.detected_card || '').toLowerCase())
        );
        if (match) setCardId(match.id);
      } else {
        setCardId(selectedCardId);
      }
    }
  }, [parsedData, autoDetect, selectedCardId, cards]);

  const confidence = formData.confidence_score || 0;
  const missingFields = formData.missing_fields || [];
  const warnings: string[] = [];

  if (formData.total_due === 0) warnings.push('Total due is ₹0');
  if (formData.outstanding_balance > 0 && formData.outstanding_balance < (formData.total_due || 0))
    warnings.push('Outstanding is less than total due');
  if (!formData.due_date) warnings.push('Due date is missing');

  const updateField = (key: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave({ ...formData, _selectedCardId: cardId });
  };

  const getConfidenceBadge = () => {
    if (confidence >= 85) return <Badge className="bg-green-500/10 text-green-600 border-green-500/30">High Confidence: {confidence}%</Badge>;
    if (confidence >= 60) return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Medium Confidence: {confidence}%</Badge>;
    return <Badge className="bg-red-500/10 text-red-600 border-red-500/30">Low Confidence: {confidence}%</Badge>;
  };

  const fields = [
    { key: 'billing_month', label: 'Billing Month', type: 'text', placeholder: 'YYYY-MM' },
    { key: 'due_date', label: 'Due Date', type: 'date', placeholder: '' },
    { key: 'outstanding_balance', label: 'Outstanding Balance (₹)', type: 'number' },
    { key: 'total_due', label: 'Total Due (₹)', type: 'number' },
    { key: 'minimum_due', label: 'Minimum Due (₹)', type: 'number' },
    { key: 'amount_paid', label: 'Amount Paid (₹)', type: 'number' },
    { key: 'payment_date', label: 'Payment Date', type: 'date' },
    { key: 'interest_charged', label: 'Interest Charged (₹)', type: 'number' },
    { key: 'late_fee', label: 'Late Fee (₹)', type: 'number' },
    { key: 'credit_limit', label: 'Credit Limit (₹)', type: 'number' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Extracted Statement
            {getConfidenceBadge()}
          </DialogTitle>
        </DialogHeader>

        {/* Warnings */}
        {(warnings.length > 0 || missingFields.length > 0) && (
          <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 space-y-1">
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0" /> {w}
              </p>
            ))}
            {missingFields.length > 0 && (
              <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0" /> Missing fields: {missingFields.join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Detected Info */}
        {(formData.detected_bank || formData.detected_card) && (
          <div className="flex gap-2 flex-wrap">
            {formData.detected_bank && <Badge variant="outline">🏦 {formData.detected_bank}</Badge>}
            {formData.detected_card && <Badge variant="outline">💳 {formData.detected_card}</Badge>}
          </div>
        )}

        {/* Card Selection */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Assign to Card</Label>
          <Select value={cardId} onValueChange={setCardId}>
            <SelectTrigger>
              <SelectValue placeholder="Select credit card" />
            </SelectTrigger>
            <SelectContent>
              {cards.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.card_name} ({c.bank_name})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Editable Fields */}
        <div className="grid grid-cols-2 gap-3">
          {fields.map(f => {
            const isLowConf = missingFields.includes(f.key);
            return (
              <div key={f.key} className="space-y-1">
                <Label className={`text-xs ${isLowConf ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                  {f.label} {isLowConf && '⚠️'}
                </Label>
                <Input
                  type={f.type}
                  value={formData[f.key] ?? ''}
                  placeholder={f.placeholder}
                  className={isLowConf ? 'border-yellow-400' : ''}
                  onChange={(e) => updateField(f.key, f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                />
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} className="gap-1.5">
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button onClick={handleSave} disabled={!cardId} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> Confirm & Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
