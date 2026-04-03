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
import { CCAddCardDialog } from '@/components/credit-cards/CCAddCardDialog';
import { CCAddStatementDialog } from '@/components/credit-cards/CCAddStatementDialog';
import { CreditCard, BarChart3, FileText, Plus, Lock, Loader2, Download } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import * as XLSX from 'xlsx';

export default function CreditCards() {
  const { role, loading: authLoading } = useAuth();
  const { cards, statements, loading, addCard, addStatement, getCardMetrics, summaryMetrics } = useCreditCards();

  const canAccess = role === 'admin' || role === 'finance';

  const [cardOpen, setCardOpen] = useState(false);
  const [stmtOpen, setStmtOpen] = useState(false);

  const exportToExcel = () => {
    const reportData = statements.map(s => {
      const card = cards.find(c => c.id === s.card_id);
      const m = getCardMetrics(s.card_id);
      return {
        'Card Name': card?.card_name || '',
        'Bank': card?.bank_name || '',
        'Billing Month': s.billing_month,
        'Credit Limit': s.outstanding_balance + s.available_credit_limit,
        'Available Credit': s.available_credit_limit,
        'Outstanding': s.outstanding_balance,
        'Last Statement Due': s.last_statement_due,
        'Minimum Due': s.minimum_due,
        'Total Due': s.total_due,
        'Amount Paid': s.amount_paid,
        'Payment Date': s.payment_date || '',
        'Payment Status': s.payment_status,
        'Interest Charged': s.interest_charged,
        'Late Fee': s.late_fee,
        'Due Date': s.due_date,
        'Utilization %': m?.utilization || 0,
        'Risk Level': m?.riskLevel || '',
        'Notes': s.notes || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Statements');
    XLSX.writeFile(wb, `CC_Statements_${new Date().toISOString().split('T')[0]}.xlsx`);
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
            <p className="text-muted-foreground mt-1">Statement-based tracking, payments & risk insights</p>
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <CCAlerts cards={cards} getCardMetrics={getCardMetrics} />

        <div className="mt-4 space-y-6">
          <CCSummaryCards {...summary} />

          <Tabs defaultValue="dashboard" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 max-w-sm">
              <TabsTrigger value="dashboard" className="gap-2"><BarChart3 className="h-4 w-4" />Dashboard</TabsTrigger>
              <TabsTrigger value="report" className="gap-2"><FileText className="h-4 w-4" />Statements</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard">
              <CCCharts cards={cards} statements={statements} getCardMetrics={getCardMetrics} />
            </TabsContent>

            <TabsContent value="report">
              <CCCardReport cards={cards} statements={statements} getCardMetrics={getCardMetrics} />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <CCAddCardDialog open={cardOpen} onOpenChange={setCardOpen} onSubmit={addCard} />
      <CCAddStatementDialog open={stmtOpen} onOpenChange={setStmtOpen} onSubmit={addStatement} cards={cards} />
    </div>
  );
}
