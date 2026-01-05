import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { OrderItem } from '@/hooks/useOrderItems';

interface ProcurementOrderItemsProps {
  orderId: string;
  orderQuantity: number;
  orderProcurementRate?: number;
  procurementCurrency: string;
}

export function ProcurementOrderItems({
  orderId,
  orderQuantity,
  orderProcurementRate,
  procurementCurrency,
}: ProcurementOrderItemsProps) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedRates, setEditedRates] = useState<Record<string, string>>({});

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
      
      // Initialize edited rates
      const rates: Record<string, string> = {};
      (data || []).forEach(item => {
        rates[item.id] = item.procurement_rate?.toString() || '';
      });
      setEditedRates(rates);
    } catch (error: any) {
      console.error('Error fetching order items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRateChange = (itemId: string, value: string) => {
    setEditedRates(prev => ({ ...prev, [itemId]: value }));
  };

  const handleSaveRates = async () => {
    try {
      setSaving(true);
      
      const updates = items.map(item => ({
        id: item.id,
        procurement_rate: editedRates[item.id] ? parseFloat(editedRates[item.id]) : null,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('order_items')
          .update({ procurement_rate: update.procurement_rate })
          .eq('id', update.id);
        
        if (error) throw error;
      }

      toast.success('Procurement rates updated');
      fetchItems();
    } catch (error: any) {
      console.error('Error updating rates:', error);
      toast.error('Failed to update rates');
    } finally {
      setSaving(false);
    }
  };

  const currencySymbol = procurementCurrency === 'USD' ? '$' : '₹';

  // Calculate totals
  const totalProcurementValue = items.reduce((sum, item) => {
    const rate = parseFloat(editedRates[item.id]) || 0;
    return sum + (rate * item.quantity);
  }, 0);

  const hasChanges = items.some(item => {
    const originalRate = item.procurement_rate?.toString() || '';
    return editedRates[item.id] !== originalRate;
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
            <Button size="sm" onClick={handleSaveRates} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save Rates
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
              <Badge variant="secondary">Qty: {item.quantity}</Badge>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs">Unit Sell Price</Label>
                <div className="text-sm font-medium">
                  {item.unit_price ? `${currencySymbol}${item.unit_price.toLocaleString()}` : '-'}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Procurement Rate</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={editedRates[item.id] || ''}
                  onChange={(e) => handleRateChange(item.id, e.target.value)}
                  placeholder="0.00"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Item Total</Label>
                <div className="text-sm font-medium">
                  {currencySymbol}{((parseFloat(editedRates[item.id]) || 0) * item.quantity).toLocaleString()}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Margin</Label>
                <div className="text-sm font-medium">
                  {item.unit_price && editedRates[item.id] ? (
                    <span className={
                      item.unit_price > parseFloat(editedRates[item.id]) 
                        ? 'text-green-600' 
                        : 'text-red-600'
                    }>
                      {currencySymbol}
                      {((item.unit_price - parseFloat(editedRates[item.id])) * item.quantity).toLocaleString()}
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
