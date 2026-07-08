import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { useDmMessages } from "@/hooks/useDmMessages";
import { useAuth } from "@/hooks/useAuth";
import { useProfileNames } from "@/hooks/useProfileNames";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function formatTime(d: string) {
  const date = new Date(d);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return `Yesterday ${format(date, "h:mm a")}`;
  return format(date, "MMM d, h:mm a");
}

export function ChatWindow({ threadId, otherUserId }: { threadId: string; otherUserId: string | undefined }) {
  const { user } = useAuth();
  const { messages, isLoading, send, isSending } = useDmMessages(threadId);
  const { resolveName, resolveAvatar } = useProfileNames();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, threadId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || isSending) return;
    setText("");
    try {
      await send(body);
      inputRef.current?.focus();
    } catch (e: any) {
      setText(body);
      toast({ title: "Failed to send", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-3 flex items-center gap-2">
        <Avatar className="h-9 w-9">
          {resolveAvatar(otherUserId) ? (
            <AvatarImage src={resolveAvatar(otherUserId) as string} alt={resolveName(otherUserId)} />
          ) : null}
          <AvatarFallback className="bg-primary/15 text-primary text-sm font-medium">
            {(resolveName(otherUserId) || "?").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="font-medium">{resolveName(otherUserId)}</div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
        {!isLoading && messages.length === 0 && (
          <div className="text-sm text-muted-foreground text-center mt-8">No messages yet. Say hi 👋</div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                  mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                )}
              >
                <div>{m.body}</div>
                <div className={cn("text-[10px] mt-1 opacity-70", mine ? "text-right" : "text-left")}>
                  {formatTime(m.created_at)}
                  {mine && m.read_at ? " · Read" : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t p-3 flex gap-2 items-end">
        <Textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type a message…"
          className="min-h-[44px] max-h-40 resize-none"
          rows={1}
        />
        <Button onClick={handleSend} disabled={!text.trim() || isSending} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}