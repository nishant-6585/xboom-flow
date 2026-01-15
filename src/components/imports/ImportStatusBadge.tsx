import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  Truck, 
  Ship, 
  Anchor, 
  FileCheck, 
  CheckCircle2, 
  Package, 
  XCircle 
} from "lucide-react";
import { ImportStatus } from "@/hooks/useImports";

interface ImportStatusBadgeProps {
  status: ImportStatus | string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode; className: string }> = {
  pending: { 
    label: 'Pending', 
    variant: 'secondary', 
    icon: <Clock className="w-3 h-3" />,
    className: 'bg-muted text-muted-foreground'
  },
  shipped: { 
    label: 'Shipped', 
    variant: 'default', 
    icon: <Truck className="w-3 h-3" />,
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  },
  in_transit: { 
    label: 'In Transit', 
    variant: 'default', 
    icon: <Ship className="w-3 h-3" />,
    className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
  },
  at_port: { 
    label: 'At Port', 
    variant: 'default', 
    icon: <Anchor className="w-3 h-3" />,
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
  },
  customs_clearance: { 
    label: 'Customs', 
    variant: 'default', 
    icon: <FileCheck className="w-3 h-3" />,
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
  },
  cleared: { 
    label: 'Cleared', 
    variant: 'default', 
    icon: <CheckCircle2 className="w-3 h-3" />,
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
  },
  delivered: { 
    label: 'Delivered', 
    variant: 'default', 
    icon: <Package className="w-3 h-3" />,
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  },
  cancelled: { 
    label: 'Cancelled', 
    variant: 'destructive', 
    icon: <XCircle className="w-3 h-3" />,
    className: 'bg-destructive/10 text-destructive'
  },
};

export function ImportStatusBadge({ status }: ImportStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;

  return (
    <Badge variant={config.variant} className={`gap-1 ${config.className}`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
