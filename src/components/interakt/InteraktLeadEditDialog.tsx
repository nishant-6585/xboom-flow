import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Pencil } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ProductSelect } from '@/components/ProductSelect';
import { PRODUCT_CATEGORIES } from '@/hooks/useEnquiries';
import type { InteraktLead } from '@/hooks/useInteraktLeads';
import { supabase } from '@/integrations/supabase/client';

interface InteraktLeadEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: InteraktLead | null;
  onSave: (lead: Partial<InteraktLead> & { id: string }) => Promise<void>;
  saving: boolean;
}

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'converted', 'lost'];
const LEAD_SOURCES = ['Website', 'IndiaMART', 'Trade India', 'Just Dial', 'Google Ads', 'Facebook', 'Instagram', 'LinkedIn', 'WhatsApp', 'Referral', 'Cold Call', 'Exhibition', 'Email Campaign', 'Interakt', 'Other'];
const URGENCY_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];
const CUSTOMER_TYPES = [
  { value: 'B2C', label: 'B2C (Consumer)' },
  { value: 'B2B', label: 'B2B (Business)' },
  { value: 'B2G', label: 'B2G (Government)' },
  { value: 'Reseller', label: 'Reseller' },
];
const PURPOSE_OF_PURCHASE = ['Personal Use', 'Business Operations', 'Government Project', 'Research & Development', 'Training & Education', 'Survey & Mapping', 'Agriculture', 'Inspection & Maintenance', 'Photography & Videography', 'Security & Surveillance', 'Delivery & Logistics', 'Entertainment & Events', 'Other'];

export function InteraktLeadEditDialog({ open, onOpenChange, lead, onSave, saving }: InteraktLeadEditDialogProps) {
  const [form, setForm] = useState({
    customer_name: '',
    phone_number: '',
    email: '',
    customer_company: '',
    company: '',
    city: '',
    product_name: '',
    product_category: 'Consumer Drones',
    product_code: '',
    quantity: 1,
    lead_source: '',
    urgency: 'medium',
    requested_timeline: '',
    purpose_of_purchase: '',
    customer_type: '',
    status: 'new',
    notes: '',
  });

  useEffect(() => {
    if (lead) {
      setForm({
        customer_name: lead.customer_name || '',
        phone_number: lead.phone_number || '',
        email: lead.email || '',
        customer_company: (lead as any).customer_company || '',
        company: lead.company || '',
        city: lead.city || '',
        product_name: lead.product_name || '',
        product_category: (lead as any).product_category || 'Consumer Drones',
        product_code: (lead as any).product_code || '',
        quantity: (lead as any).quantity || 1,
        lead_source: (lead as any).lead_source || '',
        urgency: (lead as any).urgency || 'medium',
        requested_timeline: (lead as any).requested_timeline || '',
        purpose_of_purchase: (lead as any).purpose_of_purchase || '',
        customer_type: (lead as any).customer_type || '',
        status: lead.status || 'new',
        notes: lead.notes || '',
      });
    }
  }, [lead]);

  const handleSave = async () => {
    if (!lead) return;
    await onSave({
      id: lead.id,
      customer_name: form.customer_name.trim(),
      phone_number: form.phone_number.trim(),
      email: form.email.trim() || null,
      customer_company: form.customer_company.trim() || null,
      company: form.company.trim() || null,
      city: form.city.trim() || null,
      product_name: form.product_name.trim() || null,
      product_category: form.product_category,
      product_code: form.product_code.trim() || null,
      quantity: form.quantity,
      lead_source: form.lead_source || null,
      urgency: form.urgency,
      requested_timeline: form.requested_timeline.trim() || null,
      purpose_of_purchase: form.purpose_of_purchase || null,
      customer_type: form.customer_type || null,
      status: form.status,
      notes: form.notes.trim() || null,
    } as any);
    onOpenChange(false);
  };

  // interakt_traits is excluded from the list query (heavy jsonb), so load it
  // on demand when the dialog opens for a specific lead.
  const [traits, setTraits] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!open || !lead?.id) { setTraits(null); return; }
    if (lead.interakt_traits) { setTraits(lead.interakt_traits); return; }
    let cancelled = false;
    supabase
      .from('interakt_leads')
      .select('interakt_traits')
      .eq('id', lead.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setTraits((data?.interakt_traits as Record<string, unknown>) ?? null);
      });
    return () => { cancelled = true; };
  }, [open, lead?.id, lead?.interakt_traits]);

  const dynamicTraits = traits
    ? Object.entries(traits).filter(
        ([key]) => !['name', 'Name', 'email', 'Email', 'city', 'City', 'product', 'Product', 'company', 'Company'].includes(key)
      )
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit Interakt Lead
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4 py-2">
            {/* Customer Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer Name *</Label>
                <Input value={form.customer_name} onChange={(e) => setForm(f => ({ ...f, customer_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input value={form.phone_number} onChange={(e) => setForm(f => ({ ...f, phone_number: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Customer Company</Label>
                <Input value={form.customer_company} onChange={(e) => setForm(f => ({ ...f, customer_company: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Customer Type</Label>
                <Select value={form.customer_type || 'none'} onValueChange={(v) => setForm(f => ({ ...f, customer_type: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- None --</SelectItem>
                    {CUSTOMER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lead Source</Label>
                <Select value={form.lead_source || 'none'} onValueChange={(v) => setForm(f => ({ ...f, lead_source: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- None --</SelectItem>
                    {LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Product Info */}
            <div className="space-y-2">
              <Label>Product Name</Label>
              <ProductSelect
                value={form.product_name}
                onChange={(name, product) => setForm(f => ({
                  ...f,
                  product_name: name,
                  product_category: product?.product_category || f.product_category,
                }))}
                placeholder="Select or type product..."
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Product Code</Label>
                <Input value={form.product_code} onChange={(e) => setForm(f => ({ ...f, product_code: e.target.value }))} placeholder="e.g., DJI-M3-001" />
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.product_category} onValueChange={(v) => setForm(f => ({ ...f, product_category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRODUCT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Purpose of Purchase</Label>
              <Select value={form.purpose_of_purchase || 'none'} onValueChange={(v) => setForm(f => ({ ...f, purpose_of_purchase: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Select purpose..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- None --</SelectItem>
                  {PURPOSE_OF_PURCHASE.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Urgency</Label>
                <Select value={form.urgency} onValueChange={(v) => setForm(f => ({ ...f, urgency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {URGENCY_LEVELS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Requested Timeline</Label>
              <Input value={form.requested_timeline} onChange={(e) => setForm(f => ({ ...f, requested_timeline: e.target.value }))} placeholder="e.g., 2 weeks, Urgent" />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>

            {/* Dynamic Interakt Traits */}
            {dynamicTraits.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-muted-foreground">Interakt Traits</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {dynamicTraits.map(([key, value]) => (
                      <div key={key} className="bg-muted/50 rounded-md p-2">
                        <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
                        <p className="text-sm font-medium truncate">{String(value ?? '—')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.customer_name.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
