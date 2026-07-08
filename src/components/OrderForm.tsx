import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { OrderFormData, ORDER_TYPES, CUSTOMER_TYPES, PAYMENT_STATUSES, LEAD_SOURCES, OrderType, CustomerType, PaymentStatus, LeadSource, Order } from '@/hooks/useOrders';
import { PAYMENT_MODES, isScreenshotRequired, getScreenshotHint, type PaymentMode } from '@/lib/paymentModes';
import { Loader2, Package, ImageIcon, X, Upload, FileText, Plus, Users, CreditCard, Truck, MessageSquare, Check, ChevronRight, ChevronLeft, ShoppingCart } from 'lucide-react';
import { Enquiry, PRODUCT_CATEGORIES } from '@/hooks/useEnquiries';
import { Supplier } from '@/hooks/useSuppliers';
import { OrderItemsInput } from '@/components/OrderItemsInput';
import { OrderItemFormData } from '@/hooks/useOrderItems';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { isValidHttpUrl } from '@/lib/urlValidation';
import { COURIER_NAMES, buildTrackingUrl } from '@/lib/courierTracking';
import { CourierCombobox } from '@/components/CourierCombobox';
import { Checkbox } from '@/components/ui/checkbox';
import { GenerateProformaDialog } from '@/components/orders/GenerateProformaDialog';

const KNOWN_COURIER_HOSTS = COURIER_NAMES
  .map((cn) => {
    const u = buildTrackingUrl(cn, '1');
    try { return u ? new URL(u).hostname : ''; } catch { return ''; }
  })
  .filter(Boolean);

const isKnownCourierUrl = (url: string | null | undefined) =>
  !!url && KNOWN_COURIER_HOSTS.some((h) => url.includes(h));

interface FileWithPreview {
  file: File;
  preview: string;
  id: string;
}

interface SalesTeamMember {
  user_id: string;
  name: string;
}

export interface OrderFormInitialData {
  customer_name?: string;
  customer_company?: string;
  customer_email?: string;
  customer_phone?: string;
  product_name?: string;
  product_category?: string;
  product_code?: string;
  quantity?: number;
  selling_price?: number;
  total_sales_amount?: number;
  sales_person_id?: string;
  sales_person_name?: string;
  lead_source?: string;
  customer_notes?: string;
  internal_notes?: string;
  source_pipeline_id?: string;
  source_prospect_id?: string;
}

interface OrderFormProps {
  onSubmit: (data: OrderFormData, paymentFiles?: File[], orderItems?: OrderItemFormData[], invoiceFile?: File, poFiles?: File[]) => Promise<Order | boolean | null>;
  enquiries?: Enquiry[];
  suppliers?: Supplier[];
  showProcurementRate?: boolean;
  userRole?: 'sales' | 'sales_manager' | 'supply_chain' | 'admin';
  preSelectEnquiryId?: string;
  initialData?: OrderFormInitialData;
  embedded?: boolean;
}

const STEPS = [
  { id: 1, title: 'Products', icon: ShoppingCart, description: 'Add order items' },
  { id: 2, title: 'Customer', icon: Users, description: 'Customer details' },
  { id: 3, title: 'Payment', icon: CreditCard, description: 'Payment info' },
  { id: 4, title: 'Delivery', icon: Truck, description: 'Shipping & notes' },
];

