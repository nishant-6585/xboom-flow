import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRODUCT_CATEGORIES, Enquiry, UrgencyLevel } from '@/hooks/useEnquiries';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Pencil, Package, User, Target, Calendar, Building2, Zap, Check, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ProductSelect } from '@/components/ProductSelect';
import { PricelistItem } from '@/hooks/usePricelist';

const LEAD_SOURCES = [
  'Website',
  'IndiaMART',
  'Trade India',
  'Just Dial',
  'Google Ads',
  'Facebook',
  'Instagram',
  'LinkedIn',
  'WhatsApp',
  'Referral',
  'Cold Call',
  'Exhibition',
  'Email Campaign',
  'Other',
] as const;

const URGENCY_LEVELS: { value: UrgencyLevel; label: string; sla: string; color: string }[] = [
  { value: 'low', label: 'Low', sla: '24 hrs', color: 'bg-green-500/10 text-green-600 border-green-500/30' },
  { value: 'medium', label: 'Medium', sla: '9 hrs', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' },
  { value: 'high', label: 'High', sla: '6 hrs', color: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
  { value: 'critical', label: 'Critical', sla: '3 hrs', color: 'bg-destructive/10 text-destructive border-destructive/30' },
];

const PURPOSE_OF_PURCHASE = [
  'Personal Use',
  'Business Operations',
  'Government Project',
  'Research & Development',
  'Training & Education',
  'Survey & Mapping',
  'Agriculture',
  'Inspection & Maintenance',
  'Photography & Videography',
  'Security & Surveillance',
  'Delivery & Logistics',
  'Entertainment & Events',
  'Other',
] as const;

const STEPS = [
  { id: 1, name: 'Customer', icon: User },
  { id: 2, name: 'Product', icon: Package },
  { id: 3, name: 'Details', icon: Target },
];

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Enquiry | null;
  onSuccess: () => void;
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
                  "w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300",
                  isCompleted && "bg-primary text-primary-foreground",
                  isCurrent && "bg-primary/20 text-primary ring-2 ring-primary",
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <StepIcon className="w-4 h-4" />
                )}
              </div>
              <span className={cn(
                "text-xs mt-1 font-medium",
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

export function LeadFormDialog({ open, onOpenChange, lead, onSuccess }: LeadFormDialogProps) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_company: '',
    product_name: '',
    product_code: '',
    product_category: 'Consumer Drones' as string,
    quantity: 1,
    lead_source: 'Website',
    urgency: 'medium' as UrgencyLevel,
    requested_timeline: '',
    notes: '',
    purpose_of_purchase: '',
  });

  // Reset form when dialog opens/closes or lead changes
  useEffect(() => {
    if (open) {
      setCurrentStep(1);
      if (lead) {
        // Extract lead source and purpose from notes
        const leadSourceMatch = lead.notes?.match(/Lead Source:\s*([^|]+)/i);
        const leadSource = leadSourceMatch ? leadSourceMatch[1].trim() : 'Website';
        const purposeMatch = lead.notes?.match(/Purpose:\s*([^|]+)/i);
        const purpose = purposeMatch ? purposeMatch[1].trim() : '';
        const notesWithoutMeta = lead.notes
          ?.replace(/Lead Source:\s*[^|]+\s*\|?\s*/i, '')
          .replace(/Purpose:\s*[^|]+\s*\|?\s*/i, '')
          .trim() || '';
        
        setFormData({
          customer_name: lead.customer_name,
          customer_company: lead.customer_company,
          product_name: lead.product_name,
          product_code: lead.product_code || '',
          product_category: lead.product_category,
          quantity: lead.quantity,
          lead_source: LEAD_SOURCES.includes(leadSource as any) ? leadSource : 'Other',
          urgency: lead.urgency,
          requested_timeline: lead.requested_timeline || '',
          notes: notesWithoutMeta,
          purpose_of_purchase: PURPOSE_OF_PURCHASE.includes(purpose as any) ? purpose : '',
        });
      } else {
        setFormData({
          customer_name: '',
          customer_company: '',
          product_name: '',
          product_code: '',
          product_category: 'Consumer Drones',
          quantity: 1,
          lead_source: 'Website',
          urgency: 'medium',
          requested_timeline: '',
          notes: '',
          purpose_of_purchase: '',
        });
      }
    }
  }, [open, lead]);

  const handleProductSelect = (productName: string, product?: PricelistItem) => {
    setFormData({
      ...formData,
      product_name: productName,
      product_category: product?.product_category || formData.product_category,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !profile) {
      toast.error('You must be logged in');
      return;
    }

    if (!formData.customer_name || !formData.product_name) {
      toast.error('Customer Name and Product Name are required');
      return;
    }

    setLoading(true);
    try {
      // Build notes with metadata
      let notesWithMeta = '';
      if (formData.lead_source) {
        notesWithMeta += `Lead Source: ${formData.lead_source}`;
      }
      if (formData.purpose_of_purchase) {
        notesWithMeta += notesWithMeta ? ` | Purpose: ${formData.purpose_of_purchase}` : `Purpose: ${formData.purpose_of_purchase}`;
      }
      if (formData.notes) {
        notesWithMeta += notesWithMeta ? ` | ${formData.notes}` : formData.notes;
      }
      
      if (lead) {
        // Update existing lead
        const { error } = await supabase
          .from('enquiries')
          .update({
            customer_name: formData.customer_name,
            customer_company: formData.customer_company,
            product_name: formData.product_name,
            product_code: formData.product_code || 'N/A',
            product_category: formData.product_category,
            quantity: formData.quantity,
            urgency: formData.urgency,
            requested_timeline: formData.requested_timeline || null,
            notes: notesWithMeta,
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id);

        if (error) throw error;
        toast.success('Lead updated successfully');
      } else {
        // Create new lead
        const { error } = await supabase.from('enquiries').insert({
          customer_name: formData.customer_name,
          customer_company: formData.customer_company,
          product_name: formData.product_name,
          product_code: formData.product_code || 'N/A',
          product_category: formData.product_category,
          quantity: formData.quantity,
          sales_person_id: user.id,
          sales_person_name: profile.name,
          urgency: formData.urgency,
          requested_timeline: formData.requested_timeline || null,
          notes: notesWithMeta,
          status: 'pending',
        });

        if (error) throw error;
        toast.success('Lead created successfully');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving lead:', error);
      toast.error('Failed to save lead');
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!lead;

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return formData.customer_name.trim() !== '';
      case 2:
        return formData.product_name.trim() !== '';
      case 3:
        return true;
      default:
        return false;
    }
  };

  const getUrgencyConfig = (urgency: UrgencyLevel) => {
    return URGENCY_LEVELS.find(u => u.value === urgency) || URGENCY_LEVELS[1];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b bg-gradient-to-r from-primary/5 to-transparent -mx-6 -mt-6 px-6 pt-6 rounded-t-lg">
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              {isEditing ? <Pencil className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5 text-primary" />}
            </div>
            <div>
              {isEditing ? 'Edit Lead' : 'Add New Lead'}
              <DialogDescription className="text-left mt-0.5">
                {isEditing ? 'Update the lead details below.' : 'Enter the lead details to create a new enquiry.'}
              </DialogDescription>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="pt-4">
          <StepIndicator currentStep={currentStep} steps={STEPS} />

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Step 1: Customer Information */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-primary" />
                  <h3 className="font-medium text-sm">Customer Information</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer_name" className="flex items-center gap-1">
                      Customer Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="customer_name"
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      placeholder="Enter customer name"
                      className="bg-background"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customer_company" className="flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      Company
                    </Label>
                    <Input
                      id="customer_company"
                      value={formData.customer_company}
                      onChange={(e) => setFormData({ ...formData, customer_company: e.target.value })}
                      placeholder="Company name (optional)"
                      className="bg-background"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lead_source">Lead Source</Label>
                    <Select
                      value={formData.lead_source}
                      onValueChange={(value) => setFormData({ ...formData, lead_source: value })}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border shadow-lg z-50">
                        {LEAD_SOURCES.map((source) => (
                          <SelectItem key={source} value={source}>{source}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Product Information */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-primary" />
                  <h3 className="font-medium text-sm">Product Information</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="product_name" className="flex items-center gap-1">
                      Product Name <span className="text-destructive">*</span>
                    </Label>
                    <ProductSelect
                      value={formData.product_name}
                      onChange={handleProductSelect}
                      placeholder="Select or type product..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="product_code">Product Code</Label>
                      <Input
                        id="product_code"
                        value={formData.product_code}
                        onChange={(e) => setFormData({ ...formData, product_code: e.target.value })}
                        placeholder="e.g., DJI-M3-001"
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        min={1}
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                        className="bg-background"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product_category">Category</Label>
                    <Select
                      value={formData.product_category}
                      onValueChange={(value) => setFormData({ ...formData, product_category: value })}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border shadow-lg z-50 max-h-60">
                        {PRODUCT_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="purpose_of_purchase" className="flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-primary" />
                      Purpose of Purchase
                    </Label>
                    <Select
                      value={formData.purpose_of_purchase}
                      onValueChange={(value) => setFormData({ ...formData, purpose_of_purchase: value })}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select purpose..." />
                      </SelectTrigger>
                      <SelectContent className="bg-background border shadow-lg z-50">
                        {PURPOSE_OF_PURCHASE.map((purpose) => (
                          <SelectItem key={purpose} value={purpose}>{purpose}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Additional Details */}
            {currentStep === 3 && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-primary" />
                  <h3 className="font-medium text-sm">Additional Details</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="urgency" className="flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                      Urgency Level
                    </Label>
                    <Select
                      value={formData.urgency}
                      onValueChange={(value) => setFormData({ ...formData, urgency: value as UrgencyLevel })}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border shadow-lg z-50">
                        {URGENCY_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={cn("text-xs", level.color)}>
                                {level.label}
                              </Badge>
                              <span className="text-muted-foreground text-xs">({level.sla} SLA)</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="requested_timeline" className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      Requested Timeline
                    </Label>
                    <Input
                      id="requested_timeline"
                      value={formData.requested_timeline}
                      onChange={(e) => setFormData({ ...formData, requested_timeline: e.target.value })}
                      placeholder="e.g., 2 weeks, Urgent, End of month"
                      className="bg-background"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Additional notes about this lead..."
                      rows={3}
                      className="bg-background resize-none"
                    />
                  </div>

                  {/* Summary Card */}
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                    <h4 className="text-sm font-medium">Lead Summary</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      <div className="text-muted-foreground">Customer:</div>
                      <div className="font-medium truncate">{formData.customer_name || '-'}</div>
                      <div className="text-muted-foreground">Product:</div>
                      <div className="font-medium truncate">{formData.product_name || '-'}</div>
                      <div className="text-muted-foreground">Qty:</div>
                      <div className="font-medium">{formData.quantity}</div>
                      {formData.purpose_of_purchase && (
                        <>
                          <div className="text-muted-foreground">Purpose:</div>
                          <div className="font-medium truncate">{formData.purpose_of_purchase}</div>
                        </>
                      )}
                      <div className="text-muted-foreground">Source:</div>
                      <div className="font-medium">{formData.lead_source}</div>
                      <div className="text-muted-foreground">Urgency:</div>
                      <div>
                        <Badge variant="outline" className={cn("text-xs", getUrgencyConfig(formData.urgency).color)}>
                          {getUrgencyConfig(formData.urgency).label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <DialogFooter className="flex-row gap-3 pt-4 border-t">
              {currentStep > 1 ? (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setCurrentStep(currentStep - 1)} 
                  disabled={loading}
                >
                  Back
                </Button>
              ) : (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => onOpenChange(false)} 
                  disabled={loading}
                >
                  Cancel
                </Button>
              )}
              
              <div className="flex-1" />
              
              {currentStep < 3 ? (
                <Button
                  type="button"
                  onClick={() => setCurrentStep(currentStep + 1)}
                  disabled={!canGoNext()}
                >
                  Continue
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {isEditing ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    isEditing ? 'Update Lead' : 'Create Lead'
                  )}
                </Button>
              )}
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
