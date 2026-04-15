import { useState, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertCircle, Percent, ExternalLink, Unlink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { type BankTransaction } from '@/hooks/useBankReconciliation';
import { toast } from 'sonner';

interface Props {
  transaction: BankTransaction | null;
  onClose: () => void;
  onConfirmMatch: (txId: string, entityType: string, entityId: string, confidence: number) => void;
}

interface ProbableMatch {
  id: string;
  type: string;
  label: string;
  amount: number;
  detail: string;
  confidence: number;
}

interface CurrentMatchInfo {
  type: string;
  id: string;
  label: string;
  amount: number;
  detail: string;
  confidence: number;
}

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

function calculateConfidence(txAmount: number, matchAmount: number, narration: string, matchLabel: string): number {
  let score = 0;
  const diff = Math.abs(txAmount - matchAmount);
  if (diff === 0) score += 50;
  else if (diff < txAmount * 0.05) score += 35;
  else if (diff < txAmount * 0.15) score += 20;
  else score += 5;

  const narLower = (narration || '').toLowerCase();
  const labelWords = matchLabel.toLowerCase().split(/\s+/);
  const wordMatches = labelWords.filter(w => w.length > 2 && narLower.includes(w)).length;
  score += Math.min(wordMatches * 15, 45);

  const gateways = ['payu', 'razorpay', 'easebuzz', 'phonepe', 'upi', 'neft', 'rtgs', 'imps'];
  if (gateways.some(g => narLower.includes(g))) score += 5;

  return Math.min(score, 100);
}

export function MatchPanel({ transaction, onClose, onConfirmMatch }: Props) {
  const [matches, setMatches] = useState<ProbableMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<CurrentMatchInfo | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);

  useEffect(() => {
    if (!transaction) return;
    findMatches();
    if (transaction.matched_entity_type && transaction.matched_entity_id) {
      fetchCurrentMatch(transaction.matched_entity_type, transaction.matched_entity_id, transaction.match_confidence || 0);
    } else {
      setCurrentMatch(null);
    }
  }, [transaction]);

  const fetchCurrentMatch = async (entityType: string, entityId: string, confidence: number) => {
    setLoadingCurrent(true);
    try {
      let label = '', amount = 0, detail = '';
      if (entityType === 'order') {
        const { data } = await supabase.from('orders').select('order_number, customer_name, customer_company, total_sales_amount, amount_paid, payment_status').eq('id', entityId).maybeSingle();
        if (data) {
          label = `${data.order_number} - ${data.customer_name}`;
          amount = (data.total_sales_amount || 0) - (data.amount_paid || 0);
          detail = `Outstanding: ${fmt(amount)} | ${data.customer_company || ''} | Status: ${data.payment_status}`;
        }
      } else if (entityType === 'procurement') {
        const { data } = await supabase.from('inventory_procurements').select('procurement_number, po_number, total_amount, supplier_name').eq('id', entityId).maybeSingle();
        if (data) {
          label = `${data.po_number || data.procurement_number} - ${data.supplier_name || 'Supplier'}`;
          amount = data.total_amount || 0;
          detail = `Procurement: ${fmt(amount)}`;
        }
      } else if (entityType === 'expense') {
        const { data } = await supabase.from('expenses').select('description, amount, expense_date').eq('id', entityId).maybeSingle() as { data: any };
        if (data) {
          label = `Expense: ${(data.description || '').substring(0, 50)}`;
          amount = data.amount || 0;
          detail = `Date: ${data.expense_date}`;
        }
      } else if (entityType === 'expected_payment') {
        const { data } = await supabase.from('expected_payments').select('*').eq('id', entityId).maybeSingle();
        if (data) {
          label = `Expected: ${(data as any).source || 'Unknown'}`;
          amount = (data as any).amount || 0;
          detail = `Due: ${(data as any).expected_date} | ${(data as any).notes || ''}`;
        }
      }
      if (label) {
        setCurrentMatch({ type: entityType, id: entityId, label, amount, detail, confidence });
      } else {
        setCurrentMatch({ type: entityType, id: entityId, label: `${entityType} (${entityId.slice(0, 8)}...)`, amount: 0, detail: 'Entity details not found', confidence });
      }
    } catch (err) {
      console.error('Error fetching current match:', err);
    } finally {
      setLoadingCurrent(false);
    }
  };

  const findMatches = async () => {
    if (!transaction) return;
    setLoading(true);
    const results: ProbableMatch[] = [];
    const amount = transaction.credit_amount || transaction.debit_amount;
    const narration = transaction.narration || '';

    try {
      if (transaction.transaction_type === 'credit') {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, order_number, customer_name, customer_company, total_sales_amount, amount_paid, payment_status')
          .in('payment_status', ['pending', 'partial'])
          .order('created_at', { ascending: false })
          .limit(200);

        (orders || []).forEach(o => {
          const outstanding = (o.total_sales_amount || 0) - (o.amount_paid || 0);
          if (outstanding <= 0) return;
          const conf = calculateConfidence(amount, outstanding, narration, `${o.customer_name} ${o.customer_company || ''} ${o.order_number}`);
          if (conf >= 15) {
            results.push({
              id: o.id, type: 'order', label: `${o.order_number} - ${o.customer_name}`,
              amount: outstanding, detail: `Outstanding: ${fmt(outstanding)} | ${o.customer_company || ''}`, confidence: conf,
            });
          }
        });

        const { data: expected } = await supabase
          .from('expected_payments')
          .select('*')
          .eq('status', 'pending')
          .limit(200);

        (expected || []).forEach((ep: any) => {
          const conf = calculateConfidence(amount, ep.amount, narration, `${ep.source || ''} ${ep.notes || ''}`);
          if (conf >= 15) {
            results.push({
              id: ep.id, type: 'expected_payment', label: `Expected: ${ep.source || 'Unknown'}`,
              amount: ep.amount, detail: `Due: ${ep.expected_date} | ${ep.notes || ''}`, confidence: conf,
            });
          }
        });
      } else {
        const { data: procs } = await supabase
          .from('inventory_procurements')
          .select('id, procurement_number, total_amount, supplier_id, suppliers(name)')
          .limit(200);

        (procs || []).forEach((p: any) => {
          const conf = calculateConfidence(amount, p.total_amount || 0, narration, `${p.suppliers?.name || ''} ${p.procurement_number}`);
          if (conf >= 15) {
            results.push({
              id: p.id, type: 'procurement', label: `${p.procurement_number} - ${p.suppliers?.name || 'Supplier'}`,
              amount: p.total_amount || 0, detail: `Procurement`, confidence: conf,
            });
          }
        });

        const { data: expenses } = await supabase
          .from('expenses')
          .select('id, description, amount, category, expense_date')
          .limit(200);

        (expenses || []).forEach((e: any) => {
          const conf = calculateConfidence(amount, e.amount || 0, narration, `${e.description || ''} ${e.category || ''}`);
          if (conf >= 15) {
            results.push({
              id: e.id, type: 'expense', label: `${e.category || 'Expense'}: ${(e.description || '').substring(0, 40)}`,
              amount: e.amount || 0, detail: `Date: ${e.expense_date}`, confidence: conf,
            });
          }
        });
      }

      results.sort((a, b) => b.confidence - a.confidence);
      setMatches(results.slice(0, 15));
    } catch (err) {
      console.error('Match error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnmatch = () => {
    if (!transaction) return;
    onConfirmMatch(transaction.id, '', '', 0);
    toast.success('Match removed — transaction set back to unmatched');
  };

  if (!transaction) return null;

  const isMatched = transaction.status === 'auto_matched' || transaction.status === 'reconciled';

  return (
    <Sheet open={!!transaction} onOpenChange={o => !o && onClose()}>
      <SheetContent className="w-[450px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {isMatched ? 'Matched Transaction Details' : transaction.transaction_type === 'credit' ? 'Probable Receipt Match' : 'Probable Expense Match'}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {/* Source Transaction */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground mb-1">Bank Transaction</div>
              <p className="text-sm font-medium">{transaction.narration || 'No narration'}</p>
              <div className="flex justify-between mt-2 text-sm">
                <span>{transaction.transaction_date}</span>
                <span className={transaction.transaction_type === 'credit' ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                  {fmt(transaction.credit_amount || transaction.debit_amount)}
                </span>
              </div>
              {transaction.bank_reference && (
                <p className="text-xs text-muted-foreground mt-1">Ref: {transaction.bank_reference}</p>
              )}
            </CardContent>
          </Card>

          {/* Current Match (for auto_matched / reconciled) */}
          {isMatched && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Current Match
              </h4>
              {loadingCurrent ? (
                <div className="text-xs text-muted-foreground py-4 text-center">Loading match details...</div>
              ) : currentMatch ? (
                <Card className="border-emerald-500/30 bg-emerald-500/5">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px] capitalize">{currentMatch.type.replace('_', ' ')}</Badge>
                          {currentMatch.confidence > 0 && (
                            <span className={`text-xs font-bold ${currentMatch.confidence >= 70 ? 'text-emerald-600' : currentMatch.confidence >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                              {currentMatch.confidence}% match
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium truncate">{currentMatch.label}</p>
                        <p className="text-xs text-muted-foreground">{currentMatch.detail}</p>
                        {currentMatch.amount > 0 && <p className="text-sm font-bold mt-1">{fmt(currentMatch.amount)}</p>}
                      </div>
                      <Button size="sm" variant="outline" className="ml-2 shrink-0 text-destructive hover:text-destructive" onClick={handleUnmatch} title="Remove this match">
                        <Unlink className="h-3.5 w-3.5 mr-1" />Unmatch
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : transaction.account_id ? (
                <Card className="border-emerald-500/30 bg-emerald-500/5">
                  <CardContent className="p-3">
                    <p className="text-sm text-muted-foreground">Matched via auto-rule to account/subaccount category.</p>
                    <p className="text-xs text-muted-foreground mt-1">You can re-match below or change the account in the table.</p>
                  </CardContent>
                </Card>
              ) : (
                <p className="text-xs text-muted-foreground">No match entity details available.</p>
              )}
              <div className="border-t pt-3 mt-3">
                <h4 className="text-sm font-semibold mb-2">Other Possible Matches</h4>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Searching for matches...</div>
          ) : matches.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No probable matches found</p>
            </div>
          ) : (
            matches.map(m => (
              <Card key={`${m.type}-${m.id}`} className={`hover:border-primary/50 transition-colors ${currentMatch?.id === m.id ? 'border-emerald-500 bg-emerald-500/5' : ''}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] capitalize">{m.type.replace('_', ' ')}</Badge>
                        <div className="flex items-center gap-1">
                          <Percent className="h-3 w-3" />
                          <span className={`text-xs font-bold ${m.confidence >= 70 ? 'text-emerald-600' : m.confidence >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                            {m.confidence}%
                          </span>
                        </div>
                        {currentMatch?.id === m.id && <Badge className="bg-emerald-100 text-emerald-800 text-[9px] border-0">Current</Badge>}
                      </div>
                      <p className="text-sm font-medium mt-1 truncate">{m.label}</p>
                      <p className="text-xs text-muted-foreground">{m.detail}</p>
                      <p className="text-sm font-bold mt-1">{fmt(m.amount)}</p>
                    </div>
                    <Button size="sm" variant="outline" className="ml-2 shrink-0" onClick={() => onConfirmMatch(transaction.id, m.type, m.id, m.confidence)} disabled={currentMatch?.id === m.id}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />{currentMatch?.id === m.id ? 'Matched' : 'Confirm'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
