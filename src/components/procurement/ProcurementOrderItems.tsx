import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Save, Loader2, Building2, Warehouse, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { OrderItem, ORDER_ITEM_STATUSES, OrderItemStatus } from '@/hooks/useOrderItems';
import { Supplier } from '@/hooks/useSuppliers';
import { useInventory, InventoryItem } from '@/hooks/useInventory';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface ProcurementOrderItemsProps {
  orderId: string;
  orderQuantity: number;
  orderProcurementRate?: number;
  procurementCurrency: string;
  suppliers?: Supplier[];
}

interface EditedItem {
  procurement_rate: string;
  procurement_date: string;
  status: string;
  supplier_id: string;
  quantity_procured: string;
  fulfilled_from_stock: boolean;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  ordered: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  in_transit: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  received: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export function ProcurementOrderItems({
  orderId,
  orderQuantity,
  orderProcurementRate,
  procurementCurrency,
  suppliers = [],
}: ProcurementOrderItemsProps) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedItems, setEditedItems] = useState<Record<string, EditedItem>>({});
  
  // Inventory integration
  const { inventory, fulfillFromStock, addStockFromProcurement, canManage: canManageInventory } = useInventory();
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [stockDialogItem, setStockDialogItem] = useState<OrderItem | null>(null);
  const [stockDialogType, setStockDialogType] = useState<'fulfill' | 'add'>('fulfill');
  const [stockQty, setStockQty] = useState('');
  const [stockNotes, setStockNotes] = useState('');
  const [stockSaving, setStockSaving] = useState(false);

  useEffect(() => {
    fetchItems();
  }, [orderId]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setItems(data || []);
      
      // Initialize edited items
      const edited: Record<string, EditedItem> = {};
      (data || []).forEach(item => {
        edited[item.id] = {
          procurement_rate: item.procurement_rate?.toString() || '',
          procurement_date: item.procurement_date || '',
          status: item.status || 'pending',
          supplier_id: (item as any).supplier_id || '',
          quantity_procured: (item as any).quantity_procured?.toString() || '',
          fulfilled_from_stock: (item as any).fulfilled_from_stock || false,
        };
      });
      setEditedItems(edited);
    } catch (error: any) {
      console.error('Error fetching order items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (itemId: string, field: keyof EditedItem, value: string) => {
    setEditedItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      for (const item of items) {
        const edited = editedItems[item.id];
        const { error } = await supabase
          .from('order_items')
          .update({
            procurement_rate: edited.procurement_rate ? parseFloat(edited.procurement_rate) : null,
            procurement_date: edited.procurement_date || null,
            status: edited.status,
            supplier_id: edited.supplier_id || null,
            quantity_procured: edited.quantity_procured ? parseInt(edited.quantity_procured) : 0,
          })
          .eq('id', item.id);
        
        if (error) throw error;
      }

      toast.success('Items updated successfully');
      fetchItems();
    } catch (error: any) {
      console.error('Error updating items:', error);
      toast.error('Failed to update items');
    } finally {
      setSaving(false);
    }
  };

  const currencySymbol = procurementCurrency === 'USD' ? '$' : '₹';

  // Calculate totals
  const totalProcurementValue = items.reduce((sum, item) => {
    const rate = parseFloat(editedItems[item.id]?.procurement_rate) || 0;
    const qtyProcured = parseInt(editedItems[item.id]?.quantity_procured) || item.quantity;
    return sum + (rate * qtyProcured);
  }, 0);

  const hasChanges = items.some(item => {
    const original = {
      procurement_rate: item.procurement_rate?.toString() || '',
      procurement_date: item.procurement_date || '',
      status: item.status || 'pending',
      supplier_id: (item as any).supplier_id || '',
      quantity_procured: (item as any).quantity_procured?.toString() || '',
      fulfilled_from_stock: (item as any).fulfilled_from_stock || false,
    };
    const edited = editedItems[item.id];
    return edited && (
      original.procurement_rate !== edited.procurement_rate ||
      original.procurement_date !== edited.procurement_date ||
      original.status !== edited.status ||
      original.supplier_id !== edited.supplier_id ||
      original.quantity_procured !== edited.quantity_procured ||
      original.fulfilled_from_stock !== edited.fulfilled_from_stock
    );
  });

  // Get stock for a product
  const getStockForProduct = (productName: string, productCategory: string): InventoryItem | undefined => {
    return inventory.find(
      i => i.product_name === productName && i.product_category === productCategory
    );
  };

  const openStockDialog = (item: OrderItem, type: 'fulfill' | 'add') => {
    setStockDialogItem(item);
    setStockDialogType(type);
    setStockQty('');
    setStockNotes('');
    setShowStockDialog(true);
  };

  const handleStockAction = async () => {
    if (!stockDialogItem || !stockQty) return;
    setStockSaving(true);

    const qty = parseInt(stockQty);
    let success = false;

    if (stockDialogType === 'fulfill') {
      success = await fulfillFromStock(
        stockDialogItem.product_name,
        stockDialogItem.product_category || 'Consumer Drones',
        qty,
        orderId,
        stockDialogItem.id,
        stockNotes
      );
      if (success) {
        // Update the item to mark as fulfilled from stock
        await supabase
          .from('order_items')
          .update({ fulfilled_from_stock: true })
          .eq('id', stockDialogItem.id);
      }
    } else {
      success = await addStockFromProcurement(
        stockDialogItem.product_name,
        stockDialogItem.product_category || 'Consumer Drones',
        qty,
        stockNotes
      );
    }

    setStockSaving(false);
    if (success) {
      setShowStockDialog(false);
      fetchItems();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If no order items exist, show legacy view (single product from order)
  if (items.length === 0) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Single Product Order</span>
            </div>
            <div className="text-muted-foreground">
              Qty: {orderQuantity} × {currencySymbol}{orderProcurementRate?.toLocaleString() || '0'} 
              = {currencySymbol}{((orderProcurementRate || 0) * orderQuantity).toLocaleString()}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Package className="h-4 w-4" />
            Order Items ({items.length})
          </CardTitle>
          {hasChanges && (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save Changes
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, index) => {
          const qtyProcured = parseInt(editedItems[item.id]?.quantity_procured) || 0;
          const qtyPending = item.quantity - qtyProcured;
          const selectedSupplier = suppliers.find(s => s.id === editedItems[item.id]?.supplier_id);
          const stockItem = getStockForProduct(item.product_name, item.product_category || 'Consumer Drones');
          const availableStock = stockItem?.current_stock || 0;
          const isFromStock = editedItems[item.id]?.fulfilled_from_stock || (item as any).fulfilled_from_stock;
          
          return (
            <div key={item.id} className="p-3 bg-muted/30 rounded-lg space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">#{index + 1}</Badge>
                    <span className="font-medium">{item.product_name}</span>
                    {isFromStock && (
                      <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 text-xs">
                        <Warehouse className="h-3 w-3 mr-1" />
                        From Stock
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {item.product_category} • Code: {item.product_code || '-'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Stock indicator */}
                  {stockItem && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Warehouse className="h-3 w-3" />
                      Stock: {availableStock}
                    </Badge>
                  )}
                  <Badge variant="secondary">Order Qty: {item.quantity}</Badge>
                  <Badge className={statusColors[editedItems[item.id]?.status || 'pending']}>
                    {ORDER_ITEM_STATUSES.find(s => s.value === editedItems[item.id]?.status)?.label || 'Pending'}
                  </Badge>
                </div>
              </div>

              {/* Supplier Selection Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Supplier
                  </Label>
                  <Select
                    value={editedItems[item.id]?.supplier_id || 'none'}
                    onValueChange={(value) => handleFieldChange(item.id, 'supplier_id', value === 'none' ? '' : value)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Supplier</SelectItem>
                      {suppliers.map(supplier => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name} {supplier.brand_name ? `(${supplier.brand_name})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedSupplier && (
                  <div className="text-xs p-2 bg-muted rounded flex items-center gap-2">
                    <span className="text-muted-foreground">{selectedSupplier.contact_name}</span>
                    {selectedSupplier.phone && (
                      <span className="text-muted-foreground">• {selectedSupplier.phone}</span>
                    )}
                  </div>
                )}
              </div>
              
              {/* Procurement Details Row */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={editedItems[item.id]?.status || 'pending'}
                    onValueChange={(value) => handleFieldChange(item.id, 'status', value)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_ITEM_STATUSES.map(status => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Qty Procured</Label>
                  <Input
                    type="number"
                    min={0}
                    max={item.quantity}
                    value={editedItems[item.id]?.quantity_procured || ''}
                    onChange={(e) => handleFieldChange(item.id, 'quantity_procured', e.target.value)}
                    placeholder="0"
                    className="h-8 text-sm"
                  />
                  {qtyPending > 0 && qtyProcured > 0 && (
                    <p className="text-xs text-orange-600">{qtyPending} pending</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Procurement Date</Label>
                  <Input
                    type="date"
                    value={editedItems[item.id]?.procurement_date || ''}
                    onChange={(e) => handleFieldChange(item.id, 'procurement_date', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rate/Unit</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={editedItems[item.id]?.procurement_rate || ''}
                    onChange={(e) => handleFieldChange(item.id, 'procurement_rate', e.target.value)}
                    placeholder="0.00"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Item Total</Label>
                  <div className="text-sm font-medium h-8 flex items-center">
                    {currencySymbol}{((parseFloat(editedItems[item.id]?.procurement_rate) || 0) * (parseInt(editedItems[item.id]?.quantity_procured) || item.quantity)).toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Margin</Label>
                  <div className="text-sm font-medium h-8 flex items-center">
                    {item.unit_price && editedItems[item.id]?.procurement_rate ? (
                      <span className={
                        item.unit_price > parseFloat(editedItems[item.id]?.procurement_rate) 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }>
                        {currencySymbol}
                        {((item.unit_price - parseFloat(editedItems[item.id]?.procurement_rate)) * (parseInt(editedItems[item.id]?.quantity_procured) || item.quantity)).toLocaleString()}
                      </span>
                    ) : '-'}
                  </div>
                </div>
              </div>

              {/* Stock Actions */}
              {canManageInventory && (
                <div className="flex gap-2 pt-2 border-t border-border/50">
                  {availableStock > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openStockDialog(item, 'fulfill')}
                      className="text-xs"
                    >
                      <ArrowDownCircle className="h-3 w-3 mr-1" />
                      Fulfill from Stock ({availableStock} available)
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openStockDialog(item, 'add')}
                    className="text-xs"
                  >
                    <ArrowUpCircle className="h-3 w-3 mr-1" />
                    Add to Stock
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {/* Totals Summary */}
        <div className="pt-3 border-t">
          <div className="flex justify-between items-center text-sm">
            <span className="font-medium">Total Procurement Value</span>
            <span className="font-bold text-lg">
              {currencySymbol}{totalProcurementValue.toLocaleString()}
            </span>
          </div>
        </div>
      </CardContent>

      {/* Stock Action Dialog */}
      <Dialog open={showStockDialog} onOpenChange={setShowStockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {stockDialogType === 'fulfill' ? (
                <>
                  <ArrowDownCircle className="h-5 w-5 text-blue-600" />
                  Fulfill from Stock
                </>
              ) : (
                <>
                  <ArrowUpCircle className="h-5 w-5 text-green-600" />
                  Add to Stock
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {stockDialogItem && (
            <div className="space-y-4 pt-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{stockDialogItem.product_name}</p>
                <p className="text-sm text-muted-foreground">{stockDialogItem.product_category}</p>
                {stockDialogType === 'fulfill' && (
                  <p className="text-sm mt-2">
                    Available in stock: <strong>{getStockForProduct(stockDialogItem.product_name, stockDialogItem.product_category || 'Consumer Drones')?.current_stock || 0}</strong>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  max={stockDialogType === 'fulfill' 
                    ? getStockForProduct(stockDialogItem.product_name, stockDialogItem.product_category || 'Consumer Drones')?.current_stock 
                    : undefined
                  }
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  placeholder="Enter quantity"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={stockNotes}
                  onChange={(e) => setStockNotes(e.target.value)}
                  placeholder={stockDialogType === 'fulfill' ? 'Fulfilled for order...' : 'Procured from supplier...'}
                  rows={2}
                />
              </div>
              <Button 
                onClick={handleStockAction} 
                disabled={stockSaving || !stockQty} 
                className="w-full"
              >
                {stockSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {stockDialogType === 'fulfill' ? 'Fulfill from Stock' : 'Add to Stock'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}