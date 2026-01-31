import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { User, Building2, FileText, IndianRupee, Calendar, Loader2 } from 'lucide-react';
import { QuoteFormData, QuoteItem } from '@/hooks/useQuotes';
import { QuoteItemsInput } from './QuoteItemsInput';
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
4. Payment terms: 50% advance, 50% before delivery.
5. All disputes are subject to Mumbai jurisdiction.`;

export function QuoteForm({ onSubmit, onCancel, initialData }: QuoteFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [sourceType, setSourceType] = useState<string>('manual');
  const [sourceId, setSourceId] = useState<string>('');
  
  const { enquiries } = useEnquiries();
  const { pipelineOrders } = usePipelineOrders();

  const [formData, setFormData] = useState<QuoteFormData>({
    customer_name: '',
    customer_company: '',
    customer_email: '',
    customer_phone: '',
    customer_address: '',
    customer_gst: '',
    customer_state: '',
    discount_amount: 0,
    discount_percent: 0,
    valid_until: '',
    notes: '',
    terms_and_conditions: DEFAULT_TERMS,
    items: [{
      product_name: '',
      product_code: '',
      product_category: 'Consumer Drones',
      quantity: 1,
      unit_price: 0,
      gst_percent: 18,
      gst_amount: 0,
      price_includes_gst: false,
      total_amount: 0,
    }],
  });

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
            product_category: lead.product_category || 'Consumer Drones',
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

    const totalGst = formData.items.reduce((sum, item) => sum + (item.gst_amount || 0), 0);
    const discountAmount = formData.discount_amount || (formData.discount_percent ? subtotal * (formData.discount_percent / 100) : 0);
    const grandTotal = subtotal + totalGst - discountAmount;

    return { subtotal, totalGst, discountAmount, grandTotal };
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

  const { subtotal, totalGst, discountAmount, grandTotal } = calculateTotals();

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      {/* Customer Details */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4" />
            Customer Details
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div className="md:col-span-2">
              <Label>Address</Label>
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

      {/* Products */}
      <Card>
        <CardContent className="pt-4">
          <QuoteItemsInput
            items={formData.items}
            onChange={(items) => setFormData(prev => ({ ...prev, items }))}
          />
        </CardContent>
      </Card>

      {/* Pricing Summary & Additional Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Additional Details
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 space-y-4">
            <div>
              <Label>Valid Until</Label>
              <Input
                type="date"
                value={formData.valid_until}
                onChange={(e) => setFormData(prev => ({ ...prev, valid_until: e.target.value }))}
              />
            </div>
            <div>
              <Label>Discount</Label>
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
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes for customer..."
                rows={2}
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
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total GST</span>
                <span>₹{totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount</span>
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
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Quote
        </Button>
      </div>
    </form>
  );
}
