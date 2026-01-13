import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useInventoryProcurements } from '@/hooks/useInventoryProcurements';
import { useSuppliers, Supplier } from '@/hooks/useSuppliers';
import { useInventory } from '@/hooks/useInventory';
import { calculatePaymentDueDate } from '@/lib/paymentTerms';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarIcon, Loader2, Package, Plus } from 'lucide-react';

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
  const [loading, setLoading] = useState(false);

  // Form state
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!productName.trim()) {
      return;
    }

    setLoading(true);
    
    const result = await createProcurement({
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
    }, addToInventory);

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
          {/* Product Selection */}
          <div className="space-y-4">
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

            {useExistingProduct ? (
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productCategory">Category</Label>
                  <Select value={productCategory} onValueChange={setProductCategory}>
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

          {/* Add to Inventory Option */}
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

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !productName.trim()}>
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
