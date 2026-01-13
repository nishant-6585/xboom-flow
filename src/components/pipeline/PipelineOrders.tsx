import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePipelineOrders } from '@/hooks/usePipelineOrders';
import { PipelineForm } from './PipelineForm';
import { PipelineTable } from './PipelineTable';
import { PipelineAnalytics } from './PipelineAnalytics';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Plus, List, BarChart3 } from 'lucide-react';

export function PipelineOrders() {
  const { role } = useAuth();
  const { pipelineOrders, loading, createPipelineOrder, updatePipelineOrder, deletePipelineOrder } = usePipelineOrders();
  const [activeTab, setActiveTab] = useState('list');

  const canCreate = role === 'sales' || role === 'admin';
  const canViewAnalytics = role === 'admin';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="mb-4">
        <TabsTrigger value="list" className="gap-1">
          <List className="h-4 w-4" />
          Pipeline List
        </TabsTrigger>
        {canCreate && (
          <TabsTrigger value="add" className="gap-1">
            <Plus className="h-4 w-4" />
            Add Pipeline
          </TabsTrigger>
        )}
        {canViewAnalytics && (
          <TabsTrigger value="analytics" className="gap-1">
            <BarChart3 className="h-4 w-4" />
            Pipeline Analytics
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="list">
        <PipelineTable 
          orders={pipelineOrders} 
          onUpdate={updatePipelineOrder}
          onDelete={deletePipelineOrder}
        />
      </TabsContent>

      {canCreate && (
        <TabsContent value="add">
          <PipelineForm onSubmit={createPipelineOrder} />
        </TabsContent>
      )}

      {canViewAnalytics && (
        <TabsContent value="analytics">
          <PipelineAnalytics orders={pipelineOrders} />
        </TabsContent>
      )}
    </Tabs>
  );
}
