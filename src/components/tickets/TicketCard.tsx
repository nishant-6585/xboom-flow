import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { Ticket } from "@/hooks/useTickets";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { MessageSquare, Clock, User, Building2, Link2, Eye, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TicketCardProps {
  ticket: Ticket;
  onView: (ticket: Ticket) => void;
}

const categoryLabels: Record<string, string> = {
  general_inquiry: "General Inquiry",
  order_issue: "Order Issue",
  payment_issue: "Payment Issue",
  delivery_issue: "Delivery Issue",
  supplier_issue: "Supplier Issue",
  procurement_request: "Procurement Request",
  refund_request: "Refund Request",
  technical_support: "Technical Support",
  documentation: "Documentation",
  other: "Other",
};

const departmentLabels: Record<string, string> = {
  sales: "Sales",
  supply_chain: "Supply Chain",
  finance: "Finance",
  admin: "Admin",
};

export function TicketCard({ ticket, onView }: TicketCardProps) {
  const isOverdue = ticket.sla_due_at && isPast(new Date(ticket.sla_due_at)) && ticket.status !== "resolved" && ticket.status !== "closed" && ticket.status !== "removed";

  return (
    <Card 
      className={cn(
        "hover:shadow-md transition-shadow cursor-pointer",
        isOverdue && "border-destructive border-2 bg-destructive/5"
      )}
      onClick={() => onView(ticket)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isOverdue && (
                <AlertTriangle className="w-4 h-4 text-destructive" />
              )}
              <span className="text-xs font-mono text-muted-foreground">
                {ticket.ticket_number}
              </span>
              <TicketStatusBadge status={ticket.status} />
              <TicketPriorityBadge priority={ticket.priority} />
            </div>
            <h3 className="font-semibold text-base leading-tight truncate">
              {ticket.subject}
            </h3>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {ticket.description}
        </p>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="text-xs">
            {categoryLabels[ticket.category] || ticket.category}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <Building2 className="w-3 h-3 mr-1" />
            {departmentLabels[ticket.assigned_department]}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {ticket.raised_by_name}
          </span>
          {ticket.assigned_to_name && (
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {ticket.assigned_to_name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
          </span>
        </div>

        {(ticket.orders || ticket.enquiries) && (
          <div className="flex items-center gap-1 text-xs text-primary">
            <Link2 className="w-3 h-3" />
            {ticket.orders && (
              <span>Order: {ticket.orders.order_number}</span>
            )}
            {ticket.enquiries && (
              <span>Enquiry: {ticket.enquiries.customer_name}</span>
            )}
          </div>
        )}

        {isOverdue && (
          <div className="flex items-center gap-1 text-xs text-destructive font-medium bg-destructive/10 rounded-md px-2 py-1">
            <AlertTriangle className="w-3 h-3" />
            SLA Breached - Immediate attention required
          </div>
        )}

        <div className="pt-2 border-t">
          <Button 
            size="sm" 
            variant="outline" 
            className="w-full" 
            onClick={(e) => {
              e.stopPropagation();
              onView(ticket);
            }}
          >
            <Eye className="w-4 h-4 mr-2" />
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
