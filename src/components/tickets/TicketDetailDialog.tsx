import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { TicketEditHistory } from "./TicketEditHistory";
import { Ticket, useTickets, useTicketComments, useTeamMembers, UpdateTicketData } from "@/hooks/useTickets";
import { useEditHistory } from "@/hooks/useEditHistory";
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
  History,
  Pencil,
  X,
} from "lucide-react";
import { Database } from "@/integrations/supabase/types";

type TicketStatus = Database["public"]["Enums"]["ticket_status"];
type TicketCategory = Database["public"]["Enums"]["ticket_category"];
type AppRole = Database["public"]["Enums"]["app_role"];

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
  it: "IT",
  marketing: "Marketing",
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

const categoryOptions: { value: TicketCategory; label: string }[] = [
  { value: "general_inquiry", label: "General Inquiry" },
  { value: "order_issue", label: "Order Issue" },
  { value: "payment_issue", label: "Payment Issue" },
  { value: "delivery_issue", label: "Delivery Issue" },
  { value: "supplier_issue", label: "Supplier Issue" },
  { value: "procurement_request", label: "Procurement Request" },
  { value: "refund_request", label: "Refund Request" },
  { value: "technical_support", label: "Technical Support" },
  { value: "documentation", label: "Documentation" },
  { value: "other", label: "Other" },
];

