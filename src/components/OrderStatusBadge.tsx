import { Badge } from '@/components/ui/badge';
import { OrderStatus } from '@/hooks/useOrders';
import { 
  Clock, 
  CheckCircle, 
  ShoppingCart, 
  Truck, 
  Package, 
  XCircle,
  Building2
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
  pending: { 
    label: 'Pending', 
    variant: 'secondary', 
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: Clock
  },
  confirmed: { 
    label: 'Confirmed', 
    variant: 'default', 
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: CheckCircle
  },
  procuring: { 
    label: 'Procuring', 
    variant: 'secondary', 
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    icon: ShoppingCart
  },
  in_transit: { 
    label: 'In Transit', 
    variant: 'default', 
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    icon: Truck
  },
  customs: { 
    label: 'Customs', 
    variant: 'secondary', 
    className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    icon: Building2
  },
  delivered: { 
    label: 'Delivered', 
    variant: 'default', 
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: Package
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
    <Badge variant={config.variant} className={`${config.className} gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
