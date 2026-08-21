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
import { ScrollArea } from '@/components/ui/scroll-area';
import { useInventoryProcurements } from '@/hooks/useInventoryProcurements';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useInventory } from '@/hooks/useInventory';
import { useOrders } from '@/hooks/useOrders';
import { calculatePaymentDueDate } from '@/lib/paymentTerms';
import { supabase } from '@/integrations/supabase/client';
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
  CreditCard,
  Building2,
  IndianRupee,
  Trash2,
  ShoppingCart,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  multiProductProcurementSchema,
  PROCUREMENT_STEP_FIELDS,
} from '@/lib/schemas/procurement';
import { validate, errorsForFields, firstError } from '@/lib/schemas/formErrors';

interface MultiProductProcurementFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProcurementItem {
  id: string;
  productName: string;
  productCategory: string;
  productCode: string;
  quantity: string;
  unitPrice: string;
  gstPercent: string;
  priceIncludesGst: boolean;
  linkType: 'order' | 'inventory';
  orderId: string;
  addToInventory: boolean;
  fulfillFromStock: boolean;
  selectedInventoryId: string;
}

interface InventoryItem {
  id: string;
  product_name: string;
  product_category: string;
  current_stock: number;
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
  { id: 1, title: 'Products', icon: Package, description: 'Add products to procure' },
  { id: 2, title: 'Supplier', icon: Building2, description: 'Choose supplier' },
  { id: 3, title: 'Payment', icon: CreditCard, description: 'Payment terms & status' },
  { id: 4, title: 'Review', icon: Check, description: 'Confirm details' },
];

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

function createEmptyItem(): ProcurementItem {
  return {
    id: crypto.randomUUID(),
    productName: '',
    productCategory: 'Consumer Drones',
    productCode: '',
    quantity: '1',
    unitPrice: '',
    gstPercent: '18',
    priceIncludesGst: false,
    linkType: 'inventory',
    orderId: '',
    addToInventory: true,
    fulfillFromStock: false,
    selectedInventoryId: '',
  };
}

function calculateItemTotal(item: ProcurementItem) {
  const baseAmount = Number(item.quantity || 0) * Number(item.unitPrice || 0);
  const gstRate = Number(item.gstPercent) / 100;
  
  let gstAmount = 0;
  let totalAmount = 0;
  
  if (item.priceIncludesGst) {
    gstAmount = baseAmount - (baseAmount / (1 + gstRate));
    totalAmount = baseAmount;
  } else {
    gstAmount = baseAmount * gstRate;
    totalAmount = baseAmount + gstAmount;
  }
  
  return { baseAmount, gstAmount, totalAmount };
}

