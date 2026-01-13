import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface OrderNumberBadgeProps {
  orderNumber: string | null | undefined;
  className?: string;
  size?: 'sm' | 'md';
}

export function OrderNumberBadge({ orderNumber, className, size = 'sm' }: OrderNumberBadgeProps) {
  const [copied, setCopied] = useState(false);

  if (!orderNumber) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(orderNumber);
    setCopied(true);
    toast.success('Order number copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center gap-1.5 font-mono font-medium text-primary bg-primary/10 rounded transition-colors hover:bg-primary/20 group',
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1',
        className
      )}
      title="Click to copy"
    >
      {orderNumber}
      {copied ? (
        <Check className={cn('text-green-600', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      ) : (
        <Copy className={cn('opacity-0 group-hover:opacity-100 transition-opacity', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      )}
    </button>
  );
}
