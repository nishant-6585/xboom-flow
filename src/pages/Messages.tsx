import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MessageSquare, Search, Loader2 } from "lucide-react";
import { useDmThreads, openOrCreateThread } from "@/hooks/useDmThreads";
import { useProfileNames } from "@/hooks/useProfileNames";
import { ChatWindow } from "@/components/messages/ChatWindow";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function Messages() {
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { threads } = useDmThreads();
  const { resolveName } = useProfileNames();
  const [q, setQ] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);

  const { data: people = [], isLoading } = useQuery({
    queryKey: ["dm-people-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .limit(2000);
      if (error) throw error;
      return (data ?? [])
        .filter((p: any) => p?.user_id)
        .map((p: any) => ({
          id: p.user_id as string,
          name: (p.name as string) || (p.email as string) || "Unknown",
          email: (p.email as string) ?? null,
        }));
    },
    staleTime: 60_000,
  });

  // Merge threads info into people list
  const rows = useMemo(() => {
    const threadByUser = new Map(threads.map((t) => [t.other_user_id, t]));
    const list = people
      .filter((p) => p.id !== user?.id)
      .map((p) => {
        const t = threadByUser.get(p.id);
        return {
          ...p,
          threadId: t?.id ?? null,
          last_message_at: t?.last_message_at ?? null,
          last_message_preview: t?.last_message_preview ?? null,
          unread_count: t?.unread_count ?? 0,
        };
      });
    const query = q.trim().toLowerCase();
    const filtered = query
      ? list.filter(
          (x) =>
            x.name.toLowerCase().includes(query) ||
            (x.email ?? "").toLowerCase().includes(query)
        )
      : list;
    return filtered.sort((a, b) => {
      // Unread first, then most recent thread, then alpha
      if ((b.unread_count > 0 ? 1 : 0) !== (a.unread_count > 0 ? 1 : 0)) {
        return (b.unread_count > 0 ? 1 : 0) - (a.unread_count > 0 ? 1 : 0);
      }
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      if (ta !== tb) return tb - ta;
      return a.name.localeCompare(b.name);
    });
  }, [people, threads, q, user?.id]);

  const active = threads.find((t) => t.id === threadId);

  const openChat = async (otherId: string, existingThreadId: string | null) => {
    if (existingThreadId) {
      navigate(`/messages/${existingThreadId}`);
      return;
    }
    try {
      setOpeningId(otherId);
      const id = await openOrCreateThread(otherId);
      navigate(`/messages/${id}`);
    } catch (e: any) {
      toast({ title: "Could not open chat", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0 border rounded-lg overflow-hidden h-[calc(100vh-160px)] bg-card">
          {/* Thread list */}
          <aside className={cn("border-r flex flex-col", threadId && "hidden md:flex")}>
            <div className="p-3 border-b">
              <div className="font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Messages
              </div>
              <div className="relative mt-2">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search teammates…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading people…
                </div>
              )}
              {!isLoading && rows.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground text-center">No teammates found</div>
              )}
              {rows.map((p) => {
                const isActive = !!p.threadId && p.threadId === threadId;
                const opening = openingId === p.id;
                const initials = (p.name || "?")
                  .split(" ")
                  .map((s) => s[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <button
                    key={p.id}
                    onClick={() => openChat(p.id, p.threadId)}
                    disabled={opening}
                    className={cn(
                      "w-full text-left px-3 py-3 border-b hover:bg-muted/50 flex gap-3 items-center",
                      isActive && "bg-muted",
                      opening && "opacity-60"
                    )}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/15 text-primary grid place-items-center text-sm font-medium shrink-0">
                      {initials || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium truncate">{p.name}</div>
                        {p.last_message_at && (
                          <div className="text-[10px] text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(p.last_message_at), { addSuffix: false })}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground truncate">
                          {p.last_message_preview ?? (p.email ?? "Start a conversation")}
                        </div>
                        {p.unread_count > 0 && (
                          <Badge className="h-5 min-w-5 px-1.5 text-[10px]">{p.unread_count}</Badge>
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
                Select a teammate from the list to start chatting
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}