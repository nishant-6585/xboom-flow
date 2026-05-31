import { TabsContent } from '@/components/ui/tabs';
import { OrderProfitAnalytics } from '@/components/OrderProfitAnalytics';
import type { Order } from '@/hooks/useOrders';

export interface OrdersAnalyticsTabProps {
  orders: Order[];
  onCardClick: (filter: { type: string; value: string }) => void;
}

export default function OrdersAnalyticsTab({ orders, onCardClick }: OrdersAnalyticsTabProps) {
  return (
    <TabsContent value="analytics">
      <OrderProfitAnalytics orders={orders} onCardClick={onCardClick} />
    </TabsContent>
  );
}