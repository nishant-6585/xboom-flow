import { Badge } from '@/components/ui/badge';
import { OrderStatus } from '@/hooks/useOrders';
import { 
  FileText, 
  CheckCircle, 
  CreditCard, 
  Clock, 
  Settings, 
  Package, 
  XCircle,
  Truck
} from 'lucide-react';

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

const statusConfig: Record<OrderStatus, { 
  label: string; 
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  po_received: { 
    label: 'PO Received', 
    variant: 'secondary', 
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: FileText
  },
  payment_received: { 
    label: 'Payment Received', 
    variant: 'default', 
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: CreditCard
  },
  partial_payment_received: { 
    label: 'Partial Payment', 
    variant: 'secondary', 
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: CreditCard
  },
  procurement_to_plan: { 
    label: 'Procurement to Plan', 
    variant: 'secondary', 
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    icon: Clock
  },
  procurement_in_process: { 
    label: 'Procurement in Process', 
    variant: 'default', 
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    icon: Settings
  },
  procurement_done: { 
    label: 'Procurement Done', 
    variant: 'default', 
    className: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    icon: CheckCircle
  },
  to_ship: { 
    label: 'To Ship', 
    variant: 'default', 
    className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    icon: Package
  },
  in_transit: { 
    label: 'In Transit', 
    variant: 'default', 
    className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    icon: Truck
  },
  delivery_done: { 
    label: 'Delivery Done', 
    variant: 'default', 
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    icon: Truck
  },
  cancelled: { 
    label: 'Cancelled', 
    variant: 'destructive', 
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: XCircle
  },
};

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={`${config.className} text-xs gap-1 font-medium`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
