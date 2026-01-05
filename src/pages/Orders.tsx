import { useState } from 'react';
import { Header } from '@/components/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { OrderCard } from '@/components/OrderCard';
import { OrderTable } from '@/components/OrderTable';
import { OrderForm } from '@/components/OrderForm';
import { OrderDialog } from '@/components/OrderDialog';
import { OrderProfitAnalytics } from '@/components/OrderProfitAnalytics';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { useOrders, Order, ORDER_STATUSES } from '@/hooks/useOrders';
import { useEnquiries } from '@/hooks/useEnquiries';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Package, Plus, BarChart3, LayoutGrid, Table } from 'lucide-react';
import { startOfDay, endOfDay, isWithinInterval } from 'date-fns';

export default function Orders() {
  const { role } = useAuth();
  const { orders, loading, createOrder, updateOrder, deleteOrder } = useOrders();
  const { enquiries } = useEnquiries();
  const { suppliers } = useSuppliers();
  
  const [activeTab, setActiveTab] = useState('list');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const canCreateOrder = role === 'supply_chain' || role === 'admin';
  const isAdmin = role === 'admin';

  const filteredOrders = orders.filter(o => {
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    
    const orderDate = new Date(o.created_at);
    let matchesDate = true;
    if (startDate && endDate) {
      matchesDate = isWithinInterval(orderDate, { start: startOfDay(startDate), end: endOfDay(endDate) });
    } else if (startDate) {
      matchesDate = orderDate >= startOfDay(startDate);
    } else if (endDate) {
      matchesDate = orderDate <= endOfDay(endDate);
    }
    
    return matchesStatus && matchesDate;
  });

  const clearDateFilter = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

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
            <TabsList>
              <TabsTrigger value="list">Order List</TabsTrigger>
              {canCreateOrder && (
                <TabsTrigger value="new" className="gap-1">
                  <Plus className="h-4 w-4" />
                  New Order
                </TabsTrigger>
              )}
              {isAdmin && (
                <TabsTrigger value="analytics" className="gap-1">
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="list" className="space-y-4">
            {/* Filters and View Toggle */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]">
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
                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  onClear={clearDateFilter}
                />
              </div>
              <div className="flex items-center gap-1 border rounded-md p-1">
                <Button
                  variant={viewMode === 'cards' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('cards')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                >
                  <Table className="h-4 w-4" />
                </Button>
              </div>
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
            ) : viewMode === 'table' ? (
              <OrderTable orders={filteredOrders} onOrderClick={handleOrderClick} />
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
                suppliers={suppliers}
              />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="analytics">
              <OrderProfitAnalytics orders={orders} />
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
