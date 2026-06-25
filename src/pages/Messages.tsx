import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MessageSquare, Search, Loader2, Megaphone, X, Send } from "lucide-react";
import { useDmThreads, openOrCreateThread } from "@/hooks/useDmThreads";
import { ChatWindow } from "@/components/messages/ChatWindow";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export default function Messages() {
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { threads } = useDmThreads();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [pendingOther, setPendingOther] = useState<{ threadId: string; otherUserId: string } | null>(null);
  const [broadcastMode, setBroadcastMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

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
  const activeOtherId =
    active?.other_user_id ??
    (pendingOther?.threadId === threadId ? pendingOther.otherUserId : undefined);

  const openChat = async (otherId: string, existingThreadId: string | null) => {
    if (existingThreadId) {
      setPendingOther({ threadId: existingThreadId, otherUserId: otherId });
      navigate(`/messages/${existingThreadId}`);
      return;
    }
    try {
      setOpeningId(otherId);
      const id = await openOrCreateThread(otherId);
      setPendingOther({ threadId: id, otherUserId: otherId });
      qc.invalidateQueries({ queryKey: ["dm-threads", user?.id] });
      navigate(`/messages/${id}`);
    } catch (e: any) {
      toast({ title: "Could not open chat", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setOpeningId(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendBroadcast = async () => {
    const body = broadcastText.trim();
    if (!body || selected.size === 0 || !user?.id) return;
    setSendingBroadcast(true);
    let ok = 0;
    let fail = 0;
    for (const otherId of selected) {
      try {
        const tid = await openOrCreateThread(otherId);
        const { error } = await supabase
          .from("dm_messages")
          .insert({ thread_id: tid, sender_id: user.id, body });
        if (error) throw error;
        ok++;
      } catch {
        fail++;
      }
    }
    setSendingBroadcast(false);
    setBroadcastOpen(false);
    setBroadcastText("");
    setSelected(new Set());
    setBroadcastMode(false);
    qc.invalidateQueries({ queryKey: ["dm-threads", user.id] });
    toast({
      title: "Broadcast sent",
      description: `Delivered to ${ok}${fail ? ` · ${fail} failed` : ""}`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0 border rounded-lg overflow-hidden h-[calc(100vh-160px)] bg-card">
          {/* Thread list */}
          <aside className={cn("border-r flex flex-col", threadId && "hidden md:flex")}>
            <div className="p-3 border-b">
              <div className="font-semibold flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Messages
                </span>
                <Button
                  size="sm"
                  variant={broadcastMode ? "secondary" : "outline"}
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setBroadcastMode((v) => !v);
                    setSelected(new Set());
                  }}
                >
                  {broadcastMode ? (
                    <>
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </>
                  ) : (
                    <>
                      <Megaphone className="h-3 w-3 mr-1" /> Broadcast
                    </>
                  )}
                </Button>
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
              {broadcastMode && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {selected.size} selected
                  </span>
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={selected.size === 0}
                    onClick={() => setBroadcastOpen(true)}
                  >
                    <Send className="h-3 w-3 mr-1" /> Message {selected.size || ""}
                  </Button>
                </div>
              )}
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
                const isSelected = selected.has(p.id);
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
                    onClick={() => {
                      if (broadcastMode) toggleSelected(p.id);
                      else openChat(p.id, p.threadId);
                    }}
                    disabled={opening}
                    className={cn(
                      "w-full text-left px-3 py-3 border-b hover:bg-muted/50 flex gap-3 items-center",
                      isActive && "bg-muted",
                      isSelected && "bg-primary/10",
                      opening && "opacity-60"
                    )}
                  >
                    {broadcastMode && (
                      <Checkbox checked={isSelected} className="shrink-0" />
                    )}
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
            {threadId && activeOtherId ? (
              <ChatWindow key={threadId} threadId={threadId} otherUserId={activeOtherId} />
            ) : threadId ? (
              <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2 inline" /> Opening chat…
              </div>
            ) : (
              <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
                Select a teammate from the list to start chatting
              </div>
            )}
          </section>
        </div>
      </div>

      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Broadcast message</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            Sending to <span className="font-medium text-foreground">{selected.size}</span>{" "}
            teammate{selected.size === 1 ? "" : "s"} as individual chats.
          </div>
          <Textarea
            value={broadcastText}
            onChange={(e) => setBroadcastText(e.target.value)}
            placeholder="Type your message…"
            rows={5}
            className="resize-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBroadcastOpen(false)} disabled={sendingBroadcast}>
              Cancel
            </Button>
            <Button onClick={sendBroadcast} disabled={!broadcastText.trim() || sendingBroadcast}>
              {sendingBroadcast ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" /> Send to {selected.size}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}