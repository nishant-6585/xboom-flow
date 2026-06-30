import { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSalesUsers } from '@/hooks/useSalesUsers';
import { User, X, Search, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  ownerId?: string | null;
  ownerName?: string | null;
  onChange: (userId: string | null) => void;
  size?: 'sm' | 'md';
  align?: 'start' | 'center' | 'end';
  /** Render as a full-width form field instead of a compact chip. */
  variant?: 'chip' | 'field';
  disabled?: boolean;
}

export function CompanyOwnerPicker({ ownerId, ownerName, onChange, size = 'sm', align = 'start', variant = 'chip', disabled }: Props) {
  const { salesUsers, isLoading } = useSalesUsers();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return salesUsers;
    return salesUsers.filter(u =>
      u.name.toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term)
    );
  }, [q, salesUsers]);

  const handleSelect = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };

  const isField = variant === 'field';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md transition-colors',
            isField
              ? 'h-10 w-full justify-between border border-input bg-background px-3 py-2 text-sm hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50'
              : 'border border-dashed border-border/60 px-2 py-1 hover:border-primary/60 hover:bg-muted/40',
            size === 'sm' && !isField ? 'text-xs' : 'text-sm'
          )}
          title="Click to assign owner"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <User className={cn('shrink-0 text-muted-foreground', isField ? 'h-4 w-4' : 'h-3 w-3')} />
            {ownerId && ownerName ? (
              <span className="font-medium text-foreground truncate">{ownerName}</span>
            ) : (
              <span className="italic text-muted-foreground">{isField ? 'Select salesperson' : 'Unassigned'}</span>
            )}
          </span>
          {isField && <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn('p-2', isField ? 'w-72' : 'w-64')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative mb-2">
          <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sales person…"
            className="h-7 text-xs pl-7"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto -mx-1 px-1">
          {isLoading && (
            <div className="text-[11px] text-muted-foreground py-2 text-center">Loading…</div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-[11px] text-muted-foreground py-2 text-center">No matches</div>
          )}
          {filtered.map(u => {
            const active = u.user_id === ownerId;
            return (
              <button
                key={u.user_id}
                type="button"
                onClick={() => handleSelect(u.user_id)}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/60 text-left',
                  active && 'bg-primary/10'
                )}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{u.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{u.role.replace('_', ' ')}</span>
                </div>
                {active && <Check className="h-3 w-3 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
        {ownerId && (
          <>
            <div className="border-t border-border/50 my-1" />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-full text-[11px] text-muted-foreground gap-1"
              onClick={() => handleSelect(null)}
            >
              <X className="h-3 w-3" /> Unassign
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
