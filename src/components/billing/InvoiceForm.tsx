import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BillingItemsInput, BillingItem } from './BillingItemsInput';
import { BankDetailsSection } from './BankDetailsSection';
import { SignatureSection } from './SignatureSection';
import { AttachmentsSection } from './AttachmentsSection';
import { InvoiceFormData, InvoiceItem, PAYMENT_TERMS_OPTIONS } from '@/hooks/useInvoices';
import { 
  Loader2, 
  User, 
  Building2, 
  Truck, 
  Copy, 
  FileText, 
  IndianRupee, 
  Calendar,
  CreditCard,
  StickyNote
} from 'lucide-react';

interface InvoiceFormProps {
  onSubmit: (data: InvoiceFormData) => Promise<boolean>;
  onCancel: () => void;
  initialData?: Partial<InvoiceFormData>;
}

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh'
];

const DEFAULT_TERMS = `1. Payment is due within the specified due date.
2. All disputes are subject to Bengaluru jurisdiction.
3. Goods once sold will not be taken back.
4. Interest @ 18% p.a. will be charged on delayed payments.
5. Subject to Bengaluru jurisdiction only.`;

export function InvoiceForm({ onSubmit, onCancel, initialData }: InvoiceFormProps) {
  const [loading, setLoading] = useState(false);
  const [sameAsBilling, setSameAsBilling] = useState(!initialData?.shipping_address);
  
  // Customer details
  const [customerName, setCustomerName] = useState(initialData?.customer_name || '');
  const [customerCompany, setCustomerCompany] = useState(initialData?.customer_company || '');
  const [customerEmail, setCustomerEmail] = useState(initialData?.customer_email || '');
  const [customerPhone, setCustomerPhone] = useState(initialData?.customer_phone || '');
  const [customerAddress, setCustomerAddress] = useState(initialData?.customer_address || '');
  const [customerGst, setCustomerGst] = useState(initialData?.customer_gst || '');
  const [customerState, setCustomerState] = useState(initialData?.customer_state || '');

  // Shipping details
  const [shippingName, setShippingName] = useState(initialData?.shipping_name || '');
  const [shippingCompany, setShippingCompany] = useState(initialData?.shipping_company || '');
  const [shippingAddress, setShippingAddress] = useState(initialData?.shipping_address || '');
  const [shippingState, setShippingState] = useState(initialData?.shipping_state || '');
  const [shippingPhone, setShippingPhone] = useState(initialData?.shipping_phone || '');

  // Invoice details
  const [invoiceDate, setInvoiceDate] = useState(initialData?.invoice_date || new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(initialData?.due_date || '');
  const [paymentTerms, setPaymentTerms] = useState(initialData?.payment_terms || '');
  const [paymentTermsCustom, setPaymentTermsCustom] = useState('');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [internalNotes, setInternalNotes] = useState('');
  const [termsAndConditions, setTermsAndConditions] = useState(initialData?.terms_and_conditions || DEFAULT_TERMS);
  
  // New fields
  const [includeBankDetails, setIncludeBankDetails] = useState(false);
  const [authorizedSignatory, setAuthorizedSignatory] = useState('');
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);

  // Items
  const [items, setItems] = useState<BillingItem[]>(initialData?.items?.map(item => ({
    ...item,
    discount_percent: 0,
    discount_amount: 0,
  })) || [
    { product_name: '', quantity: 1, unit_price: 0, gst_percent: 18, gst_amount: 0, price_includes_gst: false, total_amount: 0, discount_percent: 0, discount_amount: 0 }
  ]);

  // Discount
  const [discountPercent, setDiscountPercent] = useState(initialData?.discount_percent || 0);
  const [discountAmount, setDiscountAmount] = useState(0);

  // Sync shipping with billing when toggle is on
  useEffect(() => {
    if (sameAsBilling) {
      setShippingName(customerName);
      setShippingCompany(customerCompany);
      setShippingAddress(customerAddress);
      setShippingState(customerState);
      setShippingPhone(customerPhone);
    }
  }, [sameAsBilling, customerName, customerCompany, customerAddress, customerState, customerPhone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!customerName.trim()) {
      return;
    }

    if (items.length === 0 || !items[0].product_name) {
      return;
    }

    setLoading(true);
    try {
      const success = await onSubmit({
        customer_name: customerName,
        customer_company: customerCompany,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        customer_gst: customerGst,
        customer_state: customerState,
        shipping_name: sameAsBilling ? customerName : shippingName,
        shipping_company: sameAsBilling ? customerCompany : shippingCompany,
        shipping_address: sameAsBilling ? customerAddress : shippingAddress,
        shipping_state: sameAsBilling ? customerState : shippingState,
        shipping_phone: sameAsBilling ? customerPhone : shippingPhone,
        invoice_date: invoiceDate,
        due_date: dueDate || undefined,
        payment_terms: paymentTerms === 'custom' ? paymentTermsCustom : paymentTerms,
        notes,
        terms_and_conditions: termsAndConditions,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        include_bank_details: includeBankDetails,
        authorized_signatory: authorizedSignatory,
        internal_notes: internalNotes,
        attachment_urls: attachmentUrls,
        items: items as InvoiceItem[],
      });

      if (!success) {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  };

  // Calculate totals including per-item discounts
  const subtotal = items.reduce((sum, item) => {
    const basePrice = item.price_includes_gst 
      ? item.unit_price / (1 + item.gst_percent / 100)
      : item.unit_price;
    return sum + (basePrice * item.quantity);
  }, 0);

  const totalItemDiscounts = items.reduce((sum, item) => sum + (item.discount_amount || 0), 0);
  const totalGst = items.reduce((sum, item) => sum + item.gst_amount, 0);
  const overallDiscount = discountPercent > 0 ? (subtotal - totalItemDiscounts) * (discountPercent / 100) : discountAmount;
  const grandTotal = subtotal - totalItemDiscounts + totalGst - overallDiscount;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
              />
            </div>
            <div>
              <Label>Company</Label>
              <Input
                value={customerCompany}
                onChange={(e) => setCustomerCompany(e.target.value)}
                placeholder="Enter company name"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+91 XXXXXXXXXX"
              />
            </div>
            <div>
              <Label>State</Label>
              <Select
                value={customerState || 'none'}
                onValueChange={(value) => setCustomerState(value === 'none' ? '' : value)}
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
                value={customerGst}
                onChange={(e) => setCustomerGst(e.target.value.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Billing Address</Label>
              <Textarea
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
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
                id="sameAsBilling"
                checked={sameAsBilling}
                onCheckedChange={setSameAsBilling}
              />
              <Label htmlFor="sameAsBilling" className="text-sm font-normal cursor-pointer flex items-center gap-1">
                <Copy className="h-3 w-3" />
                Same as Bill To
              </Label>
            </div>
          </div>
        </CardHeader>
        {!sameAsBilling && (
          <CardContent className="pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={shippingName}
                  onChange={(e) => setShippingName(e.target.value)}
                  placeholder="Enter name"
                />
              </div>
              <div>
                <Label>Company</Label>
                <Input
                  value={shippingCompany}
                  onChange={(e) => setShippingCompany(e.target.value)}
                  placeholder="Enter company"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={shippingPhone}
                  onChange={(e) => setShippingPhone(e.target.value)}
                  placeholder="+91 XXXXXXXXXX"
                />
              </div>
              <div>
                <Label>State</Label>
                <Select
                  value={shippingState || 'none'}
                  onValueChange={(value) => setShippingState(value === 'none' ? '' : value)}
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
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="Enter shipping address"
                  rows={2}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Invoice Details */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Invoice Details
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label>Invoice Date *</Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Payment Terms
              </Label>
              <Select
                value={paymentTerms || 'none'}
                onValueChange={(value) => setPaymentTerms(value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select terms</SelectItem>
                  {PAYMENT_TERMS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {paymentTerms === 'custom' && (
              <div className="sm:col-span-2 lg:col-span-3">
                <Label>Custom Payment Terms</Label>
                <Input
                  value={paymentTermsCustom}
                  onChange={(e) => setPaymentTermsCustom(e.target.value)}
                  placeholder="e.g., 30% advance, 70% on delivery"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardContent className="pt-4">
          <BillingItemsInput 
            items={items} 
            onChange={setItems}
            showPerItemDiscount={true}
          />
        </CardContent>
      </Card>

      {/* Pricing Summary & Additional Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* Discount */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">Overall Discount</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label className="text-xs">Discount %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={discountPercent || ''}
                    onChange={(e) => {
                      setDiscountPercent(parseFloat(e.target.value) || 0);
                      setDiscountAmount(0);
                    }}
                    placeholder="0"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Or Amount (₹)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={discountAmount || ''}
                    onChange={(e) => {
                      setDiscountAmount(parseFloat(e.target.value) || 0);
                      setDiscountPercent(0);
                    }}
                    placeholder="0"
                    disabled={discountPercent > 0}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bank Details */}
          <BankDetailsSection
            includeBankDetails={includeBankDetails}
            onIncludeBankDetailsChange={setIncludeBankDetails}
          />

          {/* Signature */}
          <SignatureSection
            authorizedSignatory={authorizedSignatory}
            onAuthorizedSignatoryChange={setAuthorizedSignatory}
          />

          {/* Attachments */}
          <AttachmentsSection
            attachmentUrls={attachmentUrls}
            onAttachmentsChange={setAttachmentUrls}
            bucketPath={`invoices/${Date.now()}`}
          />
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <Card className="bg-muted/30">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <IndianRupee className="h-4 w-4" />
                Invoice Summary
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
                {overallDiscount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Overall Discount</span>
                    <span>-₹{overallDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
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
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Internal notes (not visible to customer)..."
                  rows={2}
                  className="bg-yellow-50 dark:bg-yellow-900/20"
                />
              </div>
              <div>
                <Label>Terms & Conditions</Label>
                <Textarea
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 sticky bottom-0 bg-background py-4 border-t -mx-6 px-6">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initialData ? 'Update Invoice' : 'Create Invoice'}
        </Button>
      </div>
    </form>
  );
}