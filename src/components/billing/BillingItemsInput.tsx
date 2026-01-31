import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, Package, ChevronDown, Percent } from 'lucide-react';
import { ProductSelect } from '@/components/ProductSelect';
import { usePricelist } from '@/hooks/usePricelist';

export interface BillingItem {
  id?: string;
  product_name: string;
  product_code?: string;
  product_category?: string;
  hsn_sac_code?: string;
  description?: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  discount_amount?: number;
  gst_percent: number;
  gst_amount: number;
  price_includes_gst: boolean;
  total_amount: number;
}

interface BillingItemsInputProps {
  items: BillingItem[];
  onChange: (items: BillingItem[]) => void;
  showPerItemDiscount?: boolean;
}

const GST_OPTIONS = [
  { value: '0', label: '0%' },
  { value: '5', label: '5%' },
  { value: '12', label: '12%' },
  { value: '18', label: '18%' },
  { value: '28', label: '28%' },
];

export function BillingItemsInput({ items, onChange, showPerItemDiscount = true }: BillingItemsInputProps) {
  const { items: products } = usePricelist();
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set([0]));

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  const calculateItemTotals = (item: BillingItem): BillingItem => {
    const unitPrice = item.unit_price || 0;
    const quantity = item.quantity || 1;
    const gstPercent = item.gst_percent || 0;
    const discountPercent = item.discount_percent || 0;
    const discountAmt = item.discount_amount || 0;
    
    let basePrice: number;
    let priceAfterDiscount: number;
    let gstAmount: number;
    let totalAmount: number;

    if (item.price_includes_gst) {
      basePrice = unitPrice / (1 + gstPercent / 100);
    } else {
      basePrice = unitPrice;
    }

    // Apply per-item discount
    const lineTotal = basePrice * quantity;
    const itemDiscount = discountPercent > 0 ? lineTotal * (discountPercent / 100) : discountAmt;
    priceAfterDiscount = lineTotal - itemDiscount;

    if (item.price_includes_gst) {
      gstAmount = priceAfterDiscount * (gstPercent / 100) / (1 + gstPercent / 100);
      totalAmount = priceAfterDiscount;
    } else {
      gstAmount = priceAfterDiscount * (gstPercent / 100);
      totalAmount = priceAfterDiscount + gstAmount;
    }

    return {
      ...item,
      discount_amount: Math.round(itemDiscount * 100) / 100,
      gst_amount: Math.round(gstAmount * 100) / 100,
      total_amount: Math.round(totalAmount * 100) / 100,
    };
  };

  const addItem = () => {
    const newIndex = items.length;
    const newItem: BillingItem = {
      product_name: '',
      product_code: '',
      product_category: '',
      quantity: 1,
      unit_price: 0,
      discount_percent: 0,
      discount_amount: 0,
      gst_percent: 18,
      gst_amount: 0,
      price_includes_gst: false,
      total_amount: 0,
    };
    onChange([...items, newItem]);
    setExpandedItems(new Set([...expandedItems, newIndex]));
  };

  const updateItem = (index: number, field: keyof BillingItem, value: any) => {
    const updatedItems = items.map((item, i) => {
      if (i !== index) return item;
      
      const updatedItem = { ...item, [field]: value };
      
      // Clear opposing discount field when one is set
      if (field === 'discount_percent' && value > 0) {
        updatedItem.discount_amount = 0;
      } else if (field === 'discount_amount' && value > 0) {
        updatedItem.discount_percent = 0;
      }
      
      // Recalculate totals when price/quantity/gst/discount changes
      if (['unit_price', 'quantity', 'gst_percent', 'price_includes_gst', 'discount_percent', 'discount_amount'].includes(field)) {
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
      const newExpanded = new Set<number>();
      expandedItems.forEach(i => {
        if (i < index) newExpanded.add(i);
        else if (i > index) newExpanded.add(i - 1);
      });
      setExpandedItems(newExpanded);
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
          <Card key={index} className="bg-muted/30 overflow-hidden">
            <Collapsible open={expandedItems.has(index)} onOpenChange={() => toggleExpanded(index)}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-sm font-medium text-muted-foreground w-6">#{index + 1}</span>
                    <span className="font-medium truncate">
                      {item.product_name || 'New Item'}
                    </span>
                    {item.quantity > 0 && item.unit_price > 0 && (
                      <span className="text-sm text-muted-foreground hidden sm:inline">
                        {item.quantity} × ₹{item.unit_price.toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-primary">
                      ₹{item.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${expandedItems.has(index) ? 'rotate-180' : ''}`} />
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <CardContent className="pt-0 pb-4 px-4">
                  <div className="grid gap-4">
                    {/* Row 1: Product Selection */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="sm:col-span-2 lg:col-span-1">
                        <Label className="text-xs">Product Name *</Label>
                        <ProductSelect
                          value={item.product_name}
                          onChange={(value) => handleProductSelect(index, value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Product Code</Label>
                        <Input
                          value={item.product_code || ''}
                          onChange={(e) => updateItem(index, 'product_code', e.target.value)}
                          placeholder="SKU/Code"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">HSN/SAC Code</Label>
                        <Input
                          value={item.hsn_sac_code || item.product_category || ''}
                          onChange={(e) => updateItem(index, 'hsn_sac_code', e.target.value)}
                          placeholder="HSN/SAC"
                        />
                      </div>
                    </div>

                    {/* Row 2: Description */}
                    <div>
                      <Label className="text-xs">Description (optional)</Label>
                      <Textarea
                        value={item.description || ''}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                        placeholder="Product specifications, notes..."
                        rows={2}
                        className="resize-none text-sm"
                      />
                    </div>

                    {/* Row 3: Quantity, Price, GST */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div>
                        <Label className="text-xs">Qty *</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Unit Price (₹) *</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price || ''}
                          onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div>
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
                      <div>
                        <Label className="text-xs">GST Amt</Label>
                        <Input
                          value={`₹${item.gst_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                          disabled
                          className="bg-muted text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Total</Label>
                        <Input
                          value={`₹${item.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                          disabled
                          className="bg-muted font-semibold text-sm"
                        />
                      </div>
                      <div className="flex items-end gap-2">
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
                      </div>
                    </div>

                    {/* Row 4: Per-item Discount */}
                    {showPerItemDiscount && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-dashed">
                        <div>
                          <Label className="text-xs flex items-center gap-1">
                            <Percent className="h-3 w-3" />
                            Discount %
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={item.discount_percent || ''}
                            onChange={(e) => updateItem(index, 'discount_percent', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Or Discount (₹)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={item.discount_amount && !item.discount_percent ? item.discount_amount : ''}
                            onChange={(e) => updateItem(index, 'discount_amount', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            disabled={!!item.discount_percent}
                          />
                        </div>
                        <div className="col-span-2 flex items-end justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(index)}
                            disabled={items.length === 1}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    )}

                    {!showPerItemDiscount && (
                      <div className="flex justify-end pt-2 border-t border-dashed">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(index)}
                          disabled={items.length === 1}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>
    </div>
  );
}