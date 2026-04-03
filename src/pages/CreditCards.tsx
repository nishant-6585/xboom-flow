import { useState } from 'react';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { useCreditCards } from '@/hooks/useCreditCards';
import { CCUploadZone } from '@/components/credit-cards/CCUploadZone';
import { CCSummaryCards } from '@/components/credit-cards/CCSummaryCards';
import { CCCharts } from '@/components/credit-cards/CCCharts';
import { CCStatementTable } from '@/components/credit-cards/CCStatementTable';
import { CCUploadHistory } from '@/components/credit-cards/CCUploadHistory';
import { CreditCard, Lock, Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function CreditCards() {
  const { role, loading: authLoading } = useAuth();
  const { cards, statements, uploads, loading, uploadStatement, getSummary, refetch } = useCreditCards();
  const [processing, setProcessing] = useState(false);

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

  const handleUpload = async (file: File) => {
    setProcessing(true);
    const result = await uploadStatement(file);
    setProcessing(false);
    return result;
  };

  const summary = getSummary();
  const hasData = statements.length > 0;

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
            <p className="text-muted-foreground text-sm">Upload statements → AI does the rest</p>
          </div>
        </div>

        {/* Upload Zone */}
        <CCUploadZone onUpload={handleUpload} processing={processing} />

        {/* Dashboard — only shown when data exists */}
        {hasData && (
          <>
            <CCSummaryCards {...summary} />
            <CCCharts cards={cards} statements={statements} />
            <CCStatementTable cards={cards} statements={statements} />
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
      </main>
    </div>
  );
}
