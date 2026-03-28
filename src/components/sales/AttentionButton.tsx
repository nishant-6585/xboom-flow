import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useAttentionItems } from '@/hooks/useAttentionItems';
import { useAuth } from '@/hooks/useAuth';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface AttentionButtonProps {
  sourceType: 'enquiry' | 'interakt' | 'myoperator' | 'email';
  sourceId: string;
  customerName: string;
  phoneNumber?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  productName?: string | null;
  notes?: string | null;
  isAlreadyAttention?: boolean;
}

export function AttentionButton({
  sourceType,
  sourceId,
  customerName,
  phoneNumber,
  email,
  company,
  city,
  productName,
  notes,
  isAlreadyAttention = false,
}: AttentionButtonProps) {
  const { addItem } = useAttentionItems();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(isAlreadyAttention);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (added || !user || !profile) return;
    setLoading(true);
    try {
      await addItem({
        source_type: sourceType,
        source_id: sourceId,
        customer_name: customerName,
        phone_number: phoneNumber || null,
        email: email || null,
        company: company || null,
        city: city || null,
        product_name: productName || null,
        notes: notes || null,
        status: 'active',
        marked_by: user.id,
        marked_by_name: profile.name,
      });
      setAdded(true);
    } catch {
      // handled by hook
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
            className={`h-7 w-7 rounded-full transition-all ${
              added
                ? 'bg-destructive/20 text-destructive cursor-default'
                : 'hover:bg-destructive/20 text-muted-foreground hover:text-destructive border border-dashed border-muted-foreground/30 hover:border-destructive/50'
            }`}
            onClick={handleClick}
            disabled={loading || added}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {added ? 'Marked for Attention 🚨' : 'Mark for Attention (notify manager)'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
