import { TabsContent } from '@/components/ui/tabs';
import { OrderForm } from '@/components/OrderForm';

type OrderFormProps = Parameters<typeof OrderForm>[0];
type CreateOrder = OrderFormProps['onSubmit'];
type EnquiriesProp = OrderFormProps['enquiries'];
type SuppliersProp = OrderFormProps['suppliers'];
type UserRole = OrderFormProps['userRole'];

export interface OrdersNewOrderTabProps {
  createOrder: CreateOrder;
  enquiries: EnquiriesProp;
  suppliers: SuppliersProp;
  userRole: UserRole;
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
        userRole={userRole}
        preSelectEnquiryId={preSelectEnquiryId || undefined}
      />
    </TabsContent>
  );
}