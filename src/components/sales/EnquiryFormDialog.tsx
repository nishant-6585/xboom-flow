import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEnquiries, Enquiry, EnquiryFormData, PRODUCT_CATEGORIES, ProductCategory, UrgencyLevel } from "@/hooks/useEnquiries";
import { useEnquiryItems, EnquiryItemFormData, GST_PERCENT_OPTIONS, calculateGstAndTotal } from "@/hooks/useEnquiryItems";
import { ProductSelect } from "@/components/ProductSelect";
import { PricelistItem } from "@/hooks/usePricelist";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Package, User, Target, Plus, Trash2, Loader2, Check, 
  ChevronRight, IndianRupee, Building2, Zap, Calendar
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EnquiryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry?: Enquiry | null;
  onSuccess: () => void;
}

const PURPOSE_OF_PURCHASE = [
  "Personal Use",
  "Business Operations",
  "Government Project",
  "Research & Development",
  "Training & Education",
  "Survey & Mapping",
  "Agriculture",
  "Inspection & Maintenance",
  "Photography & Videography",
  "Security & Surveillance",
  "Delivery & Logistics",
  "Entertainment & Events",
  "Other",
] as const;

const STEPS = [
  { id: 1, name: "Customer", icon: User },
  { id: 2, name: "Products", icon: Package },
  { id: 3, name: "Details", icon: Target },
];

interface ProductItem extends EnquiryItemFormData {
  id: string;
}

