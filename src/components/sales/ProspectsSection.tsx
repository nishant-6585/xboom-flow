import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { List, CalendarCheck } from 'lucide-react';
import { ProspectsPanel } from './ProspectsPanel';
import { ProspectFollowupTracker } from './ProspectFollowupTracker';

interface Props {
  selectedLeadId?: string | null;
}

export function ProspectsSection({ selectedLeadId }: Props) {
  const [tab, setTab] = useState('list');

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="list" className="gap-1">
          <List className="h-4 w-4" />
          Prospect List
        </TabsTrigger>
        <TabsTrigger value="followups" className="gap-1">
          <CalendarCheck className="h-4 w-4" />
          Follow-up Tracker
        </TabsTrigger>
      </TabsList>

      <TabsContent value="list">
        <ProspectsPanel selectedLeadId={selectedLeadId} />
      </TabsContent>
      <TabsContent value="followups">
        <ProspectFollowupTracker />
      </TabsContent>
    </Tabs>
  );
}
