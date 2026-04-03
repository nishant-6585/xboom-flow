import { useState } from 'react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useCreditCards } from '@/hooks/useCreditCards';
import { CCSummaryCards } from '@/components/credit-cards/CCSummaryCards';
import { CCCharts } from '@/components/credit-cards/CCCharts';
import { CCCardReport } from '@/components/credit-cards/CCCardReport';
import { CCAlerts } from '@/components/credit-cards/CCAlerts';
import { CCTransactionsTable } from '@/components/credit-cards/CCTransactionsTable';
import { CCAddCardDialog } from '@/components/credit-cards/CCAddCardDialog';
import { CCAddStatementDialog } from '@/components/credit-cards/CCAddStatementDialog';
import { CCAddTransactionDialog } from '@/components/credit-cards/CCAddTransactionDialog';
import { CCAddPaymentDialog } from '@/components/credit-cards/CCAddPaymentDialog';
import { CreditCard, BarChart3, FileText, Plus, Lock, Loader2, Receipt, Wallet, Download } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import * as XLSX from 'xlsx';

export default function CreditCards() {
  const { role, loading: authLoading } = useAuth();
  const { cards, statements, transactions, payments, loading, addCard, addStatement, addTransaction, addPayment, getCardMetrics, summaryMetrics } = useCreditCards();

  const canAccess = role === 'admin' || role === 'finance';

  const [cardOpen, setCardOpen] = useState(false);
  const [stmtOpen, setStmtOpen] = useState(false);
  const [txnOpen, setTxnOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const exportToExcel = () => {
    const reportData = cards.filter(c => c.is_active).map(c => {
      const m = getCardMetrics(c.id);
      return {
        'Card Name': c.card_name,
        'Bank': c.bank_name,
        'Credit Limit': c.credit_limit,
        'Outstanding': m?.latestStatement?.outstanding_balance || 0,
        'Utilization %': m?.utilization || 0,
        'Payment Status': m?.paymentStatus || 'N/A',
        'Risk Level': m?.riskLevel || 'N/A',
        'Interest Applicable': m?.interestApplicable ? 'Yes' : 'No',
        'Due Date': m?.latestStatement?.due_date || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Card Report');

    const txnData = transactions.map(t => ({
      'Date': t.transaction_date,
      'Card': cards.find(c => c.id === t.card_id)?.card_name || '',
      'Amount': t.amount,
      'Category': t.category,
      'Description': t.description || '',
      'Department': t.department || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txnData), 'Transactions');
    XLSX.writeFile(wb, `Credit_Card_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <Lock className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground text-center max-w-md">Credit Card Management is only accessible to Admin and Finance team members.</p>
          </div>
        </main>
      </div>
    );
  }

  const summary = summaryMetrics();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/70">
                <CreditCard className="h-6 w-6 text-primary-foreground" />
              </div>
              Credit Card Management
            </h1>
            <p className="text-muted-foreground mt-1">Track usage, payments, risks & reports</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportToExcel}>
              <Download className="h-4 w-4 mr-2" />Export
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-2" />Add New</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCardOpen(true)}><CreditCard className="h-4 w-4 mr-2" />Add Card</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStmtOpen(true)}><FileText className="h-4 w-4 mr-2" />Add Statement</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTxnOpen(true)}><Receipt className="h-4 w-4 mr-2" />Add Transaction</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPayOpen(true)}><Wallet className="h-4 w-4 mr-2" />Record Payment</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <CCAlerts cards={cards} getCardMetrics={getCardMetrics} />

        <div className="mt-4 space-y-6">
          <CCSummaryCards {...summary} />

          <Tabs defaultValue="dashboard" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 max-w-md">
              <TabsTrigger value="dashboard" className="gap-2"><BarChart3 className="h-4 w-4" />Dashboard</TabsTrigger>
              <TabsTrigger value="report" className="gap-2"><FileText className="h-4 w-4" />Reports</TabsTrigger>
              <TabsTrigger value="transactions" className="gap-2"><Receipt className="h-4 w-4" />Transactions</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard">
              <CCCharts cards={cards} statements={statements} transactions={transactions} payments={payments} getCardMetrics={getCardMetrics} />
            </TabsContent>

            <TabsContent value="report">
              <CCCardReport cards={cards} getCardMetrics={getCardMetrics} />
            </TabsContent>

            <TabsContent value="transactions">
              <CCTransactionsTable transactions={transactions} cards={cards} />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <CCAddCardDialog open={cardOpen} onOpenChange={setCardOpen} onSubmit={addCard} />
      <CCAddStatementDialog open={stmtOpen} onOpenChange={setStmtOpen} onSubmit={addStatement} cards={cards} />
      <CCAddTransactionDialog open={txnOpen} onOpenChange={setTxnOpen} onSubmit={addTransaction} cards={cards} />
      <CCAddPaymentDialog open={payOpen} onOpenChange={setPayOpen} onSubmit={addPayment} cards={cards} />
    </div>
  );
}
