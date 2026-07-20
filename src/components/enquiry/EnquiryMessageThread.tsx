import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, MessageSquare, Loader2, HandMetal, CornerDownLeft, Timer, UserCheck, ClipboardList } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface EnquiryMessage {
  id: string;
  enquiry_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  message: string;
  is_read: boolean;
  created_at: string;
  is_nudge?: boolean;
  is_quote_mirror?: boolean;
}

interface ResponseMeta {
  respondedAt?: string | null;
  respondedByName?: string | null;
  /** e.g. "2 min" — precomputed by the parent from created_at/responded_at */
  responseTimeText?: string;
  /** SLA color classes for the "Responded in …" chip */
  responseTimeColorClass?: string;
}

interface EnquiryMessageThreadProps {
  enquiryId: string;
  onMessageSent?: () => void;
  headerRight?: React.ReactNode;
  onDraftChange?: (draft: string) => void;
  /** When set, the first supply-chain/admin message is tagged as THE response */
  responseMeta?: ResponseMeta;
}

export interface EnquiryMessageThreadHandle {
  /** Sends any unsent composer text. Returns false if a send was attempted and failed. */
  flushDraft: () => Promise<boolean>;
}

export const EnquiryMessageThread = forwardRef<EnquiryMessageThreadHandle, EnquiryMessageThreadProps>(
  function EnquiryMessageThread({ enquiryId, onMessageSent, headerRight, onDraftChange, responseMeta }, ref) {
  const { user, profile, role } = useAuth();
  const [messages, setMessages] = useState<EnquiryMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from("enquiry_messages")
      .select("*")
      .eq("enquiry_id", enquiryId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMessages(data as EnquiryMessage[]);
      const hasUnreadFromOthers = (data as EnquiryMessage[]).some(
        (m) => !m.is_read && m.sender_id !== user?.id
      );
      if (hasUnreadFromOthers) {
        // SECURITY DEFINER RPC — RLS blocks direct UPDATE of other users' messages
        supabase.rpc("mark_enquiry_messages_read", { p_enquiry_id: enquiryId }).then(() => {});
      }
    }
    setLoading(false);
  }, [enquiryId, user?.id]);

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`enquiry-messages-${enquiryId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "enquiry_messages", filter: `enquiry_id=eq.${enquiryId}` },
        () => fetchMessages()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [enquiryId, fetchMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (): Promise<boolean> => {
    if (!newMessage.trim()) return true;
    if (!user || !profile) {
      toast.error("Your profile is still loading — please try again in a moment.");
      return false;
    }
    setSending(true);

    const { error } = await supabase.from("enquiry_messages").insert({
      enquiry_id: enquiryId,
      sender_id: user.id,
      sender_name: profile.name,
      sender_role: role || "sales",
      message: newMessage.trim(),
    });

    if (error) {
      console.error("Failed to send enquiry message:", error);
      toast.error(`Message not sent: ${error.message}`);
      setSending(false);
      return false;
    }

    setNewMessage("");
    onDraftChange?.("");
    // Refresh directly — don't rely on the realtime event arriving.
    await fetchMessages();
    onMessageSent?.();
    setSending(false);
    return true;
  };

  useImperativeHandle(ref, () => ({ flushDraft: handleSend }));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // The message that answered the enquiry: first non-nudge reply from the
  // supply side. Tagged with the "Responded in …" chip when responseMeta is set.
  const responseMessageId = responseMeta?.respondedAt
    ? messages.find(
        (m) => !m.is_nudge && ["supply_chain", "admin"].includes(m.sender_role)
      )?.id
    : undefined;

  const getRoleBadgeVariant = (senderRole: string) => {
    switch (senderRole) {
      case "admin": return "destructive";
      case "supply_chain": return "default";
      case "sales": return "secondary";
      default: return "outline";
    }
  };

  const getRoleLabel = (senderRole: string) => {
    switch (senderRole) {
      case "admin": return "Admin";
      case "supply_chain": return "Supply Chain";
      case "sales": return "Sales";
      case "sales_manager": return "Sales Manager";
      default: return senderRole;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Respond & Discuss
        </h4>
        {messages.length > 0 && (
          <Badge variant="outline" className="text-xs">{messages.length}</Badge>
        )}
        {headerRight && <div className="ml-auto">{headerRight}</div>}
      </div>

      <div
        ref={scrollRef}
        className="max-h-[300px] overflow-y-auto space-y-3 p-3 rounded-lg bg-muted/30 border border-border"
      >
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No messages yet. Type below and click Send to start the discussion.
          </p>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender_id === user?.id;
            if (msg.is_nudge) {
              return (
                <div key={msg.id} className="flex items-center justify-center gap-1.5 py-1">
                  <HandMetal className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground italic">
                    👋 {msg.sender_name} nudged the supply chain team ·{" "}
                    {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                  </span>
                </div>
              );
            }
            if (msg.is_quote_mirror) {
              // Structured quote summary posted by the DB trigger. Rendered
              // as a distinct system card (not a chat bubble) so the
              // salesperson recognizes it as the official quote response.
              const lines = msg.message.split("\n");
              return (
                <div
                  key={msg.id}
                  className="mx-auto w-full max-w-[92%] rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-[11px] font-medium text-primary">
                    <ClipboardList className="w-3.5 h-3.5" />
                    Quote from {msg.sender_name}
                    <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-sm">
                    {lines.map((line, i) => (
                      <div key={i} className="whitespace-pre-wrap">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-1 max-w-[85%]",
                  isOwn ? "ml-auto items-end" : "items-start"
                )}
              >
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span className="font-medium">{msg.sender_name}</span>
                  <Badge variant={getRoleBadgeVariant(msg.sender_role)} className="text-[10px] px-1.5 py-0">
                    {getRoleLabel(msg.sender_role)}
                  </Badge>
                  {msg.id === responseMessageId && responseMeta?.responseTimeText && (
                    <span
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium",
                        responseMeta.responseTimeColorClass
                      )}
                    >
                      <Timer className="w-3 h-3" />
                      Responded in {responseMeta.responseTimeText}
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    isOwn
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border border-border"
                  )}
                >
                  {msg.message}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                </span>
              </div>
            );
          })
        )}
        {/* Legacy fallback: enquiry was answered (e.g. via the quote form
            before quotes were mirrored here) but no supply message exists */}
        {!loading && responseMeta?.respondedAt && !responseMessageId && (
          <div className="flex items-center justify-center gap-1.5 py-1">
            <UserCheck className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground italic">
              Responded by {responseMeta.respondedByName || "Supply team"} on{" "}
              {new Date(responseMeta.respondedAt).toLocaleString()}
              {responseMeta.responseTimeText ? ` · in ${responseMeta.responseTimeText}` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex gap-2">
          <Textarea
            placeholder="Type your message, then press Enter or Send..."
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              onDraftChange?.(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            rows={2}
            className="resize-none"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="shrink-0 self-end gap-1.5"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Sending..." : "Send"}
          </Button>
        </div>
        {newMessage.trim() && !sending && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <CornerDownLeft className="w-3 h-3 shrink-0" />
            Not posted yet — press Enter or click Send and your message will appear above.
          </p>
        )}
      </div>
    </div>
  );
});
