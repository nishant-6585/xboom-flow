import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Enquiry } from '@/hooks/useEnquiries';
import { Eye, Phone, MessageSquare, Calendar, Building2, Package, User } from 'lucide-react';
import { format } from 'date-fns';
import { LeadTemperatureBadge } from '@/components/LeadTemperatureBadge';

interface LeadCardProps {
  lead: Enquiry;
  onView: (lead: Enquiry) => void;
  onCall?: (lead: Enquiry) => void;
  onWhatsApp?: (lead: Enquiry) => void;
  showSalesPerson?: boolean;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending': return 'bg-blue-500/20 text-blue-700 dark:text-blue-400';
    case 'responded': return 'bg-purple-500/20 text-purple-700 dark:text-purple-400';
    case 'moved_to_pipeline': return 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-400';
    case 'order_won': return 'bg-green-500/20 text-green-700 dark:text-green-400';
    case 'order_lost': return 'bg-red-500/20 text-red-700 dark:text-red-400';
    default: return 'bg-muted text-muted-foreground';
  }
};

const getUrgencyColor = (urgency: string) => {
  switch (urgency) {
    case 'critical': return 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30';
    case 'high': return 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30';
    case 'medium': return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
    default: return 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30';
  }
};

export function LeadCard({ lead, onView, onCall, onWhatsApp, showSalesPerson = false }: LeadCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        {/* Header with status and temperature */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={getStatusColor(lead.status)}>
              {lead.status.replace(/_/g, ' ')}
            </Badge>
            <LeadTemperatureBadge 
              temperature={lead.lead_temperature || 'warm'} 
              isMegaDeal={lead.is_mega_deal || false}
              size="sm"
            />
          </div>
          <Badge variant="outline" className={getUrgencyColor(lead.urgency)}>
            {lead.urgency}
          </Badge>
        </div>

        {/* Customer Info */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{lead.customer_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground truncate">{lead.customer_company}</span>
          </div>
        </div>

        {/* Product Info */}
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm truncate">{lead.product_name}</span>
          <Badge variant="secondary" className="text-xs shrink-0">Qty: {lead.quantity}</Badge>
        </div>

        {/* Date and Sales Person */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>{format(new Date(lead.created_at), 'dd MMM yyyy')}</span>
          </div>
          {showSalesPerson && (
            <span className="truncate max-w-[100px]">{lead.sales_person_name}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onView(lead)}>
            <Eye className="w-4 h-4 mr-1" />
            View
          </Button>
          {onCall && (
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => onCall(lead)}>
              <Phone className="w-4 h-4" />
            </Button>
          )}
          {onWhatsApp && (
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => onWhatsApp(lead)}>
              <MessageSquare className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
