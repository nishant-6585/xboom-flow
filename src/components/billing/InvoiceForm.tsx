import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { QuoteItemsInput } from './QuoteItemsInput';
import { InvoiceFormData, InvoiceItem } from '@/hooks/useInvoices';
import { Loader2 } from 'lucide-react';

interface InvoiceFormProps {
  onSubmit: (data: InvoiceFormData) => Promise<boolean>;
  onCancel: () => void;
  initialData?: Partial<InvoiceFormData>;
}

export function InvoiceForm({ onSubmit, onCancel, initialData }: InvoiceFormProps) {
  const [loading, setLoading] = useState(false);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  
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
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [termsAndConditions, setTermsAndConditions] = useState(initialData?.terms_and_conditions || '');
  
  // Items
  const [items, setItems] = useState<InvoiceItem[]>(initialData?.items || [
    { product_name: '', quantity: 1, unit_price: 0, gst_percent: 18, gst_amount: 0, price_includes_gst: false, total_amount: 0 }
  ]);

  // Discount
  const [discountPercent, setDiscountPercent] = useState(initialData?.discount_percent || 0);

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
        payment_terms: paymentTerms,
        notes,
        terms_and_conditions: termsAndConditions,
        discount_percent: discountPercent,
        items: items as InvoiceItem[],
      });

      if (!success) {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  };

  // Calculate totals
  const subtotal = items.reduce((sum, item) => {
    const basePrice = item.price_includes_gst 
      ? item.unit_price / (1 + item.gst_percent / 100)
      : item.unit_price;
    return sum + (basePrice * item.quantity);
  }, 0);

  const totalGst = items.reduce((sum, item) => sum + item.gst_amount, 0);
  const discountAmount = discountPercent > 0 ? subtotal * (discountPercent / 100) : 0;
  const grandTotal = subtotal + totalGst - discountAmount;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Customer Details */}
      <div>
        <h3 className="font-semibold mb-4">Bill To</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="customerName">Customer Name *</Label>
            <Input
              id="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Enter customer name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerCompany">Company</Label>
            <Input
              id="customerCompany"
              value={customerCompany}
              onChange={(e) => setCustomerCompany(e.target.value)}
              placeholder="Enter company name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerEmail">Email</Label>
            <Input
              id="customerEmail"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="Enter email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerPhone">Phone</Label>
            <Input
              id="customerPhone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Enter phone number"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="customerAddress">Address</Label>
            <Textarea
              id="customerAddress"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="Enter address"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerState">State</Label>
            <Input
              id="customerState"
              value={customerState}
              onChange={(e) => setCustomerState(e.target.value)}
              placeholder="Enter state"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerGst">GST Number</Label>
            <Input
              id="customerGst"
              value={customerGst}
              onChange={(e) => setCustomerGst(e.target.value)}
              placeholder="Enter GST number"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Shipping Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Ship To</h3>
        <div className="flex items-center gap-2">
          <Switch
            id="sameAsBilling"
            checked={sameAsBilling}
            onCheckedChange={setSameAsBilling}
          />
          <Label htmlFor="sameAsBilling" className="text-sm">Same as Bill To</Label>
        </div>
      </div>

      {!sameAsBilling && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={shippingName}
              onChange={(e) => setShippingName(e.target.value)}
              placeholder="Enter name"
            />
          </div>
          <div className="space-y-2">
            <Label>Company</Label>
            <Input
              value={shippingCompany}
              onChange={(e) => setShippingCompany(e.target.value)}
              placeholder="Enter company"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Address</Label>
            <Textarea
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              placeholder="Enter address"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>State</Label>
            <Input
              value={shippingState}
              onChange={(e) => setShippingState(e.target.value)}
              placeholder="Enter state"
            />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input
              value={shippingPhone}
              onChange={(e) => setShippingPhone(e.target.value)}
              placeholder="Enter phone"
            />
          </div>
        </div>
      )}

      <Separator />

      {/* Invoice Details */}
      <div>
        <h3 className="font-semibold mb-4">Invoice Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="invoiceDate">Invoice Date *</Label>
            <Input
              id="invoiceDate"
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dueDate">Due Date</Label>
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentTerms">Payment Terms</Label>
            <Input
              id="paymentTerms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="e.g., Net 30"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Items */}
      <div>
        <h3 className="font-semibold mb-4">Invoice Items</h3>
        <QuoteItemsInput items={items} onChange={setItems} />
      </div>

      <Separator />

      {/* Discount & Summary */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="discountPercent">Discount (%)</Label>
            <Input
              id="discountPercent"
              type="number"
              min="0"
              max="100"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="w-full md:w-72 space-y-2 bg-muted/50 p-4 rounded-lg">
          <div className="flex justify-between text-sm">
            <span>Subtotal</span>
            <span>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>GST</span>
            <span>₹{totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount ({discountPercent}%)</span>
              <span>-₹{discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-lg font-bold">
            <span>Grand Total</span>
            <span className="text-primary">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes..."
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="terms">Terms & Conditions</Label>
          <Textarea
            id="terms"
            value={termsAndConditions}
            onChange={(e) => setTermsAndConditions(e.target.value)}
            placeholder="Payment terms, warranty info, etc."
            rows={3}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
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
