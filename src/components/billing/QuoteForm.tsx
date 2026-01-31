import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { 
  User, 
  Building2, 
  FileText, 
  IndianRupee, 
  Calendar, 
  Loader2, 
  Truck, 
  Copy, 
  CreditCard, 
  StickyNote 
} from 'lucide-react';
import { QuoteFormData, QuoteItem, PAYMENT_TERMS_OPTIONS } from '@/hooks/useQuotes';
import { BillingItemsInput, BillingItem } from './BillingItemsInput';
import { BankDetailsSection } from './BankDetailsSection';
import { SignatureSection } from './SignatureSection';
import { AttachmentsSection } from './AttachmentsSection';
import { useEnquiries } from '@/hooks/useEnquiries';
import { usePipelineOrders } from '@/hooks/usePipelineOrders';

interface QuoteFormProps {
  onSubmit: (data: QuoteFormData) => Promise<boolean>;
  onCancel?: () => void;
  initialData?: Partial<QuoteFormData>;
}

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh'
];

const DEFAULT_TERMS = `1. This quotation is valid for the period mentioned above.
2. Prices are exclusive of applicable taxes unless otherwise stated.
3. Delivery timelines will be confirmed upon order confirmation.
4. Payment terms as mentioned in the quotation.
5. All disputes are subject to Bengaluru jurisdiction.`;

