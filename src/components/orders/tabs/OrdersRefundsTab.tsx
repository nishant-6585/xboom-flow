import { TabsContent } from '@/components/ui/tabs';
import { RefundRequestsTable } from '@/components/RefundRequestsTable';
import type { Order } from '@/hooks/useOrders';

export interface OrdersRefundsTabProps {
  orders: Order[];
  onUpdateOrder: (id: string, updates: Partial<Order>) => Promise<boolean>;
}

export default function OrdersRefundsTab({ orders, onUpdateOrder }: OrdersRefundsTabProps) {
  return (
    <TabsContent value="refunds">
      <RefundRequestsTable orders={orders} onUpdateOrder={onUpdateOrder} />
    </TabsContent>
  );
}