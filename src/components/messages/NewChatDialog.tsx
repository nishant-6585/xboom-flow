import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useProfileNames } from "@/hooks/useProfileNames";
import { useAuth } from "@/hooks/useAuth";
import { openOrCreateThread } from "@/hooks/useDmThreads";
import { toast } from "@/hooks/use-toast";

export function NewChatDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { profilesMap, isLoading } = useProfileNames();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => {
    const all: { id: string; name: string }[] = [];
    profilesMap.forEach((name, id) => {
      if (id !== user?.id) all.push({ id, name });
    });
    const query = q.trim().toLowerCase();
    const filtered = query ? all.filter((x) => x.name.toLowerCase().includes(query)) : all;
    return filtered.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 100);
  }, [profilesMap, q, user?.id]);

  const start = async (otherId: string) => {
    try {
      setBusy(true);
      const id = await openOrCreateThread(otherId);
      onOpenChange(false);
      navigate(`/messages/${id}`);
    } catch (e: any) {
      toast({ title: "Could not start chat", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
        </DialogHeader>
        <Input placeholder="Search people..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="max-h-96 overflow-y-auto divide-y border rounded">
          {isLoading && <div className="p-4 text-sm text-muted-foreground">Loading...</div>}
          {!isLoading && items.length === 0 && <div className="p-4 text-sm text-muted-foreground">No users found</div>}
          {items.map((u) => (
            <button
              key={u.id}
              disabled={busy}
              onClick={() => start(u.id)}
              className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm disabled:opacity-50"
            >
              {u.name}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}