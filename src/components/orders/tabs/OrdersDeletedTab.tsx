import { TabsContent } from '@/components/ui/tabs';
import { DeletedOrdersTab as DeletedOrders } from '@/components/orders/DeletedOrdersTab';

export default function OrdersDeletedTab() {
  return (
    <TabsContent value="deleted" className="mt-0">
      <DeletedOrders />
    </TabsContent>
  );
}