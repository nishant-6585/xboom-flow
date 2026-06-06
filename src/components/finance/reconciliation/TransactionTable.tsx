import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Download, ChevronLeft, ChevronRight, StickyNote, Link2, CalendarIcon, X, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { type BankTransaction, type ReconciliationAccount, type ReconciliationSubaccount, TRANSACTION_STATUSES, type TransactionStatus } from '@/hooks/useBankReconciliation';

interface Props {
  transactions: BankTransaction[];
  accounts: ReconciliationAccount[];
  subaccounts: ReconciliationSubaccount[];
  onUpdate: (id: string, updates: Partial<BankTransaction>) => void;
  onBulkUpdate: (ids: string[], status: TransactionStatus) => void;
  onOpenMatch: (tx: BankTransaction) => void;
}

const fmt = (n: number) => n ? '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-';
const PAGE_SIZE = 50;

interface OrderHit {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_company: string | null;
  total_sales_amount: number | null;
  amount_paid: number | null;
  payment_status: string | null;
}

export function TransactionTable({ transactions, accounts, subaccounts, onUpdate, onBulkUpdate, onOpenMatch }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [detailTx, setDetailTx] = useState<BankTransaction | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editRef, setEditRef] = useState('');
  const [orderHits, setOrderHits] = useState<OrderHit[]>([]);
  const [orderSearchLoading, setOrderSearchLoading] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<OrderHit | null>(null);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (typeFilter !== 'all' && t.transaction_type !== typeFilter) return false;
      if (accountFilter !== 'all' && t.account_id !== accountFilter) return false;
      if (dateFrom) {
        const txDate = new Date(t.transaction_date);
        if (txDate < dateFrom) return false;
      }
      if (dateTo) {
        const txDate = new Date(t.transaction_date);
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (txDate > endOfDay) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const match = [t.narration, t.bank_reference, t.internal_reference, t.notes]
          .filter(Boolean).some(s => s!.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [transactions, search, statusFilter, typeFilter, accountFilter, dateFrom, dateTo]);

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const toggleAll = () => {
    if (selected.size === paginated.length) setSelected(new Set());
    else setSelected(new Set(paginated.map(t => t.id)));
  };

  const exportCSV = () => {
    const headers = ['Date', 'Narration', 'Credit', 'Debit', 'Balance', 'Status', 'Account', 'Reference'];
    const rows = filtered.map(t => [
      t.transaction_date, t.narration || '', t.credit_amount, t.debit_amount, t.running_balance || '', t.status,
      accounts.find(a => a.id === t.account_id)?.name || '', t.internal_reference || ''
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bank_reconciliation_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    const s = TRANSACTION_STATUSES.find(st => st.value === status);
    return <Badge className={`${s?.color || 'bg-muted'} text-xs font-medium border-0`}>{s?.label || status}</Badge>;
  };

  const openDetail = (tx: BankTransaction) => {
    setDetailTx(tx);
    setEditNotes(tx.notes || '');
    setEditRef(tx.internal_reference || '');
    setOrderHits([]);
    setConfirmedOrder(null);
  };

  const saveDetail = () => {
    if (!detailTx) return;
    const updates: Partial<BankTransaction> = {
      notes: editNotes,
      internal_reference: editRef,
    };
    if (confirmedOrder) {
      (updates as any).matched_entity_type = 'order';
      (updates as any).matched_entity_id = confirmedOrder.id;
      (updates as any).match_confidence = 100;
      (updates as any).status = 'reconciled';
      (updates as any).matched_at = new Date().toISOString();
    }
    onUpdate(detailTx.id, updates);
    if (confirmedOrder) toast.success('Linked to order and marked as reconciled');
    setDetailTx(null);
  };

  // Live search orders by order_number when user types in Internal Reference
  useEffect(() => {
    if (!detailTx) return;
    const q = editRef.trim();
    if (!q || q.length < 3) { setOrderHits([]); return; }
    if (confirmedOrder && confirmedOrder.order_number === q) return;
    let cancelled = false;
    setOrderSearchLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_company, total_sales_amount, amount_paid, payment_status')
        .ilike('order_number', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(8);
      if (!cancelled) {
        setOrderHits((data as OrderHit[]) || []);
        setOrderSearchLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [editRef, detailTx, confirmedOrder]);

  const clearDates = () => { setDateFrom(undefined); setDateTo(undefined); };
  const hasDateFilter = dateFrom || dateTo;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search narration, reference..." className="pl-9 h-9" />
        </div>

        {/* Date From */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 text-xs", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, 'dd MMM yyyy') : 'From'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>

        {/* Date To */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 text-xs", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateTo ? format(dateTo, 'dd MMM yyyy') : 'To'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>

        {hasDateFilter && (
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={clearDates} title="Clear date filter">
            <X className="h-3.5 w-3.5" />
          </Button>
        )}

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {TRANSACTION_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="credit">Credit</SelectItem>
            <SelectItem value="debit">Debit</SelectItem>
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Account" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1" />Export</Button>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            {TRANSACTION_STATUSES.filter(s => ['reconciled', 'ignored', 'duplicate', 'unmatched'].includes(s.value)).map(s => (
              <Button key={s.value} size="sm" variant="outline" className="h-7 text-xs" onClick={() => { onBulkUpdate(Array.from(selected), s.value); setSelected(new Set()); }}>
                → {s.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto max-h-[calc(100vh-380px)]">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-8"><Checkbox checked={selected.size === paginated.length && paginated.length > 0} onCheckedChange={toggleAll} /></TableHead>
              <TableHead className="w-[90px]">Date</TableHead>
              <TableHead>Narration</TableHead>
              <TableHead className="w-[100px] text-right">Credit</TableHead>
              <TableHead className="w-[100px] text-right">Debit</TableHead>
              <TableHead className="w-[100px] text-right">Balance</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[140px]">Account</TableHead>
              <TableHead className="w-[140px]">Subaccount</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map(tx => {
              const filteredSubs = subaccounts.filter(s => s.account_id === tx.account_id);
              return (
                <TableRow key={tx.id} className={tx.status === 'duplicate' ? 'opacity-50' : ''}>
                  <TableCell>
                    <Checkbox checked={selected.has(tx.id)} onCheckedChange={c => {
                      const n = new Set(selected);
                      c ? n.add(tx.id) : n.delete(tx.id);
                      setSelected(n);
                    }} />
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{tx.transaction_date}</TableCell>
                  <TableCell className="text-xs max-w-[250px] truncate" title={tx.narration || ''}>{tx.narration || '-'}</TableCell>
                  <TableCell className="text-xs text-right text-emerald-600 font-medium">{tx.credit_amount > 0 ? fmt(tx.credit_amount) : '-'}</TableCell>
                  <TableCell className="text-xs text-right text-red-600 font-medium">{tx.debit_amount > 0 ? fmt(tx.debit_amount) : '-'}</TableCell>
                  <TableCell className="text-xs text-right">{tx.running_balance != null ? fmt(tx.running_balance) : '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Select value={tx.status} onValueChange={v => onUpdate(tx.id, { status: v as any })}>
                        <SelectTrigger className="h-7 text-xs border-0 p-0 shadow-none">{getStatusBadge(tx.status)}</SelectTrigger>
                        <SelectContent>{TRANSACTION_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                      {(tx.status === 'auto_matched' || tx.status === 'reconciled') && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 p-0 shrink-0" onClick={() => onOpenMatch(tx)} title="View matched details">
                          <Link2 className="h-3 w-3 text-primary" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={tx.account_id || 'none'} onValueChange={v => onUpdate(tx.id, { account_id: v === 'none' ? null : v, subaccount_id: null })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={tx.subaccount_id || 'none'} onValueChange={v => onUpdate(tx.id, { subaccount_id: v === 'none' ? null : v })} disabled={!tx.account_id}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {filteredSubs.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(tx)} title="Notes & Reference">
                        <StickyNote className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenMatch(tx)} title="Find Match">
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {paginated.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">No transactions found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{filtered.length} transactions</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-xs">{page + 1} / {totalPages || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!detailTx} onOpenChange={o => !o && setDetailTx(null)}>
        <SheetContent className="w-[400px]">
          <SheetHeader><SheetTitle>Transaction Details</SheetTitle></SheetHeader>
          {detailTx && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Date</span><p className="font-medium">{detailTx.transaction_date}</p></div>
                <div><span className="text-muted-foreground">Type</span><p className="font-medium capitalize">{detailTx.transaction_type}</p></div>
                <div><span className="text-muted-foreground">Credit</span><p className="font-medium text-emerald-600">{fmt(detailTx.credit_amount)}</p></div>
                <div><span className="text-muted-foreground">Debit</span><p className="font-medium text-red-600">{fmt(detailTx.debit_amount)}</p></div>
                <div className="col-span-2"><span className="text-muted-foreground">Narration</span><p className="font-medium text-xs">{detailTx.narration || '-'}</p></div>
                <div><span className="text-muted-foreground">Bank Ref</span><p className="font-medium text-xs">{detailTx.bank_reference || '-'}</p></div>
                <div><span className="text-muted-foreground">Balance</span><p className="font-medium">{detailTx.running_balance != null ? fmt(detailTx.running_balance) : '-'}</p></div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Internal Reference</label>
                <Input
                  value={editRef}
                  onChange={e => { setEditRef(e.target.value); setConfirmedOrder(null); }}
                  placeholder="Search Order # (e.g. ORD2600297)"
                  className="mt-1"
                />
                {confirmedOrder && (
                  <Card className="mt-2 border-emerald-500/40 bg-emerald-500/5">
                    <CardContent className="p-2.5 flex items-start justify-between gap-2">
                      <div className="text-xs">
                        <div className="flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          {confirmedOrder.order_number} — {confirmedOrder.customer_name || '—'}
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          {confirmedOrder.customer_company || ''}
                          {confirmedOrder.total_sales_amount != null && (
                            <> · Outstanding: {fmt((confirmedOrder.total_sales_amount || 0) - (confirmedOrder.amount_paid || 0))}</>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Will reconcile on Save</div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setConfirmedOrder(null)} title="Clear">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                )}
                {!confirmedOrder && editRef.trim().length >= 3 && (
                  <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto">
                    {orderSearchLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Searching orders…
                      </div>
                    ) : orderHits.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">No matching orders found</p>
                    ) : (
                      orderHits.map(o => {
                        const outstanding = (o.total_sales_amount || 0) - (o.amount_paid || 0);
                        return (
                          <Card key={o.id} className="hover:border-primary/50 transition-colors">
                            <CardContent className="p-2.5 flex items-start justify-between gap-2">
                              <div className="text-xs min-w-0">
                                <div className="font-medium truncate">{o.order_number} — {o.customer_name || '—'}</div>
                                <div className="text-muted-foreground truncate">
                                  {o.customer_company || ''} · Outstanding: {fmt(outstanding)} · {o.payment_status || ''}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs shrink-0"
                                onClick={() => { setConfirmedOrder(o); setEditRef(o.order_number); }}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Notes</label>
                <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Add notes..." rows={3} className="mt-1" />
              </div>
              <Button onClick={saveDetail} className="w-full">Save Changes</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
