import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, X } from 'lucide-react';
import { Supplier, SupplierPreference } from '@/hooks/useSuppliers';

interface SupplierFormProps {
  initialData?: Partial<Supplier>;
  onSubmit: (data: Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => Promise<boolean>;
  onCancel: () => void;
  isLoading?: boolean;
}

const PRODUCT_CATEGORIES = [
  'Consumer Drones',
  'Enterprise Drones',
  'Agriculture Drones',
  'Camera Equipment',
  'Accessories',
  'Spare Parts',
  'Batteries',
  'Other',
];

export function SupplierForm({ initialData, onSubmit, onCancel, isLoading }: SupplierFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    contact_name: initialData?.contact_name || '',
    phone: initialData?.phone || '',
    email: initialData?.email || '',
    city: initialData?.city || '',
    address: initialData?.address || '',
    bank_name: initialData?.bank_name || '',
    bank_account_number: initialData?.bank_account_number || '',
    bank_ifsc: initialData?.bank_ifsc || '',
    bank_account_holder: initialData?.bank_account_holder || '',
    product_category: initialData?.product_category || 'Consumer Drones',
    products: initialData?.products || [],
    preference: initialData?.preference || 'medium' as SupplierPreference,
    notes: initialData?.notes || '',
    is_active: initialData?.is_active ?? true,
  });

  const [newProduct, setNewProduct] = useState('');

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addProduct = () => {
    if (newProduct.trim() && !formData.products.includes(newProduct.trim())) {
      setFormData(prev => ({
        ...prev,
        products: [...prev.products, newProduct.trim()],
      }));
      setNewProduct('');
    }
  };

  const removeProduct = (product: string) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.filter(p => p !== product),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.contact_name.trim()) {
      return;
    }

    const success = await onSubmit({
      ...formData,
      phone: formData.phone || null,
      email: formData.email || null,
      city: formData.city || null,
      address: formData.address || null,
      bank_name: formData.bank_name || null,
      bank_account_number: formData.bank_account_number || null,
      bank_ifsc: formData.bank_ifsc || null,
      bank_account_holder: formData.bank_account_holder || null,
      notes: formData.notes || null,
      products: formData.products.length > 0 ? formData.products : null,
    });

    if (success) {
      onCancel();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Supplier Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Company name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_name">Contact Person *</Label>
            <Input
              id="contact_name"
              value={formData.contact_name}
              onChange={(e) => handleChange('contact_name', e.target.value)}
              placeholder="Contact person name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="+91 XXXXX XXXXX"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="supplier@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => handleChange('city', e.target.value)}
              placeholder="City"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preference">Preference</Label>
            <Select
              value={formData.preference}
              onValueChange={(value) => handleChange('preference', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High Priority</SelectItem>
                <SelectItem value="medium">Medium Priority</SelectItem>
                <SelectItem value="low">Low Priority</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Textarea
            id="address"
            value={formData.address}
            onChange={(e) => handleChange('address', e.target.value)}
            placeholder="Full address"
            rows={2}
          />
        </div>
      </div>

      {/* Product Info */}
      <div className="space-y-4">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Product Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="product_category">Product Category</Label>
            <Select
              value={formData.product_category}
              onValueChange={(value) => handleChange('product_category', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Products Supplied</Label>
          <div className="flex gap-2">
            <Input
              value={newProduct}
              onChange={(e) => setNewProduct(e.target.value)}
              placeholder="Add product name"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addProduct())}
            />
            <Button type="button" variant="outline" onClick={addProduct}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {formData.products.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.products.map((product) => (
                <div
                  key={product}
                  className="flex items-center gap-1 px-2 py-1 bg-secondary rounded-md text-sm"
                >
                  {product}
                  <button
                    type="button"
                    onClick={() => removeProduct(product)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bank Details */}
      <div className="space-y-4">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Bank Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bank_name">Bank Name</Label>
            <Input
              id="bank_name"
              value={formData.bank_name}
              onChange={(e) => handleChange('bank_name', e.target.value)}
              placeholder="Bank name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_account_holder">Account Holder Name</Label>
            <Input
              id="bank_account_holder"
              value={formData.bank_account_holder}
              onChange={(e) => handleChange('bank_account_holder', e.target.value)}
              placeholder="Account holder name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_account_number">Account Number</Label>
            <Input
              id="bank_account_number"
              value={formData.bank_account_number}
              onChange={(e) => handleChange('bank_account_number', e.target.value)}
              placeholder="Account number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank_ifsc">IFSC Code</Label>
            <Input
              id="bank_ifsc"
              value={formData.bank_ifsc}
              onChange={(e) => handleChange('bank_ifsc', e.target.value)}
              placeholder="IFSC code"
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Additional notes about the supplier..."
          rows={3}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {initialData?.id ? 'Update Supplier' : 'Add Supplier'}
        </Button>
      </div>
    </form>
  );
}