function StepIndicator({ currentStep, steps }: { currentStep: number; steps: typeof STEPS }) {
  return (
    <div className="flex items-center justify-between mb-6">
      {steps.map((step, index) => {
        const isCompleted = currentStep > step.id;
        const isCurrent = currentStep === step.id;
        const StepIcon = step.icon;
        
        return (
          <div key={step.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                  isCompleted && "bg-primary text-primary-foreground",
                  isCurrent && "bg-primary/20 text-primary ring-2 ring-primary",
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <StepIcon className="w-5 h-5" />
                )}
              </div>
              <span className={cn(
                "text-xs mt-1.5 font-medium hidden sm:block",
                isCurrent && "text-primary",
                !isCurrent && "text-muted-foreground"
              )}>
                {step.name}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={cn(
                "h-0.5 flex-1 mx-2 transition-all duration-300",
                isCompleted ? "bg-primary" : "bg-muted"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function EnquiryFormDialog({ open, onOpenChange, enquiry, onSuccess }: EnquiryFormDialogProps) {
  const { createEnquiry } = useEnquiries();
  const { createEnquiryItems, fetchEnquiryItems } = useEnquiryItems();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  // Customer data
  const [customerName, setCustomerName] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");

  // Primary product
  const [primaryProduct, setPrimaryProduct] = useState<ProductItem>({
    id: "primary",
    product_name: "",
    product_code: "",
    product_category: "Consumer Drones",
    quantity: 1,
    unit_price: 0,
    gst_percent: 18,
    price_includes_gst: false,
    notes: "",
  });

  // Additional products
  const [additionalProducts, setAdditionalProducts] = useState<ProductItem[]>([]);

  // Details
  const [urgency, setUrgency] = useState<UrgencyLevel>("medium");
  const [requestedTimeline, setRequestedTimeline] = useState("");
  const [purposeOfPurchase, setPurposeOfPurchase] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && enquiry) {
      // Load existing enquiry data
      setCustomerName(enquiry.customer_name);
      setCustomerCompany(enquiry.customer_company);
      setPrimaryProduct({
        id: "primary",
        product_name: enquiry.product_name,
        product_code: enquiry.product_code || "",
        product_category: enquiry.product_category,
        quantity: enquiry.quantity,
        unit_price: 0,
        gst_percent: 18,
        price_includes_gst: false,
        notes: "",
      });
      setUrgency(enquiry.urgency);
      setRequestedTimeline(enquiry.requested_timeline || "");
      setNotes(enquiry.notes || "");
      
      // Load additional items
      fetchEnquiryItems(enquiry.id).then(items => {
        setAdditionalProducts(items.map(item => ({
          id: item.id,
          product_name: item.product_name,
          product_code: item.product_code || "",
          product_category: item.product_category || "Consumer Drones",
          quantity: item.quantity,
          unit_price: item.unit_price,
          gst_percent: item.gst_percent,
          price_includes_gst: item.price_includes_gst,
          notes: item.notes || "",
        })));
      });
    } else if (open) {
      // Reset form
      setCurrentStep(1);
      setCustomerName("");
      setCustomerCompany("");
      setPrimaryProduct({
        id: "primary",
        product_name: "",
        product_code: "",
        product_category: "Consumer Drones",
        quantity: 1,
        unit_price: 0,
        gst_percent: 18,
        price_includes_gst: false,
        notes: "",
      });
      setAdditionalProducts([]);
      setUrgency("medium");
      setRequestedTimeline("");
      setPurposeOfPurchase("");
      setNotes("");
    }
  }, [open, enquiry]);

  const handleProductSelect = (productName: string, product?: PricelistItem, itemId?: string) => {
    const update = {
      product_name: productName,
      product_category: (product?.product_category as ProductCategory) || "Consumer Drones",
      unit_price: product?.dealer_price || product?.website_price || 0,
    };

    if (itemId === "primary") {
      setPrimaryProduct(prev => ({ ...prev, ...update }));
    } else if (itemId) {
      setAdditionalProducts(prev =>
        prev.map(p => (p.id === itemId ? { ...p, ...update } : p))
      );
    }
  };

  const addProduct = () => {
    setAdditionalProducts(prev => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        product_name: "",
        product_code: "",
        product_category: "Consumer Drones",
        quantity: 1,
        unit_price: 0,
        gst_percent: 18,
        price_includes_gst: false,
        notes: "",
      },
    ]);
  };

  const removeProduct = (id: string) => {
    setAdditionalProducts(prev => prev.filter(p => p.id !== id));
  };

  const updateProduct = (id: string, updates: Partial<ProductItem>) => {
    if (id === "primary") {
      setPrimaryProduct(prev => ({ ...prev, ...updates }));
    } else {
      setAdditionalProducts(prev =>
        prev.map(p => (p.id === id ? { ...p, ...updates } : p))
      );
    }
  };

  const calculateItemTotal = (item: ProductItem) => {
    const { totalAmount } = calculateGstAndTotal(
      item.quantity,
      item.unit_price,
      item.gst_percent,
      item.price_includes_gst
    );
    return totalAmount;
  };

  const grandTotal = additionalProducts.reduce((sum, p) => sum + calculateItemTotal(p), 0);
  const totalGst = additionalProducts.reduce((sum, p) => {
    const { gstAmount } = calculateGstAndTotal(p.quantity, p.unit_price, p.gst_percent, p.price_includes_gst);
    return sum + gstAmount;
  }, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return customerName.trim() !== "";
      case 2:
        return primaryProduct.product_name.trim() !== "";
      case 3:
        return true;
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    if (!user || !profile) {
      toast.error("You must be logged in to create an enquiry");
      return;
    }

    setLoading(true);
    try {
      const notesWithPurpose = purposeOfPurchase 
        ? `Purpose: ${purposeOfPurchase}${notes ? ` | ${notes}` : ''}`
        : notes;

      const formData: EnquiryFormData = {
        productName: primaryProduct.product_name,
        productCode: primaryProduct.product_code || "",
        productCategory: primaryProduct.product_category as ProductCategory,
        quantity: primaryProduct.quantity,
        customerName,
        customerCompany,
        urgency,
        requestedTimeline,
        notes: notesWithPurpose,
      };

      const success = await createEnquiry(formData);

      if (success) {
        // If there are additional products, we need to get the enquiry ID
        if (additionalProducts.length > 0) {
          // Fetch the latest enquiry created by this user
          const { data: latestEnquiry } = await supabase
            .from("enquiries")
            .select("id")
            .eq("sales_person_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (latestEnquiry) {
            await createEnquiryItems(
              latestEnquiry.id,
              additionalProducts.map(p => ({
                product_name: p.product_name,
                product_code: p.product_code,
                product_category: p.product_category,
                quantity: p.quantity,
                unit_price: p.unit_price,
                gst_percent: p.gst_percent,
                price_includes_gst: p.price_includes_gst,
                notes: p.notes,
              }))
            );
          }
        }

        toast.success("Enquiry created successfully!");
        onSuccess();
      }
    } catch (error) {
      console.error("Error creating enquiry:", error);
      toast.error("Failed to create enquiry");
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyColor = (u: UrgencyLevel) => {
    switch (u) {
      case "critical": return "bg-destructive/10 text-destructive border-destructive/30";
      case "high": return "bg-orange-500/10 text-orange-600 border-orange-500/30";
      case "medium": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
      case "low": return "bg-green-500/10 text-green-600 border-green-500/30";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {enquiry ? "Edit Enquiry" : "New Enquiry"}
          </DialogTitle>
          <DialogDescription>
            {enquiry ? "Update enquiry details" : "Create a new product enquiry with multiple items"}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator currentStep={currentStep} steps={STEPS} />

        <div className="space-y-6">
          {/* Step 1: Customer */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <User className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Customer Information</h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="customerName" className="flex items-center gap-1">
                    Customer Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="customerName"
                    placeholder="Enter customer name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customerCompany" className="flex items-center gap-1">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    Company
                  </Label>
                  <Input
                    id="customerCompany"
                    placeholder="Company name (optional)"
                    value={customerCompany}
                    onChange={(e) => setCustomerCompany(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Products */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Products</h3>
                </div>
                <Button variant="outline" size="sm" onClick={addProduct}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Product
                </Button>
              </div>

              {/* Primary Product */}
              <Card className="border-primary/30">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge>Primary Product</Badge>
                  </div>
                  <ProductItemForm
                    item={primaryProduct}
                    onUpdate={(updates) => updateProduct("primary", updates)}
                    onProductSelect={(name, product) => handleProductSelect(name, product, "primary")}
                    disabled={loading}
                    showRemove={false}
                  />
                </CardContent>
              </Card>

              {/* Additional Products */}
              {additionalProducts.map((product, index) => (
                <Card key={product.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="secondary">Product {index + 2}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProduct(product.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <ProductItemForm
                      item={product}
                      onUpdate={(updates) => updateProduct(product.id, updates)}
                      onProductSelect={(name, p) => handleProductSelect(name, p, product.id)}
                      disabled={loading}
                      showRemove={false}
                    />
                  </CardContent>
                </Card>
              ))}

              {/* Summary */}
              {additionalProducts.length > 0 && (
                <Card className="bg-muted/30">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {additionalProducts.length + 1} products
                        </p>
                        <p className="text-xs text-muted-foreground">
                          GST: {formatCurrency(totalGst)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Total (Additional)</p>
                        <p className="text-lg font-bold text-primary">{formatCurrency(grandTotal)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 3: Details */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Additional Details</h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="purposeOfPurchase" className="flex items-center gap-1">
                    <Target className="w-4 h-4 text-primary" />
                    Purpose of Purchase
                  </Label>
                  <Select
                    value={purposeOfPurchase}
                    onValueChange={setPurposeOfPurchase}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select purpose..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PURPOSE_OF_PURCHASE.map((purpose) => (
                        <SelectItem key={purpose} value={purpose}>
                          {purpose}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                    Urgency Level
                  </Label>
                  <Select
                    value={urgency}
                    onValueChange={(value: UrgencyLevel) => setUrgency(value)}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select urgency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-xs", getUrgencyColor("low"))}>Low</Badge>
                          <span className="text-muted-foreground">(24 hrs SLA)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="medium">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-xs", getUrgencyColor("medium"))}>Medium</Badge>
                          <span className="text-muted-foreground">(9 hrs SLA)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="high">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-xs", getUrgencyColor("high"))}>High</Badge>
                          <span className="text-muted-foreground">(6 hrs SLA)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="critical">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-xs", getUrgencyColor("critical"))}>Critical</Badge>
                          <span className="text-muted-foreground">(3 hrs SLA)</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="requestedTimeline" className="flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    Requested Delivery Timeline
                  </Label>
                  <Input
                    id="requestedTimeline"
                    placeholder="e.g., Within 2 weeks, By March 15th, ASAP"
                    value={requestedTimeline}
                    onChange={(e) => setRequestedTimeline(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional information..."
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={loading}
                  />
                </div>

                {/* Summary */}
                <Card className="bg-muted/30">
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-3">Enquiry Summary</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Customer:</div>
                      <div className="font-medium">{customerName} {customerCompany && `(${customerCompany})`}</div>
                      <div className="text-muted-foreground">Primary Product:</div>
                      <div className="font-medium">{primaryProduct.product_name}</div>
                      <div className="text-muted-foreground">Total Products:</div>
                      <div className="font-medium">{additionalProducts.length + 1}</div>
                      <div className="text-muted-foreground">Urgency:</div>
                      <div>
                        <Badge variant="outline" className={cn("text-xs", getUrgencyColor(urgency))}>
                          {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
                        </Badge>
                      </div>
                      {additionalProducts.length > 0 && (
                        <>
                          <div className="text-muted-foreground">Total Value (Add.):</div>
                          <div className="font-medium text-primary">{formatCurrency(grandTotal)}</div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-4 border-t">
            {currentStep > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep(currentStep - 1)}
                disabled={loading}
                className="flex-1 sm:flex-none"
              >
                Back
              </Button>
            )}
            <div className="flex-1" />
            {currentStep < 3 ? (
              <Button
                type="button"
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={!canGoNext() || loading}
                className="flex-1 sm:flex-none"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canGoNext() || loading}
                className="flex-1 sm:flex-none"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Submit Enquiry
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Product Item Form Component
interface ProductItemFormProps {
  item: ProductItem;
  onUpdate: (updates: Partial<ProductItem>) => void;
  onProductSelect: (name: string, product?: PricelistItem) => void;
  disabled?: boolean;
  showRemove?: boolean;
}

function ProductItemForm({ item, onUpdate, onProductSelect, disabled, showRemove }: ProductItemFormProps) {
  const { gstAmount, totalAmount } = calculateGstAndTotal(
    item.quantity,
    item.unit_price,
    item.gst_percent,
    item.price_includes_gst
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Product Name <span className="text-destructive">*</span></Label>
          <ProductSelect
            value={item.product_name}
            onChange={onProductSelect}
            placeholder="Select or type product..."
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            value={item.product_category}
            onValueChange={(value) => onUpdate({ product_category: value })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>Quantity</Label>
          <Input
            type="number"
            min="1"
            value={item.quantity}
            onChange={(e) => onUpdate({ quantity: parseInt(e.target.value) || 1 })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label>Unit Price (₹)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={item.unit_price}
            onChange={(e) => onUpdate({ unit_price: parseFloat(e.target.value) || 0 })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label>GST %</Label>
          <Select
            value={item.gst_percent.toString()}
            onValueChange={(value) => onUpdate({ gst_percent: parseFloat(value) })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GST_PERCENT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value.toString()}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Total</Label>
          <div className="h-10 px-3 py-2 rounded-md border bg-muted/50 flex items-center">
            <span className="font-medium text-primary">{formatCurrency(totalAmount)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Checkbox
            id={`gst-inclusive-${item.id}`}
            checked={item.price_includes_gst}
            onCheckedChange={(checked) => onUpdate({ price_includes_gst: !!checked })}
            disabled={disabled}
          />
          <Label htmlFor={`gst-inclusive-${item.id}`} className="text-sm font-normal cursor-pointer">
            Price includes GST
          </Label>
        </div>
        {item.unit_price > 0 && (
          <Badge variant="outline" className="text-xs">
            GST: {formatCurrency(gstAmount)}
          </Badge>
        )}
      </div>
    </div>
  );
}
