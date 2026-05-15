import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import DOMPurify from "dompurify";
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

import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketPriorityBadge } from "./TicketPriorityBadge";
import { TicketEditHistory } from "./TicketEditHistory";
import { TicketSlaAlertBanner } from "./TicketSlaAlertBanner";
import { Ticket, useTickets, useTicketComments, useTeamMembers, UpdateTicketData } from "@/hooks/useTickets";
import { useEditHistory } from "@/hooks/useEditHistory";
import { useAuth } from "@/hooks/useAuth";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
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
  Paperclip,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Upload,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Database } from "@/integrations/supabase/types";

type TicketStatus = Database["public"]["Enums"]["ticket_status"];
type TicketCategory = Database["public"]["Enums"]["ticket_category"];
type AppRole = Database["public"]["Enums"]["app_role"];

interface TicketDetailDialogProps {
  ticket: Ticket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const departmentLabels: Record<string, string> = {
  sales: "Sales",
  supply_chain: "Supply Chain",
  finance: "Finance",
  admin: "Admin",
  it: "IT",
  marketing: "Marketing",
  hr: "HR",
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
  const { comments, addComment, editComment, deleteComment } = useTicketComments(ticketProp?.id ?? null);
  const { data: teamMembers = [] } = useTeamMembers();
  const { recordChanges } = useEditHistory();

  const [newComment, setNewComment] = useState("");
  const [activeTab, setActiveTab] = useState("details");
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [editData, setEditData] = useState({ subject: "", description: "", category: "" as TicketCategory, priority: "" as string });

  // Comment edit state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");

  // Use the fresh ticket data from the query cache instead of the stale prop
  const ticket = useMemo(() => {
    if (!ticketProp) return null;
    return tickets.find((t) => t.id === ticketProp.id) || ticketProp;
  }, [ticketProp, tickets]);

  const [ticketAttachmentLinks, setTicketAttachmentLinks] = useState<Record<string, string>>({});
  const [commentAttachmentLinks, setCommentAttachmentLinks] = useState<Record<string, Record<string, string>>>({});

  const getAttachmentPath = (value: string) => {
    if (!value) return null;
    if (value.startsWith("http://") || value.startsWith("https://")) {
      try {
        const parsed = new URL(value);
        const path = parsed.pathname;
        const signedPrefix = "/object/sign/ticket-attachments/";
        const publicPrefix = "/object/public/ticket-attachments/";
        if (path.includes(signedPrefix)) return decodeURIComponent(path.split(signedPrefix)[1] || "").split("?")[0];
        if (path.includes(publicPrefix)) return decodeURIComponent(path.split(publicPrefix)[1] || "").split("?")[0];
      } catch { return null; }
      return null;
    }
    return value.replace(/^ticket-attachments\//, "");
  };

  const resolveAttachmentUrl = async (value: string) => {
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    const path = getAttachmentPath(value);
    if (!path) return null;
    const { data, error } = await supabase.storage.from("ticket-attachments").createSignedUrl(path, 60 * 60);
    if (error) { console.error("Failed to resolve ticket attachment URL", error); return null; }
    return data?.signedUrl ?? null;
  };

  const getAttachmentName = (value: string, fallbackIndex: number) => {
    const source = getAttachmentPath(value) || value;
    const fullName = source.split("/").pop() || `Attachment ${fallbackIndex + 1}`;
    return decodeURIComponent(fullName).replace(/^\d+-[a-z0-9]+-/i, "");
  };

  const isImageAttachment = (value: string) => {
    const ext = value.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "");
  };

  const ticketAttachmentKey = JSON.stringify(ticket?.attachment_urls ?? []);
  const commentAttachmentKey = JSON.stringify(comments.map((c) => ({ id: c.id, urls: c.attachment_urls ?? [] })));

  useEffect(() => {
    let cancelled = false;
    const resolveAllAttachmentLinks = async () => {
      if (!open || !ticket) return;
      const ticketRefs = ticket.attachment_urls ?? [];
      if (ticketRefs.length > 0) {
        const ticketResolved = await Promise.all(ticketRefs.map(async (ref) => {
          const resolved = await resolveAttachmentUrl(ref);
          return [ref, resolved] as const;
        }));
        if (!cancelled) setTicketAttachmentLinks(Object.fromEntries(ticketResolved.filter((entry): entry is [string, string] => Boolean(entry[1]))));
      }
      const commentsWithAttachments = comments.filter((c) => c.attachment_urls && c.attachment_urls.length > 0);
      if (commentsWithAttachments.length > 0) {
        const commentResolved = await Promise.all(commentsWithAttachments.map(async (comment) => {
          const refs = comment.attachment_urls ?? [];
          const urls = await Promise.all(refs.map(async (ref) => {
            const resolved = await resolveAttachmentUrl(ref);
            return [ref, resolved] as const;
          }));
          return [comment.id, Object.fromEntries(urls.filter((entry): entry is [string, string] => Boolean(entry[1])))] as const;
        }));
        if (!cancelled) setCommentAttachmentLinks(Object.fromEntries(commentResolved));
      }
    };
    void resolveAllAttachmentLinks();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticketAttachmentKey, commentAttachmentKey]);

  if (!ticket) return null;

  const isOverdue = ticket.sla_breached || (ticket.sla_due_at && isPast(new Date(ticket.sla_due_at)) && ticket.status !== "resolved" && ticket.status !== "closed");
  const canManage = role === "admin" || role === "hr" || role === ticket.assigned_department || ticket.assigned_to === user?.id;
  const isClosed = ticket.status === "closed";
  const isRemoved = ticket.status === "removed";
  const isLocked = isClosed || isRemoved;
  const isResolved = ticket.status === "resolved";

  const isCreatorOrAssigned = ticket.raised_by === user?.id || ticket.assigned_to === user?.id;
  const canEditTicket = isCreatorOrAssigned && !isLocked;
  const canCreatorClose = ticket.raised_by === user?.id && isResolved;
  const canManageActions = (canManage || isCreatorOrAssigned) && !isLocked;
  const canAddComments = !isLocked;

  const handleStartEdit = () => {
    setEditData({ subject: ticket.subject, description: ticket.description, category: ticket.category, priority: ticket.priority });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editData.subject.trim() || !editData.description.trim()) return;
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (editData.subject !== ticket.subject) changes.subject = { old: ticket.subject, new: editData.subject };
    if (editData.description !== ticket.description) changes.description = { old: ticket.description, new: editData.description };
    if (editData.category !== ticket.category) changes.category = { old: ticket.category, new: editData.category };
    if (editData.priority !== ticket.priority) changes.priority = { old: ticket.priority, new: editData.priority };
    if (Object.keys(changes).length === 0) { setIsEditing(false); return; }
    if (profile) await recordChanges("tickets", ticket.id, changes, profile.name);
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
  const filteredByDept = teamMembers.filter((m) => m.role === activeDepartment);
  const departmentMembers = filteredByDept.length > 0 ? filteredByDept : teamMembers;

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (profile) await recordChanges("tickets", ticket.id, { status: { old: ticket.status, new: newStatus } }, profile.name);
    await updateTicket.mutateAsync({ id: ticket.id, status: newStatus });
  };

