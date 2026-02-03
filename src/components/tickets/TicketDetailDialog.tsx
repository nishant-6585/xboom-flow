import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { Ticket, useTickets, useTicketComments, useTeamMembers } from "@/hooks/useTickets";
import { useAuth } from "@/hooks/useAuth";
import { format, formatDistanceToNow, isPast } from "date-fns";
import {
  User,
  Building2,
  Clock,
  MessageSquare,
  Send,
  AlertCircle,
  CheckCircle2,
  Link2,
  Loader2,
} from "lucide-react";
import { Database } from "@/integrations/supabase/types";

type TicketStatus = Database["public"]["Enums"]["ticket_status"];

interface TicketDetailDialogProps {
  ticket: Ticket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusFlow: TicketStatus[] = ["open", "assigned", "in_progress", "pending", "resolved", "closed"];

const departmentLabels: Record<string, string> = {
  sales: "Sales",
  supply_chain: "Supply Chain",
  finance: "Finance",
  admin: "Admin",
};

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

export function TicketDetailDialog({ ticket, open, onOpenChange }: TicketDetailDialogProps) {
  const { user, role } = useAuth();
  const { updateTicket } = useTickets();
  const { comments, addComment } = useTicketComments(ticket?.id ?? null);
  const { data: teamMembers = [] } = useTeamMembers();

  const [newComment, setNewComment] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");

  if (!ticket) return null;

  const isOverdue = ticket.sla_due_at && isPast(new Date(ticket.sla_due_at)) && ticket.status !== "resolved" && ticket.status !== "closed";
  const canManage = role === "admin" || role === ticket.assigned_department || ticket.assigned_to === user?.id;
  const isResolved = ticket.status === "resolved" || ticket.status === "closed";

  const departmentMembers = teamMembers.filter(
    (m) => m.role === ticket.assigned_department
  );

  const handleStatusChange = async (newStatus: TicketStatus) => {
    await updateTicket.mutateAsync({
      id: ticket.id,
      status: newStatus,
      resolution_notes: newStatus === "resolved" ? resolutionNotes : undefined,
    });
  };

  const handleAssign = async (userId: string) => {
    const member = teamMembers.find((m) => m.user_id === userId);
    await updateTicket.mutateAsync({
      id: ticket.id,
      assigned_to: userId,
      assigned_to_name: member?.name || null,
    });
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    await addComment.mutateAsync({ comment: newComment });
    setNewComment("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground">
                  {ticket.ticket_number}
                </span>
                <TicketStatusBadge status={ticket.status} />
                <TicketPriorityBadge priority={ticket.priority} />
                {isOverdue && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    SLA Breached
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-lg">{ticket.subject}</DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 pb-6">
            {/* Description */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs uppercase">Description</Label>
              <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
            </div>

            {/* Meta Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs uppercase">Category</Label>
                <p>{categoryLabels[ticket.category] || ticket.category}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs uppercase">Department</Label>
                <p className="flex items-center gap-1">
                  <Building2 className="w-4 h-4" />
                  {departmentLabels[ticket.assigned_department]}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs uppercase">Raised By</Label>
                <p className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {ticket.raised_by_name} ({departmentLabels[ticket.raised_by_department]})
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs uppercase">Created</Label>
                <p className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {format(new Date(ticket.created_at), "dd MMM yyyy, HH:mm")}
                </p>
              </div>
              {ticket.sla_due_at && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs uppercase">SLA Due</Label>
                  <p className={isOverdue ? "text-destructive" : ""}>
                    {format(new Date(ticket.sla_due_at), "dd MMM yyyy, HH:mm")}
                  </p>
                </div>
              )}
              {ticket.assigned_to_name && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs uppercase">Assigned To</Label>
                  <p className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {ticket.assigned_to_name}
                  </p>
                </div>
              )}
            </div>

            {/* Linked Items */}
            {(ticket.orders || ticket.enquiries) && (
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs uppercase">Linked Items</Label>
                <div className="flex flex-wrap gap-2">
                  {ticket.orders && (
                    <Badge variant="outline" className="text-xs">
                      <Link2 className="w-3 h-3 mr-1" />
                      Order: {ticket.orders.order_number} - {ticket.orders.customer_name}
                    </Badge>
                  )}
                  {ticket.enquiries && (
                    <Badge variant="outline" className="text-xs">
                      <Link2 className="w-3 h-3 mr-1" />
                      Enquiry: {ticket.enquiries.customer_name} - {ticket.enquiries.product_name}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Actions (for department members) */}
            {canManage && !isResolved && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Actions</h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Assign To</Label>
                      <Select
                        value={ticket.assigned_to || ""}
                        onValueChange={handleAssign}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select team member..." />
                        </SelectTrigger>
                        <SelectContent>
                          {departmentMembers.map((member) => (
                            <SelectItem key={member.user_id} value={member.user_id}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Update Status</Label>
                      <Select
                        value={ticket.status}
                        onValueChange={(value: TicketStatus) => handleStatusChange(value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusFlow.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {ticket.status === "in_progress" && (
                    <div className="space-y-2">
                      <Label>Resolution Notes</Label>
                      <Textarea
                        value={resolutionNotes}
                        onChange={(e) => setResolutionNotes(e.target.value)}
                        placeholder="Add resolution notes before marking as resolved..."
                        rows={3}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange("resolved")}
                        disabled={updateTicket.isPending}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Mark as Resolved
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Resolution Info */}
            {ticket.resolved_at && (
              <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg space-y-2">
                <h4 className="font-medium text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Resolved
                </h4>
                <p className="text-sm text-muted-foreground">
                  Resolved by {ticket.resolved_by_name} on{" "}
                  {format(new Date(ticket.resolved_at), "dd MMM yyyy, HH:mm")}
                </p>
                {ticket.resolution_notes && (
                  <p className="text-sm">{ticket.resolution_notes}</p>
                )}
              </div>
            )}

            {/* Comments */}
            <Separator />
            <div className="space-y-4">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Comments ({comments.length})
              </h4>

              {comments.length > 0 && (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`p-3 rounded-lg text-sm ${
                        comment.commented_by === user?.id
                          ? "bg-primary/10 ml-8"
                          : "bg-muted mr-8"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-xs">
                          {comment.commented_by_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap">{comment.comment}</p>
                    </div>
                  ))}
                </div>
              )}

              {!isResolved && (
                <div className="flex gap-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    rows={2}
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || addComment.isPending}
                  >
                    {addComment.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
