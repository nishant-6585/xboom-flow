import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { OrderItem, ORDER_ITEM_STATUSES, OrderItemStatus } from '@/hooks/useOrderItems';

interface ProcurementOrderItemsProps {
  orderId: string;
  orderQuantity: number;
  orderProcurementRate?: number;
  procurementCurrency: string;
}

interface EditedItem {
  procurement_rate: string;
  procurement_date: string;
  status: string;
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
}: ProcurementOrderItemsProps) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedItems, setEditedItems] = useState<Record<string, EditedItem>>({});

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
    return sum + (rate * item.quantity);
  }, 0);

  const hasChanges = items.some(item => {
    const original = {
      procurement_rate: item.procurement_rate?.toString() || '',
      procurement_date: item.procurement_date || '',
      status: item.status || 'pending',
    };
    const edited = editedItems[item.id];
    return edited && (
      original.procurement_rate !== edited.procurement_rate ||
      original.procurement_date !== edited.procurement_date ||
      original.status !== edited.status
    );
  });

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
        {items.map((item, index) => (
          <div key={item.id} className="p-3 bg-muted/30 rounded-lg space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">#{index + 1}</Badge>
                  <span className="font-medium">{item.product_name}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {item.product_category} • Code: {item.product_code || '-'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Qty: {item.quantity}</Badge>
                <Badge className={statusColors[editedItems[item.id]?.status || 'pending']}>
                  {ORDER_ITEM_STATUSES.find(s => s.value === editedItems[item.id]?.status)?.label || 'Pending'}
                </Badge>
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
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
                <Label className="text-xs">Procurement Date</Label>
                <Input
                  type="date"
                  value={editedItems[item.id]?.procurement_date || ''}
                  onChange={(e) => handleFieldChange(item.id, 'procurement_date', e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Procurement Rate</Label>
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
                  {currencySymbol}{((parseFloat(editedItems[item.id]?.procurement_rate) || 0) * item.quantity).toLocaleString()}
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
                      {((item.unit_price - parseFloat(editedItems[item.id]?.procurement_rate)) * item.quantity).toLocaleString()}
                    </span>
                  ) : '-'}
                </div>
              </div>
            </div>
          </div>
        ))}

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
    </Card>
  );
}