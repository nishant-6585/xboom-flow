import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useInventoryProcurements } from '@/hooks/useInventoryProcurements';
import { useSuppliers, Supplier } from '@/hooks/useSuppliers';
import { useInventory } from '@/hooks/useInventory';
import { useOrders } from '@/hooks/useOrders';
import { calculatePaymentDueDate } from '@/lib/paymentTerms';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarIcon, Loader2, Package, Plus, Search, FileText } from 'lucide-react';

interface ManualProcurementFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRODUCT_CATEGORIES = [
  'Consumer Drones',
  'Enterprise Drones',
  'Drone Accessories',
  'Cameras & Gimbals',
  'Batteries & Chargers',
  'Spare Parts',
  'Software & Services',
  'Other',
];

export function ManualProcurementForm({ open, onOpenChange }: ManualProcurementFormProps) {
  const { createProcurement } = useInventoryProcurements();
  const { suppliers } = useSuppliers();
  const { inventory } = useInventory();
  const { orders } = useOrders();
  const [loading, setLoading] = useState(false);

  // Form state
  const [isInventoryProcurement, setIsInventoryProcurement] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('Consumer Drones');
  const [productCode, setProductCode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState<Date | undefined>();
  const [procurementDate, setProcurementDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  const [addToInventory, setAddToInventory] = useState(true);
  const [useExistingProduct, setUseExistingProduct] = useState(false);
  const [selectedInventoryId, setSelectedInventoryId] = useState('');

  // Calculate total
  const totalAmount = Number(quantity || 0) * Number(unitPrice || 0);

  // Get selected supplier name
  const selectedSupplier = suppliers.find(s => s.id === supplierId);
  
  // Get selected order
  const selectedOrder = orders.find(o => o.id === selectedOrderId);

  // Filter orders for search
  const filteredOrders = useMemo(() => {
    if (!orderSearch.trim()) return orders.slice(0, 50);
    const search = orderSearch.toLowerCase();
    return orders.filter(o => 
      o.order_number?.toLowerCase().includes(search) ||
      o.product_name.toLowerCase().includes(search) ||
      o.customer_company.toLowerCase().includes(search)
    ).slice(0, 50);
  }, [orders, orderSearch]);

  // Handle order selection - auto-fill product details
  useEffect(() => {
    if (selectedOrderId && selectedOrder) {
      setProductName(selectedOrder.product_name);
      setProductCategory(selectedOrder.product_category || 'Consumer Drones');
      setProductCode(selectedOrder.product_code || '');
      setQuantity(String(selectedOrder.quantity));
      if (selectedOrder.procurement_rate) {
        setUnitPrice(String(selectedOrder.procurement_rate));
      }
      if (selectedOrder.supplier_id) {
        setSupplierId(selectedOrder.supplier_id);
      }
    }
  }, [selectedOrderId, selectedOrder]);

  // Handle payment terms change - auto-calculate due date
  const handlePaymentTermsChange = (value: string) => {
    setPaymentTerms(value);
    const dueDate = calculatePaymentDueDate(value, procurementDate);
    if (dueDate) {
      setPaymentDueDate(parseISO(dueDate));
    } else {
      setPaymentDueDate(undefined);
    }
  };

  // Handle existing product selection
  useEffect(() => {
    if (useExistingProduct && selectedInventoryId) {
      const item = inventory.find(i => i.id === selectedInventoryId);
      if (item) {
        setProductName(item.product_name);
        setProductCategory(item.product_category);
      }
    }
  }, [useExistingProduct, selectedInventoryId, inventory]);

  const resetForm = () => {
    setIsInventoryProcurement(true);
    setSelectedOrderId('');
    setOrderSearch('');
    setProductName('');
    setProductCategory('Consumer Drones');
    setProductCode('');
    setQuantity('1');
    setUnitPrice('');
    setSupplierId('');
    setPaymentTerms('');
    setPaymentDueDate(undefined);
    setProcurementDate(new Date());
    setNotes('');
    setAddToInventory(true);
    setUseExistingProduct(false);
    setSelectedInventoryId('');
  };

  // Validation - order is required for non-inventory procurements
  const isValid = productName.trim() && (isInventoryProcurement || selectedOrderId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValid) {
      return;
    }

    setLoading(true);
    
    const result = await createProcurement({
      procurement_number: null, // Auto-generated by database
      product_name: productName,
      product_category: productCategory,
      product_code: productCode || null,
      quantity: Number(quantity),
      unit_price: unitPrice ? Number(unitPrice) : null,
      total_amount: totalAmount || null,
      supplier_id: supplierId || null,
      supplier_name: selectedSupplier?.name || null,
      payment_terms: paymentTerms || null,
      payment_due_date: paymentDueDate ? format(paymentDueDate, 'yyyy-MM-dd') : null,
      payment_status: 'pending',
      procurement_date: format(procurementDate, 'yyyy-MM-dd'),
      notes: notes || null,
      inventory_id: useExistingProduct ? selectedInventoryId : null,
      order_id: selectedOrderId || null,
    }, addToInventory && isInventoryProcurement);

    setLoading(false);

    if (result) {
      resetForm();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Manual Inventory Procurement
          </DialogTitle>
          <DialogDescription>
            Create a standalone procurement entry that will automatically add to inventory.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Procurement Type Toggle */}
          <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
            <Label className="text-sm font-medium">Procurement Type</Label>
            <div className="flex gap-4">
              <div 
                className={cn(
                  "flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all",
                  isInventoryProcurement 
                    ? "border-primary bg-primary/5" 
                    : "border-muted hover:border-muted-foreground/50"
                )}
                onClick={() => {
                  setIsInventoryProcurement(true);
                  setSelectedOrderId('');
                }}
              >
                <div className="flex items-center gap-2">
                  <Package className={cn("h-4 w-4", isInventoryProcurement && "text-primary")} />
                  <span className={cn("font-medium", isInventoryProcurement && "text-primary")}>
                    Inventory Procurement
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Standalone procurement for stock (Order optional)
                </p>
              </div>
              <div 
                className={cn(
                  "flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all",
                  !isInventoryProcurement 
                    ? "border-primary bg-primary/5" 
                    : "border-muted hover:border-muted-foreground/50"
                )}
                onClick={() => setIsInventoryProcurement(false)}
              >
                <div className="flex items-center gap-2">
                  <FileText className={cn("h-4 w-4", !isInventoryProcurement && "text-primary")} />
                  <span className={cn("font-medium", !isInventoryProcurement && "text-primary")}>
                    Order Procurement
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Linked to specific order (Order required)
                </p>
              </div>
            </div>
          </div>

          {/* Order Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>
                Link to Order {!isInventoryProcurement && <span className="text-destructive">*</span>}
              </Label>
              {selectedOrder && (
                <Badge variant="secondary" className="gap-1">
                  {selectedOrder.order_number || 'No Order #'}
                </Badge>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search by order number, product, or company..."
                className="pl-9"
              />
            </div>
            <Select 
              value={selectedOrderId} 
              onValueChange={(val) => {
                if (val === 'none') {
                  setSelectedOrderId('');
                  setProductName('');
                  setProductCategory('Consumer Drones');
                  setProductCode('');
                  setQuantity('1');
                  setUnitPrice('');
                  setSupplierId('');
                } else {
                  setSelectedOrderId(val);
                }
              }}
            >
              <SelectTrigger className={cn(!isInventoryProcurement && !selectedOrderId && "border-destructive")}>
                <SelectValue placeholder="Select an order to link" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {isInventoryProcurement && (
                  <SelectItem value="none">No order (Inventory only)</SelectItem>
                )}
                {filteredOrders.map((order) => (
                  <SelectItem key={order.id} value={order.id}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{order.order_number || 'No #'}</span>
                      <span className="text-muted-foreground">-</span>
                      <span className="truncate max-w-[200px]">{order.product_name}</span>
                      <span className="text-xs text-muted-foreground">({order.customer_company})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOrder && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900 text-sm space-y-1">
                <div className="font-medium text-blue-700 dark:text-blue-300">Order Details Auto-filled</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-blue-600 dark:text-blue-400">
                  <div>Product: {selectedOrder.product_name}</div>
                  <div>Qty: {selectedOrder.quantity}</div>
                  <div>Customer: {selectedOrder.customer_company}</div>
                  <div>Status: {selectedOrder.status.replace(/_/g, ' ')}</div>
                </div>
              </div>
            )}
          </div>

          {/* Product Selection */}
          <div className="space-y-4">
            {!selectedOrderId && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useExisting"
                  checked={useExistingProduct}
                  onCheckedChange={(checked) => setUseExistingProduct(checked === true)}
                />
                <Label htmlFor="useExisting" className="cursor-pointer">
                  Select from existing inventory items
                </Label>
              </div>
            )}

            {useExistingProduct && !selectedOrderId ? (
              <div className="space-y-2">
                <Label>Select Inventory Item</Label>
                <Select value={selectedInventoryId} onValueChange={setSelectedInventoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an inventory item" />
                  </SelectTrigger>
                  <SelectContent>
                    {inventory.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.product_name} ({item.product_category}) - Stock: {item.current_stock}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="productName">Product Name *</Label>
                  <Input
                    id="productName"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Enter product name"
                    required
                    disabled={!!selectedOrderId}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productCategory">Category</Label>
                  <Select value={productCategory} onValueChange={setProductCategory} disabled={!!selectedOrderId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Quantity & Pricing */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitPrice">Unit Price (₹)</Label>
              <Input
                id="unitPrice"
                type="number"
                min={0}
                step={0.01}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Total Amount</Label>
              <div className="p-2 bg-muted rounded-md font-medium">
                ₹{totalAmount.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Supplier */}
          <div className="space-y-2">
            <Label htmlFor="supplier">Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.filter(s => s.is_active).map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name} {supplier.brand_name ? `(${supplier.brand_name})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Terms & Dates */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Procurement Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !procurementDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {procurementDate ? format(procurementDate, 'dd MMM yyyy') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={procurementDate}
                    onSelect={(date) => date && setProcurementDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Payment Terms</Label>
              <Select value={paymentTerms} onValueChange={handlePaymentTermsChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">Advance</SelectItem>
                  <SelectItem value="cod">Cash on Delivery</SelectItem>
                  <SelectItem value="net_7">Net 7 Days</SelectItem>
                  <SelectItem value="net_15">Net 15 Days</SelectItem>
                  <SelectItem value="net_30">Net 30 Days</SelectItem>
                  <SelectItem value="net_45">Net 45 Days</SelectItem>
                  <SelectItem value="net_60">Net 60 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !paymentDueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {paymentDueDate ? format(paymentDueDate, 'dd MMM yyyy') : 'Auto-calculated'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={paymentDueDate}
                    onSelect={setPaymentDueDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this procurement..."
              rows={2}
            />
          </div>

          {/* Add to Inventory Option - only for inventory procurements */}
          {isInventoryProcurement && (
            <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
              <Checkbox
                id="addToInventory"
                checked={addToInventory}
                onCheckedChange={(checked) => setAddToInventory(checked === true)}
              />
              <Label htmlFor="addToInventory" className="cursor-pointer">
                Automatically add {quantity} unit(s) to inventory stock
              </Label>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !isValid}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Procurement
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
