import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Clock, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface TimePickerSelectProps {
  value: string; // HH:MM
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  minTime?: string; // HH:MM — grey out times before this
}

const TIME_SLOTS = (() => {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
})();

function formatDisplay(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function TimePickerSelect({ value, onChange, className, placeholder = 'Select time', minTime }: TimePickerSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const minMins = minTime ? toMinutes(minTime) : -1;

  useEffect(() => {
    if (open && selectedRef.current) {
      setTimeout(() => selectedRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' }), 50);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!value) return;
    const currentMins = toMinutes(value);
    let newMins = currentMins;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      newMins = Math.max(0, currentMins - 15);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      newMins = Math.min(23 * 60 + 45, currentMins + 15);
    } else {
      return;
    }

    if (minMins >= 0 && newMins <= minMins) return;
    const h = Math.floor(newMins / 60);
    const m = newMins % 60;
    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onKeyDown={handleKeyDown}
          className={cn(
            'inline-flex items-center gap-1 h-8 px-2 rounded-md border border-input bg-background text-sm',
            'hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors',
            'cursor-pointer select-none',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="min-w-[52px] text-center">{value ? formatDisplay(value) : placeholder}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[140px] p-0" align="start" sideOffset={4}>
        <ScrollArea className="h-[240px]">
          <div className="p-1">
            {TIME_SLOTS.map(slot => {
              const isSelected = slot === value;
              const slotMins = toMinutes(slot);
              const isDisabled = minMins >= 0 && slotMins <= minMins;

              return (
                <button
                  key={slot}
                  ref={isSelected ? selectedRef : undefined}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => { onChange(slot); setOpen(false); }}
                  className={cn(
                    'w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
                    isSelected
                      ? 'bg-primary text-primary-foreground font-medium'
                      : isDisabled
                        ? 'text-muted-foreground/40 cursor-not-allowed'
                        : 'hover:bg-accent text-foreground cursor-pointer'
                  )}
                >
                  {formatDisplay(slot)}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

interface QuickAdjustProps {
  time: string;
  onChange: (value: string) => void;
}

export function QuickAdjustButtons({ time, onChange }: QuickAdjustProps) {
  if (!time) return null;

  const adjust = (addMins: number) => {
    const currentMins = toMinutes(time);
    const newMins = Math.min(23 * 60 + 45, Math.max(0, currentMins + addMins));
    const h = Math.floor(newMins / 60);
    const m = newMins % 60;
    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  return (
    <div className="flex gap-0.5">
      {[15, 30, 60].map(mins => (
        <button
          key={mins}
          type="button"
          onClick={() => adjust(mins)}
          className="text-[9px] px-1 py-0.5 rounded bg-muted/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors border border-border/50"
        >
          +{mins >= 60 ? `${mins / 60}h` : `${mins}m`}
        </button>
      ))}
    </div>
  );
}

export function formatDurationDisplay(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
