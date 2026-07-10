import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnquiryFormData, UrgencyLevel, PRODUCT_CATEGORIES, ProductCategory } from "@/hooks/useEnquiries";
import { Send, Package, User, Building2, Loader2, Calendar, Target, Zap, ChevronRight, Check, AlertCircle } from "lucide-react";
import { ProductSelect } from "@/components/ProductSelect";
import { PricelistItem } from "@/hooks/usePricelist";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ContactFieldCombo } from "@/components/crm/ContactFieldCombo";
import { FollowupNoteInput } from "@/components/crm/FollowupNoteInput";
import { FOLLOWUP_NOTE_OPTIONS, ENQUIRY_SOURCE_OPTIONS } from "@/lib/followupNotes";

interface QueryFormProps {
  onSubmit: (data: EnquiryFormData) => Promise<boolean>;
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
  { id: 1, name: "Product", icon: Package },
  { id: 2, name: "Customer", icon: User },
  { id: 3, name: "Details", icon: Target },
];

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

export function QueryForm({ onSubmit }: QueryFormProps) {
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<EnquiryFormData & { purposeOfPurchase: string }>({
    productName: "",
    productCode: "",
    productCategory: "Consumer Drones",
    quantity: 1,
    customerName: "",
    customerCompany: "",
    urgency: "medium",
    requestedTimeline: "",
    notes: "",
    purposeOfPurchase: "",
    leadSource: "",
    followupNote: "",
  });

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    
    if (currentStep < 3) {
      return;
    }

    if (!formData.productName || !formData.customerName) {
      return;
    }

    setLoading(true);
    // Include purpose of purchase in notes
    const notesWithPurpose = formData.purposeOfPurchase 
      ? `Purpose: ${formData.purposeOfPurchase}${formData.notes ? ` | ${formData.notes}` : ''}`
      : formData.notes;
    
    const success = await onSubmit({ ...formData, notes: notesWithPurpose });
    setLoading(false);

    if (success) {
      setFormData({
        productName: "",
        productCode: "",
        productCategory: "Consumer Drones",
        quantity: 1,
        customerName: "",
        customerCompany: "",
        urgency: "medium",
        requestedTimeline: "",
        notes: "",
        purposeOfPurchase: "",
        leadSource: "",
        followupNote: "",
      });
      setCurrentStep(1);
    }
  };

  const handleProductSelect = (productName: string, product?: PricelistItem) => {
    setFormData({
      ...formData,
      productName,
      productCategory: (product?.product_category as ProductCategory) || formData.productCategory,
    });
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return formData.productName.trim() !== "";
      case 2:
        return formData.customerName.trim() !== "";
      case 3:
        return true;
      default:
        return false;
    }
  };

  const getUrgencyColor = (urgency: UrgencyLevel) => {
    switch (urgency) {
      case "critical": return "bg-destructive/10 text-destructive border-destructive/30";
      case "high": return "bg-orange-500/10 text-orange-600 border-orange-500/30";
      case "medium": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
      case "low": return "bg-green-500/10 text-green-600 border-green-500/30";
    }
  };

  return (
    <Card className="glass animate-fade-in overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b">
        <CardTitle className="flex items-center gap-2 text-xl">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <span>New Product Enquiry</span>
            <p className="text-sm font-normal text-muted-foreground">Fill in the details to submit your enquiry</p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <StepIndicator currentStep={currentStep} steps={STEPS} />

        <div className="space-y-6">
          {/* Step 1: Product Details */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Product Details</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="productName" className="flex items-center gap-1">
                    Product Name <span className="text-destructive">*</span>
                  </Label>
                  <ProductSelect
                    value={formData.productName}
                    onChange={handleProductSelect}
                    placeholder="Select or type product..."
                    disabled={loading}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="productCategory">Product Category</Label>
                    <Select
                      value={formData.productCategory}
                      onValueChange={(value: ProductCategory) => setFormData({ ...formData, productCategory: value })}
                      disabled={loading}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent className="bg-background border shadow-lg z-50">
                        {PRODUCT_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                      disabled={loading}
                      className="bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purposeOfPurchase" className="flex items-center gap-1">
                    <Target className="w-4 h-4 text-primary" />
                    Purpose of Purchase
                  </Label>
                  <Select
                    value={formData.purposeOfPurchase}
                    onValueChange={(value) => setFormData({ ...formData, purposeOfPurchase: value })}
                    disabled={loading}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select purpose..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      {PURPOSE_OF_PURCHASE.map((purpose) => (
                        <SelectItem key={purpose} value={purpose}>
                          {purpose}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Customer Information */}
          {currentStep === 2 && (
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
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    disabled={loading}
                    className="bg-background"
                    required
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
                    value={formData.customerCompany}
                    onChange={(e) => setFormData({ ...formData, customerCompany: e.target.value })}
                    disabled={loading}
                    className="bg-background"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Additional Details */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Additional Details</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="urgency" className="flex items-center gap-1">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                    Urgency Level
                  </Label>
                  <Select
                    value={formData.urgency}
                    onValueChange={(value: UrgencyLevel) => setFormData({ ...formData, urgency: value })}
                    disabled={loading}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select urgency" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
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
                    value={formData.requestedTimeline}
                    onChange={(e) => setFormData({ ...formData, requestedTimeline: e.target.value })}
                    disabled={loading}
                    className="bg-background"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="leadSource">Source of Enquiry</Label>
                    <Select
                      value={formData.leadSource || ""}
                      onValueChange={(value) => setFormData({ ...formData, leadSource: value })}
                      disabled={loading}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select source (optional)" />
                      </SelectTrigger>
                      <SelectContent className="bg-background border shadow-lg z-50">
                        {ENQUIRY_SOURCE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="followupNote">Follow-up Note</Label>
                    <FollowupNoteInput
                      value={formData.followupNote || ""}
                      onChange={(v) => setFormData({ ...formData, followupNote: v })}
                      options={FOLLOWUP_NOTE_OPTIONS}
                      placeholder="Pick or type…"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional information for the supply chain team..."
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    disabled={loading}
                    className="bg-background resize-none"
                  />
                </div>

                {/* Summary Section */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-primary" />
                    Enquiry Summary
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Product:</div>
                    <div className="font-medium truncate">{formData.productName || "Not specified"}</div>
                    <div className="text-muted-foreground">Customer:</div>
                    <div className="font-medium truncate">{formData.customerName || "Not specified"}</div>
                    <div className="text-muted-foreground">Quantity:</div>
                    <div className="font-medium">{formData.quantity}</div>
                    {formData.purposeOfPurchase && (
                      <>
                        <div className="text-muted-foreground">Purpose:</div>
                        <div className="font-medium">{formData.purposeOfPurchase}</div>
                      </>
                    )}
                    <div className="text-muted-foreground">Urgency:</div>
                    <div>
                      <Badge variant="outline" className={cn("text-xs", getUrgencyColor(formData.urgency))}>
                        {formData.urgency.charAt(0).toUpperCase() + formData.urgency.slice(1)}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
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
                Continue
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={loading} className="flex-1 sm:flex-none">
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Submit Enquiry
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