export function QuoteForm({ onSubmit, onCancel, initialData }: QuoteFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [sourceType, setSourceType] = useState<string>(initialData?.source_type || 'manual');
  const [sourceId, setSourceId] = useState<string>(initialData?.source_id || '');
  const [shipToSameAsBillTo, setShipToSameAsBillTo] = useState(!initialData?.shipping_address);
  
  const { enquiries } = useEnquiries();
  const { pipelineOrders } = usePipelineOrders();

  const [formData, setFormData] = useState<QuoteFormData>({
    customer_name: initialData?.customer_name || '',
    customer_company: initialData?.customer_company || '',
    customer_email: initialData?.customer_email || '',
    customer_phone: initialData?.customer_phone || '',
    customer_address: initialData?.customer_address || '',
    customer_gst: initialData?.customer_gst || '',
    customer_state: initialData?.customer_state || '',
    shipping_name: initialData?.shipping_name || '',
    shipping_company: initialData?.shipping_company || '',
    shipping_address: initialData?.shipping_address || '',
    shipping_state: initialData?.shipping_state || '',
    shipping_phone: initialData?.shipping_phone || '',
    discount_amount: initialData?.discount_amount || 0,
    discount_percent: initialData?.discount_percent || 0,
    valid_until: initialData?.valid_until || '',
    notes: initialData?.notes || '',
    terms_and_conditions: initialData?.terms_and_conditions || DEFAULT_TERMS,
    payment_terms: initialData?.payment_terms || '',
    payment_terms_custom: initialData?.payment_terms_custom || '',
    internal_notes: initialData?.internal_notes || '',
    include_bank_details: initialData?.include_bank_details || false,
    authorized_signatory: initialData?.authorized_signatory || '',
    attachment_urls: initialData?.attachment_urls || [],
    items: initialData?.items?.length ? initialData.items : [{
      product_name: '',
      product_code: '',
      product_category: '',
      quantity: 1,
      unit_price: 0,
      gst_percent: 18,
      gst_amount: 0,
      price_includes_gst: false,
      total_amount: 0,
    }],
  });

  // Copy billing to shipping when checkbox is checked
  useEffect(() => {
    if (shipToSameAsBillTo) {
      setFormData(prev => ({
        ...prev,
        shipping_name: prev.customer_name,
        shipping_company: prev.customer_company,
        shipping_address: prev.customer_address,
        shipping_state: prev.customer_state,
        shipping_phone: prev.customer_phone,
      }));
    }
  }, [shipToSameAsBillTo, formData.customer_name, formData.customer_company, formData.customer_address, formData.customer_state, formData.customer_phone]);

  // Load data from source (enquiry or lead)
  useEffect(() => {
    if (sourceType === 'enquiry' && sourceId) {
      const enquiry = enquiries.find(e => e.id === sourceId);
      if (enquiry) {
        setFormData(prev => ({
          ...prev,
          customer_name: enquiry.customer_name,
          customer_company: enquiry.customer_company,
          customer_state: (enquiry as any).customer_state || '',
          source_type: 'enquiry',
          source_id: sourceId,
          items: [{
            product_name: enquiry.product_name,
            product_code: enquiry.product_code,
            product_category: enquiry.product_category,
            quantity: enquiry.quantity,
            unit_price: enquiry.response_pricing ? parseFloat(enquiry.response_pricing) : 0,
            gst_percent: 18,
            gst_amount: 0,
            price_includes_gst: false,
            total_amount: 0,
          }],
        }));
      }
    } else if (sourceType === 'pipeline' && sourceId) {
      const lead = pipelineOrders.find(p => p.id === sourceId);
      if (lead) {
        setFormData(prev => ({
          ...prev,
          customer_name: lead.customer_name,
          customer_company: lead.customer_company,
          customer_email: lead.customer_email || '',
          customer_phone: lead.customer_phone || '',
          customer_state: (lead as any).customer_state || '',
          source_type: 'pipeline',
          source_id: sourceId,
          items: [{
            product_name: lead.product_name,
            product_code: lead.product_code || '',
            product_category: lead.product_category || '',
            quantity: lead.quantity,
            unit_price: lead.expected_price || 0,
            gst_percent: 18,
            gst_amount: 0,
            price_includes_gst: false,
            total_amount: 0,
          }],
        }));
      }
    }
  }, [sourceType, sourceId, enquiries, pipelineOrders]);

  const calculateTotals = () => {
    const subtotal = formData.items.reduce((sum, item) => {
      const basePrice = item.price_includes_gst 
        ? item.unit_price / (1 + item.gst_percent / 100)
        : item.unit_price;
      return sum + (basePrice * item.quantity);
    }, 0);

    const totalItemDiscounts = formData.items.reduce((sum, item) => sum + ((item as any).discount_amount || 0), 0);
    const totalGst = formData.items.reduce((sum, item) => sum + (item.gst_amount || 0), 0);
    const discountAmount = formData.discount_amount || (formData.discount_percent ? (subtotal - totalItemDiscounts) * (formData.discount_percent / 100) : 0);
    const grandTotal = subtotal - totalItemDiscounts + totalGst - discountAmount;

    return { subtotal, totalItemDiscounts, totalGst, discountAmount, grandTotal };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.customer_name.trim()) {
      return;
    }

    if (formData.items.some(item => !item.product_name.trim())) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        source_type: sourceType !== 'manual' ? sourceType : undefined,
        source_id: sourceType !== 'manual' ? sourceId : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const { subtotal, totalItemDiscounts, totalGst, discountAmount, grandTotal } = calculateTotals();

  const handleItemsChange = (items: BillingItem[]) => {
    setFormData(prev => ({ ...prev, items: items as QuoteItem[] }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Source Selection */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Import from Existing Data (Optional)
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Source Type</Label>
              <Select value={sourceType} onValueChange={(value) => { setSourceType(value); setSourceId(''); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  <SelectItem value="enquiry">From Enquiry</SelectItem>
                  <SelectItem value="pipeline">From Lead/Pipeline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {sourceType !== 'manual' && (
              <div>
                <Label>Select {sourceType === 'enquiry' ? 'Enquiry' : 'Lead'}</Label>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${sourceType}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceType === 'enquiry' 
                      ? enquiries.slice(0, 50).map(e => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.customer_name} - {e.product_name}
                          </SelectItem>
                        ))
                      : pipelineOrders.slice(0, 50).map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.customer_name} - {p.product_name}
                          </SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bill To Details */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4" />
            Bill To
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Customer Name *</Label>
              <Input
                required
                value={formData.customer_name}
                onChange={(e) => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                placeholder="Enter customer name"
              />
            </div>
            <div>
              <Label>Company Name</Label>
              <Input
                value={formData.customer_company}
                onChange={(e) => setFormData(prev => ({ ...prev, customer_company: e.target.value }))}
                placeholder="Enter company name"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.customer_email}
                onChange={(e) => setFormData(prev => ({ ...prev, customer_email: e.target.value }))}
                placeholder="customer@example.com"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={formData.customer_phone}
                onChange={(e) => setFormData(prev => ({ ...prev, customer_phone: e.target.value }))}
                placeholder="+91 XXXXXXXXXX"
              />
            </div>
            <div>
              <Label>State</Label>
              <Select
                value={formData.customer_state || 'none'}
                onValueChange={(value) => setFormData(prev => ({ ...prev, customer_state: value === 'none' ? '' : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select state</SelectItem>
                  {INDIAN_STATES.map(state => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>GST Number</Label>
              <Input
                value={formData.customer_gst}
                onChange={(e) => setFormData(prev => ({ ...prev, customer_gst: e.target.value.toUpperCase() }))}
                placeholder="22AAAAA0000A1Z5"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Billing Address</Label>
              <Textarea
                value={formData.customer_address}
                onChange={(e) => setFormData(prev => ({ ...prev, customer_address: e.target.value }))}
                placeholder="Enter billing address"
                rows={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ship To Details */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Ship To
            </CardTitle>
            <div className="flex items-center gap-2">
              <Switch
                id="sameAsBillTo"
                checked={shipToSameAsBillTo}
                onCheckedChange={setShipToSameAsBillTo}
              />
              <Label htmlFor="sameAsBillTo" className="text-sm font-normal cursor-pointer flex items-center gap-1">
                <Copy className="h-3 w-3" />
                Same as Bill To
              </Label>
            </div>
          </div>
        </CardHeader>
        {!shipToSameAsBillTo && (
          <CardContent className="pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Recipient Name</Label>
                <Input
                  value={formData.shipping_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, shipping_name: e.target.value }))}
                  placeholder="Enter recipient name"
                />
              </div>
              <div>
                <Label>Company Name</Label>
                <Input
                  value={formData.shipping_company}
                  onChange={(e) => setFormData(prev => ({ ...prev, shipping_company: e.target.value }))}
                  placeholder="Enter company name"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={formData.shipping_phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, shipping_phone: e.target.value }))}
                  placeholder="+91 XXXXXXXXXX"
                />
              </div>
              <div>
                <Label>State</Label>
                <Select
                  value={formData.shipping_state || 'none'}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, shipping_state: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select state</SelectItem>
                    {INDIAN_STATES.map(state => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Shipping Address</Label>
                <Textarea
                  value={formData.shipping_address}
                  onChange={(e) => setFormData(prev => ({ ...prev, shipping_address: e.target.value }))}
                  placeholder="Enter shipping address"
                  rows={2}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Products */}
      <Card>
        <CardContent className="pt-4">
          <BillingItemsInput
            items={formData.items as BillingItem[]}
            onChange={handleItemsChange}
            showPerItemDiscount={true}
          />
        </CardContent>
      </Card>

      {/* Pricing Summary & Additional Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* Quote Details */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Quote Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Payment Terms
                  </Label>
                  <Select
                    value={formData.payment_terms || 'none'}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, payment_terms: value === 'none' ? '' : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment terms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select terms</SelectItem>
                      {PAYMENT_TERMS_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valid Until</Label>
                  <Input
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) => setFormData(prev => ({ ...prev, valid_until: e.target.value }))}
                  />
                </div>
              </div>
              {formData.payment_terms === 'custom' && (
                <div>
                  <Label>Custom Payment Terms</Label>
                  <Input
                    value={formData.payment_terms_custom}
                    onChange={(e) => setFormData(prev => ({ ...prev, payment_terms_custom: e.target.value }))}
                    placeholder="e.g., 30% advance, 40% on delivery, 30% after 15 days"
                  />
                </div>
              )}
              <div>
                <Label>Overall Discount</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="Amount (₹)"
                    value={formData.discount_amount || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      discount_amount: parseFloat(e.target.value) || 0,
                      discount_percent: 0 
                    }))}
                  />
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="% off"
                    value={formData.discount_percent || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      discount_percent: parseFloat(e.target.value) || 0,
                      discount_amount: 0 
                    }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bank Details */}
          <BankDetailsSection
            includeBankDetails={formData.include_bank_details || false}
            onIncludeBankDetailsChange={(include) => setFormData(prev => ({ ...prev, include_bank_details: include }))}
          />

          {/* Signature */}
          <SignatureSection
            authorizedSignatory={formData.authorized_signatory || ''}
            onAuthorizedSignatoryChange={(name) => setFormData(prev => ({ ...prev, authorized_signatory: name }))}
          />

          {/* Attachments */}
          <AttachmentsSection
            attachmentUrls={formData.attachment_urls || []}
            onAttachmentsChange={(urls) => setFormData(prev => ({ ...prev, attachment_urls: urls }))}
            bucketPath={`quotes/${Date.now()}`}
          />
        </div>

        <div className="space-y-4">
          {/* Summary */}
          <Card className="bg-muted/30">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <IndianRupee className="h-4 w-4" />
                Quote Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {totalItemDiscounts > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Item Discounts</span>
                    <span>-₹{totalItemDiscounts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total GST</span>
                  <span>₹{totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Overall Discount</span>
                    <span>-₹{discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Grand Total</span>
                  <span className="text-primary">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Notes & Terms
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-4">
              <div>
                <Label>Notes (for Customer)</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes visible to customer..."
                  rows={2}
                />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4" />
                  Internal Notes
                </Label>
                <Textarea
                  value={formData.internal_notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, internal_notes: e.target.value }))}
                  placeholder="Internal notes for team reference..."
                  rows={2}
                  className="bg-yellow-50 dark:bg-yellow-900/20"
                />
              </div>
              <div>
                <Label>Terms & Conditions</Label>
                <Textarea
                  value={formData.terms_and_conditions}
                  onChange={(e) => setFormData(prev => ({ ...prev, terms_and_conditions: e.target.value }))}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 sticky bottom-0 bg-background py-4 border-t -mx-6 px-6">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initialData ? 'Update Quote' : 'Create Quote'}
        </Button>
      </div>
    </form>
  );
}