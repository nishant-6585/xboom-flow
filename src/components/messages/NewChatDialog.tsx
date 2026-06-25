import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useProfileNames } from "@/hooks/useProfileNames";
import { useAuth } from "@/hooks/useAuth";
import { openOrCreateThread } from "@/hooks/useDmThreads";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Search, MessageSquarePlus, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; email: string | null };

export function NewChatDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { isLoading: profilesLoading } = useProfileNames();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: people = [], isLoading } = useQuery({
    queryKey: ["dm-people"],
    enabled: open,
    queryFn: async (): Promise<Person[]> => {
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

  useEffect(() => {
    if (!open) {
      setQ("");
      setSelectedId(null);
      setBusyId(null);
    }
  }, [open]);

  const items = useMemo(() => {
    const base = people.filter((p) => p.id !== user?.id);
    const query = q.trim().toLowerCase();
    const filtered = query
      ? base.filter(
          (x) =>
            x.name.toLowerCase().includes(query) ||
            (x.email ?? "").toLowerCase().includes(query)
        )
      : base;
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [people, q, user?.id]);

  const start = async (otherId: string) => {
    try {
      setBusyId(otherId);
      const id = await openOrCreateThread(otherId);
      onOpenChange(false);
      navigate(`/messages/${id}`);
    } catch (e: any) {
      toast({ title: "Could not start chat", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const loading = isLoading || profilesLoading;
  const selected = items.find((p) => p.id === selectedId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            Start a new chat
          </DialogTitle>
          <DialogDescription>
            Select a teammate to begin a private 1:1 conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-3 border-b bg-muted/30">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name or email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
              className="pl-9"
            />
          </div>
        </div>

        <div className="max-h-[380px] overflow-y-auto">
          {loading && (
            <div className="p-8 text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading people…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="p-10 text-sm text-muted-foreground text-center flex flex-col items-center gap-2">
              <Users className="h-8 w-8 opacity-50" />
              <div>No teammates found{q ? ` for "${q}"` : ""}</div>
            </div>
          )}
          {!loading &&
            items.map((u) => {
              const isSelected = selectedId === u.id;
              const isBusy = busyId === u.id;
              const initials = (u.name || "?")
                .split(" ")
                .map((s) => s[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase();
              return (
                <div
                  key={u.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 cursor-pointer transition-colors",
                    isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                  )}
                  onClick={() => setSelectedId(u.id)}
                  onDoubleClick={() => start(u.id)}
                >
                  <div className="h-9 w-9 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-semibold shrink-0">
                    {initials || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{u.name}</div>
                    {u.email && (
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    disabled={isBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      start(u.id);
                    }}
                    className="shrink-0"
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Opening…
                      </>
                    ) : (
                      <>
                        <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" /> Message
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
        </div>

        <div className="px-5 py-3 border-t bg-muted/30 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {items.length} {items.length === 1 ? "person" : "people"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!selected || !!busyId}
              onClick={() => selected && start(selected.id)}
            >
              {busyId ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Opening…
                </>
              ) : (
                <>
                  <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
                  Start chat{selected ? ` with ${selected.name.split(" ")[0]}` : ""}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}