  const handleAssign = async (userId: string) => {
    const member = teamMembers.find((m) => m.user_id === userId);
    if (profile) {
      const changes: Record<string, { old: unknown; new: unknown }> = { assigned_to_name: { old: ticket.assigned_to_name, new: member?.name || null } };
      if (selectedDepartment && selectedDepartment !== ticket.assigned_department) changes.assigned_department = { old: ticket.assigned_department, new: selectedDepartment };
      await recordChanges("tickets", ticket.id, changes, profile.name);
    }
    const updateData: UpdateTicketData = { id: ticket.id, assigned_to: userId, assigned_to_name: member?.name || null };
    if (selectedDepartment && selectedDepartment !== ticket.assigned_department) {
      await supabase.from("tickets").update({ assigned_department: selectedDepartment as AppRole }).eq("id", ticket.id);
    }
    await updateTicket.mutateAsync(updateData);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    if (profile) await recordChanges("tickets", ticket.id, { comment: { old: null, new: newComment.substring(0, 200) + (newComment.length > 200 ? "..." : "") } }, profile.name);
    await addComment.mutateAsync({ comment: newComment });
    setNewComment("");
  };

  const handleEditComment = async (commentId: string) => {
    if (!editingCommentText.trim()) return;
    const original = comments.find((c) => c.id === commentId);
    if (profile && original) {
      await recordChanges("tickets", ticket.id, { comment_edited: { old: original.comment.substring(0, 100), new: editingCommentText.substring(0, 100) } }, profile.name);
    }
    await editComment.mutateAsync({ commentId, comment: editingCommentText });
    setEditingCommentId(null);
    setEditingCommentText("");
  };

