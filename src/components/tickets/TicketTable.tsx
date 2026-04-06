import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { TicketSlaAlertBanner } from "./TicketSlaAlertBanner";
import { Ticket } from "@/hooks/useTickets";
import { useTicketSlaAlerts } from "@/hooks/useTicketAi";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { Eye, AlertTriangle, Clock, User, Building2, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TicketTableProps {
  tickets: Ticket[];
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

export function TicketTable({ tickets, onView }: TicketTableProps) {
  const ticketIds = tickets.map((t) => t.id);
  const { data: slaAlerts = [] } = useTicketSlaAlerts(ticketIds.length > 0 ? ticketIds : undefined);
  const alertedTicketIds = new Set(slaAlerts.map((a) => a.ticket_id));

  const isOverdue = (ticket: Ticket) => {
    return (
      ticket.sla_breached ||
      (ticket.sla_due_at &&
      isPast(new Date(ticket.sla_due_at)) &&
      ticket.status !== "resolved" &&
      ticket.status !== "closed" &&
      ticket.status !== "removed")
    );
  };

  return (
    <div className="rounded-md border overflow-hidden">
      {/* SLA Alert Banner at top of table */}
      {slaAlerts.length > 0 && (
        <div className="p-3 border-b bg-destructive/5">
          <TicketSlaAlertBanner ticketIds={ticketIds} />
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[100px]">Ticket #</TableHead>
            <TableHead className="min-w-[200px]">Subject</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Raised By</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead>SLA Due</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                No tickets found
              </TableCell>
            </TableRow>
          ) : (
            tickets.map((ticket) => {
              const overdue = isOverdue(ticket);
              return (
                <TableRow
                  key={ticket.id}
                  className={cn(
                    "cursor-pointer hover:bg-muted/50 transition-colors",
                    overdue && "bg-destructive/5 hover:bg-destructive/10 border-l-4 border-l-destructive"
                  )}
                  onClick={() => onView(ticket)}
                >
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-1">
                      {overdue && (
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                      )}
                      {alertedTicketIds.has(ticket.id) && !overdue && (
                        <AlertTriangle className="w-4 h-4 text-orange-500 animate-pulse" />
                      )}
                      {ticket.ticket_number}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[250px] truncate font-medium flex items-center gap-1.5">
                      {ticket.subject}
                    </div>
                    {(ticket.orders || ticket.enquiries) && (
                      <div className="flex items-center gap-1 text-xs text-primary mt-1">
                        <Link2 className="w-3 h-3" />
                        {ticket.orders && <span>{ticket.orders.order_number}</span>}
                        {ticket.enquiries && <span>{ticket.enquiries.customer_name}</span>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs whitespace-nowrap">
                      {categoryLabels[ticket.category] || ticket.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <TicketStatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell>
                    <TicketPriorityBadge priority={ticket.priority} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs">
                      <Building2 className="w-3 h-3" />
                      {departmentLabels[ticket.assigned_department]}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs">
                      <User className="w-3 h-3" />
                      <span className="truncate max-w-[100px]">{ticket.raised_by_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {ticket.assigned_to_name ? (
                      <div className="flex items-center gap-1 text-xs">
                        <User className="w-3 h-3" />
                        <span className="truncate max-w-[100px]">{ticket.assigned_to_name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {ticket.sla_due_at ? (
                      <div
                        className={cn(
                          "flex items-center gap-1 text-xs",
                          overdue && "text-destructive font-medium"
                        )}
                      >
                        <Clock className="w-3 h-3" />
                        {overdue ? (
                          <span>Breached</span>
                        ) : (
                          <span>{format(new Date(ticket.sla_due_at), "dd MMM, HH:mm")}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onView(ticket);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
