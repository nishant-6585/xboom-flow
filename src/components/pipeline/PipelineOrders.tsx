import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePipelineOrders, PipelineStatus } from '@/hooks/usePipelineOrders';
import { PipelineForm } from './PipelineForm';
import { PipelineTable } from './PipelineTable';
import { PipelineAnalytics } from './PipelineAnalytics';
import { PipelineStatusDashboard } from './PipelineStatusDashboard';
import { PipelineCalendarView } from './PipelineCalendarView';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Plus, List, BarChart3, ArrowLeft, CalendarDays, CalendarCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SourceCoverageCard } from '@/components/crm/SourceCoverageCard';
import { BarChart3 as PipelineIcon } from 'lucide-react';
import { PipelineFollowupTracker } from './PipelineFollowupTracker';

interface PipelineOrdersProps {
  enquiryIdFilter?: string | null;
  selectedLeadId?: string | null;
  statusPreFilter?: PipelineStatus;
  megaDealsOnly?: boolean;
}

export function PipelineOrders({ enquiryIdFilter, selectedLeadId, statusPreFilter, megaDealsOnly }: PipelineOrdersProps) {
  const { role } = useAuth();
  const { pipelineOrders, loading, createPipelineOrder, updatePipelineOrder, deletePipelineOrder } = usePipelineOrders();
  const [activeTab, setActiveTab] = useState('list');
  const [statusFilter, setStatusFilter] = useState<PipelineStatus | 'all'>(statusPreFilter || 'all');

  const canCreate = role === 'sales' || role === 'sales_manager' || role === 'supply_chain' || role === 'admin';
  const canViewAnalytics = role === 'sales' || role === 'sales_manager' || role === 'supply_chain' || role === 'admin';

  // Filter by enquiry_id and mega deals
  let filteredByEnquiry = enquiryIdFilter 
    ? pipelineOrders.filter(o => o.enquiry_id === enquiryIdFilter)
    : pipelineOrders;

  if (megaDealsOnly) {
    filteredByEnquiry = filteredByEnquiry.filter(o => o.is_mega_deal === true);
  }

  const handleAnalyticsCardClick = (filter: { type: string; value: string }) => {
    setActiveTab('list');
    if (filter.type === 'status') {
      // Filter by specific status
      if (filter.value === 'pending') {
        // Show all non-closed statuses
        setStatusFilter('all');
      } else if (filter.value === 'won') {
        setStatusFilter('won');
      } else if (filter.value === 'lost') {
        setStatusFilter('lost');
      } else {
        setStatusFilter(filter.value as PipelineStatus);
      }
    } else {
      setStatusFilter('all');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {enquiryIdFilter && (
        <Link 
          to="/" 
          className="text-sm text-primary hover:underline flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Enquiries
        </Link>
      )}
      <div className="mb-4">
        <SourceCoverageCard
          title="Pipeline Entries by Source"
          dataset="pipeline"
          Icon={PipelineIcon}
        />
      </div>
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
          <TabsTrigger value="calendar" className="gap-1">
            <CalendarDays className="h-4 w-4" />
            Calendar View
          </TabsTrigger>
          <TabsTrigger value="followups" className="gap-1">
            <CalendarCheck className="h-4 w-4" />
            Follow-up Tracker
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          {statusPreFilter && (statusPreFilter === 'won' || statusPreFilter === 'lost') && (
            <PipelineStatusDashboard orders={pipelineOrders} status={statusPreFilter} />
          )}
          <PipelineTable 
            orders={filteredByEnquiry} 
            onUpdate={updatePipelineOrder}
            onDelete={deletePipelineOrder}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            selectedLeadId={selectedLeadId}
          />
        </TabsContent>

        {canCreate && (
          <TabsContent value="add">
            <PipelineForm onSubmit={createPipelineOrder} />
          </TabsContent>
        )}

        {canViewAnalytics && (
          <TabsContent value="analytics">
            <PipelineAnalytics orders={pipelineOrders} onCardClick={handleAnalyticsCardClick} />
          </TabsContent>
        )}

        <TabsContent value="calendar">
          <PipelineCalendarView orders={filteredByEnquiry} />
        </TabsContent>

        <TabsContent value="followups">
          <PipelineFollowupTracker />
        </TabsContent>
      </Tabs>
    </div>
  );
}
