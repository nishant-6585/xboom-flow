import { useState } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import { SupportCallsDashboard } from '@/components/orders/SupportCallsDashboard';
import { CallLogsPanel } from '@/components/admin/CallLogsPanel';

type SupportCallLog = Parameters<typeof SupportCallsDashboard>[0]['logs'][number];

export default function OrdersSupportCallsTab() {
  const [supportCallLogs, setSupportCallLogs] = useState<SupportCallLog[]>([]);
  return (
    <TabsContent value="support_calls" className="space-y-6 mt-0">
      <SupportCallsDashboard logs={supportCallLogs} />
      <CallLogsPanel defaultDepartment="support" onLogsLoaded={setSupportCallLogs} />
    </TabsContent>
  );
}