interface ProductItemCardProps {
  item: ProcurementItem;
  index: number;
  orders: any[];
  inventory: InventoryItem[];
  onUpdate: (id: string, updates: Partial<ProcurementItem>) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

function ProductItemCard({ item, index, orders, inventory, onUpdate, onRemove, canRemove }: ProductItemCardProps) {
  const [orderSearch, setOrderSearch] = useState('');
  
  const filteredOrders = useMemo(() => {
    if (!orderSearch.trim()) return orders.slice(0, 30);
    const search = orderSearch.toLowerCase();
    return orders.filter(o => 
      o.order_number?.toLowerCase().includes(search) ||
      o.product_name.toLowerCase().includes(search) ||
      o.customer_company.toLowerCase().includes(search)
    ).slice(0, 30);
  }, [orders, orderSearch]);
  
  const selectedOrder = orders.find(o => o.id === item.orderId);
  const { totalAmount, gstAmount } = calculateItemTotal(item);
  
  // Find matching inventory items based on product name/category
  const matchingInventory = useMemo(() => {
    if (!item.productName && !selectedOrder) return [];
    
    const productName = item.productName || selectedOrder?.product_name || '';
    const productCategory = item.productCategory || selectedOrder?.product_category || '';
    
    return inventory.filter(inv => {
      const nameMatch = inv.product_name.toLowerCase().includes(productName.toLowerCase()) ||
                       productName.toLowerCase().includes(inv.product_name.toLowerCase());
      const categoryMatch = !productCategory || inv.product_category === productCategory;
      return nameMatch && categoryMatch && inv.current_stock > 0;
    });
  }, [inventory, item.productName, item.productCategory, selectedOrder]);
  
  const selectedInventory = inventory.find(inv => inv.id === item.selectedInventoryId);
  const hasAvailableStock = matchingInventory.length > 0;
  const requiredQty = Number(item.quantity || 0);
  const availableStock = selectedInventory?.current_stock || 0;
  const canFulfillFully = availableStock >= requiredQty;
  
  // Auto-fill from order
  useEffect(() => {
    if (item.orderId && selectedOrder) {
      onUpdate(item.id, {
        productName: selectedOrder.product_name,
        productCategory: selectedOrder.product_category || 'Consumer Drones',
        productCode: selectedOrder.product_code || '',
        quantity: String(selectedOrder.quantity),
        unitPrice: selectedOrder.procurement_rate ? String(selectedOrder.procurement_rate) : item.unitPrice,
        fulfillFromStock: false,
        selectedInventoryId: '',
      });
    }
  }, [item.orderId]);
  
  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
              {index + 1}
            </div>
            Product Item
          </CardTitle>
          <div className="flex items-center gap-2">
            {!item.fulfillFromStock && (
              <Badge variant="outline" className="text-xs">
                ₹{totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </Badge>
            )}
            {item.fulfillFromStock && (
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                From Stock
              </Badge>
            )}
            {canRemove && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Link Type Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={cn(
              "p-3 rounded-lg border text-left transition-all text-sm",
              item.linkType === 'order' 
                ? "border-primary bg-primary/5" 
                : "border-muted hover:border-muted-foreground/50"
            )}
            onClick={() => {
              onUpdate(item.id, { linkType: 'order', addToInventory: false, fulfillFromStock: false, selectedInventoryId: '' });
            }}
          >
            <ShoppingCart className={cn("h-4 w-4 mb-1", item.linkType === 'order' && "text-primary")} />
            <p className={cn("font-medium text-xs", item.linkType === 'order' && "text-primary")}>
              Link to Order
            </p>
          </button>
          <button
            type="button"
            className={cn(
              "p-3 rounded-lg border text-left transition-all text-sm",
              item.linkType === 'inventory' 
                ? "border-primary bg-primary/5" 
                : "border-muted hover:border-muted-foreground/50"
            )}
            onClick={() => {
              onUpdate(item.id, { linkType: 'inventory', orderId: '', addToInventory: true, fulfillFromStock: false, selectedInventoryId: '' });
            }}
          >
            <Warehouse className={cn("h-4 w-4 mb-1", item.linkType === 'inventory' && "text-primary")} />
            <p className={cn("font-medium text-xs", item.linkType === 'inventory' && "text-primary")}>
              Add to Inventory
            </p>
          </button>
        </div>
        
        {/* Order Selection */}
        {item.linkType === 'order' && (
          <div className="space-y-2">
            <Label className="text-xs">Select Order *</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search orders..."
                className="pl-7 h-8 text-sm"
              />
            </div>
            <Select 
              value={item.orderId} 
              onValueChange={(val) => onUpdate(item.id, { orderId: val, fulfillFromStock: false, selectedInventoryId: '' })}
            >
              <SelectTrigger className={cn("h-8 text-sm", !item.orderId && "border-amber-500")}>
                <SelectValue placeholder="Select an order" />
              </SelectTrigger>
              <SelectContent className="max-h-48">
                {filteredOrders.map((order) => (
                  <SelectItem key={order.id} value={order.id} className="text-sm">
                    <span className="font-medium">{order.order_number || 'No #'}</span>
                    <span className="text-muted-foreground mx-1">-</span>
                    <span className="truncate">{order.product_name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOrder && (
              <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-xs text-blue-600 dark:text-blue-400">
                {selectedOrder.customer_company} • Qty: {selectedOrder.quantity}
              </div>
            )}
            
            {/* Fulfill from Stock Option - Only show when order is selected and matching inventory exists */}
            {item.linkType === 'order' && selectedOrder && hasAvailableStock && (
              <div className="p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-900 space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`stock-${item.id}`}
                    checked={item.fulfillFromStock}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        // Auto-select first matching inventory item
                        onUpdate(item.id, { 
                          fulfillFromStock: true, 
                          selectedInventoryId: matchingInventory[0]?.id || '',
                          unitPrice: '0',
                          addToInventory: false,
                        });
                      } else {
                        onUpdate(item.id, { 
                          fulfillFromStock: false, 
                          selectedInventoryId: '',
                          unitPrice: selectedOrder?.procurement_rate ? String(selectedOrder.procurement_rate) : '',
                        });
                      }
                    }}
                  />
                  <Label htmlFor={`stock-${item.id}`} className="text-xs cursor-pointer font-medium text-green-700 dark:text-green-400">
                    Fulfill from existing inventory stock
                  </Label>
                </div>
                
                {item.fulfillFromStock && (
                  <div className="space-y-2">
                    <Label className="text-xs text-green-700 dark:text-green-400">Select Inventory Item</Label>
                    <Select 
                      value={item.selectedInventoryId} 
                      onValueChange={(val) => onUpdate(item.id, { selectedInventoryId: val })}
                    >
                      <SelectTrigger className="h-8 text-sm bg-white dark:bg-background">
                        <SelectValue placeholder="Select inventory item" />
                      </SelectTrigger>
                      <SelectContent>
                        {matchingInventory.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id} className="text-sm">
                            <span>{inv.product_name}</span>
                            <span className="text-muted-foreground mx-1">•</span>
                            <span className={cn(
                              inv.current_stock >= requiredQty ? "text-green-600" : "text-amber-600"
                            )}>
                              Stock: {inv.current_stock}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {selectedInventory && (
                      <div className={cn(
                        "text-xs p-2 rounded",
                        canFulfillFully 
                          ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" 
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                      )}>
                        {canFulfillFully 
                          ? `✓ Sufficient stock (${availableStock} available, ${requiredQty} needed)`
                          : `⚠ Partial stock (${availableStock} available, ${requiredQty} needed)`
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Option to also add to inventory when linked to order */}
            {!item.fulfillFromStock && (
              <div className="flex items-center space-x-2 p-2 bg-muted/50 rounded mt-2">
                <Checkbox
                  id={`also-inv-${item.id}`}
                  checked={item.addToInventory}
                  onCheckedChange={(checked) => onUpdate(item.id, { addToInventory: checked === true })}
                />
                <Label htmlFor={`also-inv-${item.id}`} className="text-xs cursor-pointer">
                  Also add to inventory stock after procurement
                </Label>
              </div>
            )}
          </div>
        )}
        
        {/* Product Details - Hide pricing fields if fulfilling from stock */}
        {!item.fulfillFromStock && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Product Name *</Label>
                <Input
                  value={item.productName}
                  onChange={(e) => onUpdate(item.id, { productName: e.target.value })}
                  placeholder="Enter product"
                  className="h-8 text-sm"
                  disabled={item.linkType === 'order' && !!item.orderId}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select 
                  value={item.productCategory} 
                  onValueChange={(val) => onUpdate(item.id, { productCategory: val })}
                  disabled={item.linkType === 'order' && !!item.orderId}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat} className="text-sm">{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => onUpdate(item.id, { quantity: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit Price (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.unitPrice}
                  onChange={(e) => onUpdate(item.id, { unitPrice: e.target.value })}
                  className="h-8 text-sm"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">GST %</Label>
                <Select value={item.gstPercent} onValueChange={(val) => onUpdate(item.id, { gstPercent: val })}>
                  <SelectTrigger className="h-8 text-sm">
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
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`gst-${item.id}`}
                  checked={item.priceIncludesGst}
                  onCheckedChange={(checked) => onUpdate(item.id, { priceIncludesGst: checked === true })}
                />
                <Label htmlFor={`gst-${item.id}`} className="text-xs cursor-pointer">
                  Price includes GST
                </Label>
              </div>
              <div className="text-xs text-muted-foreground">
                GST: ₹{gstAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
          </>
        )}
        
        {item.linkType === 'inventory' && (
          <div className="flex items-center space-x-2 p-2 bg-muted/50 rounded">
            <Checkbox
              id={`inv-${item.id}`}
              checked={item.addToInventory}
              onCheckedChange={(checked) => onUpdate(item.id, { addToInventory: checked === true })}
            />
            <Label htmlFor={`inv-${item.id}`} className="text-xs cursor-pointer">
              Add {item.quantity || 0} unit(s) to inventory stock
            </Label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MultiProductProcurementForm({ open, onOpenChange }: MultiProductProcurementFormProps) {
  const { createProcurement } = useInventoryProcurements();
  const { suppliers } = useSuppliers();
  const { inventory, fulfillFromStock: fulfillFromInventory } = useInventory();
  const { orders } = useOrders();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  // Products state
  const [items, setItems] = useState<ProcurementItem[]>([createEmptyItem()]);
  
  // Shared supplier & payment state
  const [supplierId, setSupplierId] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState<Date | undefined>();
  const [procurementDate, setProcurementDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [paymentScreenshots, setPaymentScreenshots] = useState<File[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('bank_transfer');
  const [paymentReferenceNumber, setPaymentReferenceNumber] = useState('');
  const screenshotInputRef = useRef<HTMLInputElement>(null);


  const selectedSupplier = suppliers.find(s => s.id === supplierId);
  
  // Calculate grand total (exclude items being fulfilled from stock)
  const grandTotal = useMemo(() => {
    return items
      .filter(item => !item.fulfillFromStock)
      .reduce((sum, item) => sum + calculateItemTotal(item).totalAmount, 0);
  }, [items]);
  
  const totalGst = useMemo(() => {
    return items
      .filter(item => !item.fulfillFromStock)
      .reduce((sum, item) => sum + calculateItemTotal(item).gstAmount, 0);
  }, [items]);
  
  const stockFulfillItems = useMemo(() => items.filter(item => item.fulfillFromStock), [items]);

  const handleUpdateItem = (id: string, updates: Partial<ProcurementItem>) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleAddItem = () => {
    setItems(prev => [...prev, createEmptyItem()]);
  };

  const handlePaymentTermsChange = (value: string) => {
    setPaymentTerms(value);
    const dueDate = calculatePaymentDueDate(value, procurementDate);
    if (dueDate) {
      setPaymentDueDate(parseISO(dueDate));
    } else {
      setPaymentDueDate(undefined);
    }
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setPaymentScreenshots(prev => [...prev, ...newFiles]);
    }
  };

  const handleRemoveScreenshot = (index: number) => {
    setPaymentScreenshots(prev => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setCurrentStep(1);
    setItems([createEmptyItem()]);
    setSupplierId('');
    setPaymentTerms('');
    setPaymentDueDate(undefined);
    setProcurementDate(new Date());
    setNotes('');
    setPaymentStatus('pending');
    setPaymentScreenshots([]);
    setPaymentAmount('');
    setPaymentMode('bank_transfer');
    setPaymentReferenceNumber('');
  };

  /**
   * Every field in this form is a string in state. Rather than hand-checking a
   * few of them per step, parse the whole thing with zod and slice the errors
   * by step — so quantity/price/GST, order links and payment amounts are all
   * validated before anything reaches the database.
   */
  const validation = useMemo(
    () =>
      validate(multiProductProcurementSchema, {
        items,
        supplierId,
        paymentTerms,
        paymentStatus,
        paymentAmount,
        paymentMode,
        paymentReferenceNumber,
        procurementDate,
        paymentDueDate,
        notes,
      }),
    [
      items,
      supplierId,
      paymentTerms,
      paymentStatus,
      paymentAmount,
      paymentMode,
      paymentReferenceNumber,
      procurementDate,
      paymentDueDate,
      notes,
    ]
  );

  const stepErrors = useMemo(
    () => errorsForFields(validation.errors, PROCUREMENT_STEP_FIELDS[currentStep] ?? []),
    [validation.errors, currentStep]
  );

  // Errors from any step at or before this one — the review step must not let a
  // problem on step 1 through just because step 4 owns no fields.
  const blockingErrors = useMemo(() => {
    const prefixes = Object.entries(PROCUREMENT_STEP_FIELDS)
      .filter(([step]) => Number(step) <= currentStep)
      .flatMap(([, fields]) => fields);
    return errorsForFields(validation.errors, prefixes);
  }, [validation.errors, currentStep]);

  const canGoNext = () => Object.keys(blockingErrors).length === 0;

  const goToStep = (step: number) => {
    if (step < currentStep || canGoNext()) {
      setCurrentStep(step);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Only allow submission from the final review step (step 4)
    if (currentStep !== 4) return;

    // Re-validate the complete form at the boundary. The step gates above are a
    // convenience; this is the guarantee.
    if (!validation.success) {
      toast.error(firstError(validation.errors) ?? 'Please fix the highlighted fields');
      return;
    }

    setLoading(true);
    
    let successCount = 0;
    let stockFulfillCount = 0;
    
    for (const item of items) {
      // Handle fulfill from stock - no procurement record needed
      if (item.fulfillFromStock && item.selectedInventoryId && item.orderId) {
        const selectedInv = inventory.find(inv => inv.id === item.selectedInventoryId);
        if (selectedInv) {
          const success = await fulfillFromInventory(
            selectedInv.product_name,
            selectedInv.product_category,
            Number(item.quantity),
            item.orderId,
            undefined,
            `Fulfilled from stock for order`
          );
          if (success) {
            stockFulfillCount++;
            successCount++;
          }
        }
        continue;
      }
      
      // Create procurement record for non-stock-fulfill items
      const { totalAmount } = calculateItemTotal(item);
      
      const result = await createProcurement({
        procurement_number: null,
        product_name: item.productName,
        product_category: item.productCategory,
        product_code: item.productCode || null,
        quantity: Number(item.quantity),
        unit_price: item.unitPrice ? Number(item.unitPrice) : null,
        total_amount: totalAmount || null,
        supplier_id: supplierId || null,
        supplier_name: selectedSupplier?.name || null,
        payment_terms: paymentTerms || null,
        payment_due_date: paymentDueDate ? format(paymentDueDate, 'yyyy-MM-dd') : null,
        payment_status: paymentStatus,
        procurement_date: format(procurementDate, 'yyyy-MM-dd'),
        notes: notes || null,
        inventory_id: null,
        order_id: item.orderId || null,
      }, item.addToInventory);
      
      if (result) successCount++;
    }

    setLoading(false);

    if (successCount === items.length) {
      const message = stockFulfillCount > 0 
        ? `${stockFulfillCount} fulfilled from stock, ${successCount - stockFulfillCount} procurement(s) created`
        : `${successCount} procurement(s) created successfully`;
      toast.success(message);
      resetForm();
      onOpenChange(false);
    } else if (successCount > 0) {
      toast.warning(`${successCount} of ${items.length} items processed`);
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
              <p className="text-sm font-normal text-muted-foreground">
                Add multiple products • Link to orders or add to inventory
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 border-b bg-muted/30">
          <StepIndicator currentStep={currentStep} steps={STEPS} onStepClick={goToStep} />
        </div>

        <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && currentStep !== 4) e.preventDefault(); }} className="flex-1 overflow-hidden flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* Step 1: Products */}
              {currentStep === 1 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Products to Procure</h3>
                      <p className="text-sm text-muted-foreground">
                        Add products and choose whether to link to an order or add to inventory
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-sm">
                      {items.length} item{items.length !== 1 ? 's' : ''} • ₹{grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </Badge>
                  </div>
                  
                  <div className="space-y-4">
                    {items.map((item, index) => (
                      <ProductItemCard
                        key={item.id}
                        item={item}
                        index={index}
                        orders={orders}
                        inventory={inventory}
                        onUpdate={handleUpdateItem}
                        onRemove={handleRemoveItem}
                        canRemove={items.length > 1}
                      />
                    ))}
                  </div>
                  
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddItem}
                    className="w-full gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Another Product
                  </Button>
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

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Additional Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
                        placeholder="Add any additional instructions, supplier notes, delivery info..."
                        rows={3}
                        maxLength={1000}
                        className="text-sm"
                      />
                      <p className="text-xs text-muted-foreground mt-1 text-right">
                        {notes.length}/1000
                      </p>
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
                        <Package className="h-4 w-4" />
                        Products ({items.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {items.map((item, index) => {
                          const { totalAmount } = calculateItemTotal(item);
                          const order = orders.find(o => o.id === item.orderId);
                          const selectedInv = inventory.find(inv => inv.id === item.selectedInventoryId);
                          return (
                            <div key={item.id} className={cn(
                              "flex items-center justify-between p-3 rounded-lg",
                              item.fulfillFromStock ? "bg-green-50 dark:bg-green-950/30" : "bg-muted/50"
                            )}>
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold",
                                  item.fulfillFromStock ? "bg-green-100 text-green-700" : "bg-primary/10 text-primary"
                                )}>
                                  {index + 1}
                                </div>
                                <div>
                                  <p className="font-medium text-sm">{item.productName}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                    <span>Qty: {item.quantity}</span>
                                    {item.fulfillFromStock && selectedInv && (
                                      <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                                        <Package className="h-3 w-3 mr-1" />
                                        From Stock ({selectedInv.current_stock} avail)
                                      </Badge>
                                    )}
                                    {!item.fulfillFromStock && item.linkType === 'order' && order && (
                                      <Badge variant="outline" className="text-xs">
                                        <ShoppingCart className="h-3 w-3 mr-1" />
                                        {order.order_number}
                                      </Badge>
                                    )}
                                    {item.addToInventory && !item.fulfillFromStock && (
                                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                        <Warehouse className="h-3 w-3 mr-1" />
                                        Add to Stock
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {item.fulfillFromStock ? (
                                <span className="font-medium text-green-700">From Stock</span>
                              ) : (
                                <span className="font-medium">₹{totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-2 gap-4">
                    <Card className="p-4">
                      <h4 className="font-medium text-sm flex items-center gap-2 mb-3">
                        <Building2 className="h-4 w-4" />
                        Supplier
                      </h4>
                      <p className="text-sm">{selectedSupplier?.name || 'Not selected'}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Date: {format(procurementDate, 'dd MMM yyyy')}
                      </p>
                    </Card>

                    <Card className="p-4">
                      <h4 className="font-medium text-sm flex items-center gap-2 mb-3">
                        <CreditCard className="h-4 w-4" />
                        Payment
                      </h4>
                      <p className="text-sm capitalize">{paymentStatus}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {paymentTerms || 'No terms set'}
                      </p>
                    </Card>
                  </div>

                  {stockFulfillItems.length > 0 && (
                    <Card className="p-4 bg-green-50 dark:bg-green-950/30 border-green-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-green-700 dark:text-green-400">
                            Fulfill from Stock
                          </span>
                          <p className="text-xs text-green-600 dark:text-green-500">
                            {stockFulfillItems.length} item(s) from existing inventory
                          </p>
                        </div>
                        <Badge className="bg-green-600">No Cost</Badge>
                      </div>
                    </Card>
                  )}

                  <Card className="p-4 bg-primary/10 border-primary/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">Total Procurement Value</span>
                        <p className="text-xs text-muted-foreground">
                          {grandTotal > 0 ? `GST: ₹${totalGst.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'No new procurement cost'}
                        </p>
                      </div>
                      <span className="text-2xl font-bold text-primary flex items-center">
                        <IndianRupee className="h-5 w-5" />
                        {grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </Card>

                  {notes && (
                    <Card className="p-4">
                      <h4 className="font-medium text-sm flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4" />
                        Additional Details
                      </h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{notes}</p>
                    </Card>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer Navigation */}
          <div className="border-t bg-muted/30 px-6 py-4">
            {Object.keys(currentStep === 4 ? blockingErrors : stepErrors).length > 0 && (
              <div
                role="alert"
                className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2"
              >
                <ul className="space-y-0.5 text-sm text-destructive">
                  {Object.entries(currentStep === 4 ? blockingErrors : stepErrors)
                    .slice(0, 4)
                    .map(([field, message]) => (
                      <li key={field}>{message}</li>
                    ))}
                </ul>
              </div>
            )}
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
                  title={firstError(stepErrors) ?? undefined}
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
                      Create {items.length} Procurement{items.length !== 1 ? 's' : ''}
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