export function TicketDetailDialog({ ticket: ticketProp, open, onOpenChange }: TicketDetailDialogProps) {
  const { user, role, profile } = useAuth();
  const { tickets, updateTicket } = useTickets();
  const { comments, addComment } = useTicketComments(ticketProp?.id ?? null);
  const { data: teamMembers = [] } = useTeamMembers();
  const { recordChanges } = useEditHistory();

  const [newComment, setNewComment] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [activeTab, setActiveTab] = useState("details");
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ subject: "", description: "", category: "" as TicketCategory, priority: "" as string });

  // Use the fresh ticket data from the query cache instead of the stale prop
  const ticket = useMemo(() => {
    if (!ticketProp) return null;
    return tickets.find((t) => t.id === ticketProp.id) || ticketProp;
  }, [ticketProp, tickets]);

  if (!ticket) return null;

  const isOverdue = ticket.sla_due_at && isPast(new Date(ticket.sla_due_at)) && ticket.status !== "resolved" && ticket.status !== "closed";
  const canManage = role === "admin" || role === ticket.assigned_department || ticket.assigned_to === user?.id;
  const isClosed = ticket.status === "closed";
  const isResolved = ticket.status === "resolved";
  const canCreatorClose = ticket.raised_by === user?.id && isResolved;
  const canCreatorEdit = ticket.raised_by === user?.id && !isClosed && !isResolved;

  const handleStartEdit = () => {
    setEditData({
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editData.subject.trim() || !editData.description.trim()) return;
    
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (editData.subject !== ticket.subject) changes.subject = { old: ticket.subject, new: editData.subject };
    if (editData.description !== ticket.description) changes.description = { old: ticket.description, new: editData.description };
    if (editData.category !== ticket.category) changes.category = { old: ticket.category, new: editData.category };
    if (editData.priority !== ticket.priority) changes.priority = { old: ticket.priority, new: editData.priority };

    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      return;
    }

    if (profile) {
      await recordChanges("tickets", ticket.id, changes, profile.name);
    }

    await updateTicket.mutateAsync({
      id: ticket.id,
      ...(editData.subject !== ticket.subject && { subject: editData.subject }),
      ...(editData.description !== ticket.description && { description: editData.description }),
      ...(editData.category !== ticket.category && { category: editData.category as TicketCategory }),
      ...(editData.priority !== ticket.priority && { priority: editData.priority as any }),
    });

    setIsEditing(false);
  };

  const activeDepartment = selectedDepartment || ticket.assigned_department;
  const filteredByDept = teamMembers.filter(
    (m) => m.role === activeDepartment
  );
  // If no members found for the department, show all team members so assignment is always possible
  const departmentMembers = filteredByDept.length > 0 ? filteredByDept : teamMembers;

  const handleStatusChange = async (newStatus: TicketStatus) => {
    // Record the change in history
    if (profile) {
      await recordChanges("tickets", ticket.id, {
        status: { old: ticket.status, new: newStatus }
      }, profile.name);
    }

    await updateTicket.mutateAsync({
      id: ticket.id,
      status: newStatus,
      resolution_notes: newStatus === "resolved" ? resolutionNotes : undefined,
    });
  };

  const handleAssign = async (userId: string) => {
    const member = teamMembers.find((m) => m.user_id === userId);
    
    // Record the change in history
    if (profile) {
      const changes: Record<string, { old: unknown; new: unknown }> = {
        assigned_to_name: { old: ticket.assigned_to_name, new: member?.name || null }
      };
      if (selectedDepartment && selectedDepartment !== ticket.assigned_department) {
        changes.assigned_department = { old: ticket.assigned_department, new: selectedDepartment };
      }
      await recordChanges("tickets", ticket.id, changes, profile.name);
    }

    const updateData: UpdateTicketData = {
      id: ticket.id,
      assigned_to: userId,
      assigned_to_name: member?.name || null,
    };

    // If admin changed the department, update it too
    if (selectedDepartment && selectedDepartment !== ticket.assigned_department) {
      // We need to update assigned_department via a separate call since UpdateTicketData doesn't include it
      await supabase.from("tickets").update({ assigned_department: selectedDepartment as AppRole }).eq("id", ticket.id);
    }

    await updateTicket.mutateAsync(updateData);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    await addComment.mutateAsync({ comment: newComment });
    setNewComment("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
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
            {canCreatorEdit && !isEditing && (
              <Button variant="outline" size="sm" onClick={handleStartEdit}>
                <Pencil className="w-4 h-4 mr-1" />
                Edit
              </Button>
            )}
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TabsList className="mx-6 w-fit flex-shrink-0">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="comments" className="gap-2">
              Comments
              {comments.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5">
                  {comments.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="w-4 h-4" />
              History
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 overflow-y-auto px-6">
            <TabsContent value="details" className="mt-4 space-y-6 pb-6">
              {/* Edit Mode */}
              {isEditing ? (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Edit Ticket</h4>
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input
                      value={editData.subject}
                      onChange={(e) => setEditData({ ...editData, subject: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={editData.description}
                      onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      rows={4}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={editData.category} onValueChange={(v) => setEditData({ ...editData, category: v as TicketCategory })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {categoryOptions.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={editData.priority} onValueChange={(v) => setEditData({ ...editData, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveEdit} disabled={updateTicket.isPending || !editData.subject.trim() || !editData.description.trim()}>
                      {updateTicket.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                      Save Changes
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Description */}
                  <div className="space-y-2">
                    <Label className="text-muted-foreground text-xs uppercase">Description</Label>
                    <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
                  </div>
                </>
              )}

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
              {canManage && !isResolved && !isClosed && (
                <>
                  <Separator />
                   <div className="space-y-4">
                    <h4 className="font-medium text-sm">Actions</h4>

                    <div className={`grid ${role === "admin" ? "grid-cols-3" : "grid-cols-2"} gap-4`}>
                      {role === "admin" && (
                        <div className="space-y-2">
                          <Label>Department</Label>
                          <Select
                            value={activeDepartment}
                            onValueChange={(value) => setSelectedDepartment(value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(departmentLabels).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

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

              {/* Close Ticket Action (for ticket creator when resolved) */}
              {canCreatorClose && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Verify & Close</h4>
                    <p className="text-sm text-muted-foreground">
                      This ticket has been marked as resolved. Please verify the resolution and close the ticket if satisfied.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange("closed")}
                      disabled={updateTicket.isPending}
                    >
                      {updateTicket.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      Close Ticket
                    </Button>
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
            </TabsContent>

            <TabsContent value="comments" className="mt-4 space-y-4 pb-6">
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

              {comments.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No comments yet</p>
                </div>
              )}

              {!isResolved && (
                <div className="flex gap-2 pt-4 border-t">
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
            </TabsContent>

            <TabsContent value="history" className="mt-4 pb-6">
              <TicketEditHistory ticketId={ticket.id} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