  const handleDeleteComment = async (commentId: string) => {
    const original = comments.find((c) => c.id === commentId);
    if (profile && original) {
      await recordChanges("tickets", ticket.id, { comment_deleted: { old: original.comment.substring(0, 100), new: null } }, profile.name);
    }
    await deleteComment.mutateAsync(commentId);
  };

  const handleRemoveTicket = async () => {
    if (profile) await recordChanges("tickets", ticket.id, { status: { old: ticket.status, new: "removed" } }, profile.name);
    await updateTicket.mutateAsync({ id: ticket.id, status: "removed" });
  };

  const getAvailableStatuses = (): TicketStatus[] => {
    const all: TicketStatus[] = ["open", "assigned", "in_progress", "pending", "resolved", "closed", "removed"];
    if (role === "admin" || role === "hr") return all;
    return all.filter(s => s !== "closed");
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingAttachment(true);
    try {
      const { validateFile } = await import("@/lib/fileValidation");
      const uploadedPaths: string[] = [];
      for (const file of Array.from(files)) {
        const validation = validateFile(file, "documents");
        if (!validation.valid) { toast.error(validation.error || "Invalid file"); continue; }
        const safeName = file.name.replace(/\s+/g, "-");
        const storagePath = `tickets/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
        const { error } = await supabase.storage.from("ticket-attachments").upload(storagePath, file);
        if (error) throw error;
        uploadedPaths.push(storagePath);
      }
      if (uploadedPaths.length > 0) {
        const newUrls = [...(ticket.attachment_urls || []), ...uploadedPaths];
        await updateTicket.mutateAsync({ id: ticket.id, attachment_urls: newUrls });
        toast.success(`${uploadedPaths.length} attachment(s) added`);
      }
    } catch (error) {
      console.error("Failed to upload attachment", error);
      toast.error("Failed to upload attachment");
    } finally {
      setUploadingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  };

  const renderAttachment = (ref: string, index: number, linkMap: Record<string, string>) => {
    const fileName = getAttachmentName(ref, index);
    const isImage = isImageAttachment(fileName);
    const displayUrl = linkMap[ref];
    return displayUrl ? (
      <a key={`${ref}-${index}`} href={displayUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-muted px-3 py-2 rounded-lg text-sm hover:bg-muted/80 transition-colors">
        {isImage ? <ImageIcon className="w-4 h-4 text-muted-foreground" /> : <FileText className="w-4 h-4 text-muted-foreground" />}
        <span className="max-w-[150px] truncate">{fileName}</span>
        <ExternalLink className="w-3 h-3 text-muted-foreground" />
      </a>
    ) : (
      <div key={`${ref}-${index}`} className="flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-lg text-sm text-muted-foreground">
        {isImage ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
        <span className="max-w-[150px] truncate">{fileName}</span>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-muted-foreground">{ticket.ticket_number}</span>
                  <TicketStatusBadge status={ticket.status} />
                  <TicketPriorityBadge priority={ticket.priority} />
                  {isOverdue && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      SLA Breached
                    </Badge>
                  )}
                  {isLocked && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">🔒 Read-only</Badge>
                  )}
                </div>
                <DialogTitle className="text-lg">{ticket.subject}</DialogTitle>
              </div>
            <div className="flex gap-1">
              {canEditTicket && !isEditing && (
                <Button variant="outline" size="sm" onClick={handleStartEdit}>
                  <Pencil className="w-4 h-4 mr-1" />
                  Edit
                </Button>
              )}
              {canManageActions && !isRemoved && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleRemoveTicket} disabled={updateTicket.isPending}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TabsList className="mx-6 w-fit flex-shrink-0">
            <TabsTrigger value="details" className="gap-2">
              Details
              {comments.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5">{comments.length}</Badge>
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
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}><X className="w-4 h-4" /></Button>
                  </div>
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input value={editData.subject} onChange={(e) => setEditData({ ...editData, subject: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} rows={4} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={editData.category} onValueChange={(v) => setEditData({ ...editData, category: v as TicketCategory })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {categoryOptions.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
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
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase">Description</Label>
                  <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
                </div>
              )}

              {/* SLA Alert Banner */}
              <TicketSlaAlertBanner ticketId={ticket.id} />


              {/* Meta Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs uppercase">Category</Label>
                  <p>{categoryLabels[ticket.category] || ticket.category}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs uppercase">Department</Label>
                  <p className="flex items-center gap-1"><Building2 className="w-4 h-4" />{departmentLabels[ticket.assigned_department]}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs uppercase">Raised By</Label>
                  <p className="flex items-center gap-1"><User className="w-4 h-4" />{ticket.raised_by_name} ({departmentLabels[ticket.raised_by_department]})</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs uppercase">Created</Label>
                  <p className="flex items-center gap-1"><Clock className="w-4 h-4" />{format(new Date(ticket.created_at), "dd MMM yyyy, HH:mm")}</p>
                </div>
                {ticket.sla_due_at && (
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs uppercase">SLA Due</Label>
                    <p className={isOverdue ? "text-destructive" : ""}>{format(new Date(ticket.sla_due_at), "dd MMM yyyy, HH:mm")}</p>
                  </div>
                )}
                {ticket.assigned_to_name && (
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs uppercase">Assigned To</Label>
                    <p className="flex items-center gap-1"><User className="w-4 h-4" />{ticket.assigned_to_name}</p>
                  </div>
                )}
              </div>

              {/* Linked Items */}
              {(ticket.orders || ticket.enquiries) && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase">Linked Items</Label>
                  <div className="flex flex-wrap gap-2">
                    {ticket.orders && (
                      <Badge variant="outline" className="text-xs"><Link2 className="w-3 h-3 mr-1" />Order: {ticket.orders.order_number} - {ticket.orders.customer_name}</Badge>
                    )}
                    {ticket.enquiries && (
                      <Badge variant="outline" className="text-xs"><Link2 className="w-3 h-3 mr-1" />Enquiry: {ticket.enquiries.customer_name} - {ticket.enquiries.product_name}</Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Attachments */}
              {ticket.attachment_urls && ticket.attachment_urls.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase flex items-center gap-1">
                    <Paperclip className="w-3 h-3" />Attachments ({ticket.attachment_urls.length})
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {ticket.attachment_urls.map((ref, index) => renderAttachment(ref, index, ticketAttachmentLinks))}
                  </div>
                </div>
              )}

              {/* Add Attachment */}
              {!isLocked && (
                <div className="space-y-2">
                  {!(ticket.attachment_urls && ticket.attachment_urls.length > 0) && (
                    <Label className="text-muted-foreground text-xs uppercase flex items-center gap-1"><Paperclip className="w-3 h-3" />Attachments</Label>
                  )}
                  <div className="rounded-lg border border-dashed p-3 text-center cursor-pointer hover:bg-muted/50 transition-colors" role="button" tabIndex={0}
                    onClick={() => attachmentInputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); attachmentInputRef.current?.click(); } }}>
                    {uploadingAttachment ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Uploading...</div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Upload className="h-4 w-4" /><span>Click to add attachments</span></div>
                    )}
                  </div>
                  <input ref={attachmentInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp" onChange={handleFileUpload} className="hidden" />
                </div>
              )}


              {/* Actions */}
              {canManageActions && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm">Actions</h4>
                    <div className={`grid ${role === "admin" || role === "hr" ? "grid-cols-3" : "grid-cols-2"} gap-4`}>
                      {(role === "admin" || role === "hr") && (
                        <div className="space-y-2">
                          <Label>Department</Label>
                          <Select value={activeDepartment} onValueChange={(value) => setSelectedDepartment(value)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(departmentLabels).map(([value, label]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>Assign To</Label>
                        <Select value={ticket.assigned_to || ""} onValueChange={handleAssign}>
                          <SelectTrigger><SelectValue placeholder="Select team member..." /></SelectTrigger>
                          <SelectContent>
                            {departmentMembers.map((member) => (<SelectItem key={member.user_id} value={member.user_id}>{member.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Update Status</Label>
                        <Select value={ticket.status} onValueChange={(value: TicketStatus) => handleStatusChange(value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {getAvailableStatuses().map((status) => (
                              <SelectItem key={status} value={status}>{status === "in_progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Close Ticket Action */}
              {canCreatorClose && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Verify & Close</h4>
                    <p className="text-sm text-muted-foreground">This ticket has been marked as resolved. Please verify the resolution and close the ticket if satisfied.</p>
                    <Button size="sm" onClick={() => handleStatusChange("closed")} disabled={updateTicket.isPending}>
                      {updateTicket.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Close Ticket
                    </Button>
                  </div>
                </>
              )}

              {/* Resolution Info - ONLY show when status is actually resolved */}
              {isResolved && ticket.resolved_at && (
                <div className="bg-green-50 dark:bg-green-950/30 p-4 rounded-lg space-y-2">
                  <h4 className="font-medium text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />Resolved
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Resolved by {ticket.resolved_by_name} on {format(new Date(ticket.resolved_at), "dd MMM yyyy, HH:mm")}
                  </p>
                  {ticket.resolution_notes && <p className="text-sm">{ticket.resolution_notes}</p>}
                </div>
              )}

              {/* ─── COMMENTS SECTION (inline in Details) ─── */}
              <Separator />
              <div className="space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Comments {comments.length > 0 && <Badge variant="secondary" className="h-5 px-1.5">{comments.length}</Badge>}
                </h4>

                {/* Comment List */}
                {comments.length > 0 ? (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {comments.map((comment) => {
                      const isOwn = comment.commented_by === user?.id;
                      const isEditingThis = editingCommentId === comment.id;

                      return (
                        <div key={comment.id} className={`p-3 rounded-lg text-sm ${
                          comment.ai_generated
                            ? "bg-violet-50/80 dark:bg-violet-950/30 border border-violet-200/50 dark:border-violet-800/30 mr-4"
                            : isOwn ? "bg-primary/10 ml-8" : "bg-muted mr-8"
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-xs">
                              {comment.ai_generated ? "🤖 Xboom AI" : comment.commented_by_name}
                            </span>
                            {comment.ai_generated && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300">AI Generated</Badge>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{format(new Date(comment.created_at), "dd MMM yyyy, HH:mm")}</span>
                              {isOwn && canAddComments && !isEditingThis && (
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.comment); }}>
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleDeleteComment(comment.id)} disabled={deleteComment.isPending}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>

                          {isEditingThis ? (
                            <div className="space-y-2 mt-2">
                              <Textarea value={editingCommentText} onChange={(e) => setEditingCommentText(e.target.value)} rows={3} />
                              <div className="flex gap-2 justify-end">
                                <Button variant="outline" size="sm" onClick={() => { setEditingCommentId(null); setEditingCommentText(""); }}>Cancel</Button>
                                <Button size="sm" onClick={() => handleEditComment(comment.id)} disabled={editComment.isPending || !editingCommentText.trim()}>
                                  {editComment.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}Save
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(comment.comment) }} />
                              {comment.attachment_urls && comment.attachment_urls.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {comment.attachment_urls.map((ref, index) => {
                                    const fileName = getAttachmentName(ref, index);
                                    const isImage = isImageAttachment(fileName);
                                    const displayUrl = commentAttachmentLinks[comment.id]?.[ref];
                                    return displayUrl ? (
                                      <a key={`${comment.id}-${ref}-${index}`} href={displayUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs hover:bg-background">
                                        {isImage ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                                        <span className="max-w-[160px] truncate">{fileName}</span>
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    ) : (
                                      <div key={`${comment.id}-${ref}-${index}`} className="inline-flex items-center gap-1 rounded-md bg-background/50 px-2 py-1 text-xs text-muted-foreground">
                                        {isImage ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                                        <span className="max-w-[160px] truncate">{fileName}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <MessageSquare className="w-6 h-6 mx-auto mb-1 opacity-50" />
                    <p className="text-sm">No comments yet</p>
                  </div>
                )}

                {/* Add Comment Editor */}
                {canAddComments ? (
                  <div className="space-y-2 pt-3 border-t">
                    <Label className="text-xs text-muted-foreground">Add a comment (supports formatting: **bold**, *italic*, - lists)</Label>
                    <div className="flex gap-2">
                      <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment..." rows={3} className="flex-1" />
                      <Button size="icon" className="self-end" onClick={handleAddComment} disabled={!newComment.trim() || addComment.isPending}>
                        {addComment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-3 border-t text-center text-sm text-muted-foreground">
                    🔒 This ticket is {isClosed ? "closed" : "removed"} — no further comments allowed.
                  </div>
                )}
              </div>
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

function sanitizeHtml(input: string): string {
  if (!/<[a-z][\s\S]*>/i.test(input)) {
    return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "u", "p", "br", "ul", "ol", "li", "a", "blockquote", "code", "pre", "span", "div"],
    ALLOWED_ATTR: ["href", "title", "target", "rel"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}
