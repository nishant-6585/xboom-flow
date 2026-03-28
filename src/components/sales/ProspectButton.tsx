import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useProspects } from '@/hooks/useProspects';
import { useAuth } from '@/hooks/useAuth';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface ProspectButtonProps {
  sourceType: 'enquiry' | 'interakt' | 'myoperator' | 'email';
  sourceId: string;
  customerName: string;
  phoneNumber?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  productName?: string | null;
  notes?: string | null;
  isAlreadyProspect?: boolean;
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
}: ProspectButtonProps) {
  const { addProspect } = useProspects();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(isAlreadyProspect);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (added || !user || !profile) return;
    if (!productName || productName.trim() === '') {
      toast.error('Product name is required before marking as Prospect. Please edit the lead and fill the Product field.');
      return;
    }
    setLoading(true);
    try {
      await addProspect({
        source_type: sourceType,
        source_id: sourceId,
        customer_name: customerName,
        phone_number: phoneNumber || null,
        email: email || null,
        company: company || null,
        city: city || null,
        product_name: productName || null,
        notes: notes || null,
        is_a_category: false,
        status: 'new',
        created_by: user.id,
        created_by_name: profile.name,
      });
      setAdded(true);
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
    </TooltipProvider>
  );
}

interface ACategoryButtonProps {
  sourceType: 'enquiry' | 'interakt' | 'myoperator' | 'email';
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
