import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OrderFormData, ORDER_TYPES, CUSTOMER_TYPES, PAYMENT_STATUSES, OrderType, CustomerType, PaymentStatus } from '@/hooks/useOrders';
import { Loader2, Package, ImageIcon, X, Upload } from 'lucide-react';
import { Enquiry, PRODUCT_CATEGORIES } from '@/hooks/useEnquiries';
import { Supplier } from '@/hooks/useSuppliers';

interface OrderFormProps {
  onSubmit: (data: OrderFormData, paymentFile?: File) => Promise<boolean>;
  enquiries?: Enquiry[];
  suppliers?: Supplier[];
}

export function OrderForm({ onSubmit, enquiries = [], suppliers = [] }: OrderFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [paymentPreview, setPaymentPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<OrderFormData>({
    product_name: '',
    product_category: 'Consumer Drones',
    quantity: 1,
    customer_name: '',
    customer_company: '',
    sales_person_id: '',
    sales_person_name: '',
    shipping_address: '',
    order_type: 'prepaid',
    customer_type: 'b2b',
    supplier_id: undefined,
    supplier_name: '',
    supplier_contact: '',
    procurement_rate: undefined,
    procurement_currency: 'INR',
    selling_price: undefined,
    total_sales_amount: undefined,
    amount_paid: undefined,
    payment_terms: '',
    payment_status: 'pending',
    payment_due_date: '',
    tracking_number: '',
    tracking_url: '',
    committed_timeline: '',
    estimated_delivery: '',
    internal_notes: '',
    customer_notes: '',
    sales_notes: '',
  });

  const confirmedEnquiries = enquiries.filter(e => e.status === 'confirmed');
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
    }
  };

  const handlePaymentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setPaymentFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPaymentPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleClearPaymentFile = () => {
    setPaymentFile(null);
    setPaymentPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.product_name || !formData.customer_name || !formData.sales_person_name) {
      return;
    }

    setLoading(true);
    const success = await onSubmit(formData, paymentFile || undefined);
    setLoading(false);

    if (success) {
      setFormData({
        product_name: '',
        product_category: 'Consumer Drones',
        quantity: 1,
        customer_name: '',
        customer_company: '',
        sales_person_id: '',
        sales_person_name: '',
        shipping_address: '',
        order_type: 'prepaid',
        customer_type: 'b2b',
        supplier_id: undefined,
        supplier_name: '',
        supplier_contact: '',
        procurement_rate: undefined,
        procurement_currency: 'INR',
        selling_price: undefined,
        total_sales_amount: undefined,
        amount_paid: undefined,
        payment_terms: '',
        payment_status: 'pending',
        payment_due_date: '',
        tracking_number: '',
        tracking_url: '',
        committed_timeline: '',
        estimated_delivery: '',
        internal_notes: '',
        customer_notes: '',
        sales_notes: '',
      });
      handleClearPaymentFile();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Create New Order
        </CardTitle>
        <CardDescription>
          Create a new order from an enquiry or enter details manually
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Link to Enquiry */}
          {confirmedEnquiries.length > 0 && (
            <div className="space-y-2">
              <Label>Create from Enquiry (Optional)</Label>
              <Select onValueChange={handleEnquirySelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an enquiry or create standalone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Create Standalone Order</SelectItem>
                  {confirmedEnquiries.map(enquiry => (
                    <SelectItem key={enquiry.id} value={enquiry.id}>
                      {enquiry.product_name} - {enquiry.customer_name} ({enquiry.customer_company})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Product Details */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Product Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product_name">Product Name *</Label>
                <Input
                  id="product_name"
                  value={formData.product_name}
                  onChange={e => setFormData(prev => ({ ...prev, product_name: e.target.value }))}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product_category">Product Category *</Label>
                <Select 
                  value={formData.product_category} 
                  onValueChange={v => setFormData(prev => ({ ...prev, product_category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  value={formData.quantity}
                  onChange={e => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                  required
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Customer Details */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Customer Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer_name">Customer Name *</Label>
                <Input
                  id="customer_name"
                  value={formData.customer_name}
                  onChange={e => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_company">Customer Company *</Label>
                <Input
                  id="customer_company"
                  value={formData.customer_company}
                  onChange={e => setFormData(prev => ({ ...prev, customer_company: e.target.value }))}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_type">Customer Type</Label>
                <Select 
                  value={formData.customer_type} 
                  onValueChange={v => setFormData(prev => ({ ...prev, customer_type: v as CustomerType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sales_person_name">Sales Person Name *</Label>
                <Input
                  id="sales_person_name"
                  value={formData.sales_person_name}
                  onChange={e => setFormData(prev => ({ ...prev, sales_person_name: e.target.value }))}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="shipping_address">Shipping Address</Label>
                <Textarea
                  id="shipping_address"
                  value={formData.shipping_address || ''}
                  onChange={e => setFormData(prev => ({ ...prev, shipping_address: e.target.value }))}
                  disabled={loading}
                  rows={2}
                  placeholder="Full shipping address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="committed_timeline">Committed Timeline</Label>
                <Input
                  id="committed_timeline"
                  value={formData.committed_timeline || ''}
                  onChange={e => setFormData(prev => ({ ...prev, committed_timeline: e.target.value }))}
                  disabled={loading}
                  placeholder="e.g., 2-3 weeks, End of month"
                />
              </div>
            </div>
          </div>

          {/* Payment Details */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Payment Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="order_type">Order Type</Label>
                <Select 
                  value={formData.order_type} 
                  onValueChange={v => setFormData(prev => ({ ...prev, order_type: v as OrderType }))}
                >
                  <SelectTrigger>
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
                <Label htmlFor="payment_status">Payment Status</Label>
                <Select 
                  value={formData.payment_status} 
                  onValueChange={v => setFormData(prev => ({ ...prev, payment_status: v as PaymentStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="total_sales_amount">Total Sales Amount (₹)</Label>
                <Input
                  id="total_sales_amount"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.total_sales_amount || ''}
                  onChange={e => setFormData(prev => ({ ...prev, total_sales_amount: parseFloat(e.target.value) || undefined }))}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount_paid">Amount Paid (₹)</Label>
                <Input
                  id="amount_paid"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.amount_paid || ''}
                  onChange={e => setFormData(prev => ({ ...prev, amount_paid: parseFloat(e.target.value) || undefined }))}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_terms">Payment Terms</Label>
                <Input
                  id="payment_terms"
                  value={formData.payment_terms || ''}
                  onChange={e => setFormData(prev => ({ ...prev, payment_terms: e.target.value }))}
                  disabled={loading}
                  placeholder="e.g., 50% advance, 50% on delivery"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_due_date">Payment Due Date</Label>
                <Input
                  id="payment_due_date"
                  type="date"
                  value={formData.payment_due_date || ''}
                  onChange={e => setFormData(prev => ({ ...prev, payment_due_date: e.target.value }))}
                  disabled={loading}
                />
              </div>
              
              {/* Payment Screenshot Upload */}
              <div className="space-y-2 md:col-span-2">
                <Label className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Payment Screenshot (Optional)
                </Label>
                {paymentPreview ? (
                  <div className="relative">
                    <img
                      src={paymentPreview}
                      alt="Payment screenshot preview"
                      className="w-full h-48 object-contain rounded-lg border border-border bg-muted"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={handleClearPaymentFile}
                      disabled={loading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Click to upload payment screenshot
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PNG, JPG, JPEG up to 10MB
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePaymentFileChange}
                  className="hidden"
                />
                <p className="text-xs text-muted-foreground">
                  Upload proof of payment for admin approval
                </p>
              </div>
            </div>
          </div>

          {/* Procurement Details */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Procurement Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Select Supplier</Label>
                <Select 
                  value={formData.supplier_id || 'none'} 
                  onValueChange={handleSupplierSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a supplier (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Supplier / Enter Manually</SelectItem>
                    {activeSuppliers.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name} - {supplier.contact_name} ({supplier.product_category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier_name">Supplier Name</Label>
                <Input
                  id="supplier_name"
                  value={formData.supplier_name || ''}
                  onChange={e => setFormData(prev => ({ ...prev, supplier_name: e.target.value }))}
                  disabled={loading}
                  placeholder={formData.supplier_id ? 'Auto-filled from selection' : 'Enter supplier name'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier_contact">Supplier Contact</Label>
                <Input
                  id="supplier_contact"
                  value={formData.supplier_contact || ''}
                  onChange={e => setFormData(prev => ({ ...prev, supplier_contact: e.target.value }))}
                  disabled={loading}
                  placeholder={formData.supplier_id ? 'Auto-filled from selection' : 'Enter contact info'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="procurement_rate">Procurement Rate (₹)</Label>
                <Input
                  id="procurement_rate"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.procurement_rate || ''}
                  onChange={e => setFormData(prev => ({ ...prev, procurement_rate: parseFloat(e.target.value) || undefined }))}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="selling_price">Selling Price per Unit (₹)</Label>
                <Input
                  id="selling_price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.selling_price || ''}
                  onChange={e => setFormData(prev => ({ ...prev, selling_price: parseFloat(e.target.value) || undefined }))}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Tracking Details */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Tracking Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tracking_number">Tracking Number</Label>
                <Input
                  id="tracking_number"
                  value={formData.tracking_number || ''}
                  onChange={e => setFormData(prev => ({ ...prev, tracking_number: e.target.value }))}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tracking_url">Tracking URL</Label>
                <Input
                  id="tracking_url"
                  type="url"
                  value={formData.tracking_url || ''}
                  onChange={e => setFormData(prev => ({ ...prev, tracking_url: e.target.value }))}
                  disabled={loading}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimated_delivery">Estimated Delivery</Label>
                <Input
                  id="estimated_delivery"
                  type="date"
                  value={formData.estimated_delivery || ''}
                  onChange={e => setFormData(prev => ({ ...prev, estimated_delivery: e.target.value }))}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Notes</h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sales_notes">Sales Notes (From Sales Team)</Label>
                <Textarea
                  id="sales_notes"
                  value={formData.sales_notes || ''}
                  onChange={e => setFormData(prev => ({ ...prev, sales_notes: e.target.value }))}
                  disabled={loading}
                  rows={2}
                  placeholder="Notes from sales team about the order"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="internal_notes">Internal Notes (Supply Chain Only)</Label>
                  <Textarea
                    id="internal_notes"
                    value={formData.internal_notes || ''}
                    onChange={e => setFormData(prev => ({ ...prev, internal_notes: e.target.value }))}
                    disabled={loading}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer_notes">Customer Notes (Visible to Sales)</Label>
                  <Textarea
                    id="customer_notes"
                    value={formData.customer_notes || ''}
                    onChange={e => setFormData(prev => ({ ...prev, customer_notes: e.target.value }))}
                    disabled={loading}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Order...
              </>
            ) : (
              'Create Order'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
