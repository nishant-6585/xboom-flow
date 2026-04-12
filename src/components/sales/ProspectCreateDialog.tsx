import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserPlus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ProductSelect } from '@/components/ProductSelect';
import { PRODUCT_CATEGORIES } from '@/hooks/useEnquiries';
import { useProspects } from '@/hooks/useProspects';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface ProspectCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillData: Record<string, any>;
  onCreated: (prospectId: string) => void;
}

const CUSTOMER_TYPES = [
  { value: 'B2C (Consumer)', label: 'B2C (Consumer)' },
  { value: 'B2B (Business)', label: 'B2B (Business)' },
  { value: 'B2G (Government)', label: 'B2G (Government)' },
  { value: 'Reseller', label: 'Reseller' },
];

const PROSPECT_TYPES = [
  { value: 'B2C', label: 'B2C' },
  { value: 'B2B', label: 'B2B' },
  { value: 'B2G', label: 'B2G' },
  { value: 'Reseller', label: 'Reseller' },
];

const URGENCY_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const PURPOSE_OF_PURCHASE = ['Personal Use', 'Business Operations', 'Government Project', 'Research & Development', 'Training & Education', 'Survey & Mapping', 'Agriculture', 'Inspection & Maintenance', 'Photography & Videography', 'Security & Surveillance', 'Delivery & Logistics', 'Entertainment & Events', 'Other'];

export function ProspectCreateDialog({ open, onOpenChange, prefillData, onCreated }: ProspectCreateDialogProps) {
  const { addProspect } = useProspects();
  const { user, profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_name: '',
    phone_number: '',
    email: '',
    company: '',
    city: '',
    product_name: '',
    product_category: 'Consumer Drones',
    product_code: '',
    quantity: 1,
    lead_source: '',
    customer_type: '',
    prospect_type: '',
    urgency: 'medium',
    requested_timeline: '',
    purpose_of_purchase: '',
    status: 'new',
    notes: '',
  });

  useEffect(() => {
    if (open && prefillData) {
      setForm({
        customer_name: prefillData.customer_name || '',
        phone_number: prefillData.phone_number || '',
        email: prefillData.email || '',
        company: prefillData.company || '',
        city: prefillData.city || '',
        product_name: prefillData.product_name || '',
        product_category: prefillData.product_category || 'Consumer Drones',
        product_code: prefillData.product_code || '',
        quantity: prefillData.quantity || 1,
        lead_source: prefillData.lead_source || '',
        customer_type: prefillData.customer_type || '',
        prospect_type: prefillData.prospect_type || '',
        urgency: prefillData.urgency || 'medium',
        requested_timeline: prefillData.requested_timeline || '',
        purpose_of_purchase: prefillData.purpose_of_purchase || '',
        status: 'new',
        notes: prefillData.notes || '',
      });
    }
  }, [open, prefillData]);

  const handleSave = async () => {
    if (!form.customer_name.trim()) {
      toast.error('Customer Name is required');
      return;
    }
    if (!form.customer_type) {
      toast.error('Customer Type is required');
      return;
    }
    if (!form.prospect_type) {
      toast.error('Prospect Type is required');
      return;
    }
    if (!user || !profile) return;

    setSaving(true);
    try {
      const result = await addProspect({
        source_type: prefillData.source_type,
        source_id: prefillData.source_id,
        customer_name: form.customer_name.trim(),
        phone_number: form.phone_number.trim() || null,
        email: form.email.trim() || null,
        company: form.company.trim() || null,
        city: form.city.trim() || null,
        product_name: form.product_name.trim() || null,
        notes: form.notes.trim() || null,
        is_a_category: false,
        status: form.status,
        created_by: user.id,
        created_by_name: profile.name,
        lead_source: form.lead_source,
        prospect_type: form.prospect_type,
        customer_type: form.customer_type,
        product_category: form.product_category,
        product_code: form.product_code.trim() || null,
        quantity: form.quantity,
        urgency: form.urgency,
        requested_timeline: form.requested_timeline.trim() || null,
        purpose_of_purchase: form.purpose_of_purchase || null,
      } as any);

      onOpenChange(false);
      if (result) {
        onCreated(result.id);
      }
    } catch {
      // Error handled by hook
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Convert to Prospect
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4 py-2">
            <div className="text-xs text-muted-foreground">
              Source: <span className="font-medium text-foreground">{form.lead_source}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer Name <span className="text-destructive">*</span></Label>
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
                <Label>Company</Label>
                <Input value={form.company} onChange={(e) => setForm(f => ({ ...f, company: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Customer Type <span className="text-destructive">*</span></Label>
                <Select value={form.customer_type || 'none'} onValueChange={(v) => setForm(f => ({ ...f, customer_type: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Select --</SelectItem>
                    {CUSTOMER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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
              <Label>Prospect Type <span className="text-destructive">*</span></Label>
              <Select value={form.prospect_type || 'none'} onValueChange={(v) => setForm(f => ({ ...f, prospect_type: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- Select --</SelectItem>
                  {PROSPECT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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
                    {['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost'].map(s => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
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
          <Button onClick={handleSave} disabled={saving || !form.customer_name.trim() || !form.customer_type || !form.prospect_type}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Convert to Prospect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
