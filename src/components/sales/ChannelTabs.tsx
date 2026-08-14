import { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ChannelTabsProps {
  /** Label for the list tab, e.g. "Facebook Leads" */
  listLabel: string;
  list: ReactNode;
  analytics: ReactNode;
}

/**
 * Shared "Leads | Analytics" split used by every lead channel so each
 * channel exposes its own analytics tab (same layout as ManyChat).
 */
export function ChannelTabs({ listLabel, list, analytics }: ChannelTabsProps) {
  return (
    <Tabs defaultValue="list" className="space-y-6">
      <TabsList>
        <TabsTrigger value="list">{listLabel}</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
      </TabsList>
      <TabsContent value="list" className="space-y-6">
        {list}
      </TabsContent>
      <TabsContent value="analytics" className="space-y-6">
        {analytics}
      </TabsContent>
    </Tabs>
  );
}
