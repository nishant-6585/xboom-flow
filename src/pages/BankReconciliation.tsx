import { useState } from 'react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useBankReconciliation, type BankTransaction, type TransactionStatus } from '@/hooks/useBankReconciliation';
import { ReconciliationKPIs } from '@/components/finance/reconciliation/ReconciliationKPIs';
import { TransactionTable } from '@/components/finance/reconciliation/TransactionTable';
import { UploadBankStatement } from '@/components/finance/reconciliation/UploadBankStatement';
import { MatchPanel } from '@/components/finance/reconciliation/MatchPanel';
import { DailyClosingSummary } from '@/components/finance/reconciliation/DailyClosingSummary';
import { Upload, Landmark, BarChart3, Lock, Loader2, FileStack } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function BankReconciliation() {
  const { user, role, loading: authLoading } = useAuth();
  const { transactions, accounts, subaccounts, rules, uploads, loading, kpis, fetchAll, updateTransaction, bulkUpdateStatus } = useBankReconciliation();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [matchTx, setMatchTx] = useState<BankTransaction | null>(null);

  const canAccess = role === 'admin' || role === 'finance';

  const handleConfirmMatch = async (txId: string, entityType: string, entityId: string, confidence: number) => {
    await updateTransaction(txId, {
      matched_entity_type: entityType,
      matched_entity_id: entityId,
      match_confidence: confidence,
      status: 'reconciled' as TransactionStatus,
      matched_at: new Date().toISOString(),
    } as any);
    setMatchTx(null);
    toast.success('Match confirmed and transaction reconciled');
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <Lock className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground text-center max-w-md">Bank Reconciliation is only accessible to Admin and Finance team members.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/70">
                <Landmark className="h-5 w-5 text-primary-foreground" />
              </div>
              Bank Reconciliation
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Upload statements, match transactions, and reconcile accounts</p>
          </div>
          <div className="flex items-center gap-2">
            {uploads.length > 0 && (
              <Badge variant="secondary" className="gap-1">
                <FileStack className="h-3 w-3" />
                {uploads.length} uploads • {kpis.total} transactions
              </Badge>
            )}
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Statement
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <ReconciliationKPIs kpis={kpis} />

        {/* Main Content */}
        <Tabs defaultValue="workbench" className="mt-6 space-y-4">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="workbench" className="gap-2">
              <Landmark className="h-4 w-4" />
              Workbench
            </TabsTrigger>
            <TabsTrigger value="summary" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Summary
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workbench">
            <TransactionTable
              transactions={transactions}
              accounts={accounts}
              subaccounts={subaccounts}
              onUpdate={updateTransaction}
              onBulkUpdate={bulkUpdateStatus}
              onOpenMatch={setMatchTx}
            />
          </TabsContent>

          <TabsContent value="summary">
            <DailyClosingSummary transactions={transactions} accounts={accounts} />
          </TabsContent>
        </Tabs>
      </main>

      <UploadBankStatement
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploadComplete={fetchAll}
        rules={rules}
      />

      <MatchPanel
        transaction={matchTx}
        onClose={() => setMatchTx(null)}
        onConfirmMatch={handleConfirmMatch}
      />
    </div>
  );
}
