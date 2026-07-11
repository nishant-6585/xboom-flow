import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { useCreditCards, CCStatement } from '@/hooks/useCreditCards';
import { CCUploadZone } from '@/components/credit-cards/CCUploadZone';
import { CCSummaryCards } from '@/components/credit-cards/CCSummaryCards';
import { CCCharts } from '@/components/credit-cards/CCCharts';
import { CCStatementTable } from '@/components/credit-cards/CCStatementTable';
import { CCUploadHistory } from '@/components/credit-cards/CCUploadHistory';
import { CCStatementDetail } from '@/components/credit-cards/CCStatementDetail';
import { CCReports } from '@/components/credit-cards/CCReports';
import { CCAvailableCredit } from '@/components/credit-cards/CCAvailableCredit';
import { CreditCard, Lock, Loader2, Sparkles, ArrowUpRight, TrendingUp, Calendar, TrendingDown, IndianRupee } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function CreditCards() {
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();
  const {
    cards, statements, transactions, payments, uploads, loading,
    uploadStatement, checkDuplicate, getSummary, refetch,
    recordPayment, getStatementFile, reanalyzeStatement, replaceStatementFile,
    deleteCardWithData, updateStatement, updateCard,
    updatePayment, deletePayment,
  } = useCreditCards();
  const [processing, setProcessing] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<CCStatement | null>(null);

  const canAccess = role === 'admin' || role === 'finance';

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

  const handleUpload = async (file: File, password?: string) => {
    setProcessing(true);
    const result = await uploadStatement(file, password);
    setProcessing(false);
    return result;
  };

  const summary = getSummary();
  const hasData = statements.length > 0;

  // Get transactions and payments for the selected statement
  const selectedTxns = selectedStatement
    ? transactions.filter(t => t.statement_id === selectedStatement.id)
    : [];
  const selectedPayments = selectedStatement
    ? payments.filter(p => p.statement_id === selectedStatement.id)
    : [];
  const selectedCard = selectedStatement
    ? cards.find(c => c.id === selectedStatement.card_id)
    : undefined;

  // Find the upload file URL for the selected statement
  const selectedUpload = selectedStatement
    ? uploads.find(u => u.statement_id === selectedStatement.id)
    : undefined;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
            <CreditCard className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Credit Card Intelligence
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Sparkles className="h-3 w-3" /> AI Powered
              </Badge>
            </h1>
            <p className="text-muted-foreground text-sm">Upload statements → AI extracts transactions & data automatically</p>
          </div>
        </div>

        {/* Finance Navigation Tabs */}
        <Tabs value="creditcards" className="w-full">
          <TabsList className="grid w-full grid-cols-5 max-w-3xl">
            <TabsTrigger value="overview" className="gap-2" onClick={() => navigate('/finance')}>
              <ArrowUpRight className="h-4 w-4" />
              Credit / Debit
            </TabsTrigger>
            <TabsTrigger value="cashflow" className="gap-2" onClick={() => navigate('/finance')}>
              <TrendingUp className="h-4 w-4" />
              Cashflow
            </TabsTrigger>
            <TabsTrigger value="aging" className="gap-2" onClick={() => navigate('/finance')}>
              <Calendar className="h-4 w-4" />
              Invoice Aging
            </TabsTrigger>
            <TabsTrigger value="risk" className="gap-2" onClick={() => navigate('/finance')}>
              <TrendingDown className="h-4 w-4" />
              Payment Risk
            </TabsTrigger>
            <TabsTrigger value="creditcards" className="gap-2">
              <IndianRupee className="h-4 w-4" />
              Credit Cards
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Upload Zone */}
        <CCUploadZone onUpload={handleUpload} processing={processing} />

        {/* Dashboard */}
        {hasData && (
          <>
            <CCSummaryCards {...summary} />
            <CCAvailableCredit cards={cards} statements={statements} payments={payments} />
            <CCCharts cards={cards} statements={statements} />
            <CCStatementTable
              cards={cards}
              statements={statements}
              payments={payments}
              onViewStatement={setSelectedStatement}
              onDeleteCard={deleteCardWithData}
              onUpdateStatement={updateStatement}
              onUpdateCard={updateCard}
            />
            <CCReports
              cards={cards}
              statements={statements}
              transactions={transactions}
              payments={payments}
            />
          </>
        )}

        {/* Empty state */}
        {!hasData && !loading && (
          <div className="text-center py-16 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No statements yet</p>
            <p className="text-sm">Upload your first credit card statement to get started</p>
          </div>
        )}

        {/* Upload History */}
        <CCUploadHistory uploads={uploads} cards={cards} />

        {/* Statement Detail Dialog */}
        {selectedStatement && (
          <CCStatementDetail
            open={!!selectedStatement}
            onClose={() => setSelectedStatement(null)}
            statement={selectedStatement}
            card={selectedCard}
            transactions={selectedTxns}
            payments={selectedPayments}
            onRecordPayment={recordPayment}
            onViewFile={getStatementFile}
            onReanalyze={reanalyzeStatement}
            onReplaceFile={replaceStatementFile}
            upload={selectedUpload}
            canManagePayments={role === 'admin'}
            onUpdatePayment={updatePayment}
            onDeletePayment={deletePayment}
          />
        )}
      </main>
    </div>
  );
}
