import { TabsContent } from '@/components/ui/tabs';
import { OrderForm } from '@/components/OrderForm';

type CreateOrder = Parameters<typeof OrderForm>[0]['onSubmit'];
type EnquiriesProp = Parameters<typeof OrderForm>[0]['enquiries'];
type SuppliersProp = Parameters<typeof OrderForm>[0]['suppliers'];

export interface OrdersNewOrderTabProps {
  createOrder: CreateOrder;
  enquiries: EnquiriesProp;
  suppliers: SuppliersProp;
  userRole: string;
  preSelectEnquiryId: string | null;
}

export default function OrdersNewOrderTab({
  createOrder, enquiries, suppliers, userRole, preSelectEnquiryId,
}: OrdersNewOrderTabProps) {
  return (
    <TabsContent value="new">
      <OrderForm
        onSubmit={createOrder}
        enquiries={enquiries}
        suppliers={suppliers}
        showProcurementRate={false}
        userRole={userRole || 'sales'}
        preSelectEnquiryId={preSelectEnquiryId || undefined}
      />
    </TabsContent>
  );
}