import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, Package } from 'lucide-react';
import { PRODUCT_CATEGORIES } from '@/hooks/useEnquiries';
import { OrderItemFormData } from '@/hooks/useOrderItems';

interface OrderItemsInputProps {
  items: OrderItemFormData[];
  onChange: (items: OrderItemFormData[]) => void;
  disabled?: boolean;
  showProcurementRate?: boolean;
}

const emptyItem: OrderItemFormData = {
  product_name: '',
  product_code: '',
  product_category: 'Consumer Drones',
  quantity: 1,
  unit_price: undefined,
  procurement_rate: undefined,
  notes: '',
};

export function OrderItemsInput({ items, onChange, disabled = false, showProcurementRate = true }: OrderItemsInputProps) {
  const addItem = () => {
    onChange([...items, { ...emptyItem }]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return; // Keep at least one item
    onChange(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof OrderItemFormData, value: any) => {
    const updated = items.map((item, i) => {
      if (i === index) {
        return { ...item, [field]: value };
      }
      return item;
    });
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
          <Package className="h-4 w-4" />
          Products ({items.length})
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          disabled={disabled}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Product
        </Button>
      </div>

      <div className="space-y-4">
        {items.map((item, index) => (
          <Card key={index} className="border-dashed">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-2 mb-3">
                <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                  #{index + 1}
                </span>
                {items.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive ml-auto"
                    onClick={() => removeItem(index)}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`product_name_${index}`}>Product Name *</Label>
                  <Input
                    id={`product_name_${index}`}
                    value={item.product_name}
                    onChange={e => updateItem(index, 'product_name', e.target.value)}
                    placeholder="Enter product name"
                    required
                    disabled={disabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`product_category_${index}`}>Category</Label>
                  <Select
                    value={item.product_category}
                    onValueChange={v => updateItem(index, 'product_category', v)}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`quantity_${index}`}>Quantity *</Label>
                  <Input
                    id={`quantity_${index}`}
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                    required
                    disabled={disabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`unit_price_${index}`}>Unit Price (₹)</Label>
                  <Input
                    id={`unit_price_${index}`}
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.unit_price || ''}
                    onChange={e => updateItem(index, 'unit_price', parseFloat(e.target.value) || undefined)}
                    placeholder="Selling price"
                    disabled={disabled}
                  />
                </div>

                {showProcurementRate && (
                  <div className="space-y-2">
                    <Label htmlFor={`procurement_rate_${index}`}>Procurement Rate (₹)</Label>
                    <Input
                      id={`procurement_rate_${index}`}
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.procurement_rate || ''}
                      onChange={e => updateItem(index, 'procurement_rate', parseFloat(e.target.value) || undefined)}
                      placeholder="Cost price"
                      disabled={disabled}
                    />
                  </div>
                )}

                <div className={`space-y-2 ${showProcurementRate ? '' : 'md:col-span-2'}`}>
                  <Label htmlFor={`product_code_${index}`}>Product Code</Label>
                  <Input
                    id={`product_code_${index}`}
                    value={item.product_code || ''}
                    onChange={e => updateItem(index, 'product_code', e.target.value)}
                    placeholder="Optional SKU/Code"
                    disabled={disabled}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {items.length === 0 && (
        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No products added yet</p>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={addItem}
            disabled={disabled}
          >
            Add your first product
          </Button>
        </div>
      )}
    </div>
  );
}
