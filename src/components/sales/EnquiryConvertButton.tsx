import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface EnquiryConvertButtonProps {
  sourceType: 'interakt' | 'myoperator' | 'email' | 'form_lead';
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

    if (!productName || productName.trim() === '') {
      toast.error('Product name is required before converting to enquiry. Please edit the lead and fill the Product field.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('enquiries').insert({
        product_name: productName || 'Unknown Product',
        product_code: productCode || '',
        product_category: productCategory || 'Consumer Drones',
        quantity: quantity || 1,
        customer_name: customerName,
        customer_company: company || '',
        sales_person_id: user.id,
        sales_person_name: profile.name,
        urgency: urgency || 'medium',
        requested_timeline: requestedTimeline || null,
        notes: [
          notes,
          purposeOfPurchase ? `Purpose: ${purposeOfPurchase}` : null,
          email ? `Email: ${email}` : null,
          phoneNumber ? `Phone: ${phoneNumber}` : null,
          city ? `City: ${city}` : null,
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
