import { useState, useCallback } from 'react';
import { ProspectAnalyticsCards } from './ProspectAnalyticsCards';
import { CallLogsPanel } from '@/components/admin/CallLogsPanel';
import { MyOperatorAnalytics } from './MyOperatorAnalytics';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import type { Prospect } from '@/hooks/useProspects';

interface Props {
  prospects: Prospect[];
  prospectSourceIds: Set<string>;
  attentionSourceIds: Set<string>;
}

export function MyOperatorTabContent({ prospects, prospectSourceIds, attentionSourceIds }: Props) {
  const [rawLogs, setRawLogs] = useState<any[]>([]);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <ProspectAnalyticsCards prospects={prospects} sourceType="myoperator" />
      </div>
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
      <MyOperatorAnalytics logs={rawLogs} prospects={prospects} dateRange={dateRange} />
      <CallLogsPanel
        prospects={prospects}
        prospectSourceIds={prospectSourceIds}
        attentionSourceIds={attentionSourceIds}
        onLogsLoaded={handleLogsLoaded}
        dateRange={dateRange}
      />
    </div>
  );
}
