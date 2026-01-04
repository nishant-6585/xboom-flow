import { useState } from 'react';
import { Header } from '@/components/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OrderCard } from '@/components/OrderCard';
import { OrderForm } from '@/components/OrderForm';
import { OrderDialog } from '@/components/OrderDialog';
import { useOrders, Order, ORDER_STATUSES } from '@/hooks/useOrders';
import { useEnquiries } from '@/hooks/useEnquiries';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Package, Plus } from 'lucide-react';

export default function Orders() {
  const { role } = useAuth();
  const { orders, loading, createOrder, updateOrder, deleteOrder } = useOrders();
  const { enquiries } = useEnquiries();
  
  const [activeTab, setActiveTab] = useState('list');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const canCreateOrder = role === 'supply_chain' || role === 'admin';

  const filteredOrders = statusFilter === 'all'
    ? orders
    : orders.filter(o => o.status === statusFilter);

  const handleOrderClick = (order: Order) => {
    setSelectedOrder(order);
    setDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto py-6 px-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Package className="h-6 w-6" />
                Orders
              </h1>
              <p className="text-muted-foreground">
                {role === 'sales' ? 'Track your order status and delivery' : 'Manage orders and procurement'}
              </p>
            </div>
            {canCreateOrder && (
              <TabsList>
                <TabsTrigger value="list">Order List</TabsTrigger>
                <TabsTrigger value="new" className="gap-1">
                  <Plus className="h-4 w-4" />
                  New Order
                </TabsTrigger>
              </TabsList>
            )}
          </div>

          <TabsContent value="list" className="space-y-4">
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Filter by status:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {ORDER_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No orders found</h3>
                <p className="text-muted-foreground">
                  {statusFilter !== 'all' 
                    ? 'Try changing the filter to see more orders'
                    : canCreateOrder 
                      ? 'Create your first order to get started'
                      : 'No orders have been assigned to you yet'}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredOrders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onClick={() => handleOrderClick(order)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {canCreateOrder && (
            <TabsContent value="new">
              <OrderForm 
                onSubmit={createOrder}
                enquiries={enquiries}
              />
            </TabsContent>
          )}
        </Tabs>

        <OrderDialog
          order={selectedOrder}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onUpdate={updateOrder}
          onDelete={deleteOrder}
        />
      </main>
    </div>
  );
}
