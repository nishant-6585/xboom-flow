import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Users, Save, Check } from 'lucide-react';
import { useSalesUsers } from '@/hooks/useSalesUsers';

interface OwnerRow {
  owner_id: string;
  owner_label: string | null;
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

  const saveLabel = useMutation({
    mutationFn: async ({ ownerId, agentName }: { ownerId: string; agentName: string }) => {
      const { data, error } = await supabase.rpc('upsert_interakt_owner_mapping' as any, {
        _owner_id: ownerId,
        _user_id: null,
        _label: null,
        _agent_name: agentName,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interakt-owner-mappings'] });
      toast.success('Owner label saved');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save owner label'),
  });

  const saveMapping = useMutation({
    mutationFn: async ({ ownerId, userId, agentName }: { ownerId: string; userId: string; agentName: string | null }) => {
      const label = salesUsers.find((u) => u.user_id === userId)?.name ?? null;
      const { data, error } = await supabase.rpc('upsert_interakt_owner_mapping' as any, {
        _owner_id: ownerId,
        _user_id: userId,
        _label: label,
        _agent_name: agentName,
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
            assigned automatically to the mapped salesperson. The long ID below each name is Interakt's
            internal owner identifier.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6">Loading account owners…</p>
        ) : owners.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No Interakt account owners found in synced leads yet.
          </p>
        ) : (
          <div className="space-y-3">
            {owners.map((o) => (
              <OwnerRowCard
                key={o.owner_id}
                owner={o}
                salesUsers={salesUsers}
                savingLabel={saveLabel.isPending}
                savingMapping={saveMapping.isPending}
                onLabelChange={(agentName) => saveLabel.mutate({ ownerId: o.owner_id, agentName })}
                onSalespersonChange={(userId) =>
                  saveMapping.mutate({ ownerId: o.owner_id, userId, agentName: o.owner_label })
                }
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OwnerRowCard({
  owner,
  salesUsers,
  savingLabel,
  savingMapping,
  onLabelChange,
  onSalespersonChange,
}: {
  owner: OwnerRow;
  salesUsers: { user_id: string; name: string }[];
  savingLabel: boolean;
  savingMapping: boolean;
  onLabelChange: (agentName: string) => void;
  onSalespersonChange: (userId: string) => void;
}) {
  const [draft, setDraft] = useState(owner.owner_label ?? '');
  const isDirty = draft !== (owner.owner_label ?? '');


  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Owner ${owner.owner_id.slice(0, 8)}`}
              className="h-8 text-sm font-medium"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={!isDirty || savingLabel}
              onClick={() => onLabelChange(draft)}
              title="Save owner label"
            >
              {savingLabel ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Save className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground mt-1 truncate" title={owner.owner_id}>
            Interakt owner ID: {owner.owner_id}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px]">
              {owner.lead_count} leads
            </Badge>
            {owner.unassigned_count > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {owner.unassigned_count} unassigned
              </Badge>
            )}
            {owner.user_name && (
              <Badge variant="default" className="text-[10px] gap-1">
                <Check className="h-3 w-3" />
                Mapped to {owner.user_name}
              </Badge>
            )}
          </div>
        </div>
        <Select
          value={owner.user_id ?? undefined}
          onValueChange={onSalespersonChange}
          disabled={savingMapping}
        >
          <SelectTrigger className="w-full sm:w-[220px]">
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
    </div>
  );
}
