import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, Loader2, Paperclip, Send, UserCheck, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import AdminTabsNav from "@/components/admin/AdminTabsNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TicketPriorityBadge, TicketStatusBadge } from "@/portal/components/TicketStatusBadge";
import { notifyPortal } from "@/portal/lib/portalNotify";
import { signedAttachmentUrl } from "@/portal/lib/portalUploads";
import type { PortalTicket, PortalTicketMessage, TicketStatus, TicketPriority } from "@/portal/hooks/usePortalTickets";
import { TICKET_PRIORITIES } from "@/portal/hooks/usePortalTickets";
import { useNotifications } from "@/hooks/useNotifications";

type AdminTicket = PortalTicket & {
  account_id: string;
  assigned_to: string | null;
  account: { company_name: string | null } | null;
  raised_by: { full_name: string | null; email: string | null } | null;
};

type AdminTicketMessage = PortalTicketMessage & {
  is_internal: boolean;
};

const STATUS_OPTIONS: TicketStatus[] = ["open", "in_progress", "awaiting_customer", "resolved", "closed"];
const STAFF_ROLES = new Set(["admin", "support", "supply_chain", "sales", "sales_manager"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: TicketStatus) {
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function AttachmentLink({ attachment, inverted }: { attachment: { name: string; path: string }; inverted?: boolean }) {
  const { toast } = useToast();

  async function openAttachment() {
    try {
      const url = await signedAttachmentUrl(attachment.path, 600);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast({
        title: "Couldn't open attachment",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <button
      type="button"
      onClick={openAttachment}
      className={inverted ? "inline-flex items-center gap-1 text-xs text-primary-foreground hover:underline mr-3" : "inline-flex items-center gap-1 text-xs text-primary hover:underline mr-3"}
    >
      <Paperclip className="h-3 w-3" />
      {attachment.name}
    </button>
  );
}

function useAdminTicket(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["admin", "portal-ticket", ticketId],
    enabled: !!ticketId,
    queryFn: async (): Promise<{ ticket: AdminTicket | null; messages: AdminTicketMessage[] }> => {
      if (!ticketId) throw new Error("Missing ticket id");

      const [ticketRes, messagesRes] = await Promise.all([
        supabase
          .from("portal_tickets")
          .select(
            "id, ticket_number, account_id, raised_by_contact_id, subject, description, category, priority, status, order_id, assigned_to, created_at, updated_at, first_response_at, resolved_at, ticket_type, related_order_id, related_order_number, related_product_name, sla_first_response_due_at, sla_resolution_due_at, account:portal_accounts(company_name), raised_by:portal_contacts(full_name, email)",
          )
          .eq("id", ticketId)
          .maybeSingle(),
        supabase
          .from("portal_ticket_messages")
          .select("id, ticket_id, sender_id, sender_name_snapshot, is_internal, body, attachments, created_at")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true }),
      ]);

      if (ticketRes.error) throw ticketRes.error;
      if (messagesRes.error) throw messagesRes.error;

      return {
        ticket: ((ticketRes.data ?? null) as unknown) as AdminTicket | null,
        messages: ((messagesRes.data ?? []) as unknown) as AdminTicketMessage[],
      };
    },
  });
}

export default function PortalTicketAdminDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const isValidTicketId = !!ticketId && UUID_RE.test(ticketId);
  const { user, roles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyBody, setReplyBody] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const canAccess = useMemo(() => (roles ?? []).some((role) => STAFF_ROLES.has(role)), [roles]);
  const { data, isLoading, refetch, isError, error } = useAdminTicket(
    canAccess && isValidTicketId ? ticketId : undefined,
  );
  const { markTicketNotificationsAsRead } = useNotifications();

  // Auto-clear notifications for this ticket when the page is opened.
  useEffect(() => {
    if (!canAccess || !isValidTicketId || !ticketId) return;
    markTicketNotificationsAsRead(ticketId);
  }, [canAccess, isValidTicketId, ticketId, markTicketNotificationsAsRead]);

  useEffect(() => {
    if (!ticketId || !canAccess || !isValidTicketId) return;
    const channel = supabase
      .channel(`admin-portal-ticket-${ticketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "portal_ticket_messages", filter: `ticket_id=eq.${ticketId}` },
        () => refetch(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "portal_tickets", filter: `id=eq.${ticketId}` },
        () => refetch(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canAccess, isValidTicketId, ticketId, refetch]);

  const updateStatus = useMutation({
    mutationFn: async (status: TicketStatus) => {
      if (!ticketId) throw new Error("Missing ticket id");
      const { error } = await supabase
        .from("portal_tickets")
        .update({ status } as never)
        .eq("id", ticketId);
      if (error) throw error;
      // Fire dedicated status-changed event — emails the customer with the
      // new status. The DB trigger keeps resolved_at in sync.
      notifyPortal("ticket_status_changed", { ticket_id: ticketId, new_status: status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "portal-ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "portal-tickets"] });
      toast({ title: "Ticket updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't update ticket", description: error.message, variant: "destructive" });
    },
  });

  const updatePriority = useMutation({
    mutationFn: async (priority: TicketPriority) => {
      if (!ticketId) throw new Error("Missing ticket id");
      const { error } = await supabase
        .from("portal_tickets")
        .update({ priority } as never)
        .eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "portal-ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "portal-tickets"] });
      toast({ title: "Priority updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't update priority", description: err.message, variant: "destructive" });
    },
  });

  const assignToMe = useMutation({
    mutationFn: async () => {
      if (!ticketId || !user?.id) throw new Error("Missing ticket or user");
      const { error } = await supabase
        .from("portal_tickets")
        .update({ assigned_to: user.id } as never)
        .eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "portal-ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "portal-tickets"] });
      toast({ title: "Assigned to you" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't assign ticket", description: err.message, variant: "destructive" });
    },
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      if (!ticketId || !user?.id) throw new Error("Missing ticket or user");
      const body = replyBody.trim();
      if (!body) return;

      const { data: message, error } = await supabase
        .from("portal_ticket_messages")
        .insert({
          ticket_id: ticketId,
          sender_id: user.id,
          body,
          attachments: [],
          is_internal: internalNote,
        } as never)
        .select("id")
        .single();
      if (error) throw error;

      if (!internalNote) {
        notifyPortal("ticket_message_added", {
          ticket_id: ticketId,
          message_id: (message as { id: string }).id,
        });
      }
    },
    onSuccess: () => {
      setReplyBody("");
      setInternalNote(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "portal-ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "portal-tickets"] });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't send reply", description: error.message, variant: "destructive" });
    },
  });

  if (!canAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Access restricted to portal support staff.
      </div>
    );
  }

  const ticket = data?.ticket;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AdminTabsNav active="portal-tickets" />
      <main className="container mx-auto px-4 py-6 space-y-5">
        <Link to="/admin/portal-tickets" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to portal tickets
        </Link>

        {isLoading && <Skeleton className="h-72 w-full" />}

        {!isLoading && !ticket && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">Ticket not found.</CardContent>
          </Card>
        )}

        {ticket && (
          <>
            <section className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_number}</span>
                  <TicketStatusBadge status={ticket.status} />
                  <TicketPriorityBadge priority={ticket.priority} />
                  {ticket.ticket_type === "service_request" && (
                    <Badge variant="outline" className="gap-1">
                      <Wrench className="h-3 w-3" /> Service request · 12h SLA
                    </Badge>
                  )}
                </div>
                <h1 className="text-xl sm:text-2xl font-semibold mt-1 break-words">{ticket.subject}</h1>
                <p className="text-xs text-muted-foreground mt-1">
                  {ticket.account?.company_name ?? "—"} · Raised {formatDateTime(ticket.created_at)}
                </p>
              </div>

              <div className="w-full sm:w-56">
                <Select value={ticket.status} onValueChange={(value) => updateStatus.mutate(value as TicketStatus)} disabled={updateStatus.isPending}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>{statusLabel(status)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Conversation</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {data.messages.length === 0 && (
                      <p className="text-sm text-muted-foreground">No messages yet.</p>
                    )}

                    {data.messages.map((message) => {
                      const mine = message.sender_id === user?.id;
                      const attachments = (message.attachments ?? []) as { name: string; path: string }[];
                      return (
                        <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[88%] rounded-lg border px-4 py-3 text-sm ${message.is_internal ? "bg-muted/70 border-border" : mine ? "bg-primary text-primary-foreground border-primary" : "bg-card text-card-foreground border-border"}`}>
                            <div className="text-[11px] opacity-80 mb-1">
                              {message.sender_name_snapshot ?? "Member"} · {formatDateTime(message.created_at)}
                              {message.is_internal ? " · Internal note" : ""}
                            </div>
                            <div className="whitespace-pre-wrap break-words">{message.body}</div>
                            {attachments.length > 0 && (
                              <div className="mt-2 -mx-1">
                                {attachments.map((attachment) => (
                                  <AttachmentLink key={attachment.path} attachment={attachment} inverted={mine && !message.is_internal} />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {ticket.status !== "closed" && ticket.status !== "resolved" && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Reply</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea
                        rows={4}
                        placeholder={internalNote ? "Add an internal note..." : "Type your reply to the customer..."}
                        value={replyBody}
                        onChange={(event) => setReplyBody(event.target.value)}
                      />
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                          <Checkbox checked={internalNote} onCheckedChange={(checked) => setInternalNote(checked === true)} />
                          Internal note
                        </label>
                        <Button onClick={() => sendReply.mutate()} disabled={sendReply.isPending || replyBody.trim().length === 0}>
                          {sendReply.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                          Send
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <aside className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Ticket details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Customer</div>
                      <div className="font-medium">{ticket.account?.company_name ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Raised by</div>
                      <div className="font-medium">{ticket.raised_by?.full_name ?? "—"}</div>
                      {ticket.raised_by?.email && <div className="text-xs text-muted-foreground">{ticket.raised_by.email}</div>}
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Linked purchase</div>
                      <div className="font-medium">{ticket.related_order_number ?? ticket.order_id ?? "—"}</div>
                      {ticket.related_product_name && <div className="text-xs text-muted-foreground">{ticket.related_product_name}</div>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">First response due</div>
                        <div>{formatDateTime(ticket.sla_first_response_due_at)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Resolution due</div>
                        <div>{formatDateTime(ticket.sla_resolution_due_at)}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Description</div>
                      <p className="whitespace-pre-wrap break-words mt-1">{ticket.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}