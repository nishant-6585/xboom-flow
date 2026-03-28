import { useState, useCallback } from 'react';
import { ProspectAnalyticsCards } from './ProspectAnalyticsCards';
import { CallLogsPanel } from '@/components/admin/CallLogsPanel';
import { MyOperatorAnalytics } from './MyOperatorAnalytics';
import type { Prospect } from '@/hooks/useProspects';

interface Props {
  prospects: Prospect[];
  prospectSourceIds: Set<string>;
  attentionSourceIds: Set<string>;
}

export function MyOperatorTabContent({ prospects, prospectSourceIds, attentionSourceIds }: Props) {
  const [rawLogs, setRawLogs] = useState<any[]>([]);

  const handleLogsLoaded = useCallback((logs: any[]) => {
    setRawLogs(logs);
  }, []);

  return (
    <div className="space-y-6">
      <ProspectAnalyticsCards prospects={prospects} sourceType="myoperator" />
      <MyOperatorAnalytics logs={rawLogs} prospects={prospects} />
      <CallLogsPanel
        prospects={prospects}
        prospectSourceIds={prospectSourceIds}
        attentionSourceIds={attentionSourceIds}
        onLogsLoaded={handleLogsLoaded}
      />
    </div>
  );
}
