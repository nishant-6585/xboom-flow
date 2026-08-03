import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { useSalesUsers } from '@/hooks/useSalesUsers';

interface OwnerRow {
  owner_id: string;
  lead_count: number;
  unassigned_count: number;
  last_seen: string | null;
  user_id: string | null;
  user_name: string | null;
  label: string | null;
}

export function InteraktOwnerMappingDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { salesUsers } = useSalesUsers();

  const { data: owners = [], isLoading } = useQuery({
    queryKey: ['interakt-owner-mappings'],
    enabled: open,
    queryFn: async (): Promise<OwnerRow[]> => {
      const { data, error } = await supabase.rpc('list_interakt_owner_mappings' as any);
      if (error) throw error;
      return (data ?? []) as OwnerRow[];
    },
  });

  const save = useMutation({
    mutationFn: async ({ ownerId, userId }: { ownerId: string; userId: string }) => {
      const label = salesUsers.find((u) => u.user_id === userId)?.name ?? null;
      const { data, error } = await supabase.rpc('upsert_interakt_owner_mapping' as any, {
        _owner_id: ownerId,
        _user_id: userId,
        _label: label,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (backfilled) => {
      queryClient.invalidateQueries({ queryKey: ['interakt-owner-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['interakt-leads'] });
      toast.success(
        backfilled > 0
          ? `Mapping saved — ${backfilled} unassigned lead(s) assigned`
          : 'Mapping saved. New leads will be assigned automatically.',
      );
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save mapping'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Users className="h-4 w-4" />
          Account owner mapping
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Interakt account owner mapping</DialogTitle>
          <DialogDescription>
            Map each Interakt Contact Hub account owner to a salesperson. Incoming Interakt leads are
            assigned automatically to the mapped salesperson.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6">Loading account owners…</p>
        ) : owners.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No Interakt account owners found in synced leads yet.
          </p>
        ) : (
          <div className="space-y-2">
            {owners.map((o) => (
              <div
                key={o.owner_id}
                className="flex flex-wrap items-center gap-3 justify-between rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs truncate">{o.owner_id}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {o.lead_count} leads
                    </Badge>
                    {o.unassigned_count > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {o.unassigned_count} unassigned
                      </Badge>
                    )}
                    {o.label && <span className="text-xs text-muted-foreground">{o.label}</span>}
                  </div>
                </div>
                <Select
                  value={o.user_id ?? undefined}
                  onValueChange={(userId) => save.mutate({ ownerId: o.owner_id, userId })}
                  disabled={save.isPending}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Select salesperson" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesUsers.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}