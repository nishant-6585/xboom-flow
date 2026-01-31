import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, Package } from 'lucide-react';
import { QuoteItem } from '@/hooks/useQuotes';
import { ProductSelect } from '@/components/ProductSelect';
import { usePricelist } from '@/hooks/usePricelist';

interface QuoteItemsInputProps {
  items: QuoteItem[];
  onChange: (items: QuoteItem[]) => void;
}

const GST_OPTIONS = [
  { value: '0', label: '0%' },
  { value: '5', label: '5%' },
  { value: '12', label: '12%' },
  { value: '18', label: '18%' },
  { value: '28', label: '28%' },
];

export function QuoteItemsInput({ items, onChange }: QuoteItemsInputProps) {
  const { items: products } = usePricelist();

  const calculateItemTotals = (item: QuoteItem): QuoteItem => {
    const unitPrice = item.unit_price || 0;
    const quantity = item.quantity || 1;
    const gstPercent = item.gst_percent || 0;
    
    let basePrice: number;
    let gstAmount: number;
    let totalAmount: number;

    if (item.price_includes_gst) {
      // Price includes GST - calculate backwards
      basePrice = unitPrice / (1 + gstPercent / 100);
      gstAmount = (unitPrice - basePrice) * quantity;
      totalAmount = unitPrice * quantity;
    } else {
      // Price excludes GST - add GST on top
      basePrice = unitPrice;
      gstAmount = (unitPrice * quantity * gstPercent) / 100;
      totalAmount = (unitPrice * quantity) + gstAmount;
    }

    return {
      ...item,
      gst_amount: Math.round(gstAmount * 100) / 100,
      total_amount: Math.round(totalAmount * 100) / 100,
    };
  };

  const addItem = () => {
    const newItem: QuoteItem = {
      product_name: '',
      product_code: '',
      product_category: 'Consumer Drones',
      quantity: 1,
      unit_price: 0,
      gst_percent: 18,
      gst_amount: 0,
      price_includes_gst: false,
      total_amount: 0,
    };
    onChange([...items, newItem]);
  };

  const updateItem = (index: number, field: keyof QuoteItem, value: any) => {
    const updatedItems = items.map((item, i) => {
      if (i !== index) return item;
      
      const updatedItem = { ...item, [field]: value };
      
      // Recalculate totals when price/quantity/gst changes
      if (['unit_price', 'quantity', 'gst_percent', 'price_includes_gst'].includes(field)) {
        return calculateItemTotals(updatedItem);
      }
      
      return updatedItem;
    });
    onChange(updatedItems);
  };

  const handleProductSelect = (index: number, productName: string) => {
    const product = products.find(p => p.product_name === productName);
    if (product) {
      const updatedItems = items.map((item, i) => {
        if (i !== index) return item;
        
        const updatedItem = {
          ...item,
          product_name: product.product_name,
          product_category: product.product_category,
          unit_price: product.dealer_price || product.website_price || 0,
        };
        
        return calculateItemTotals(updatedItem);
      });
      onChange(updatedItems);
    } else {
      updateItem(index, 'product_name', productName);
    }
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      onChange(items.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold flex items-center gap-2">
          <Package className="h-4 w-4" />
          Products / Services
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4 mr-1" />
          Add Item
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <Card key={index} className="bg-muted/30">
            <CardContent className="p-4">
              <div className="grid gap-4">
                {/* Row 1: Product Selection */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-6">
                    <Label className="text-xs">Product Name *</Label>
                    <ProductSelect
                      value={item.product_name}
                      onChange={(value) => handleProductSelect(index, value)}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">Product Code</Label>
                    <Input
                      value={item.product_code || ''}
                      onChange={(e) => updateItem(index, 'product_code', e.target.value)}
                      placeholder="Code"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">HSN/SAC Code</Label>
                    <Input
                      value={item.product_category || ''}
                      onChange={(e) => updateItem(index, 'product_category', e.target.value)}
                      placeholder="HSN/SAC"
                    />
                  </div>
                </div>

                {/* Row 1.5: Description */}
                <div>
                  <Label className="text-xs">Product Description (optional)</Label>
                  <Textarea
                    value={item.description || ''}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                    placeholder="Enter detailed product description, specifications, or notes..."
                    rows={2}
                    className="resize-none text-sm"
                  />
                </div>

                {/* Row 2: Pricing */}
                <div className="grid grid-cols-2 md:grid-cols-12 gap-3">
                  <div className="md:col-span-2">
                    <Label className="text-xs">Quantity *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Unit Price (₹) *</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price || ''}
                      onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">GST %</Label>
                    <Select
                      value={item.gst_percent.toString()}
                      onValueChange={(value) => updateItem(index, 'gst_percent', parseFloat(value))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GST_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">GST Amount</Label>
                    <Input
                      value={`₹${item.gst_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Total</Label>
                    <Input
                      value={`₹${item.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      disabled
                      className="bg-muted font-semibold"
                    />
                  </div>
                  <div className="md:col-span-2 flex items-end gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <Switch
                        id={`gst-inclusive-${index}`}
                        checked={item.price_includes_gst}
                        onCheckedChange={(checked) => updateItem(index, 'price_includes_gst', checked)}
                      />
                      <Label htmlFor={`gst-inclusive-${index}`} className="text-xs whitespace-nowrap">
                        Inc. GST
                      </Label>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(index)}
                      disabled={items.length === 1}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
