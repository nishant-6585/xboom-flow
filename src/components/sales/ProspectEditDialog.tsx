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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Prospect } from '@/hooks/useProspects';

interface ProspectEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: Prospect | null;
  onSuccess: () => void;
}

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost'];
const LEAD_SOURCES = ['Website', 'IndiaMART', 'Trade India', 'Just Dial', 'Google Ads', 'Facebook', 'Instagram', 'LinkedIn', 'WhatsApp', 'Referral', 'Cold Call', 'Exhibition', 'Email Campaign', 'Interakt', 'MyOperator', 'Other'];
const URGENCY_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];
const PURPOSE_OF_PURCHASE = ['Personal Use', 'Business Operations', 'Government Project', 'Research & Development', 'Training & Education', 'Survey & Mapping', 'Agriculture', 'Inspection & Maintenance', 'Photography & Videography', 'Security & Surveillance', 'Delivery & Logistics', 'Entertainment & Events', 'Other'];

export function ProspectEditDialog({ open, onOpenChange, prospect, onSuccess }: ProspectEditDialogProps) {
  const [saving, setSaving] = useState(false);
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
    prospect_type: '',
    status: 'new',
    notes: '',
  });

  useEffect(() => {
    if (prospect) {
      setForm({
        customer_name: prospect.customer_name || '',
        phone_number: prospect.phone_number || '',
        email: prospect.email || '',
        customer_company: (prospect as any).customer_company || '',
        company: prospect.company || '',
        city: prospect.city || '',
        product_name: prospect.product_name || '',
        product_category: (prospect as any).product_category || 'Consumer Drones',
        product_code: (prospect as any).product_code || '',
        quantity: (prospect as any).quantity || 1,
        lead_source: (prospect as any).lead_source || '',
        urgency: (prospect as any).urgency || 'medium',
        requested_timeline: (prospect as any).requested_timeline || '',
        purpose_of_purchase: (prospect as any).purpose_of_purchase || '',
        prospect_type: (prospect as any).prospect_type || '',
        status: prospect.status || 'new',
        notes: prospect.notes || '',
      });
    }
  }, [prospect]);

  const handleSave = async () => {
    if (!prospect) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('prospects')
        .update({
          customer_name: form.customer_name.trim(),
          phone_number: form.phone_number.trim() || null,
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
          prospect_type: form.prospect_type || null,
          status: form.status,
          notes: form.notes.trim() || null,
        } as Record<string, unknown>)
        .eq('id', prospect.id);

      if (error) throw error;
      toast.success('Prospect updated successfully');
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit Prospect
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4 py-2">
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} />
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
                <Input value={form.product_code} onChange={(e) => setForm(f => ({ ...f, product_code: e.target.value }))} />
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

            <div className="space-y-2">
              <Label>Prospect Type</Label>
              <Select value={form.prospect_type || 'none'} onValueChange={(v) => setForm(f => ({ ...f, prospect_type: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- None --</SelectItem>
                  <SelectItem value="B2C">B2C</SelectItem>
                  <SelectItem value="B2B">B2B</SelectItem>
                  <SelectItem value="B2G">B2G</SelectItem>
                  <SelectItem value="Reseller">Reseller</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

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
