import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { InventoryProcurement } from '@/hooks/useInventoryProcurements';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useOrders } from '@/hooks/useOrders';
import { calculatePaymentDueDate } from '@/lib/paymentTerms';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarIcon, Loader2, Package, Check, ChevronsUpDown, X, ShoppingCart, Building2 } from 'lucide-react';

interface EditProcurementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  procurement: InventoryProcurement | null;
  onSave: (id: string, updates: Partial<InventoryProcurement>) => Promise<boolean>;
}

const PRODUCT_CATEGORIES = [
  'Consumer Drones',
  'Enterprise Drones',
  'Drone Accessories',
  'Cameras & Gimbals',
  'Batteries & Chargers',
  'Spare Parts',
  'Software & Services',
  'Robot Rental',
  'Agri Drones',
  'Other',
];

export function EditProcurementDialog({ open, onOpenChange, procurement, onSave }: EditProcurementDialogProps) {
  const { suppliers } = useSuppliers();
  const { orders } = useOrders();
  const [saving, setSaving] = useState(false);
  const [orderDropdownOpen, setOrderDropdownOpen] = useState(false);

  // Form state
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [productCode, setProductCode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [orderId, setOrderId] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState<Date | undefined>();
  const [procurementDate, setProcurementDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');

  // Populate form when procurement changes
  useEffect(() => {
    if (procurement) {
      setProductName(procurement.product_name || '');
      setProductCategory(procurement.product_category || 'Consumer Drones');
      setProductCode(procurement.product_code || '');
      setQuantity(String(procurement.quantity || 1));
      setUnitPrice(procurement.unit_price ? String(procurement.unit_price) : '');
      setTotalAmount(procurement.total_amount ? String(procurement.total_amount) : '');
      setSupplierId(procurement.supplier_id || '');
      setSupplierName(procurement.supplier_name || '');
      setOrderId(procurement.order_id || '');
      setPaymentTerms(procurement.payment_terms || '');
      setPaymentDueDate(procurement.payment_due_date ? parseISO(procurement.payment_due_date) : undefined);
      setProcurementDate(parseISO(procurement.procurement_date));
      setNotes(procurement.notes || '');
    }
  }, [procurement]);

  // Auto-calculate total when unit price or quantity changes
  useEffect(() => {
    const qty = Number(quantity) || 0;
    const price = Number(unitPrice) || 0;
    if (qty > 0 && price > 0) {
      setTotalAmount(String(qty * price));
    }
  }, [quantity, unitPrice]);

  // Update supplier name when supplierId changes
  useEffect(() => {
    if (supplierId) {
      const supplier = suppliers.find(s => s.id === supplierId);
      setSupplierName(supplier?.name || '');
    } else {
      setSupplierName('');
    }
  }, [supplierId, suppliers]);

  // Handle payment terms change
  const handlePaymentTermsChange = (terms: string) => {
    setPaymentTerms(terms);
    if (terms && procurementDate) {
      const dueDate = calculatePaymentDueDate(terms, procurementDate);
      if (dueDate) {
        setPaymentDueDate(parseISO(dueDate));
      }
    }
  };

  const selectedOrder = orders.find(o => o.id === orderId);

  const handleSave = async () => {
    if (!procurement) return;

    setSaving(true);
    const success = await onSave(procurement.id, {
      product_name: productName,
      product_category: productCategory,
      product_code: productCode || null,
      quantity: Number(quantity),
      unit_price: unitPrice ? Number(unitPrice) : null,
      total_amount: totalAmount ? Number(totalAmount) : null,
      supplier_id: supplierId || null,
      supplier_name: supplierName || null,
      order_id: orderId || null,
      payment_terms: paymentTerms || null,
      payment_due_date: paymentDueDate ? format(paymentDueDate, 'yyyy-MM-dd') : null,
      procurement_date: format(procurementDate, 'yyyy-MM-dd'),
      notes: notes || null,
    });
    setSaving(false);

    if (success) {
      onOpenChange(false);
    }
  };

  const handleUnlinkOrder = () => {
    setOrderId('');
  };

  if (!procurement) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Edit Procurement
            {procurement.procurement_number && (
              <Badge variant="outline" className="font-mono ml-2">
                {procurement.procurement_number}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Order Link Section */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <Label className="text-sm font-medium flex items-center gap-2 mb-3">
              <ShoppingCart className="h-4 w-4" />
              Link to Order
            </Label>
            
            {orderId && selectedOrder ? (
              <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                <div>
                  <Badge variant="secondary" className="gap-1">
                    {selectedOrder.order_number || 'No Order#'}
                  </Badge>
                  <p className="text-sm mt-1">{selectedOrder.product_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedOrder.customer_company}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUnlinkOrder}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="h-4 w-4 mr-1" />
                  Unlink
                </Button>
              </div>
            ) : (
              <Popover open={orderDropdownOpen} onOpenChange={setOrderDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={orderDropdownOpen}
                    className="w-full justify-between"
                  >
                    Select an order to link...
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search orders..." />
                    <CommandList>
                      <CommandEmpty>No orders found.</CommandEmpty>
                      <CommandGroup className="max-h-64 overflow-auto">
                        {orders.slice(0, 50).map((order) => (
                          <CommandItem
                            key={order.id}
                            value={`${order.order_number} ${order.product_name} ${order.customer_company}`}
                            onSelect={() => {
                              setOrderId(order.id);
                              setOrderDropdownOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                orderId === order.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex-1">
                              <span className="font-medium">{order.order_number || 'No Order#'}</span>
                              <span className="text-muted-foreground mx-2">-</span>
                              <span className="truncate">{order.product_name}</span>
                              <p className="text-xs text-muted-foreground">{order.customer_company}</p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Product Details */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Package className="h-4 w-4" />
              Product Details
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Product Name *</Label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Product name"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
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

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Price (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Total Amount (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="Auto-calculated"
                />
              </div>
            </div>
          </div>

          {/* Supplier */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Supplier Details
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={supplierId || "none"} onValueChange={(val) => setSupplierId(val === "none" ? "" : val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {suppliers.filter(s => s.is_active).map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={procurementDate}
                      onSelect={(date) => date && setProcurementDate(date)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Terms</Label>
                <Select value={paymentTerms || "none"} onValueChange={(val) => handlePaymentTermsChange(val === "none" ? "" : val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select terms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
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
                      {paymentDueDate ? format(paymentDueDate, 'dd MMM yyyy') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={paymentDueDate}
                      onSelect={setPaymentDueDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !productName}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
