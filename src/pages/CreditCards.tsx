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
import { CCInsights } from '@/components/credit-cards/CCInsights';
import { CCQuickActions } from '@/components/credit-cards/CCQuickActions';
import { CCAddCardDialog } from '@/components/credit-cards/CCAddCardDialog';
import { CCAddStatementDialog } from '@/components/credit-cards/CCAddStatementDialog';
import { CCStatementUpload } from '@/components/credit-cards/CCStatementUpload';
import { CreditCard, BarChart3, FileText, Lock, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function CreditCards() {
  const { role, loading: authLoading } = useAuth();
  const { cards, statements, loading, addCard, addStatement, updateStatement, getCardMetrics, summaryMetrics, refetch } = useCreditCards();

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
        'Minimum Due': s.minimum_due,
        'Total Due': s.total_due,
        'Amount Paid': s.amount_paid,
        'Payment Status': s.payment_status,
        'Interest Charged': s.interest_charged,
        'Late Fee': s.late_fee,
        'Due Date': s.due_date,
        'Utilization %': m?.utilization || 0,
        'Risk Level': m?.riskLevel || '',
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

  const overdueCount = cards.filter(c => {
    const m = getCardMetrics(c.id);
    return m?.daysUntilDue !== null && m.daysUntilDue < 0 && m.paymentStatus !== 'FULL';
  }).length;

  const handleMarkPaid = async (statement: any) => {
    await updateStatement(statement.id, {
      amount_paid: statement.total_due,
      payment_date: new Date().toISOString().split('T')[0],
      payment_status: 'FULL',
      total_due: statement.total_due,
      minimum_due: statement.minimum_due,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 space-y-5">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
                <CreditCard className="h-5 w-5 text-primary-foreground" />
              </div>
              Credit Card Control Tower
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Monitor, manage & optimize your credit card portfolio</p>
          </div>
        </div>

        {/* Summary Cards */}
        <CCSummaryCards {...summary} />

        {/* Alerts + Insights + Quick Actions Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6">
            <CCAlerts cards={cards} getCardMetrics={getCardMetrics} onAddStatement={() => setStmtOpen(true)} />
          </div>
          <div className="lg:col-span-4">
            <CCInsights cards={cards} getCardMetrics={getCardMetrics} summaryMetrics={summary} />
          </div>
          <div className="lg:col-span-2">
            <CCQuickActions
              onAddStatement={() => setStmtOpen(true)}
              onAddCard={() => setCardOpen(true)}
              onExport={exportToExcel}
              overdueCount={overdueCount}
            />
          </div>
        </div>

        {/* Charts + Statements Tabs */}
        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 max-w-xs">
            <TabsTrigger value="dashboard" className="gap-2 text-xs"><BarChart3 className="h-3.5 w-3.5" />Dashboard</TabsTrigger>
            <TabsTrigger value="report" className="gap-2 text-xs"><FileText className="h-3.5 w-3.5" />Statements</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <CCCharts cards={cards} statements={statements} getCardMetrics={getCardMetrics} />
          </TabsContent>

          <TabsContent value="report">
            <CCCardReport
              cards={cards}
              statements={statements}
              getCardMetrics={getCardMetrics}
              onMarkPaid={handleMarkPaid}
            />
          </TabsContent>
        </Tabs>
      </main>

      <CCAddCardDialog open={cardOpen} onOpenChange={setCardOpen} onSubmit={addCard} />
      <CCAddStatementDialog open={stmtOpen} onOpenChange={setStmtOpen} onSubmit={addStatement} cards={cards} />
    </div>
  );
}
