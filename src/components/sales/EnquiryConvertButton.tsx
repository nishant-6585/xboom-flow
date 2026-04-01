import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface EnquiryConvertButtonProps {
  sourceType: 'interakt' | 'myoperator' | 'email' | 'form_lead' | 'google_ads';
  sourceId: string;
  customerName: string;
  phoneNumber?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  productName?: string | null;
  productCategory?: string | null;
  productCode?: string | null;
  quantity?: number | null;
  urgency?: string | null;
  requestedTimeline?: string | null;
  purposeOfPurchase?: string | null;
  notes?: string | null;
  isAlreadyConverted?: boolean;
}

export function EnquiryConvertButton({
  sourceType,
  sourceId,
  customerName,
  phoneNumber,
  email,
  company,
  city,
  productName,
  productCategory,
  productCode,
  quantity,
  urgency,
  requestedTimeline,
  purposeOfPurchase,
  notes,
  isAlreadyConverted = false,
}: EnquiryConvertButtonProps) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [converted, setConverted] = useState(isAlreadyConverted);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (converted || !user || !profile) return;

    setLoading(true);
    try {
      let resolvedCustomerName = customerName;
      let resolvedPhoneNumber = phoneNumber;
      let resolvedEmail = email;
      let resolvedCompany = company;
      let resolvedCity = city;
      let resolvedProductName = productName?.trim() || '';
      let resolvedProductCategory = productCategory;
      let resolvedProductCode = productCode;
      let resolvedQuantity = quantity;
      let resolvedUrgency = urgency;
      let resolvedRequestedTimeline = requestedTimeline;
      let resolvedPurposeOfPurchase = purposeOfPurchase;
      let resolvedNotes = notes;

      // MyOperator rows can be grouped/updated asynchronously in UI.
      // Re-fetch latest call_log row once before validating product_name.
      if (sourceType === 'myoperator' && !resolvedProductName) {
        const { data: latestLog } = await supabase
          .from('call_logs')
          .select(
            'customer_name, customer_company, email, city, product_name, product_category, product_code, quantity, urgency, requested_timeline, purpose_of_purchase, notes, full_number, caller_number'
          )
          .eq('id', sourceId)
          .maybeSingle();

        if (latestLog) {
          resolvedCustomerName = latestLog.customer_name || resolvedCustomerName;
          resolvedPhoneNumber = latestLog.full_number || latestLog.caller_number || resolvedPhoneNumber;
          resolvedEmail = latestLog.email || resolvedEmail;
          resolvedCompany = latestLog.customer_company || resolvedCompany;
          resolvedCity = latestLog.city || resolvedCity;
          resolvedProductName = latestLog.product_name?.trim() || resolvedProductName;
          resolvedProductCategory = latestLog.product_category || resolvedProductCategory;
          resolvedProductCode = latestLog.product_code || resolvedProductCode;
          resolvedQuantity = latestLog.quantity ?? resolvedQuantity;
          resolvedUrgency = latestLog.urgency || resolvedUrgency;
          resolvedRequestedTimeline = latestLog.requested_timeline || resolvedRequestedTimeline;
          resolvedPurposeOfPurchase = latestLog.purpose_of_purchase || resolvedPurposeOfPurchase;
          resolvedNotes = latestLog.notes || resolvedNotes;
        }
      }

      if (!resolvedProductName) {
        toast.error('Product name is required before converting to enquiry. Please save product details and retry.');
        return;
      }

      const { error } = await supabase.from('enquiries').insert({
        product_name: resolvedProductName,
        product_code: resolvedProductCode || '',
        product_category: resolvedProductCategory || 'Consumer Drones',
        quantity: resolvedQuantity || 1,
        customer_name: resolvedCustomerName,
        customer_company: resolvedCompany || '',
        sales_person_id: user.id,
        sales_person_name: profile.name,
        urgency: resolvedUrgency || 'medium',
        requested_timeline: resolvedRequestedTimeline || null,
        notes: [
          resolvedNotes,
          resolvedPurposeOfPurchase ? `Purpose: ${resolvedPurposeOfPurchase}` : null,
          resolvedEmail ? `Email: ${resolvedEmail}` : null,
          resolvedPhoneNumber ? `Phone: ${resolvedPhoneNumber}` : null,
          resolvedCity ? `City: ${resolvedCity}` : null,
          `Converted from ${sourceType} (ID: ${sourceId})`,
        ].filter(Boolean).join('\n'),
        status: 'pending',
        lead_temperature: 'warm',
        is_mega_deal: false,
      });

      if (error) throw error;

      setConverted(true);
      toast.success(`Lead converted to enquiry successfully`);
    } catch (err: any) {
      console.error('Error converting to enquiry:', err);
      toast.error('Failed to convert to enquiry');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant={converted ? 'secondary' : 'outline'}
            className={`h-7 w-7 p-0 text-xs font-bold ${
              converted
                ? 'bg-blue-500/20 text-blue-500 border-blue-500/30 cursor-default'
                : 'hover:bg-blue-500/10 hover:text-blue-500 hover:border-blue-500/50'
            }`}
            onClick={handleClick}
            disabled={loading || converted}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'E'}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {converted ? 'Already converted to Enquiry' : 'Convert to Enquiry'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
