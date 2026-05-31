import { TabsContent } from '@/components/ui/tabs';
import { PipelineOrders } from '@/components/pipeline/PipelineOrders';

export interface OrdersPipelineTabProps {
  enquiryIdFilter: string | null;
}

export default function OrdersPipelineTab({ enquiryIdFilter }: OrdersPipelineTabProps) {
  return (
    <TabsContent value="pipeline">
      <PipelineOrders enquiryIdFilter={enquiryIdFilter} />
    </TabsContent>
  );
}