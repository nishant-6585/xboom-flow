import { useState, useCallback, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProspectAnalyticsCards } from './ProspectAnalyticsCards';
import { CallLogsPanel } from '@/components/admin/CallLogsPanel';
import { MyOperatorAnalytics } from './MyOperatorAnalytics';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { SalespersonCallStats } from './SalespersonCallStats';
import { Button } from '@/components/ui/button';
import { Users, Headphones } from 'lucide-react';
import type { Prospect } from '@/hooks/useProspects';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  prospects: Prospect[];
  prospectSourceIds: Set<string>;
  attentionSourceIds: Set<string>;
  /** Extra analytics content rendered at the top of the Analytics tab. */
  analytics?: ReactNode;
}

export function MyOperatorTabContent({ prospects, prospectSourceIds, attentionSourceIds, analytics }: Props) {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'sales_manager';
  const [rawLogs, setRawLogs] = useState<any[]>([]);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [showSalesStats, setShowSalesStats] = useState(false);
  const [showSupportStats, setShowSupportStats] = useState(false);

  const handleLogsLoaded = useCallback((logs: any[]) => {
    setRawLogs(logs);
  }, []);

  const handleClearDates = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const dateRange = { start: startDate, end: endDate };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="list" className="space-y-6">
        <TabsList>
          <TabsTrigger value="list">MyOperator Leads</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-6">
          {analytics}
          {canManage && (
            <MyOperatorAnalytics logs={rawLogs} prospects={prospects} dateRange={dateRange} />
          )}
        </TabsContent>

        <TabsContent value="list" forceMount className="space-y-6 data-[state=inactive]:hidden">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <ProspectAnalyticsCards prospects={prospects} sourceType="myoperator" />
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Filter by date:</span>
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onClear={handleClearDates}
          />
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSalesStats(true)} className="gap-1.5">
              <Users className="h-4 w-4" />
              Sales Stats
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSupportStats(true)} className="gap-1.5">
              <Headphones className="h-4 w-4" />
              Support Stats
            </Button>
          </div>
        )}
      </div>
      <CallLogsPanel
        prospects={prospects}
        prospectSourceIds={prospectSourceIds}
        attentionSourceIds={attentionSourceIds}
        onLogsLoaded={handleLogsLoaded}
        dateRange={dateRange}
      />
        </TabsContent>
      </Tabs>
      {canManage && (
        <>
          <SalespersonCallStats
            open={showSalesStats}
            onOpenChange={setShowSalesStats}
            logs={rawLogs}
            dateRange={dateRange}
            department="sales"
          />
          <SalespersonCallStats
            open={showSupportStats}
            onOpenChange={setShowSupportStats}
            logs={rawLogs}
            dateRange={dateRange}
            department="support"
          />
        </>
      )}
    </div>
  );
}
