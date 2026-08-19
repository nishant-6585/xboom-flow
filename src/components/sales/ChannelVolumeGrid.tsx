import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface ChannelVolumeItem {
  /** Tab value this card selects. */
  tab: string;
  label: string;
  total: number;
  newCount: number;
}

const STORAGE_KEY = 'leads.channelVolumeGrid.open';

interface Props {
  items: ChannelVolumeItem[];
  activeTab: string;
  onSelect: (tab: string) => void;
}

export function ChannelVolumeGrid({ items, activeTab, onSelect }: Props) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={toggle}
        className="h-7 px-2 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 mr-1" /> : <ChevronRight className="h-3.5 w-3.5 mr-1" />}
        Channel volume
      </Button>

      {open && (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}
        >
          {items.map((item) => (
            <button
              key={item.tab}
              type="button"
              onClick={() => onSelect(item.tab)}
              className={cn(
                'rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50',
                activeTab === item.tab && 'border-primary bg-primary/10',
              )}
            >
              <div className="text-[12.5px] text-muted-foreground truncate">{item.label}</div>
              <div className="text-[19px] font-semibold tabular-nums leading-tight">
                {item.total.toLocaleString()}
              </div>
              <div
                className={cn(
                  'font-mono text-[10px]',
                  item.newCount > 0 ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {item.newCount > 0 ? `${item.newCount} new` : 'none new'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
