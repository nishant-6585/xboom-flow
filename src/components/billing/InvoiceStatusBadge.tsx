import { Badge } from '@/components/ui/badge';
import { InvoiceStatus } from '@/hooks/useInvoices';
import { FileText, Send, CheckCircle, AlertCircle, XCircle, Clock, PenTool } from 'lucide-react';

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
  size?: 'sm' | 'md' | 'lg';
}

const STATUS_CONFIG: Record<InvoiceStatus, { 
  label: string; 
  color: string; 
  bgColor: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  draft: { 
    label: 'Draft', 
    color: 'text-gray-700', 
    bgColor: 'bg-gray-100',
    icon: FileText 
  },
  pending_signature: { 
    label: 'Pending Signature', 
    color: 'text-orange-700', 
    bgColor: 'bg-orange-100',
    icon: PenTool 
  },
  signed: { 
    label: 'Signed', 
    color: 'text-green-700', 
    bgColor: 'bg-green-100',
    icon: CheckCircle 
  },
  sent: { 
    label: 'Sent', 
    color: 'text-blue-700', 
    bgColor: 'bg-blue-100',
    icon: Send 
  },
  paid: { 
    label: 'Paid', 
    color: 'text-green-700', 
    bgColor: 'bg-green-100',
    icon: CheckCircle 
  },
  partial: { 
    label: 'Partial', 
    color: 'text-yellow-700', 
    bgColor: 'bg-yellow-100',
    icon: Clock 
  },
  overdue: { 
    label: 'Overdue', 
    color: 'text-red-700', 
    bgColor: 'bg-red-100',
    icon: AlertCircle 
  },
  cancelled: { 
    label: 'Cancelled', 
    color: 'text-gray-500', 
    bgColor: 'bg-gray-100',
    icon: XCircle 
  },
};

export function InvoiceStatusBadge({ status, size = 'md' }: InvoiceStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-0.5',
    lg: 'text-base px-3 py-1',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  };

  return (
    <Badge 
      variant="outline" 
      className={`${config.bgColor} ${config.color} border-0 font-medium ${sizeClasses[size]} flex items-center gap-1.5`}
    >
      <Icon className={iconSizes[size]} />
      {config.label}
    </Badge>
  );
}
