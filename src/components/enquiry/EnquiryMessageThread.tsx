import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, MessageSquare, Loader2, HandMetal } from "lucide-react";
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
}

interface EnquiryMessageThreadProps {
  enquiryId: string;
  onMessageSent?: () => void;
  headerRight?: React.ReactNode;
}

export function EnquiryMessageThread({ enquiryId, onMessageSent, headerRight }: EnquiryMessageThreadProps) {
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

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !profile) return;
    setSending(true);

    const { error } = await supabase.from("enquiry_messages").insert({
      enquiry_id: enquiryId,
      sender_id: user.id,
      sender_name: profile.name,
      sender_role: role || "sales",
      message: newMessage.trim(),
    });

    if (!error) {
      setNewMessage("");
      onMessageSent?.();
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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
            No messages yet. Start a conversation about this enquiry.
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
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-1 max-w-[85%]",
                  isOwn ? "ml-auto items-end" : "items-start"
                )}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{msg.sender_name}</span>
                  <Badge variant={getRoleBadgeVariant(msg.sender_role)} className="text-[10px] px-1.5 py-0">
                    {getRoleLabel(msg.sender_role)}
                  </Badge>
                </div>
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
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
      </div>

      <div className="flex gap-2">
        <Textarea
          placeholder="Type your message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          className="resize-none"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!newMessage.trim() || sending}
          className="shrink-0 self-end"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
