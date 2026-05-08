import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { COURIER_NAMES } from '@/lib/courierTracking';

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
}

/** Searchable courier dropdown. Always shows full list when reopened; allows typing custom. */
export function CourierCombobox({
  value,
  onChange,
  disabled,
  placeholder = 'Select courier…',
  id,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = COURIER_NAMES.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase()),
  );
  const showAddCustom =
    search.trim().length > 0 &&
    !COURIER_NAMES.some((o) => o.toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type custom…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && !showAddCustom && (
              <CommandEmpty>No couriers found</CommandEmpty>
            )}
            {showAddCustom && (
              <CommandGroup heading="Add custom">
                <CommandItem
                  value={`__add__${search}`}
                  onSelect={() => {
                    onChange(search.trim());
                    setSearch('');
                    setOpen(false);
                  }}
                >
                  + Use “{search.trim()}”
                </CommandItem>
              </CommandGroup>
            )}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((opt) => (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={() => {
                      onChange(opt);
                      setSearch('');
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === opt ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {opt}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}