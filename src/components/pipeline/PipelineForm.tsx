import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PipelineOrderFormData, PIPELINE_STATUSES, PIPELINE_PRIORITIES } from '@/hooks/usePipelineOrders';
import { LEAD_SOURCES } from '@/hooks/useOrders';
import { PRODUCT_CATEGORIES } from '@/hooks/useEnquiries';
import { toast } from 'sonner';
import { ProductSelect } from '@/components/ProductSelect';

interface PipelineFormProps {
  onSubmit: (data: PipelineOrderFormData) => Promise<boolean>;
}

interface SalesTeamMember {
  user_id: string;
  name: string;
}

export function PipelineForm({ onSubmit }: PipelineFormProps) {
  const { user, profile, role } = useAuth();
  const [loading, setLoading] = useState(false);
  const [salesTeam, setSalesTeam] = useState<SalesTeamMember[]>([]);
  const [closureDate, setClosureDate] = useState<Date | undefined>(undefined);
  
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_company: '',
    customer_email: '',
    customer_phone: '',
    customer_notes: '',
    product_name: '',
    product_category: 'Consumer Drones',
    product_code: '',
    quantity: 1,
    expected_price: '',
    status: 'pending_confirmation',
    sales_person_id: user?.id || '',
    sales_person_name: profile?.name || '',
    lead_source: '',
    priority: 3,
    probability: 50,
    internal_notes: '',
    customer_type: 'b2b',
  });

  useEffect(() => {
    const fetchSalesTeam = async () => {
      const { data, error } = await supabase.rpc('get_sales_team');
      if (!error && data) {
        setSalesTeam(data);
      }
    };
    fetchSalesTeam();
  }, []);

  useEffect(() => {
    if (user && profile) {
      setFormData(prev => ({
        ...prev,
        sales_person_id: user.id,
        sales_person_name: profile.name,
      }));
    }
  }, [user, profile]);

  const handleChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSalesPersonChange = (userId: string) => {
    const member = salesTeam.find(m => m.user_id === userId);
    if (member) {
      setFormData(prev => ({
        ...prev,
        sales_person_id: member.user_id,
        sales_person_name: member.name,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.customer_name || !formData.customer_company || !formData.product_name) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    const success = await onSubmit({
      ...formData,
      quantity: Number(formData.quantity),
      expected_price: formData.expected_price ? Number(formData.expected_price) : undefined,
      expected_closure_date: closureDate ? format(closureDate, 'yyyy-MM-dd') : undefined,
      status: formData.status as any,
      priority: Number(formData.priority),
      probability: Number(formData.probability),
      customer_type: formData.customer_type as 'b2b' | 'b2c',
    });

    if (success) {
      setFormData({
        customer_name: '',
        customer_company: '',
        customer_email: '',
        customer_phone: '',
        customer_notes: '',
        product_name: '',
        product_category: 'Consumer Drones',
        product_code: '',
        quantity: 1,
        expected_price: '',
        status: 'pending_confirmation',
        sales_person_id: user?.id || '',
        sales_person_name: profile?.name || '',
        lead_source: '',
        priority: 3,
        probability: 50,
        internal_notes: '',
        customer_type: 'b2b',
      });
      setClosureDate(undefined);
    }
    setLoading(false);
  };

  const isAdminOrSupplyChain = role === 'admin' || role === 'supply_chain';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Add Pipeline Lead
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Customer Information */}
            <div className="space-y-2">
              <Label htmlFor="customer_name">Customer Name *</Label>
              <Input
                id="customer_name"
                value={formData.customer_name}
                onChange={(e) => handleChange('customer_name', e.target.value)}
                placeholder="Enter customer name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_company">Company *</Label>
              <Input
                id="customer_company"
                value={formData.customer_company}
                onChange={(e) => handleChange('customer_company', e.target.value)}
                placeholder="Enter company name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_email">Email</Label>
              <Input
                id="customer_email"
                type="email"
                value={formData.customer_email}
                onChange={(e) => handleChange('customer_email', e.target.value)}
                placeholder="customer@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_phone">Phone</Label>
              <Input
                id="customer_phone"
                value={formData.customer_phone}
                onChange={(e) => handleChange('customer_phone', e.target.value)}
                placeholder="Enter phone number"
              />
            </div>

            {/* Product Information */}
            <div className="space-y-2">
              <Label htmlFor="product_name">Product Name *</Label>
              <ProductSelect
                value={formData.product_name}
                onChange={(value, product) => {
                  setFormData(prev => ({
                    ...prev,
                    product_name: value,
                    product_category: product?.product_category || prev.product_category,
                  }));
                }}
                placeholder="Search or enter product name"
              />
            </div>
            <div className="space-y-2">
              <Label>Product Category</Label>
              <Select value={formData.product_category} onValueChange={(v) => handleChange('product_category', v)}>
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
            <div className="space-y-2">
              <Label htmlFor="product_code">Product Code</Label>
              <Input
                id="product_code"
                value={formData.product_code}
                onChange={(e) => handleChange('product_code', e.target.value)}
                placeholder="Enter product code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expected_price">Expected Price (₹)</Label>
              <Input
                id="expected_price"
                type="number"
                min={0}
                step="0.01"
                value={formData.expected_price}
                onChange={(e) => handleChange('expected_price', e.target.value)}
                placeholder="Enter expected price"
              />
            </div>

            {/* Pipeline Details */}
            <div className="space-y-2">
              <Label>Expected Closure Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !closureDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {closureDate ? format(closureDate, 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={closureDate}
                    onSelect={setClosureDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={String(formData.priority)} onValueChange={(v) => handleChange('priority', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="probability">Probability (%)</Label>
              <Input
                id="probability"
                type="number"
                min={0}
                max={100}
                value={formData.probability}
                onChange={(e) => handleChange('probability', Math.min(100, Math.max(0, Number(e.target.value))))}
                placeholder="0-100%"
              />
            </div>
            <div className="space-y-2">
              <Label>Lead Source</Label>
              <Select value={formData.lead_source} onValueChange={(v) => handleChange('lead_source', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select lead source" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Customer Type</Label>
              <Select value={formData.customer_type} onValueChange={(v) => handleChange('customer_type', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="b2b">B2B</SelectItem>
                  <SelectItem value="b2c">B2C</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sales Person Selection - only for admin */}
            {isAdminOrSupplyChain && salesTeam.length > 0 && (
              <div className="space-y-2">
                <Label>Sales Person</Label>
                <Select value={formData.sales_person_id} onValueChange={handleSalesPersonChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sales person" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesTeam.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer_notes">Customer Notes</Label>
              <Textarea
                id="customer_notes"
                value={formData.customer_notes}
                onChange={(e) => handleChange('customer_notes', e.target.value)}
                placeholder="Notes about customer requirements..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="internal_notes">Internal Notes</Label>
              <Textarea
                id="internal_notes"
                value={formData.internal_notes}
                onChange={(e) => handleChange('internal_notes', e.target.value)}
                placeholder="Internal notes..."
                rows={3}
              />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full md:w-auto">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add to Pipeline
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
