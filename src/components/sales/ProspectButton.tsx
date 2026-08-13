import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useProspects } from '@/hooks/useProspects';
import { useAuth } from '@/hooks/useAuth';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { FollowupScheduleDialog } from './FollowupScheduleDialog';
import { ProspectCreateDialog } from './ProspectCreateDialog';
import { supabase } from '@/integrations/supabase/client';

const SOURCE_LABEL_MAP: Record<string, string> = {
  myoperator: 'MyOperator',
  manychat: 'ManyChat',
  interakt: 'Interakt',
  form_lead: 'Website Form',
  email: 'Email',
  enquiry: 'Enquiry',
  google_ads: 'Google Ads',
};

interface ProspectButtonProps {
  sourceType: 'enquiry' | 'interakt' | 'myoperator' | 'email' | 'form_lead' | 'google_ads' | 'lead' | 'manychat';
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
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [prefillData, setPrefillData] = useState<Record<string, any>>({});

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (added || !user || !profile) return;
    setLoading(true);

    try {
      let resolvedProductName = productName?.trim() || '';

      // Hydrate product name from DB for various lead sources
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
      if (!resolvedProductName && sourceType === 'email') {
        const { data } = await supabase.from('email_leads').select('product_name').eq('id', sourceId).maybeSingle();
        resolvedProductName = data?.product_name?.trim() || '';
      }
      if (!resolvedProductName && sourceType === 'form_lead') {
        const { data } = await supabase.from('form_leads').select('product_name').eq('id', sourceId).maybeSingle();
        resolvedProductName = data?.product_name?.trim() || '';
      }
      if (!resolvedProductName && sourceType === 'google_ads') {
        const { data } = await supabase.from('enquiries').select('product_name').eq('id', sourceId).maybeSingle();
        resolvedProductName = data?.product_name?.trim() || '';
      }

      // Get customer_type from source
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

      setPrefillData({
        customer_name: customerName || '',
        phone_number: phoneNumber || '',
        email: email || '',
        company: company || '',
        city: city || '',
        product_name: resolvedProductName,
        notes: notes || '',
        customer_type: prefilledType,
        lead_source: SOURCE_LABEL_MAP[sourceType] || sourceType,
        source_type: sourceType,
        source_id: sourceId,
      });
      setShowCreateDialog(true);
    } catch {
      toast.error('Failed to load lead details');
    } finally {
      setLoading(false);
    }
  };

  const handleProspectCreated = (prospectId: string) => {
    setAdded(true);
    setNewProspectId(prospectId);
    setShowFollowup(true);
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

      <ProspectCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        prefillData={prefillData}
        onCreated={handleProspectCreated}
      />

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
  sourceType: 'enquiry' | 'interakt' | 'myoperator' | 'email' | 'form_lead' | 'google_ads' | 'lead' | 'manychat';
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
