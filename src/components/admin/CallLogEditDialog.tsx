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

interface CallLogEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callLog: any;
  onSuccess: () => void;
}

const LEAD_SOURCES = ['Website', 'IndiaMART', 'Trade India', 'Just Dial', 'Google Ads', 'Facebook', 'Instagram', 'LinkedIn', 'WhatsApp', 'Referral', 'Cold Call', 'Exhibition', 'Email Campaign', 'MyOperator', 'Other'];
const URGENCY_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];
const PURPOSE_OF_PURCHASE = ['Personal Use', 'Business Operations', 'Government Project', 'Research & Development', 'Training & Education', 'Survey & Mapping', 'Agriculture', 'Inspection & Maintenance', 'Photography & Videography', 'Security & Surveillance', 'Delivery & Logistics', 'Entertainment & Events', 'Other'];
const CUSTOMER_TYPES = [
  { value: 'B2C', label: 'B2C (Consumer)' },
  { value: 'B2B', label: 'B2B (Business)' },
  { value: 'B2G', label: 'B2G (Government)' },
  { value: 'Reseller', label: 'Reseller' },
];

export function CallLogEditDialog({ open, onOpenChange, callLog, onSuccess }: CallLogEditDialogProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_name: '',
    customer_company: '',
    email: '',
    city: '',
    product_name: '',
    product_category: 'Consumer Drones',
    product_code: '',
    quantity: 1,
    lead_source: 'MyOperator',
    urgency: 'medium',
    requested_timeline: '',
    purpose_of_purchase: '',
    notes: '',
    customer_type: '',
    outcall_info: '',
  });

  useEffect(() => {
    if (callLog) {
      setForm({
        customer_name: callLog.customer_name || '',
        customer_company: callLog.customer_company || '',
        email: callLog.email || '',
        city: callLog.city || '',
        product_name: callLog.product_name || '',
        product_category: callLog.product_category || 'Consumer Drones',
        product_code: callLog.product_code || '',
        quantity: callLog.quantity || 1,
        lead_source: callLog.lead_source || 'MyOperator',
        urgency: callLog.urgency || 'medium',
        requested_timeline: callLog.requested_timeline || '',
        purpose_of_purchase: callLog.purpose_of_purchase || '',
        notes: callLog.notes || '',
        customer_type: callLog.customer_type || '',
        outcall_info: callLog.outcall_info || '',
      });
    }
  }, [callLog]);

  const handleSave = async () => {
    if (!callLog) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('call_logs')
        .update({
          customer_name: form.customer_name.trim() || null,
          customer_company: form.customer_company.trim() || null,
          email: form.email.trim() || null,
          city: form.city.trim() || null,
          product_name: form.product_name.trim() || null,
          product_category: form.product_category,
          product_code: form.product_code.trim() || null,
          quantity: form.quantity,
          lead_source: form.lead_source || null,
          urgency: form.urgency,
          requested_timeline: form.requested_timeline.trim() || null,
          purpose_of_purchase: form.purpose_of_purchase || null,
          notes: form.notes.trim() || null,
          customer_type: form.customer_type || null,
          outcall_info: form.outcall_info.trim() || null,
        } as Record<string, unknown>)
        .eq('id', callLog.id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("You don't have permission to edit this call log, or it no longer exists.");
      }
      toast.success('Call log updated successfully');
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
            Edit Call Log Details
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer Name</Label>
                <Input value={form.customer_name} onChange={(e) => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Enter customer name" />
              </div>
              <div className="space-y-2">
                <Label>Customer Company</Label>
                <Input value={form.customer_company} onChange={(e) => setForm(f => ({ ...f, customer_company: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Urgency</Label>
                <Select value={form.urgency} onValueChange={(v) => setForm(f => ({ ...f, urgency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {URGENCY_LEVELS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Requested Timeline</Label>
                <Input value={form.requested_timeline} onChange={(e) => setForm(f => ({ ...f, requested_timeline: e.target.value }))} placeholder="e.g., 2 weeks" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Outcall Info
                {form.outcall_info.trim() ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-600 font-medium">Updated</span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-500 font-medium">Not Updated</span>
                )}
              </Label>
              <Textarea
                value={form.outcall_info}
                onChange={(e) => setForm(f => ({ ...f, outcall_info: e.target.value }))}
                rows={3}
                placeholder="Enter order notes, follow-up details, or callback summary..."
              />
              <p className="text-xs text-muted-foreground">This field tracks whether the salesperson has followed up on this call.</p>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
