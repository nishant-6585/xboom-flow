import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PortalLayout } from "@/portal/components/PortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Send, Loader2, Paperclip } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePortalTicket, useReplyTicket } from "@/portal/hooks/usePortalTickets";
import { TicketPriorityBadge, TicketStatusBadge } from "@/portal/components/TicketStatusBadge";
import { AttachmentUploader } from "@/portal/components/AttachmentUploader";
import type { UploadedAttachment } from "@/portal/lib/portalUploads";
import { signedAttachmentUrl } from "@/portal/lib/portalUploads";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";
import { supabase } from "@/integrations/supabase/client";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AttachmentLink({ a }: { a: { name: string; path: string } }) {
  async function open() {
    try {
      const url = await signedAttachmentUrl(a.path, 600);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // ignore
    }
  }
  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mr-3"
    >
      <Paperclip className="h-3 w-3" />
      {a.name}
    </button>
  );
}

export default function PortalTicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { data, isLoading, refetch } = usePortalTicket(ticketId);
  const reply = useReplyTicket(ticketId);
  const { contact } = usePortalAuth();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);

  // Live updates: refetch on new messages for this ticket
  useEffect(() => {
    if (!ticketId) return;
    const ch = supabase
      .channel(`portal-ticket-${ticketId}`)
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
      supabase.removeChannel(ch);
    };
  }, [ticketId, refetch]);

  async function send() {
    if (body.trim().length < 1) return;
    try {
      await reply.mutateAsync({ body: body.trim(), attachments });
      setBody("");
      setAttachments([]);
    } catch (e) {
      toast({
        title: "Couldn't send reply",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <PortalLayout>
      <div className="mb-4">
        <Link to="/portal/tickets" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to tickets
        </Link>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {!isLoading && data && !data.ticket && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Ticket not found.</CardContent>
        </Card>
      )}

      {data?.ticket && (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">{data.ticket.ticket_number}</span>
                <TicketStatusBadge status={data.ticket.status} />
                <TicketPriorityBadge priority={data.ticket.priority} />
                {data.ticket.ticket_type === "service_request" && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    Service request · 12h SLA
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold mt-1">{data.ticket.subject}</h1>
              <p className="text-xs text-muted-foreground mt-1">Raised {formatDateTime(data.ticket.created_at)}</p>
            </div>
          </div>

          {data.ticket.related_order_id && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Linked purchase</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="font-medium">{data.ticket.related_order_number ?? "Order"}</div>
                {data.ticket.related_product_name && (
                  <div className="text-muted-foreground mt-0.5">{data.ticket.related_product_name}</div>
                )}
                <Link
                  to="/portal/purchases"
                  className="text-xs text-primary hover:underline mt-2 inline-block"
                >
                  View in My Orders →
                </Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Conversation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">No messages yet.</p>
                )}
                {data.messages.map((m) => {
                  const isMine = m.sender_id != null && m.sender_id === (contact ? undefined : null) ? false : false;
                  // Determine if this message was sent by the current customer (compare sender_name)
                  const fromCustomer = m.sender_name_snapshot === contact?.full_name;
                  return (
                    <div
                      key={m.id}
                      className={`flex ${fromCustomer ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
                          fromCustomer
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        <div className="text-[11px] opacity-80 mb-1">
                          {m.sender_name_snapshot ?? "Member"} · {formatDateTime(m.created_at)}
                        </div>
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        {m.attachments?.length > 0 && (
                          <div className="mt-2 -mx-1">
                            {m.attachments.map((a) => (
                              <AttachmentLink key={a.path} a={a} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {data.ticket.status !== "closed" && data.ticket.status !== "resolved" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Reply</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  rows={4}
                  placeholder="Type your reply..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <AttachmentUploader scope="ticket" attachments={attachments} onChange={setAttachments} />
                <div className="flex justify-end">
                  <Button onClick={send} disabled={reply.isPending || body.trim().length === 0}>
                    {reply.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Send reply
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {(data.ticket.status === "closed" || data.ticket.status === "resolved") && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                This ticket is {data.ticket.status}. Raise a new ticket if you need further help.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PortalLayout>
  );
}