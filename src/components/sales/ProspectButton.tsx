import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useProspects } from '@/hooks/useProspects';
import { useAuth } from '@/hooks/useAuth';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { FollowupScheduleDialog } from './FollowupScheduleDialog';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const CUSTOMER_TYPES = [
  { value: 'B2C (Consumer)', label: 'B2C (Consumer)' },
  { value: 'B2B (Business)', label: 'B2B (Business)' },
  { value: 'B2G (Government)', label: 'B2G (Government)' },
  { value: 'Reseller', label: 'Reseller' },
];

interface ProspectButtonProps {
  sourceType: 'enquiry' | 'interakt' | 'myoperator' | 'email' | 'form_lead' | 'google_ads';
  sourceId: string;
  customerName: string;
  phoneNumber?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  productName?: string | null;
  notes?: string | null;
  isAlreadyProspect?: boolean;
  customerType?: string | null;
}

export function ProspectButton({
  sourceType,
  sourceId,
  customerName,
  phoneNumber,
  email,
  company,
  city,
  productName,
  notes,
  isAlreadyProspect = false,
  customerType: initialCustomerType,
}: ProspectButtonProps) {
  const { addProspect } = useProspects();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(isAlreadyProspect);
  const [showFollowup, setShowFollowup] = useState(false);
  const [newProspectId, setNewProspectId] = useState<string | null>(null);
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [selectedCustomerType, setSelectedCustomerType] = useState(initialCustomerType || '');
  const [resolvedProduct, setResolvedProduct] = useState('');

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (added || !user || !profile) return;

    let resolvedProductName = productName?.trim() || '';

    // Hydrate from DB for MyOperator and Email leads to avoid stale props
    if (!resolvedProductName && sourceType === 'myoperator') {
      const { data: latestLog } = await supabase
        .from('call_logs')
        .select('id, call_id, product_name, updated_at')
        .eq('id', sourceId)
        .maybeSingle();

      resolvedProductName = latestLog?.product_name?.trim() || '';

      if (!resolvedProductName && latestLog?.call_id) {
        const { data: relatedLogs } = await supabase
          .from('call_logs')
          .select('product_name, updated_at')
          .eq('call_id', latestLog.call_id)
          .order('updated_at', { ascending: false })
          .limit(20);

        resolvedProductName = relatedLogs?.find((log) => log.product_name?.trim())?.product_name?.trim() || '';
      }
    }

    // Email leads: hydrate from email_leads table
    if (!resolvedProductName && sourceType === 'email') {
      const { data: emailLead } = await supabase
        .from('email_leads')
        .select('product_name')
        .eq('id', sourceId)
        .maybeSingle();

      resolvedProductName = emailLead?.product_name?.trim() || '';
    }

    // Form leads: hydrate from form_leads table
    if (!resolvedProductName && sourceType === 'form_lead') {
      const { data: formLead } = await supabase
        .from('form_leads')
        .select('product_name')
        .eq('id', sourceId)
        .maybeSingle();

      resolvedProductName = formLead?.product_name?.trim() || '';
    }

    // Google Ads leads: hydrate from enquiries table
    if (!resolvedProductName && sourceType === 'google_ads') {
      const { data: gadsLead } = await supabase
        .from('enquiries')
        .select('product_name')
        .eq('id', sourceId)
        .maybeSingle();

      resolvedProductName = gadsLead?.product_name?.trim() || '';
    }

    if (!resolvedProductName) {
      toast.error('Product name is required before marking as Prospect. Please edit the lead and fill the Product field.');
      return;
    }

    // Try to get customer_type from the source lead if not passed
    let prefilledType = initialCustomerType || '';
    if (!prefilledType) {
      if (sourceType === 'interakt') {
        const { data } = await supabase.from('interakt_leads').select('customer_type').eq('id', sourceId).maybeSingle();
        prefilledType = data?.customer_type || '';
      } else if (sourceType === 'email') {
        const { data } = await supabase.from('email_leads').select('customer_type').eq('id', sourceId).maybeSingle();
        prefilledType = data?.customer_type || '';
      } else if (sourceType === 'myoperator') {
        const { data } = await supabase.from('call_logs').select('customer_type').eq('id', sourceId).maybeSingle();
        prefilledType = data?.customer_type || '';
      } else if (sourceType === 'form_lead') {
        const { data } = await supabase.from('form_leads').select('customer_type').eq('id', sourceId).maybeSingle();
        prefilledType = (data as any)?.customer_type || '';
      }
    }

    setResolvedProduct(resolvedProductName);
    setSelectedCustomerType(prefilledType);
    setShowTypeDialog(true);
  };

  const handleConfirmProspect = async () => {
    if (!selectedCustomerType) {
      toast.error('Please select a Customer Type before proceeding.');
      return;
    }
    if (!user || !profile) return;

    setShowTypeDialog(false);
    setLoading(true);
    try {
      const result = await addProspect({
        source_type: sourceType,
        source_id: sourceId,
        customer_name: customerName,
        phone_number: phoneNumber || null,
        email: email || null,
        company: company || null,
        city: city || null,
        product_name: resolvedProduct,
        notes: notes || null,
        is_a_category: false,
        status: 'new',
        created_by: user.id,
        created_by_name: profile.name,
        customer_type: selectedCustomerType,
      });
      setAdded(true);
      if (result) {
        setNewProspectId(result.id);
        setShowFollowup(true);
      }
    } catch {
      // Error handled by hook
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 rounded-full font-bold text-xs transition-all ${
              added
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 cursor-default'
                : 'hover:bg-amber-500/20 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 border border-dashed border-muted-foreground/30 hover:border-amber-500/50'
            }`}
            onClick={handleClick}
            disabled={loading || added}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'P'}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {added ? 'Already a Prospect' : 'Move to Prospects (+10 pts)'}
        </TooltipContent>
      </Tooltip>

      {/* Customer Type Selection Dialog */}
      <Dialog open={showTypeDialog} onOpenChange={setShowTypeDialog}>
        <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Select Customer Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-sm text-muted-foreground">
              Converting <span className="font-medium text-foreground">{customerName}</span> to Prospect
            </div>
            <div>
              <Label>Customer Type <span className="text-destructive">*</span></Label>
              <Select value={selectedCustomerType} onValueChange={setSelectedCustomerType}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select customer type..." />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMER_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTypeDialog(false)}>Cancel</Button>
            <Button onClick={handleConfirmProspect} disabled={!selectedCustomerType}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Follow-up Schedule Dialog */}
      <FollowupScheduleDialog
        open={showFollowup}
        onOpenChange={setShowFollowup}
        sourceType="prospect"
        sourceId={newProspectId || sourceId}
        customerName={customerName}
        customerCompany={company}
        productName={productName}
        phone={phoneNumber}
        email={email}
      />
    </TooltipProvider>
  );
}

interface ACategoryButtonProps {
  sourceType: 'enquiry' | 'interakt' | 'myoperator' | 'email' | 'form_lead' | 'google_ads';
  sourceId: string;
  isACategory: boolean;
  onToggle?: () => void;
}

export function ACategoryButton({
  isACategory,
  onToggle,
}: ACategoryButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 rounded-full font-bold text-xs transition-all ${
              isACategory
                ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/40'
                : 'hover:bg-red-500/20 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 border border-dashed border-muted-foreground/30 hover:border-red-500/50'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.();
            }}
          >
            A
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isACategory ? 'A-Category Big Deal 🌟' : 'Mark as A-Category Big Deal (+20 pts)'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
