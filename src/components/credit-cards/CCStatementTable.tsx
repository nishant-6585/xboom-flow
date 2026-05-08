import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CreditCard, CCStatement, CCPayment } from '@/hooks/useCreditCards';
import { CCEditStatementDialog } from './CCEditStatementDialog';
import { getStatementOutstanding, getStatementCreditLimit } from '@/lib/creditCardMetrics';
import { FileText, Search, Eye, Trash2, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  cards: CreditCard[];
  statements: CCStatement[];
  payments: CCPayment[];
  onViewStatement?: (statement: CCStatement) => void;
  onDeleteCard?: (cardId: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateStatement?: (id: string, updates: any) => Promise<{ success: boolean; error?: string }>;
  onUpdateCard?: (id: string, updates: any) => Promise<{ success: boolean; error?: string }>;
}

export function CCStatementTable({ cards, statements, payments, onViewStatement, onDeleteCard, onUpdateStatement, onUpdateCard }: Props) {
  const [bankFilter, setBankFilter] = useState('all');
  const [cardFilter, setCardFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editStatement, setEditStatement] = useState<CCStatement | null>(null);

  const banks = [...new Set(cards.map(c => c.bank_name))];

  const filtered = statements.filter(s => {
    const card = cards.find(c => c.id === s.card_id);
    if (!card) return false;
    if (bankFilter !== 'all' && card.bank_name !== bankFilter) return false;
    if (cardFilter !== 'all' && s.card_id !== cardFilter) return false;
    if (statusFilter !== 'all' && s.payment_status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return card.card_name.toLowerCase().includes(q) || card.bank_name.toLowerCase().includes(q) || s.billing_month.includes(q);
    }
    return true;
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'FULL': return <Badge className="bg-green-500/10 text-green-600 border-green-500/30 text-[10px]">Paid</Badge>;
      case 'PARTIAL': return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 text-[10px]">Partial</Badge>;
      default: return <Badge className="bg-red-500/10 text-red-600 border-red-500/30 text-[10px]">Unpaid</Badge>;
    }
  };

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  const handleDeleteCard = async () => {
    if (!deleteCardId || !onDeleteCard) return;
    setDeleting(true);
    const result = await onDeleteCard(deleteCardId);
    setDeleting(false);
    setDeleteCardId(null);
    if (result.success) {
      toast.success('Card and all associated data deleted');
    } else {
      toast.error(result.error || 'Failed to delete');
    }
  };

  const deleteCardObj = deleteCardId ? cards.find(c => c.id === deleteCardId) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" /> Statement History
          </CardTitle>
          {onDeleteCard && cards.length > 0 && (
            <Select onValueChange={(v) => setDeleteCardId(v)}>
              <SelectTrigger className="w-auto h-8 text-xs gap-1 text-destructive border-destructive/30">
                <Trash2 className="h-3 w-3" />
                <span>Delete Card</span>
              </SelectTrigger>
              <SelectContent>
                {cards.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.bank_name} — {c.card_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[150px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search…" className="pl-8 h-9 text-xs" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={bankFilter} onValueChange={setBankFilter}>
            <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="Bank" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Banks</SelectItem>
              {banks.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cardFilter} onValueChange={setCardFilter}>
            <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue placeholder="Card" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cards</SelectItem>
              {cards.map(c => <SelectItem key={c.id} value={c.id}>{c.card_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="FULL">Paid</SelectItem>
              <SelectItem value="PARTIAL">Partial</SelectItem>
              <SelectItem value="UNPAID">Unpaid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Bank</TableHead>
                <TableHead className="text-xs">Card</TableHead>
                <TableHead className="text-xs">Month</TableHead>
                <TableHead className="text-xs text-right">Total Due</TableHead>
                <TableHead className="text-xs text-right">Min. Due</TableHead>
                <TableHead className="text-xs text-right">Credit Limit</TableHead>
                <TableHead className="text-xs text-right">Outstanding</TableHead>
                <TableHead className="text-xs text-right">Amount Paid</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Due Date</TableHead>
                <TableHead className="text-xs text-right">Interest</TableHead>
                <TableHead className="text-xs text-center">Details</TableHead>
                <TableHead className="text-xs text-center">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                   <TableCell colSpan={13} className="text-center text-xs text-muted-foreground py-8">
                    No statements found. Upload a statement to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(s => {
                  const card = cards.find(c => c.id === s.card_id);
                  const outstanding = getStatementOutstanding(s, card);
                  const creditLimit = getStatementCreditLimit(s, card);
                  const amountPaid = payments
                    .filter(p => p.statement_id === s.id)
                    .reduce((sum, p) => sum + (p.amount || 0), 0);
                  return (
                    <TableRow key={s.id} className="cursor-pointer hover:bg-muted/60" onClick={() => onViewStatement?.(s)}>
                      <TableCell className="text-xs font-medium">{card?.bank_name}</TableCell>
                      <TableCell className="text-xs">{card?.card_name}</TableCell>
                      <TableCell className="text-xs">{s.billing_month}</TableCell>
                      <TableCell className="text-xs text-right">{fmt(s.total_due)}</TableCell>
                      <TableCell className="text-xs text-right">{s.minimum_due > 0 ? fmt(s.minimum_due) : '—'}</TableCell>
                      <TableCell className="text-xs text-right">{creditLimit > 0 ? fmt(creditLimit) : '—'}</TableCell>
                      <TableCell className="text-xs text-right">{fmt(outstanding)}</TableCell>
                      <TableCell className="text-xs text-right">{amountPaid > 0 ? fmt(amountPaid) : '—'}</TableCell>
                      <TableCell>{statusBadge(s.payment_status)}</TableCell>
                      <TableCell className="text-xs">{new Date(s.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</TableCell>
                      <TableCell className="text-xs text-right">{s.interest_charged > 0 ? fmt(s.interest_charged) : '—'}</TableCell>
                      <TableCell className="text-center">
                        <Eye className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditStatement(s);
                          }}
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
              </TableBody>
            </Table>
          </div>

        <AlertDialog open={!!deleteCardId} onOpenChange={(open) => !open && setDeleteCardId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Card & All Data?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <strong>{deleteCardObj?.bank_name} — {deleteCardObj?.card_name}</strong> along with all statements, transactions, payments, and uploaded files. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCard} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Delete Everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {editStatement && onUpdateStatement && onUpdateCard && (
          <CCEditStatementDialog
            open={!!editStatement}
            onClose={() => setEditStatement(null)}
            statement={editStatement}
            card={cards.find(c => c.id === editStatement.card_id)}
            onUpdateStatement={onUpdateStatement}
            onUpdateCard={onUpdateCard}
          />
        )}
      </CardContent>
    </Card>
  );
}
