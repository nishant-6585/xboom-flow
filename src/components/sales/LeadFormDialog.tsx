import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRODUCT_CATEGORIES, Enquiry, UrgencyLevel } from '@/hooks/useEnquiries';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const LEAD_SOURCES = [
  'Website',
  'IndiaMART',
  'Trade India',
  'Just Dial',
  'Google Ads',
  'Facebook',
  'Instagram',
  'LinkedIn',
  'WhatsApp',
  'Referral',
  'Cold Call',
  'Exhibition',
  'Email Campaign',
  'Other',
] as const;

const URGENCY_LEVELS: { value: UrgencyLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Enquiry | null;
  onSuccess: () => void;
}

export function LeadFormDialog({ open, onOpenChange, lead, onSuccess }: LeadFormDialogProps) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_company: '',
    product_name: '',
    product_code: '',
    product_category: 'Consumer Drones' as string,
    quantity: 1,
    lead_source: 'Website',
    urgency: 'medium' as UrgencyLevel,
    requested_timeline: '',
    notes: '',
  });

  // Reset form when dialog opens/closes or lead changes
  useEffect(() => {
    if (open) {
      if (lead) {
        // Extract lead source from notes
        const leadSourceMatch = lead.notes?.match(/Lead Source:\s*([^|]+)/i);
        const leadSource = leadSourceMatch ? leadSourceMatch[1].trim() : 'Website';
        const notesWithoutSource = lead.notes?.replace(/Lead Source:\s*[^|]+\s*\|?\s*/i, '').trim() || '';
        
        setFormData({
          customer_name: lead.customer_name,
          customer_company: lead.customer_company,
          product_name: lead.product_name,
          product_code: lead.product_code || '',
          product_category: lead.product_category,
          quantity: lead.quantity,
          lead_source: LEAD_SOURCES.includes(leadSource as any) ? leadSource : 'Other',
          urgency: lead.urgency,
          requested_timeline: lead.requested_timeline || '',
          notes: notesWithoutSource,
        });
      } else {
        setFormData({
          customer_name: '',
          customer_company: '',
          product_name: '',
          product_code: '',
          product_category: 'Consumer Drones',
          quantity: 1,
          lead_source: 'Website',
          urgency: 'medium',
          requested_timeline: '',
          notes: '',
        });
      }
    }
  }, [open, lead]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !profile) {
      toast.error('You must be logged in');
      return;
    }

    if (!formData.customer_name || !formData.product_name) {
      toast.error('Customer Name and Product Name are required');
      return;
    }

    setLoading(true);
    try {
      const notesWithSource = `Lead Source: ${formData.lead_source}${formData.notes ? ` | ${formData.notes}` : ''}`;
      
      if (lead) {
        // Update existing lead
        const { error } = await supabase
          .from('enquiries')
          .update({
            customer_name: formData.customer_name,
            customer_company: formData.customer_company,
            product_name: formData.product_name,
            product_code: formData.product_code || 'N/A',
            product_category: formData.product_category,
            quantity: formData.quantity,
            urgency: formData.urgency,
            requested_timeline: formData.requested_timeline || null,
            notes: notesWithSource,
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id);

        if (error) throw error;
        toast.success('Lead updated successfully');
      } else {
        // Create new lead
        const { error } = await supabase.from('enquiries').insert({
          customer_name: formData.customer_name,
          customer_company: formData.customer_company,
          product_name: formData.product_name,
          product_code: formData.product_code || 'N/A',
          product_category: formData.product_category,
          quantity: formData.quantity,
          sales_person_id: user.id,
          sales_person_name: profile.name,
          urgency: formData.urgency,
          requested_timeline: formData.requested_timeline || null,
          notes: notesWithSource,
          status: 'pending',
        });

        if (error) throw error;
        toast.success('Lead created successfully');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving lead:', error);
      toast.error('Failed to save lead');
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!lead;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {isEditing ? 'Edit Lead' : 'Add New Lead'}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update the lead details below.' : 'Enter the lead details to create a new enquiry.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer_name">Customer Name *</Label>
              <Input
                id="customer_name"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                placeholder="John Doe"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_company">Company</Label>
              <Input
                id="customer_company"
                value={formData.customer_company}
                onChange={(e) => setFormData({ ...formData, customer_company: e.target.value })}
                placeholder="ABC Corp"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="product_name">Product Name *</Label>
              <Input
                id="product_name"
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                placeholder="DJI Mavic 3"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product_code">Product Code</Label>
              <Input
                id="product_code"
                value={formData.product_code}
                onChange={(e) => setFormData({ ...formData, product_code: e.target.value })}
                placeholder="DJI-M3-001"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="product_category">Category</Label>
              <Select
                value={formData.product_category}
                onValueChange={(value) => setFormData({ ...formData, product_category: value })}
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
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lead_source">Lead Source</Label>
              <Select
                value={formData.lead_source}
                onValueChange={(value) => setFormData({ ...formData, lead_source: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>{source}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="urgency">Urgency</Label>
              <Select
                value={formData.urgency}
                onValueChange={(value) => setFormData({ ...formData, urgency: value as UrgencyLevel })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {URGENCY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="requested_timeline">Requested Timeline</Label>
            <Input
              id="requested_timeline"
              value={formData.requested_timeline}
              onChange={(e) => setFormData({ ...formData, requested_timeline: e.target.value })}
              placeholder="e.g., 2 weeks, Urgent, End of month"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this lead..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isEditing ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                isEditing ? 'Update Lead' : 'Create Lead'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
