import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRODUCT_CATEGORIES } from '@/hooks/useEnquiries';
import { useEmailLeads, MAIL_SOURCES, EmailLead } from '@/hooks/useEmailLeads';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { ProductSelect } from '@/components/ProductSelect';
import { PricelistItem } from '@/hooks/usePricelist';

const LEAD_SOURCES = [
  'Website', 'IndiaMART', 'Trade India', 'Just Dial', 'Google Ads',
  'Facebook', 'Instagram', 'LinkedIn', 'WhatsApp', 'Referral',
  'Cold Call', 'Exhibition', 'Email Campaign', 'Other',
] as const;

const URGENCY_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const PURPOSE_OPTIONS = [
  'Personal Use', 'Business Operations', 'Government Project',
  'Research & Development', 'Training & Education', 'Survey & Mapping',
  'Agriculture', 'Inspection & Maintenance', 'Photography & Videography',
  'Security & Surveillance', 'Delivery & Logistics', 'Entertainment & Events', 'Other',
];

const CUSTOMER_TYPES = [
  { value: 'B2C', label: 'B2C (Consumer)' },
  { value: 'B2B', label: 'B2B (Business)' },
  { value: 'B2G', label: 'B2G (Government)' },
  { value: 'Reseller', label: 'Reseller' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: EmailLead | null;
  onSuccess: () => void;
}

export function EmailLeadFormDialog({ open, onOpenChange, lead, onSuccess }: Props) {
  const { createLead, creating, updateLead, updating } = useEmailLeads();
  const { user, profile } = useAuth();
  const isEdit = !!lead;

  const [selectedProduct, setSelectedProduct] = useState('');
  const [form, setForm] = useState({
    customer_name: '',
    customer_company: '',
    phone_number: '',
    email: '',
    city: '',
    product_name: '',
    product_code: '',
    product_category: 'Consumer Drones',
    quantity: 1,
    lead_source: 'Email Campaign',
    mail_source: 'hello@xboom.in',
    urgency: 'medium',
    requested_timeline: '',
    purpose_of_purchase: '',
    notes: '',
    status: 'pending',
    sales_person_name: '',
  });

  useEffect(() => {
    if (lead) {
      setForm({
        customer_name: lead.customer_name || '',
        customer_company: lead.customer_company || '',
        phone_number: lead.phone_number || '',
        email: lead.email || '',
        city: lead.city || '',
        product_name: lead.product_name || '',
        product_code: lead.product_code || '',
        product_category: lead.product_category || 'Consumer Drones',
        quantity: lead.quantity || 1,
        lead_source: lead.lead_source || 'Email Campaign',
        mail_source: lead.mail_source || 'hello@xboom.in',
        urgency: lead.urgency || 'medium',
        requested_timeline: lead.requested_timeline || '',
        purpose_of_purchase: lead.purpose_of_purchase || '',
        notes: lead.notes || '',
        status: lead.status || 'pending',
        sales_person_name: lead.sales_person_name || '',
      });
    } else {
      setForm({
        customer_name: '',
        customer_company: '',
        phone_number: '',
        email: '',
        city: '',
        product_name: '',
        product_code: '',
        product_category: 'Consumer Drones',
        quantity: 1,
        lead_source: 'Email Campaign',
        mail_source: 'hello@xboom.in',
        urgency: 'medium',
        requested_timeline: '',
        purpose_of_purchase: '',
        notes: '',
        status: 'pending',
        sales_person_name: profile?.name || '',
      });
      setSelectedProduct('');
    }
  }, [lead, open, profile]);

  const handleSubmit = async () => {
    if (!form.customer_name.trim()) return;
    try {
      if (isEdit && lead) {
        await updateLead({ id: lead.id, ...form, updated_by: user?.id });
      } else {
        await createLead({ ...form, created_by: user?.id, created_by_name: profile?.name || '' });
      }
      onSuccess();
    } catch {
      // handled by hook
    }
  };

  const handleProductChange = (value: string, product?: PricelistItem) => {
    setSelectedProduct(value);
    if (product) {
      setForm(f => ({
        ...f,
        product_name: product.product_name,
        product_code: '',
        product_category: product.product_category || f.product_category,
      }));
    }
  };

  const busy = creating || updating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Email Lead' : 'Add Email Lead'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Mail Source *</Label>
            <Select value={form.mail_source} onValueChange={(v) => setForm(f => ({ ...f, mail_source: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MAIL_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Customer Name *</Label>
            <Input value={form.customer_name} onChange={(e) => setForm(f => ({ ...f, customer_name: e.target.value }))} />
          </div>
          <div>
            <Label>Company</Label>
            <Input value={form.customer_company} onChange={(e) => setForm(f => ({ ...f, customer_company: e.target.value }))} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone_number} onChange={(e) => setForm(f => ({ ...f, phone_number: e.target.value }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} />
          </div>
          <div>
            <Label>Sales Person</Label>
            <Input value={form.sales_person_name} onChange={(e) => setForm(f => ({ ...f, sales_person_name: e.target.value }))} />
          </div>

          <div className="md:col-span-2">
            <Label>Product (from Pricelist)</Label>
            <ProductSelect value={selectedProduct} onChange={handleProductChange} />
          </div>
          <div>
            <Label>Product Name</Label>
            <Input value={form.product_name} onChange={(e) => setForm(f => ({ ...f, product_name: e.target.value }))} />
          </div>
          <div>
            <Label>Product Code</Label>
            <Input value={form.product_code} onChange={(e) => setForm(f => ({ ...f, product_code: e.target.value }))} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.product_category} onValueChange={(v) => setForm(f => ({ ...f, product_category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRODUCT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantity</Label>
            <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} />
          </div>

          <div>
            <Label>Lead Source</Label>
            <Select value={form.lead_source} onValueChange={(v) => setForm(f => ({ ...f, lead_source: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Urgency</Label>
            <Select value={form.urgency} onValueChange={(v) => setForm(f => ({ ...f, urgency: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {URGENCY_LEVELS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Purpose of Purchase</Label>
            <Select value={form.purpose_of_purchase} onValueChange={(v) => setForm(f => ({ ...f, purpose_of_purchase: v }))}>
              <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
              <SelectContent>
                {PURPOSE_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Requested Timeline</Label>
            <Input value={form.requested_timeline} onChange={(e) => setForm(f => ({ ...f, requested_timeline: e.target.value }))} placeholder="e.g. 2 weeks" />
          </div>
          {isEdit && (
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="responded">Responded</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="moved_to_pipeline">Pipeline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={busy || !form.customer_name.trim()}>
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
