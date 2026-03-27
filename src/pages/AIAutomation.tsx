import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Shield, ListChecks, History, Bot } from 'lucide-react';
import { useAIAutomation } from '@/hooks/useAIAutomation';
import { AutoRulesPanel } from '@/components/automation/AutoRulesPanel';
import { PoliciesPanel } from '@/components/automation/PoliciesPanel';
import { ActionQueuePanel } from '@/components/automation/ActionQueuePanel';
import { ActionHistoryPanel } from '@/components/automation/ActionHistoryPanel';
import { AutoModeToggle } from '@/components/automation/AutoModeToggle';
import { Loader2 } from 'lucide-react';

const AIAutomation = () => {
  const { roles, isApproved } = useAuth();

  if (!roles.includes('admin') || !isApproved) {
    return <Navigate to="/" replace />;
  }

  const {
    rules, policies, queue, loading,
    toggleRule, approveQueueItem, rejectQueueItem,
    createRule, createPolicy, deleteRule,
  } = useAIAutomation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const pendingCount = queue.filter(q => q.status === 'pending').length;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-primary/10">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">AI Automation Center</h1>
              <p className="text-sm text-muted-foreground">Rules, policies, and action queue for autonomous AI execution</p>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <AutoModeToggle />
        </div>

        <Tabs defaultValue="rules" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="rules" className="gap-1.5 text-xs">
              <Activity className="w-3.5 h-3.5" /> Rules
            </TabsTrigger>
            <TabsTrigger value="policies" className="gap-1.5 text-xs">
              <Shield className="w-3.5 h-3.5" /> Policies
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-1.5 text-xs relative">
              <ListChecks className="w-3.5 h-3.5" /> Queue
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] rounded-full flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs">
              <History className="w-3.5 h-3.5" /> History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules">
            <AutoRulesPanel rules={rules} onToggle={toggleRule} onCreate={createRule} onDelete={deleteRule} />
          </TabsContent>

          <TabsContent value="policies">
            <PoliciesPanel policies={policies} onCreate={createPolicy} />
          </TabsContent>

          <TabsContent value="queue">
            <ActionQueuePanel queue={queue} onApprove={approveQueueItem} onReject={rejectQueueItem} />
          </TabsContent>

          <TabsContent value="history">
            <ActionHistoryPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AIAutomation;
