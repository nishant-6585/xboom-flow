import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, MessageSquare } from "lucide-react";
import { useDmThreads } from "@/hooks/useDmThreads";
import { useProfileNames } from "@/hooks/useProfileNames";
import { ChatWindow } from "@/components/messages/ChatWindow";
import { NewChatDialog } from "@/components/messages/NewChatDialog";
import { cn } from "@/lib/utils";

export default function Messages() {
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const { threads, isLoading } = useDmThreads();
  const { resolveName } = useProfileNames();
  const [newOpen, setNewOpen] = useState(false);

  const active = threads.find((t) => t.id === threadId);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0 border rounded-lg overflow-hidden h-[calc(100vh-160px)] bg-card">
          {/* Thread list */}
          <aside className={cn("border-r flex flex-col", threadId && "hidden md:flex")}>
            <div className="p-3 border-b flex items-center justify-between">
              <div className="font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Messages
              </div>
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> New
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading && <div className="p-4 text-sm text-muted-foreground">Loading...</div>}
              {!isLoading && threads.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  No conversations yet. Start one with the "New" button.
                </div>
              )}
              {threads.map((t) => {
                const name = resolveName(t.other_user_id);
                const isActive = t.id === threadId;
                return (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/messages/${t.id}`)}
                    className={cn(
                      "w-full text-left px-3 py-3 border-b hover:bg-muted/50 flex gap-3 items-center",
                      isActive && "bg-muted"
                    )}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/15 text-primary grid place-items-center text-sm font-medium shrink-0">
                      {(name || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium truncate">{name}</div>
                        <div className="text-[10px] text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: false })}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground truncate">
                          {t.last_message_preview ?? "New conversation"}
                        </div>
                        {t.unread_count > 0 && (
                          <Badge className="h-5 min-w-5 px-1.5 text-[10px]">{t.unread_count}</Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Chat */}
          <section className={cn("flex flex-col", !threadId && "hidden md:flex")}>
            {threadId && active ? (
              <ChatWindow key={threadId} threadId={threadId} otherUserId={active.other_user_id} />
            ) : (
              <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
                Select a conversation or start a new one
              </div>
            )}
          </section>
        </div>
      </div>
      <NewChatDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}