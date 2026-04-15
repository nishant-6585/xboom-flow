import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, AlertTriangle, Clock, CalendarCheck, Repeat, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { useRecurringExpenses, RECURRING_STATUSES, type RecurringStatus } from '@/hooks/useRecurringExpenses';
import { useBankReconciliation, type ReconciliationAccount, type ReconciliationSubaccount } from '@/hooks/useBankReconciliation';
import { RecurringExpenseForm } from './RecurringExpenseForm';
import { type RecurringExpense } from '@/hooks/useRecurringExpenses';

const fmt = (n: number | null | undefined) => n != null ? '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '-';

export function RecurringExpensesPanel() {
  const { expenses, loading, createExpense, updateExpense, deleteExpense, alerts } = useRecurringExpenses();
  const { accounts, subaccounts } = useBankReconciliation();
  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState<RecurringExpense | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [freqFilter, setFreqFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return expenses.filter(e => {
      if (statusFilter !== 'all' && e.computed_status !== statusFilter) return false;
      if (freqFilter !== 'all' && e.frequency !== freqFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return [e.expense_name, e.vendor_name, e.notes].filter(Boolean).some(s => s!.toLowerCase().includes(q));
      }
      return true;
    });
  }, [expenses, search, statusFilter, freqFilter]);

  const getStatusBadge = (status: RecurringStatus) => {
    const s = RECURRING_STATUSES.find(st => st.value === status);
    return <Badge className={`${s?.color || 'bg-muted'} text-xs border-0`}>{s?.label || status}</Badge>;
  };

  const totalMonthly = useMemo(() => {
    return expenses.filter(e => e.is_active).reduce((sum, e) => {
      switch (e.frequency) {
        case 'weekly': return sum + e.default_amount * 4.33;
        case 'monthly': return sum + e.default_amount;
        case 'quarterly': return sum + e.default_amount / 3;
        case 'yearly': return sum + e.default_amount / 12;
        default: return sum + e.default_amount;
      }
    }, 0);
  }, [expenses]);

  const handleEdit = (e: any) => { setEditData(e); setFormOpen(true); };
  const handleCreate = () => { setEditData(null); setFormOpen(true); };

  return (
    <div className="space-y-4">
      {/* Alert Cards */}
      {(alerts.overdue.length > 0 || alerts.due.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {alerts.overdue.length > 0 && (
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="p-3 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800">{alerts.overdue.length} Overdue</p>
                  <p className="text-xs text-red-600">{alerts.overdue.map(e => e.expense_name).join(', ')}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {alerts.due.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="p-3 flex items-center gap-3">
                <Clock className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">{alerts.due.length} Due Now</p>
                  <p className="text-xs text-amber-600">{alerts.due.map(e => e.expense_name).join(', ')}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {alerts.variance.length > 0 && (
            <Card className="border-orange-200 bg-orange-50/50">
              <CardContent className="p-3 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-orange-800">{alerts.variance.length} Amount Variance</p>
                  <p className="text-xs text-orange-600">Paid amounts differ from expected by &gt;10%</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Active Expenses</p>
          <p className="text-xl font-bold">{expenses.filter(e => e.is_active).length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Est. Monthly Outflow</p>
          <p className="text-xl font-bold">{fmt(totalMonthly)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Overdue</p>
          <p className="text-xl font-bold text-red-600">{alerts.overdue.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Due This Week</p>
          <p className="text-xl font-bold text-amber-600">{alerts.due.length}</p>
        </CardContent></Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search expenses..." className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {RECURRING_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={freqFilter} onValueChange={setFreqFilter}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Frequency" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleCreate} size="sm"><Plus className="h-4 w-4 mr-1" />Add Expense</Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Expense</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead>Next Due</TableHead>
              <TableHead>Last Paid</TableHead>
              <TableHead className="text-right">Last Amount</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(e => (
              <TableRow key={e.id} className={!e.is_active ? 'opacity-50' : ''}>
                <TableCell className="font-medium text-sm">{e.expense_name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.vendor_name || '-'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] capitalize gap-1"><Repeat className="h-3 w-3" />{e.frequency}</Badge>
                </TableCell>
                <TableCell className="text-right text-sm font-medium">{fmt(e.default_amount)}</TableCell>
                <TableCell className="text-xs">{e.next_due_date || '-'}</TableCell>
                <TableCell className="text-xs">{e.last_paid_date || '-'}</TableCell>
                <TableCell className="text-right text-xs">{fmt(e.last_paid_amount)}</TableCell>
                <TableCell className="text-right text-xs">
                  {e.variance != null ? (
                    <span className={e.variance > 0 ? 'text-red-600' : e.variance < 0 ? 'text-emerald-600' : ''}>
                      {e.variance > 0 ? '+' : ''}{fmt(e.variance)}
                    </span>
                  ) : '-'}
                </TableCell>
                <TableCell>{getStatusBadge(e.computed_status)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(e)} title="Edit">
                      <CalendarCheck className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateExpense(e.id, { is_active: !e.is_active })} title={e.is_active ? 'Deactivate' : 'Activate'}>
                      {e.is_active ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteExpense(e.id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                {loading ? 'Loading...' : 'No recurring expenses found'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <RecurringExpenseForm
        open={formOpen}
        onOpenChange={o => { setFormOpen(o); if (!o) setEditData(null); }}
        onSave={editData ? (data) => { updateExpense(editData.id, data); return Promise.resolve(true); } : createExpense}
        accounts={accounts}
        subaccounts={subaccounts}
        editData={editData}
      />
    </div>
  );
}
