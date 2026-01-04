import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OrderFormData } from '@/hooks/useOrders';
import { Loader2, Package } from 'lucide-react';
import { Enquiry } from '@/hooks/useEnquiries';

interface OrderFormProps {
  onSubmit: (data: OrderFormData) => Promise<boolean>;
  enquiries?: Enquiry[];
}

export function OrderForm({ onSubmit, enquiries = [] }: OrderFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<OrderFormData>({
    product_name: '',
    product_code: '',
    quantity: 1,
    customer_name: '',
    customer_company: '',
    sales_person_id: '',
    sales_person_name: '',
    supplier_name: '',
    supplier_contact: '',
    procurement_rate: undefined,
    procurement_currency: 'INR',
    tracking_number: '',
    tracking_url: '',
    estimated_delivery: '',
    internal_notes: '',
    customer_notes: '',
  });

  const confirmedEnquiries = enquiries.filter(e => e.status === 'confirmed');

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
        product_code: enquiry.product_code,
        quantity: enquiry.quantity,
        customer_name: enquiry.customer_name,
        customer_company: enquiry.customer_company,
        sales_person_id: enquiry.sales_person_id || '',
        sales_person_name: enquiry.sales_person_name,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.product_name || !formData.product_code || !formData.customer_name || !formData.sales_person_name) {
      return;
    }

    setLoading(true);
    const success = await onSubmit(formData);
    setLoading(false);

    if (success) {
      setFormData({
        product_name: '',
        product_code: '',
        quantity: 1,
        customer_name: '',
        customer_company: '',
        sales_person_id: '',
        sales_person_name: '',
        supplier_name: '',
        supplier_contact: '',
        procurement_rate: undefined,
        procurement_currency: 'INR',
        tracking_number: '',
        tracking_url: '',
        estimated_delivery: '',
        internal_notes: '',
        customer_notes: '',
      });
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
                <Label htmlFor="product_code">Product Code *</Label>
                <Input
                  id="product_code"
                  value={formData.product_code}
                  onChange={e => setFormData(prev => ({ ...prev, product_code: e.target.value }))}
                  required
                  disabled={loading}
                />
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
                <Label htmlFor="sales_person_name">Sales Person Name *</Label>
                <Input
                  id="sales_person_name"
                  value={formData.sales_person_name}
                  onChange={e => setFormData(prev => ({ ...prev, sales_person_name: e.target.value }))}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sales_person_id">Sales Person ID *</Label>
                <Input
                  id="sales_person_id"
                  value={formData.sales_person_id}
                  onChange={e => setFormData(prev => ({ ...prev, sales_person_id: e.target.value }))}
                  required
                  disabled={loading}
                  placeholder="User UUID"
                />
              </div>
            </div>
          </div>

          {/* Procurement Details */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">Procurement Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supplier_name">Supplier Name</Label>
                <Input
                  id="supplier_name"
                  value={formData.supplier_name || ''}
                  onChange={e => setFormData(prev => ({ ...prev, supplier_name: e.target.value }))}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier_contact">Supplier Contact</Label>
                <Input
                  id="supplier_contact"
                  value={formData.supplier_contact || ''}
                  onChange={e => setFormData(prev => ({ ...prev, supplier_contact: e.target.value }))}
                  disabled={loading}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="internal_notes">Internal Notes (Supply Chain Only)</Label>
                <Textarea
                  id="internal_notes"
                  value={formData.internal_notes || ''}
                  onChange={e => setFormData(prev => ({ ...prev, internal_notes: e.target.value }))}
                  disabled={loading}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_notes">Customer Notes (Visible to Sales)</Label>
                <Textarea
                  id="customer_notes"
                  value={formData.customer_notes || ''}
                  onChange={e => setFormData(prev => ({ ...prev, customer_notes: e.target.value }))}
                  disabled={loading}
                  rows={3}
                />
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
