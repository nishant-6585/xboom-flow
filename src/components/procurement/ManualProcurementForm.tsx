import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInventoryProcurements } from '@/hooks/useInventoryProcurements';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useInventory } from '@/hooks/useInventory';
import { useOrders } from '@/hooks/useOrders';
import { calculatePaymentDueDate } from '@/lib/paymentTerms';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  CalendarIcon, 
  Loader2, 
  Package, 
  Plus, 
  Search, 
  FileText, 
  Upload, 
  X, 
  Image,
  ChevronRight,
  ChevronLeft,
  Check,
  Truck,
  CreditCard,
  Building2,
  IndianRupee
} from 'lucide-react';

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

const STEPS = [
  { id: 1, title: 'Product', icon: Package, description: 'Select product details' },
  { id: 2, title: 'Supplier', icon: Building2, description: 'Choose supplier' },
  { id: 3, title: 'Payment', icon: CreditCard, description: 'Payment terms & status' },
  { id: 4, title: 'Review', icon: Check, description: 'Confirm details' },
];

// Step Indicator Component
function StepIndicator({ 
  currentStep, 
  steps, 
  onStepClick 
}: { 
  currentStep: number; 
  steps: typeof STEPS;
  onStepClick: (step: number) => void;
}) {
  return (
    <div className="w-full">
      {/* Desktop stepper */}
      <div className="hidden md:flex items-center justify-between">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = currentStep > step.id;
          
          return (
            <div key={step.id} className="flex items-center flex-1">
              <button
                type="button"
                onClick={() => onStepClick(step.id)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl transition-all w-full",
                  isActive && "bg-primary/10",
                  isCompleted && "cursor-pointer hover:bg-muted",
                  !isActive && !isCompleted && "opacity-50"
                )}
                disabled={!isCompleted && !isActive}
              >
                <div className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center transition-all shrink-0",
                  isActive && "bg-primary text-primary-foreground shadow-lg",
                  isCompleted && "bg-green-500 text-white",
                  !isActive && !isCompleted && "bg-muted text-muted-foreground"
                )}>
                  {isCompleted ? <Check className="h-5 w-5" /> : <StepIcon className="h-5 w-5" />}
                </div>
                <div className="text-left">
                  <p className={cn(
                    "font-medium text-sm",
                    isActive && "text-primary",
                    isCompleted && "text-green-600",
                    !isActive && !isCompleted && "text-muted-foreground"
                  )}>
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground hidden lg:block">{step.description}</p>
                </div>
              </button>
              {index < steps.length - 1 && (
                <ChevronRight className={cn(
                  "h-5 w-5 mx-2 shrink-0",
                  isCompleted ? "text-green-500" : "text-muted-foreground/30"
                )} />
              )}
            </div>
          );
        })}
      </div>
      
      {/* Mobile stepper */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Step {currentStep} of {steps.length}</span>
          <span className="text-sm text-primary font-medium">{steps[currentStep - 1].title}</span>
        </div>
        <div className="flex gap-1">
          {steps.map((step) => (
            <div 
              key={step.id}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all",
                currentStep >= step.id ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Order Summary Sidebar
function ProcurementSummary({
  productName,
  quantity,
  unitPrice,
  totalAmount,
  gstAmount,
  supplierName,
  paymentStatus,
  priceIncludesGst,
}: {
  productName: string;
  quantity: string;
  unitPrice: string;
  totalAmount: number;
  gstAmount: number;
  supplierName?: string;
  paymentStatus: string;
  priceIncludesGst: boolean;
}) {
  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Package className="h-4 w-4" />
          Procurement Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {productName && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Product</p>
            <p className="text-sm font-medium truncate">{productName}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Quantity</p>
            <p className="text-sm font-medium">{quantity || '0'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Unit Price</p>
            <p className="text-sm font-medium">₹{Number(unitPrice || 0).toLocaleString()}</p>
          </div>
        </div>
        {supplierName && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Supplier</p>
            <p className="text-sm font-medium truncate">{supplierName}</p>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">GST</p>
          <p className="text-sm font-medium">
            ₹{gstAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {priceIncludesGst && <span className="text-xs text-muted-foreground ml-1">(incl.)</span>}
          </p>
        </div>
        <div className="pt-3 border-t border-primary/20">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-bold text-primary flex items-center">
              <IndianRupee className="h-4 w-4" />
              {totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
        <Badge 
          variant="outline" 
          className={cn(
            "w-full justify-center",
            paymentStatus === 'done' && "bg-green-50 text-green-700 border-green-200",
            paymentStatus === 'partial' && "bg-amber-50 text-amber-700 border-amber-200",
            paymentStatus === 'pending' && "bg-muted text-muted-foreground"
          )}
        >
          Payment: {paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1)}
        </Badge>
      </CardContent>
    </Card>
  );
}

export function ManualProcurementForm({ open, onOpenChange }: ManualProcurementFormProps) {
  const { createProcurement } = useInventoryProcurements();
  const { suppliers } = useSuppliers();
  const { inventory } = useInventory();
  const { orders } = useOrders();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

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
  
  // Payment status and screenshot
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [paymentScreenshots, setPaymentScreenshots] = useState<File[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('bank_transfer');
  const [paymentReferenceNumber, setPaymentReferenceNumber] = useState('');
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  
  // GST fields
  const [gstPercent, setGstPercent] = useState('18');
  const [priceIncludesGst, setPriceIncludesGst] = useState(false);

  // Calculate totals with GST
  const baseAmount = Number(quantity || 0) * Number(unitPrice || 0);
  
  const gstAmount = useMemo(() => {
    if (!baseAmount || !gstPercent) return 0;
    const gstRate = Number(gstPercent) / 100;
    if (priceIncludesGst) {
      // Price includes GST, extract GST from total
      return baseAmount - (baseAmount / (1 + gstRate));
    } else {
      // Price excludes GST, calculate GST on top
      return baseAmount * gstRate;
    }
  }, [baseAmount, gstPercent, priceIncludesGst]);

  const totalAmount = useMemo(() => {
    if (priceIncludesGst) {
      // Price already includes GST
      return baseAmount;
    } else {
      // Add GST to base amount
      return baseAmount + gstAmount;
    }
  }, [baseAmount, gstAmount, priceIncludesGst]);

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
    setCurrentStep(1);
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
    setPaymentStatus('pending');
    setPaymentScreenshots([]);
    setPaymentAmount('');
    setPaymentMode('bank_transfer');
    setPaymentReferenceNumber('');
    setGstPercent('18');
    setPriceIncludesGst(false);
  };

  // Screenshot handlers
  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setPaymentScreenshots(prev => [...prev, ...newFiles]);
    }
  };

  const handleRemoveScreenshot = (index: number) => {
    setPaymentScreenshots(prev => prev.filter((_, i) => i !== index));
  };

  // Step validation
  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return productName.trim() && (isInventoryProcurement || selectedOrderId);
      case 2:
        return true; // Supplier is optional
      case 3:
        return true; // Payment details are optional
      case 4:
        return true;
      default:
        return false;
    }
  };

  const goToStep = (step: number) => {
    if (step < currentStep || canGoNext()) {
      setCurrentStep(step);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canGoNext()) {
      return;
    }

    setLoading(true);
    
    const result = await createProcurement({
      procurement_number: null,
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
      payment_status: paymentStatus,
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <span>New Procurement</span>
              <p className="text-sm font-normal text-muted-foreground">Create a procurement entry</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 border-b bg-muted/30">
          <StepIndicator currentStep={currentStep} steps={STEPS} onStepClick={goToStep} />
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <div className="flex gap-6 p-6">
              {/* Main Content */}
              <div className="flex-1 space-y-6">
                {/* Step 1: Product Details */}
                {currentStep === 1 && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Procurement Type Toggle */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Procurement Type</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            className={cn(
                              "p-4 rounded-xl border-2 text-left transition-all",
                              isInventoryProcurement 
                                ? "border-primary bg-primary/5" 
                                : "border-muted hover:border-muted-foreground/50"
                            )}
                            onClick={() => {
                              setIsInventoryProcurement(true);
                              setSelectedOrderId('');
                            }}
                          >
                            <Package className={cn("h-5 w-5 mb-2", isInventoryProcurement && "text-primary")} />
                            <p className={cn("font-medium", isInventoryProcurement && "text-primary")}>
                              Inventory Procurement
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Standalone procurement for stock
                            </p>
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "p-4 rounded-xl border-2 text-left transition-all",
                              !isInventoryProcurement 
                                ? "border-primary bg-primary/5" 
                                : "border-muted hover:border-muted-foreground/50"
                            )}
                            onClick={() => setIsInventoryProcurement(false)}
                          >
                            <FileText className={cn("h-5 w-5 mb-2", !isInventoryProcurement && "text-primary")} />
                            <p className={cn("font-medium", !isInventoryProcurement && "text-primary")}>
                              Order Procurement
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Linked to specific order
                            </p>
                          </button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Order Selection */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center justify-between">
                          <span>
                            Link to Order {!isInventoryProcurement && <span className="text-destructive">*</span>}
                          </span>
                          {selectedOrder && (
                            <Badge variant="secondary">{selectedOrder.order_number || 'No #'}</Badge>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={orderSearch}
                            onChange={(e) => setOrderSearch(e.target.value)}
                            placeholder="Search orders..."
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
                            <SelectValue placeholder="Select an order" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {isInventoryProcurement && (
                              <SelectItem value="none">No order (Inventory only)</SelectItem>
                            )}
                            {filteredOrders.map((order) => (
                              <SelectItem key={order.id} value={order.id}>
                                <span className="font-medium">{order.order_number || 'No #'}</span>
                                <span className="text-muted-foreground mx-1">-</span>
                                <span className="truncate">{order.product_name}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedOrder && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
                            <p className="font-medium text-blue-700 dark:text-blue-300 text-sm mb-2">Order Details Auto-filled</p>
                            <div className="grid grid-cols-2 gap-2 text-xs text-blue-600 dark:text-blue-400">
                              <div>Product: {selectedOrder.product_name}</div>
                              <div>Qty: {selectedOrder.quantity}</div>
                              <div>Customer: {selectedOrder.customer_company}</div>
                              <div>Status: {selectedOrder.status.replace(/_/g, ' ')}</div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Product Details */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Product Details</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {!selectedOrderId && (
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="useExisting"
                              checked={useExistingProduct}
                              onCheckedChange={(checked) => setUseExistingProduct(checked === true)}
                            />
                            <Label htmlFor="useExisting" className="cursor-pointer text-sm">
                              Select from existing inventory
                            </Label>
                          </div>
                        )}

                        {useExistingProduct && !selectedOrderId ? (
                          <div className="space-y-2">
                            <Label>Select Inventory Item</Label>
                            <Select value={selectedInventoryId} onValueChange={setSelectedInventoryId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose an item" />
                              </SelectTrigger>
                              <SelectContent>
                                {inventory.map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.product_name} - Stock: {item.current_stock}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Product Name *</Label>
                              <Input
                                value={productName}
                                onChange={(e) => setProductName(e.target.value)}
                                placeholder="Enter product name"
                                disabled={!!selectedOrderId}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Category</Label>
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

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Quantity *</Label>
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
                              step={0.01}
                              value={unitPrice}
                              onChange={(e) => setUnitPrice(e.target.value)}
                              placeholder="0.00"
                            />
                          </div>
                        </div>

                        {/* GST Section */}
                        <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">GST Details</Label>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="priceIncludesGst"
                                checked={priceIncludesGst}
                                onCheckedChange={(checked) => setPriceIncludesGst(checked === true)}
                              />
                              <Label htmlFor="priceIncludesGst" className="text-sm cursor-pointer">
                                Price includes GST
                              </Label>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>GST %</Label>
                              <Select value={gstPercent} onValueChange={setGstPercent}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">0%</SelectItem>
                                  <SelectItem value="5">5%</SelectItem>
                                  <SelectItem value="12">12%</SelectItem>
                                  <SelectItem value="18">18%</SelectItem>
                                  <SelectItem value="28">28%</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>GST Amount</Label>
                              <div className="h-10 px-3 rounded-md bg-muted flex items-center font-medium text-muted-foreground">
                                ₹{gstAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Base Amount</Label>
                              <div className="h-10 px-3 rounded-md bg-muted flex items-center font-medium text-muted-foreground">
                                ₹{(priceIncludesGst ? baseAmount - gstAmount : baseAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Total Amount */}
                        <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">Total Amount (incl. GST)</span>
                            <span className="text-xl font-bold text-primary flex items-center">
                              <IndianRupee className="h-4 w-4" />
                              {totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Step 2: Supplier */}
                {currentStep === 2 && (
                  <div className="space-y-6 animate-fade-in">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Select Supplier
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Select value={supplierId} onValueChange={setSupplierId}>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder="Choose a supplier" />
                          </SelectTrigger>
                          <SelectContent>
                            {suppliers.filter(s => s.is_active).map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id}>
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <span>{supplier.name}</span>
                                  {supplier.brand_name && (
                                    <Badge variant="outline" className="text-xs">{supplier.brand_name}</Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {selectedSupplier && (
                          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                            <p className="font-medium">{selectedSupplier.name}</p>
                            {selectedSupplier.brand_name && (
                              <p className="text-sm text-muted-foreground">Brand: {selectedSupplier.brand_name}</p>
                            )}
                            {selectedSupplier.mobile && (
                              <p className="text-sm text-muted-foreground">Mobile: {selectedSupplier.mobile}</p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4" />
                          Procurement Date
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal h-12",
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
                            />
                          </PopoverContent>
                        </Popover>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Step 3: Payment */}
                {currentStep === 3 && (
                  <div className="space-y-6 animate-fade-in">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <CreditCard className="h-4 w-4" />
                          Payment Terms
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
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
                              <PopoverContent className="w-auto p-0" align="start">
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
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          Payout Status
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Payment Status</Label>
                            <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="partial">Partial</SelectItem>
                                <SelectItem value="done">Done</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Payment Mode</Label>
                            <Select value={paymentMode} onValueChange={setPaymentMode}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                <SelectItem value="upi">UPI</SelectItem>
                                <SelectItem value="cash">Cash</SelectItem>
                                <SelectItem value="cheque">Cheque</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {(paymentStatus === 'partial' || paymentStatus === 'done') && (
                          <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className="space-y-2">
                              <Label>Amount Paid (₹)</Label>
                              <Input
                                type="number"
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                                placeholder="0.00"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Reference Number</Label>
                              <Input
                                value={paymentReferenceNumber}
                                onChange={(e) => setPaymentReferenceNumber(e.target.value)}
                                placeholder="Transaction ID / UTR"
                              />
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 pt-2">
                          <Label>Payment Screenshots</Label>
                          <div className="flex flex-wrap gap-2">
                            {paymentScreenshots.map((file, index) => (
                              <div key={index} className="relative group">
                                <div className="w-20 h-20 rounded-lg border bg-muted overflow-hidden">
                                  <img
                                    src={URL.createObjectURL(file)}
                                    alt={`Screenshot ${index + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveScreenshot(index)}
                                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => screenshotInputRef.current?.click()}
                              className="w-20 h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                            >
                              <Image className="h-5 w-5" />
                              <span className="text-xs">Add</span>
                            </button>
                            <input
                              ref={screenshotInputRef}
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={handleScreenshotChange}
                              className="hidden"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Step 4: Review */}
                {currentStep === 4 && (
                  <div className="space-y-6 animate-fade-in">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Check className="h-4 w-4" />
                          Review & Confirm
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                            <h4 className="font-medium text-sm flex items-center gap-2">
                              <Package className="h-4 w-4" />
                              Product
                            </h4>
                            <div className="space-y-1 text-sm">
                              <p><span className="text-muted-foreground">Name:</span> {productName}</p>
                              <p><span className="text-muted-foreground">Category:</span> {productCategory}</p>
                              <p><span className="text-muted-foreground">Quantity:</span> {quantity}</p>
                              <p><span className="text-muted-foreground">Unit Price:</span> ₹{Number(unitPrice || 0).toLocaleString()}</p>
                            </div>
                          </div>

                          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                            <h4 className="font-medium text-sm flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              Supplier
                            </h4>
                            <div className="space-y-1 text-sm">
                              <p><span className="text-muted-foreground">Name:</span> {selectedSupplier?.name || 'Not selected'}</p>
                              <p><span className="text-muted-foreground">Date:</span> {format(procurementDate, 'dd MMM yyyy')}</p>
                              {selectedOrder && (
                                <p><span className="text-muted-foreground">Order:</span> {selectedOrder.order_number}</p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <h4 className="font-medium text-sm flex items-center gap-2 mb-3">
                              <CreditCard className="h-4 w-4" />
                              Payment Details
                            </h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <p><span className="text-muted-foreground">Status:</span> {paymentStatus}</p>
                              <p><span className="text-muted-foreground">Mode:</span> {paymentMode.replace('_', ' ')}</p>
                              <p><span className="text-muted-foreground">Terms:</span> {paymentTerms || 'Not set'}</p>
                            </div>
                          </div>

                          <div className="p-4 bg-muted/50 rounded-lg">
                            <h4 className="font-medium text-sm flex items-center gap-2 mb-3">
                              <IndianRupee className="h-4 w-4" />
                              GST Details
                            </h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <p><span className="text-muted-foreground">GST %:</span> {gstPercent}%</p>
                              <p><span className="text-muted-foreground">GST Amount:</span> ₹{gstAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                              <p className="col-span-2">
                                <span className="text-muted-foreground">Price includes GST:</span> {priceIncludesGst ? 'Yes' : 'No'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium">Total Procurement Value</span>
                              <p className="text-xs text-muted-foreground">(Including GST)</p>
                            </div>
                            <span className="text-2xl font-bold text-primary">₹{totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>

                        {isInventoryProcurement && (
                          <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
                            <Checkbox
                              id="addToInventory"
                              checked={addToInventory}
                              onCheckedChange={(checked) => setAddToInventory(checked === true)}
                            />
                            <Label htmlFor="addToInventory" className="cursor-pointer text-sm">
                              Automatically add {quantity} unit(s) to inventory stock
                            </Label>
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label>Notes (Optional)</Label>
                          <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Any additional notes..."
                            rows={2}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>

              {/* Sidebar Summary - Desktop only */}
              <div className="hidden lg:block w-64 shrink-0">
                <div className="sticky top-0">
                  <ProcurementSummary
                    productName={productName}
                    quantity={quantity}
                    unitPrice={unitPrice}
                    totalAmount={totalAmount}
                    gstAmount={gstAmount}
                    supplierName={selectedSupplier?.name}
                    paymentStatus={paymentStatus}
                    priceIncludesGst={priceIncludesGst}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer Navigation */}
          <div className="border-t bg-muted/30 px-6 py-4">
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => currentStep > 1 ? setCurrentStep(currentStep - 1) : onOpenChange(false)}
                className="gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                {currentStep > 1 ? 'Back' : 'Cancel'}
              </Button>

              {currentStep < 4 ? (
                <Button
                  type="button"
                  onClick={() => canGoNext() && setCurrentStep(currentStep + 1)}
                  disabled={!canGoNext()}
                  className="gap-2"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" disabled={loading} className="gap-2">
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Procurement
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
