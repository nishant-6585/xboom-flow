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

      // MyOperator rows can be grouped/duplicated by call session.
      // Always hydrate from latest DB row and, if needed, sibling rows with same call_id.
      if (sourceType === 'myoperator') {
        const applyLogData = (log: any) => {
          resolvedCustomerName = log.customer_name || resolvedCustomerName;
          resolvedPhoneNumber = log.full_number || log.caller_number || resolvedPhoneNumber;
          resolvedEmail = log.email || resolvedEmail;
          resolvedCompany = log.customer_company || resolvedCompany;
          resolvedCity = log.city || resolvedCity;
          resolvedProductName = log.product_name?.trim() || resolvedProductName;
          resolvedProductCategory = log.product_category || resolvedProductCategory;
          resolvedProductCode = log.product_code || resolvedProductCode;
          resolvedQuantity = log.quantity ?? resolvedQuantity;
          resolvedUrgency = log.urgency || resolvedUrgency;
          resolvedRequestedTimeline = log.requested_timeline || resolvedRequestedTimeline;
          resolvedPurposeOfPurchase = log.purpose_of_purchase || resolvedPurposeOfPurchase;
          resolvedNotes = log.notes || resolvedNotes;
        };

        const { data: latestLog } = await supabase
          .from('call_logs')
          .select(
            'id, call_id, customer_name, customer_company, email, city, product_name, product_category, product_code, quantity, urgency, requested_timeline, purpose_of_purchase, notes, full_number, caller_number, updated_at'
          )
          .eq('id', sourceId)
          .maybeSingle();

        if (latestLog) {
          applyLogData(latestLog);

          if (!resolvedProductName && latestLog.call_id) {
            const { data: relatedLogs } = await supabase
              .from('call_logs')
              .select(
                'id, call_id, customer_name, customer_company, email, city, product_name, product_category, product_code, quantity, urgency, requested_timeline, purpose_of_purchase, notes, full_number, caller_number, updated_at'
              )
              .eq('call_id', latestLog.call_id)
              .order('updated_at', { ascending: false })
              .limit(20);

            if (relatedLogs && relatedLogs.length > 0) {
              const bestRelatedLog = relatedLogs.find((log) => log.product_name?.trim()) || relatedLogs[0];
              applyLogData(bestRelatedLog);
            }
          }
        }
      }

      // Email leads: hydrate from email_leads table
      if (sourceType === 'email') {
        const { data: emailLead } = await supabase
          .from('email_leads')
          .select('customer_name, customer_company, email, phone_number, city, product_name, product_category, product_code, quantity, urgency, requested_timeline, purpose_of_purchase, notes')
          .eq('id', sourceId)
          .maybeSingle();

        if (emailLead) {
          resolvedCustomerName = emailLead.customer_name || resolvedCustomerName;
          resolvedPhoneNumber = emailLead.phone_number || resolvedPhoneNumber;
          resolvedEmail = emailLead.email || resolvedEmail;
          resolvedCompany = emailLead.customer_company || resolvedCompany;
          resolvedCity = emailLead.city || resolvedCity;
          resolvedProductName = emailLead.product_name?.trim() || resolvedProductName;
          resolvedProductCategory = emailLead.product_category || resolvedProductCategory;
          resolvedProductCode = emailLead.product_code || resolvedProductCode;
          resolvedQuantity = emailLead.quantity ?? resolvedQuantity;
          resolvedUrgency = emailLead.urgency || resolvedUrgency;
          resolvedRequestedTimeline = emailLead.requested_timeline || resolvedRequestedTimeline;
          resolvedPurposeOfPurchase = emailLead.purpose_of_purchase || resolvedPurposeOfPurchase;
          resolvedNotes = emailLead.notes || resolvedNotes;
        }
      }

      // Form leads: hydrate from form_leads table
      if (sourceType === 'form_lead') {
        const { data: formLead } = await supabase
          .from('form_leads')
          .select('customer_name, email, phone, company, city, product_name, notes')
          .eq('id', sourceId)
          .maybeSingle();

        if (formLead) {
          resolvedCustomerName = formLead.customer_name || resolvedCustomerName;
          resolvedPhoneNumber = formLead.phone || resolvedPhoneNumber;
          resolvedEmail = formLead.email || resolvedEmail;
          resolvedCompany = formLead.company || resolvedCompany;
          resolvedCity = formLead.city || resolvedCity;
          resolvedProductName = formLead.product_name?.trim() || resolvedProductName;
          resolvedNotes = formLead.notes || resolvedNotes;
        }
      }

      // Google Ads leads: hydrate from enquiries table
      if (sourceType === 'google_ads') {
        const { data: gadsLead } = await supabase
          .from('enquiries')
          .select('customer_name, customer_company, product_name, product_category, product_code, quantity, urgency, requested_timeline, notes')
          .eq('id', sourceId)
          .maybeSingle();

        if (gadsLead) {
          resolvedCustomerName = gadsLead.customer_name || resolvedCustomerName;
          resolvedCompany = gadsLead.customer_company || resolvedCompany;
          resolvedProductName = gadsLead.product_name?.trim() || resolvedProductName;
          resolvedProductCategory = gadsLead.product_category || resolvedProductCategory;
          resolvedProductCode = gadsLead.product_code || resolvedProductCode;
          resolvedQuantity = gadsLead.quantity ?? resolvedQuantity;
          resolvedUrgency = gadsLead.urgency || resolvedUrgency;
          resolvedRequestedTimeline = gadsLead.requested_timeline || resolvedRequestedTimeline;
          resolvedNotes = gadsLead.notes || resolvedNotes;
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