export function OrderForm({ onSubmit, enquiries = [], suppliers = [], showProcurementRate = true, userRole = 'sales', preSelectEnquiryId, initialData, embedded = false }: OrderFormProps) {
  const canViewProcurement = userRole === 'admin' || userRole === 'supply_chain';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [salesTeam, setSalesTeam] = useState<SalesTeamMember[]>([]);
  const [currentStep, setCurrentStep] = useState(1);

  useEffect(() => {
    const fetchSalesTeam = async () => {
      const { data, error } = await supabase.rpc('get_sales_team');
      if (!error && data) {
        setSalesTeam(data);
      }
    };
    fetchSalesTeam();
  }, []);

  // Auto-select enquiry if preSelectEnquiryId is provided (e.g. from "Convert to Order" flow)
  useEffect(() => {
    if (preSelectEnquiryId && enquiries.length > 0) {
      const enquiry = enquiries.find(e => e.id === preSelectEnquiryId);
      if (enquiry) {
        setFormData(prev => ({
          ...prev,
          enquiry_id: preSelectEnquiryId,
          product_name: enquiry.product_name,
          product_category: enquiry.product_category,
          quantity: enquiry.quantity,
          customer_name: enquiry.customer_name,
          customer_company: enquiry.customer_company,
          sales_person_id: enquiry.sales_person_id || '',
          sales_person_name: enquiry.sales_person_name,
          committed_timeline: enquiry.requested_timeline || '',
        }));
        setOrderItems([{
          product_name: enquiry.product_name,
          product_code: enquiry.product_code,
          product_category: enquiry.product_category,
          quantity: enquiry.quantity,
          unit_price: undefined,
          procurement_rate: undefined,
          notes: '',
        }]);
      }
    }
  }, [preSelectEnquiryId, enquiries]);
  
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const poInputRef = useRef<HTMLInputElement>(null);
  const [paymentFiles, setPaymentFiles] = useState<FileWithPreview[]>([]);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);
  const [poFiles, setPoFiles] = useState<FileWithPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [generateProforma, setGenerateProforma] = useState(false);
  const [createdOrderForProforma, setCreatedOrderForProforma] = useState<Order | null>(null);
  const [proformaDialogOpen, setProformaDialogOpen] = useState(false);
  const [pendingReset, setPendingReset] = useState<null | (() => void)>(null);
  const [orderItems, setOrderItems] = useState<OrderItemFormData[]>([
    {
      product_name: initialData?.product_name || '',
      product_code: initialData?.product_code || '',
      product_category: initialData?.product_category || 'Consumer Drones',
      quantity: initialData?.quantity || 1,
      unit_price: initialData?.selling_price || undefined,
      procurement_rate: undefined,
      notes: '',
    }
  ]);
  const [formData, setFormData] = useState<OrderFormData>({
    product_name: initialData?.product_name || '',
    product_category: initialData?.product_category || 'Consumer Drones',
    quantity: initialData?.quantity || 1,
    customer_name: initialData?.customer_name || '',
    customer_company: initialData?.customer_company || '',
    customer_email: initialData?.customer_email || '',
    customer_phone: initialData?.customer_phone || '',
    customer_gst: '',
    sales_person_id: initialData?.sales_person_id || '',
    sales_person_name: initialData?.sales_person_name || '',
    is_website_order: false,
    shipping_address: '',
    order_type: 'prepaid',
    customer_type: 'b2b',
    lead_source: (initialData?.lead_source as LeadSource) || undefined,
    supplier_id: undefined,
    supplier_name: '',
    supplier_contact: '',
    procurement_rate: undefined,
    procurement_currency: 'INR',
    selling_price: initialData?.selling_price || undefined,
    total_sales_amount: initialData?.total_sales_amount || undefined,
    discount_amount: undefined,
    amount_paid: undefined,
    delivery_charges: undefined,
    payment_terms: '',
    payment_status: 'pending',
    payment_due_date: '',
    payment_mode: undefined,
    tracking_number: '',
    tracking_url: '',
    courier_name: '',
    committed_timeline: '',
    estimated_delivery: '',
    internal_notes: initialData?.internal_notes || '',
    customer_notes: initialData?.customer_notes || '',
    sales_notes: '',
  });

  // Auto-calculate total sales amount from order items + delivery charges - discount
  useEffect(() => {
    const itemsTotal = orderItems.reduce((sum, item) => {
      const price = item.unit_price || 0;
      const qty = item.quantity || 0;
      const base = price * qty;
      // If price already includes GST, don't add GST again.
      // Otherwise add per-unit GST amount * qty.
      const gst = item.sales_price_includes_gst
        ? 0
        : (item.sales_gst_amount || 0) * qty;
      return sum + base + gst;
    }, 0);
    const delivery = formData.delivery_charges || 0;
    const discount = formData.discount_amount || 0;
    const total = itemsTotal + delivery - discount;
    
    setFormData(prev => ({
      ...prev,
      total_sales_amount: total > 0 ? total : undefined
    }));
  }, [orderItems, formData.delivery_charges, formData.discount_amount]);

  const respondedEnquiries = enquiries.filter(e => 
    e.status === 'responded' || e.status === 'moved_to_pipeline' || e.status === 'pending'
  );
  const activeSuppliers = suppliers.filter(s => s.is_active);

  const handleSupplierSelect = (supplierId: string) => {
    if (supplierId === 'none') {
      setFormData(prev => ({
        ...prev,
        supplier_id: undefined,
        supplier_name: '',
        supplier_contact: '',
      }));
      return;
    }

    const supplier = suppliers.find(s => s.id === supplierId);
    if (supplier) {
      setFormData(prev => ({
        ...prev,
        supplier_id: supplierId,
        supplier_name: supplier.name,
        supplier_contact: supplier.phone || supplier.email || '',
      }));
    }
  };

  const handleEnquirySelect = (enquiryId: string) => {
    if (enquiryId === 'none') {
      setFormData(prev => ({
        ...prev,
        enquiry_id: undefined,
      }));
      return;
    }

    const enquiry = enquiries.find(e => e.id === enquiryId);
    if (enquiry) {
      setFormData(prev => ({
        ...prev,
        enquiry_id: enquiryId,
        product_name: enquiry.product_name,
        product_category: enquiry.product_category,
        quantity: enquiry.quantity,
        customer_name: enquiry.customer_name,
        customer_company: enquiry.customer_company,
        sales_person_id: enquiry.sales_person_id || '',
        sales_person_name: enquiry.sales_person_name,
        committed_timeline: enquiry.requested_timeline || '',
      }));
      setOrderItems([{
        product_name: enquiry.product_name,
        product_code: enquiry.product_code,
        product_category: enquiry.product_category,
        quantity: enquiry.quantity,
        unit_price: undefined,
        procurement_rate: undefined,
        notes: '',
      }]);
    }
  };

  const handlePaymentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      Array.from(selectedFiles).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPaymentFiles(prev => [...prev, {
            file,
            preview: reader.result as string,
            id: `${Date.now()}-${Math.random().toString(36).substring(7)}`
          }]);
        };
        reader.readAsDataURL(file);
      });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemovePaymentFile = (id: string) => {
    setPaymentFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleClearPaymentFiles = () => {
    setPaymentFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleInvoiceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setInvoiceFile(selectedFile);
      setInvoicePreview(selectedFile.name);
    }
  };

  const handleClearInvoiceFile = () => {
    setInvoiceFile(null);
    setInvoicePreview(null);
    if (invoiceInputRef.current) {
      invoiceInputRef.current.value = '';
    }
  };

  const handlePoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      Array.from(selectedFiles).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPoFiles(prev => [...prev, {
            file,
            preview: file.name,
            id: `${Date.now()}-${Math.random().toString(36).substring(7)}`
          }]);
        };
        reader.readAsDataURL(file);
      });
    }
    if (poInputRef.current) {
      poInputRef.current.value = '';
    }
  };

  const handleRemovePoFile = (id: string) => {
    setPoFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleClearPoFiles = () => {
    setPoFiles([]);
    if (poInputRef.current) {
      poInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validItems = orderItems.filter(item => item.product_name.trim());
    if (validItems.length === 0) {
      return;
    }
    
    if (!formData.customer_name || (!formData.is_website_order && !formData.sales_person_name)) {
      return;
    }

    // Mobile is mandatory — required for MSG91 SMS updates to customers
    const phoneDigits = (formData.customer_phone || '').replace(/\D/g, '');
    if (!formData.customer_phone || phoneDigits.length < 10 || phoneDigits.length > 15) {
      toast.error('Customer mobile is required (10–15 digits). It is used to send SMS order updates.');
      return;
    }

    if (formData.tracking_url && !isValidHttpUrl(formData.tracking_url)) {
      toast.error('Tracking URL must be a valid link starting with http:// or https://');
      return;
    }

    // Payment-mode gating: modes like UPI / NEFT / cheque MUST come with proof
    // when an initial payment is captured. Cash is proof-optional. Leaving the
    // mode blank is allowed (order can be created before any payment exists).
    const amtPaid = formData.amount_paid ?? 0;
    if (amtPaid > 0 && formData.payment_mode) {
      const needsProof = isScreenshotRequired(formData.payment_mode as PaymentMode);
      if (needsProof && paymentFiles.length === 0) {
        toast.error(`Payment screenshot is required for ${formData.payment_mode.toUpperCase()}. Cash payments don't need one.`);
        return;
      }
    }

    const firstItem = validItems[0];
    const updatedFormData = {
      ...formData,
      product_name: firstItem.product_name,
      product_category: firstItem.product_category,
      quantity: validItems.reduce((sum, item) => sum + item.quantity, 0),
    };

    setLoading(true);
    const paymentFilesArray = paymentFiles.length > 0 ? paymentFiles.map(f => f.file) : undefined;
    const poFilesArray = poFiles.length > 0 ? poFiles.map(f => f.file) : undefined;
    const result = await onSubmit(updatedFormData, paymentFilesArray, validItems, invoiceFile || undefined, poFilesArray);
    setLoading(false);

    const success = !!result;
    const createdOrder = (result && typeof result === 'object') ? (result as Order) : null;

    const doReset = () => {
      setFormData({
        product_name: '',
        product_category: 'Consumer Drones',
        quantity: 1,
        customer_name: '',
        customer_company: '',
        customer_email: '',
        customer_phone: '',
        sales_person_id: '',
        sales_person_name: '',
        shipping_address: '',
        order_type: 'prepaid',
        customer_type: 'b2b',
        lead_source: undefined,
        supplier_id: undefined,
        supplier_name: '',
        supplier_contact: '',
        procurement_rate: undefined,
        procurement_currency: 'INR',
        selling_price: undefined,
        total_sales_amount: undefined,
        amount_paid: undefined,
        delivery_charges: undefined,
        payment_terms: '',
        payment_status: 'pending',
        payment_due_date: '',
        payment_mode: undefined,
        tracking_number: '',
        tracking_url: '',
        courier_name: '',
        committed_timeline: '',
        estimated_delivery: '',
        internal_notes: '',
        customer_notes: '',
        sales_notes: '',
      });
      setOrderItems([{
        product_name: '',
        product_code: '',
        product_category: 'Consumer Drones',
        quantity: 1,
        unit_price: undefined,
        procurement_rate: undefined,
        notes: '',
      }]);
      handleClearPaymentFiles();
      handleClearInvoiceFile();
      handleClearPoFiles();
      setCurrentStep(1);
    };

    if (success) {
      if (generateProforma && createdOrder) {
        setCreatedOrderForProforma(createdOrder);
        setProformaDialogOpen(true);
        setPendingReset(() => doReset);
      } else {
        doReset();
      }
    }
  };

  const canGoNext = () => {
    if (currentStep === 1) {
      return orderItems.some(item => item.product_name.trim());
    }
    if (currentStep === 2) {
      const phoneDigits = (formData.customer_phone || '').replace(/\D/g, '');
      return !!formData.customer_name &&
             (formData.is_website_order || !!formData.sales_person_name) &&
             phoneDigits.length >= 10 && phoneDigits.length <= 15;
    }
    return true;
  };

  const goToStep = (step: number) => {
    if (step < currentStep || canGoNext()) {
      setCurrentStep(step);
    }
  };

  const totalItems = orderItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const totalAmount = formData.total_sales_amount || 0;

  // Step Progress Indicator
  const StepIndicator = () => (
    <div className="mb-6">
      {/* Desktop Steps */}
      <div className="hidden md:flex items-center justify-between">
        {STEPS.map((step, index) => {
          const isActive = currentStep === step.id;
          const isCompleted = currentStep > step.id;
          const Icon = step.icon;
          
          return (
            <div key={step.id} className="flex items-center flex-1">
              <button
                type="button"
                onClick={() => goToStep(step.id)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl transition-all w-full",
                  isActive && "bg-primary/10 border-2 border-primary",
                  isCompleted && "bg-green-50 dark:bg-green-900/20",
                  !isActive && !isCompleted && "hover:bg-muted"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors",
                  isActive && "bg-primary text-primary-foreground",
                  isCompleted && "bg-green-500 text-white",
                  !isActive && !isCompleted && "bg-muted text-muted-foreground"
                )}>
                  {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <div className="text-left min-w-0">
                  <p className={cn(
                    "font-medium text-sm truncate",
                    isActive && "text-primary",
                    isCompleted && "text-green-600 dark:text-green-400"
                  )}>
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                </div>
              </button>
              {index < STEPS.length - 1 && (
                <div className={cn(
                  "h-0.5 w-8 mx-2 shrink-0",
                  currentStep > step.id ? "bg-green-500" : "bg-border"
                )} />
              )}
            </div>
          );
        })}
      </div>
      
      {/* Mobile Steps */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((step, index) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            
            return (
              <div key={step.id} className="flex items-center flex-1">
                <button
                  type="button"
                  onClick={() => goToStep(step.id)}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                    isActive && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                    isCompleted && "bg-green-500 text-white",
                    !isActive && !isCompleted && "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : step.id}
                </button>
                {index < STEPS.length - 1 && (
                  <div className={cn(
                    "h-0.5 flex-1 mx-1",
                    currentStep > step.id ? "bg-green-500" : "bg-border"
                  )} />
                )}
              </div>
            );
          })}
        </div>
        <div className="text-center">
          <p className="font-medium text-sm">{STEPS[currentStep - 1].title}</p>
          <p className="text-xs text-muted-foreground">{STEPS[currentStep - 1].description}</p>
        </div>
      </div>
    </div>
  );

  // Order Summary Card
  const OrderSummary = () => (
    <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl p-4 border border-primary/20">
      <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        Order Summary
      </h4>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Items</span>
          <span className="font-medium">{orderItems.filter(i => i.product_name).length} products</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Quantity</span>
          <span className="font-medium">{totalItems} units</span>
        </div>
        {formData.delivery_charges && formData.delivery_charges > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Delivery</span>
            <span className="font-medium">₹{formData.delivery_charges.toLocaleString()}</span>
          </div>
        )}
        <Separator className="my-2" />
        <div className="flex justify-between text-base">
          <span className="font-medium">Total Amount</span>
          <span className="font-bold text-primary">₹{totalAmount.toLocaleString()}</span>
        </div>
        {formData.customer_name && (
          <>
            <Separator className="my-2" />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium truncate ml-2">{formData.customer_name}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );

  const formBody = (
    <>
    <form onSubmit={handleSubmit}>
      <StepIndicator />
          
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Main Form Area */}
            <div className="xl:col-span-2 space-y-6">
              {/* Step 1: Products */}
              {currentStep === 1 && (
                <div className="space-y-6 animate-fade-in">
                  {/* Link to Enquiry */}
                  {respondedEnquiries.length > 0 && (
                    <div className="p-4 bg-muted/50 rounded-xl space-y-3">
                      <Label className="text-sm font-medium">Quick Fill from Enquiry</Label>
                      <Select onValueChange={handleEnquirySelect}>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Select an enquiry to auto-fill..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Create Standalone Order</SelectItem>
                          {respondedEnquiries.map(enquiry => (
                            <SelectItem key={enquiry.id} value={enquiry.id}>
                              {enquiry.product_name} - {enquiry.customer_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Product Items */}
                  <OrderItemsInput
                    items={orderItems}
                    onChange={setOrderItems}
                    disabled={loading}
                    showProcurementRate={showProcurementRate}
                  />
                </div>
              )}

              {/* Step 2: Customer Details */}
              {currentStep === 2 && (
                <div className="space-y-5 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="customer_name">Customer Name *</Label>
                      <Input
                        id="customer_name"
                        value={formData.customer_name}
                        onChange={e => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                        required
                        disabled={loading}
                        placeholder="Enter customer name"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer_company">Company Name <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                      <Input
                        id="customer_company"
                        value={formData.customer_company}
                        onChange={e => setFormData(prev => ({ ...prev, customer_company: e.target.value }))}
                        disabled={loading}
                        placeholder="Enter company name (optional for B2C)"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer_email">Email</Label>
                      <Input
                        id="customer_email"
                        type="email"
                        value={formData.customer_email || ''}
                        onChange={e => setFormData(prev => ({ ...prev, customer_email: e.target.value }))}
                        disabled={loading}
                        placeholder="customer@example.com"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer_phone">
                        Mobile <span className="text-destructive">*</span>{' '}
                        <span className="text-muted-foreground text-xs">(required — used for MSG91 SMS order updates)</span>
                      </Label>
                      <Input
                        id="customer_phone"
                        type="tel"
                        inputMode="tel"
                        pattern="^\+?[0-9 \-]{7,20}$"
                        value={formData.customer_phone || ''}
                        onChange={e => setFormData(prev => ({ ...prev, customer_phone: e.target.value }))}
                        disabled={loading}
                        placeholder="+91 98765 43210"
                        required
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Customer Type</Label>
                      <Select 
                        value={formData.customer_type} 
                        onValueChange={v => setFormData(prev => ({ ...prev, customer_type: v as CustomerType }))}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CUSTOMER_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="customer_gst">GST Number <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                      <Input
                        id="customer_gst"
                        value={formData.customer_gst || ''}
                        onChange={e => setFormData(prev => ({ ...prev, customer_gst: e.target.value.toUpperCase() }))}
                        disabled={loading}
                        placeholder="e.g., 29ABCDE1234F1Z5"
                        maxLength={15}
                        className="h-11"
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label>Order Source</Label>
                    <RadioGroup
                      value={formData.is_website_order ? 'website' : 'sales'}
                      onValueChange={(value) => {
                        const isWebsite = value === 'website';
                        setFormData(prev => ({
                          ...prev,
                          is_website_order: isWebsite,
                          ...(isWebsite ? { sales_person_id: '', sales_person_name: 'Website Order' } : { sales_person_name: '' }),
                        }));
                      }}
                      className="grid grid-cols-2 gap-4"
                    >
                      <label
                        htmlFor="sales_order"
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                          !formData.is_website_order ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
                        )}
                      >
                        <RadioGroupItem value="sales" id="sales_order" />
                        <div>
                          <p className="font-medium">Sales Order</p>
                          <p className="text-xs text-muted-foreground">From sales team</p>
                        </div>
                      </label>
                      <label
                        htmlFor="website_order"
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                          formData.is_website_order ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
                        )}
                      >
                        <RadioGroupItem value="website" id="website_order" />
                        <div>
                          <p className="font-medium">Website Order</p>
                          <p className="text-xs text-muted-foreground">Online purchase</p>
                        </div>
                      </label>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label>Sales Person {!formData.is_website_order && '*'}</Label>
                    <Select
                      value={formData.sales_person_id || ''}
                      onValueChange={(value) => {
                        const member = salesTeam.find(m => m.user_id === value);
                        if (member) {
                          setFormData(prev => ({
                            ...prev,
                            sales_person_id: member.user_id,
                            sales_person_name: member.name,
                          }));
                        }
                      }}
                      disabled={loading}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder={formData.is_website_order ? "Optional - Select sales person" : "Select sales person"} />
                      </SelectTrigger>
                      <SelectContent>
                        {salesTeam.map(member => (
                          <SelectItem key={member.user_id} value={member.user_id}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Committed Timeline</Label>
                      <Input
                        value={formData.committed_timeline || ''}
                        onChange={e => setFormData(prev => ({ ...prev, committed_timeline: e.target.value }))}
                        disabled={loading}
                        placeholder="e.g., 2-3 weeks"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Lead Source</Label>
                      <Select 
                        value={formData.lead_source || ''} 
                        onValueChange={v => setFormData(prev => ({ ...prev, lead_source: v as LeadSource }))}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_SOURCES.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Shipping Address</Label>
                    <Textarea
                      value={formData.shipping_address || ''}
                      onChange={e => setFormData(prev => ({ ...prev, shipping_address: e.target.value }))}
                      disabled={loading}
                      rows={2}
                      placeholder="Full shipping address"
                      className="resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Payment Details */}
              {currentStep === 3 && (
                <div className="space-y-5 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Order Type</Label>
                      <Select 
                        value={formData.order_type} 
                        onValueChange={v => setFormData(prev => ({ ...prev, order_type: v as OrderType }))}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ORDER_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Status</Label>
                      <Select 
                        value={formData.payment_status} 
                        onValueChange={v => setFormData(prev => ({ ...prev, payment_status: v as PaymentStatus }))}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_STATUSES.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Payment Mode — optional at creation. Feeds the initial
                      payment_records row so Finance can see how the first
                      receipt came in. Cash needs no screenshot; digital modes
                      still require proof (enforced on submit). */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Payment Mode (optional)</Label>
                      <Select
                        value={formData.payment_mode ?? 'none'}
                        onValueChange={v => setFormData(prev => ({
                          ...prev,
                          payment_mode: v === 'none' ? undefined : (v as PaymentMode),
                        }))}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Not captured yet" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not captured yet</SelectItem>
                          {PAYMENT_MODES.map(m => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formData.payment_mode && (
                        <p className="text-xs text-muted-foreground">
                          {getScreenshotHint(formData.payment_mode as PaymentMode)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Total Amount (₹)</Label>
                      <Input
                        type="number"
                        value={formData.total_sales_amount || ''}
                        readOnly
                        className="h-11 bg-muted font-medium"
                      />
                      <p className="text-xs text-muted-foreground">Auto-calculated</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Amount Paid (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData.amount_paid || ''}
                        onChange={e => setFormData(prev => ({ ...prev, amount_paid: parseFloat(e.target.value) || undefined }))}
                        disabled={loading}
                        className="h-11"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Delivery Charges (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData.delivery_charges || ''}
                        onChange={e => setFormData(prev => ({ ...prev, delivery_charges: parseFloat(e.target.value) || undefined }))}
                        disabled={loading}
                        className="h-11"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Discount (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={formData.discount_amount || ''}
                        onChange={e => setFormData(prev => ({ ...prev, discount_amount: parseFloat(e.target.value) || undefined }))}
                        disabled={loading}
                        className="h-11"
                        placeholder="0"
                      />
                      <p className="text-xs text-muted-foreground">Subtracted from total</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Payment Terms</Label>
                      <Input
                        value={formData.payment_terms || ''}
                        onChange={e => setFormData(prev => ({ ...prev, payment_terms: e.target.value }))}
                        disabled={loading}
                        placeholder="e.g., 50% advance"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Due Date</Label>
                      <Input
                        type="date"
                        value={formData.payment_due_date || ''}
                        onChange={e => setFormData(prev => ({ ...prev, payment_due_date: e.target.value }))}
                        disabled={loading}
                        className="h-11"
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* File Uploads */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Payment Screenshots */}
                    <div className="space-y-3">
                      <Label className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          Payment Screenshots ({paymentFiles.length})
                        </span>
                        {paymentFiles.length > 0 && (
                          <Button type="button" variant="ghost" size="sm" onClick={handleClearPaymentFiles} disabled={loading} className="h-6 text-xs">
                            Clear
                          </Button>
                        )}
                      </Label>
                      
                      {paymentFiles.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {paymentFiles.map((fileItem) => (
                            <div key={fileItem.id} className="relative group">
                              <img src={fileItem.preview} alt="Payment" className="w-full h-16 object-cover rounded-lg border" />
                              <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => handleRemovePaymentFile(fileItem.id)} disabled={loading}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 transition-colors" onClick={() => fileInputRef.current?.click()}>
                        <ImageIcon className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                        <p className="text-xs text-muted-foreground">Click to upload</p>
                      </div>
                      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePaymentFileChange} className="hidden" />
                    </div>

                    {/* Invoice & PO */}
                    <div className="space-y-4">
                      {/* Invoice */}
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Invoice
                        </Label>
                        {invoicePreview ? (
                          <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm flex-1 truncate">{invoicePreview}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={handleClearInvoiceFile} disabled={loading}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="border-2 border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:border-primary/50" onClick={() => invoiceInputRef.current?.click()}>
                            <p className="text-xs text-muted-foreground">Upload invoice</p>
                          </div>
                        )}
                        <input ref={invoiceInputRef} type="file" accept=".pdf,image/*" onChange={handleInvoiceFileChange} className="hidden" />
                        <div className="flex items-start gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
                          <Checkbox
                            id="generate-proforma"
                            checked={generateProforma}
                            onCheckedChange={(v) => setGenerateProforma(v === true)}
                            className="mt-0.5"
                          />
                          <div className="space-y-0.5">
                            <Label htmlFor="generate-proforma" className="text-sm font-medium cursor-pointer">
                              Generate Proforma Invoice
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Opens the proforma editor right after the order is created.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* PO */}
                      <div className="space-y-2">
                        <Label className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            PO Documents ({poFiles.length})
                          </span>
                          {poFiles.length > 0 && (
                            <Button type="button" variant="ghost" size="sm" onClick={handleClearPoFiles} disabled={loading} className="h-6 text-xs">
                              Clear
                            </Button>
                          )}
                        </Label>
                        
                        {poFiles.length > 0 && (
                          <div className="space-y-1 max-h-20 overflow-y-auto">
                            {poFiles.map((fileItem) => (
                              <div key={fileItem.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted text-sm">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="flex-1 truncate">{fileItem.preview}</span>
                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemovePoFile(fileItem.id)} disabled={loading}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="border-2 border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:border-primary/50" onClick={() => poInputRef.current?.click()}>
                          <p className="text-xs text-muted-foreground">{poFiles.length > 0 ? 'Add more' : 'Upload PO'}</p>
                        </div>
                        <input ref={poInputRef} type="file" accept=".pdf,image/*" multiple onChange={handlePoFileChange} className="hidden" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Delivery & Notes */}
              {currentStep === 4 && (
                <div className="space-y-5 animate-fade-in">
                  {/* Tracking Details */}
                  {canViewProcurement && (
                    <div className="space-y-4">
                      <h4 className="font-medium flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        Tracking Details
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Tracking Number</Label>
                          <Input
                            value={formData.tracking_number || ''}
                            onChange={e => {
                              const tracking_number = e.target.value;
                              setFormData(prev => {
                                const generated = buildTrackingUrl(prev.courier_name, tracking_number);
                                const keepExisting =
                                  prev.tracking_url && !isKnownCourierUrl(prev.tracking_url);
                                return {
                                  ...prev,
                                  tracking_number,
                                  tracking_url: keepExisting || !generated ? prev.tracking_url : generated,
                                };
                              });
                            }}
                            disabled={loading}
                            placeholder="Enter tracking number"
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Tracking URL</Label>
                          <Input
                            type="url"
                            value={formData.tracking_url || ''}
                            onChange={e => setFormData(prev => ({ ...prev, tracking_url: e.target.value }))}
                            disabled={loading}
                            placeholder="https://..."
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Courier Name</Label>
                          <CourierCombobox
                            value={formData.courier_name || ''}
                            onChange={(courier_name) => {
                              setFormData(prev => {
                                const generated = buildTrackingUrl(courier_name, prev.tracking_number);
                                const keepExisting =
                                  prev.tracking_url && !isKnownCourierUrl(prev.tracking_url);
                                return {
                                  ...prev,
                                  courier_name,
                                  tracking_url: keepExisting || !generated ? prev.tracking_url : generated,
                                };
                              });
                            }}
                            disabled={loading}
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Estimated Delivery</Label>
                          <Input
                            type="date"
                            value={formData.estimated_delivery || ''}
                            onChange={e => setFormData(prev => ({ ...prev, estimated_delivery: e.target.value }))}
                            disabled={loading}
                            className="h-11"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Notes */}
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Notes
                    </h4>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Sales Notes</Label>
                        <Textarea
                          value={formData.sales_notes || ''}
                          onChange={e => setFormData(prev => ({ ...prev, sales_notes: e.target.value }))}
                          disabled={loading}
                          rows={2}
                          placeholder="Notes from sales team..."
                          className="resize-none"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {canViewProcurement && (
                          <div className="space-y-2">
                            <Label>Internal Notes (Supply Chain)</Label>
                            <Textarea
                              value={formData.internal_notes || ''}
                              onChange={e => setFormData(prev => ({ ...prev, internal_notes: e.target.value }))}
                              disabled={loading}
                              rows={2}
                              className="resize-none"
                            />
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label>Customer Notes</Label>
                          <Textarea
                            value={formData.customer_notes || ''}
                            onChange={e => setFormData(prev => ({ ...prev, customer_notes: e.target.value }))}
                            disabled={loading}
                            rows={2}
                            placeholder="Notes visible to sales..."
                            className="resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar - Order Summary */}
            <div className="xl:col-span-1">
              <div className="xl:sticky xl:top-4 space-y-4">
                <OrderSummary />
                
                {/* Navigation Buttons */}
                <div className="flex flex-col gap-2">
                  {currentStep < 4 ? (
                    <Button
                      type="button"
                      onClick={() => goToStep(currentStep + 1)}
                      disabled={!canGoNext()}
                      className="w-full h-12 text-base"
                    >
                      Continue
                      <ChevronRight className="ml-2 h-5 w-5" />
                    </Button>
                  ) : (
                    <Button type="submit" disabled={loading} className="w-full h-12 text-base bg-green-600 hover:bg-green-700">
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-5 w-5" />
                          Create Order
                        </>
                      )}
                    </Button>
                  )}
                  
                  {currentStep > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => goToStep(currentStep - 1)}
                      className="w-full"
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>
    {createdOrderForProforma && (
      <GenerateProformaDialog
        order={createdOrderForProforma}
        open={proformaDialogOpen}
        onOpenChange={(o) => {
          setProformaDialogOpen(o);
          if (!o) {
            const reset = pendingReset;
            setPendingReset(null);
            setCreatedOrderForProforma(null);
            setGenerateProforma(false);
            if (reset) reset();
          }
        }}
        onGenerated={() => {
          // Dialog stays open showing success; closing triggers reset above.
        }}
      />
    )}
    </>
  );

  if (embedded) {
    return <div>{formBody}</div>;
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
              Create New Order
            </CardTitle>
            <CardDescription className="mt-1">
              Add a new customer order in just a few steps
            </CardDescription>
          </div>
          <Badge variant="outline" className="hidden md:flex gap-1">
            Step {currentStep} of {STEPS.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {formBody}
      </CardContent>
    </Card>
  );
}
