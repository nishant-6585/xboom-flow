import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, ChevronsUpDown, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
}

/**
 * Follow-up note input: pick from preset list OR toggle "Write custom note…"
 * to type a free-form multi-line note. Custom mode auto-activates when the
 * current value is not in the preset list.
 */
export function FollowupNoteInput({ value, onChange, options, placeholder = "Pick or type a note…" }: Props) {
  const isPreset = !value || options.includes(value);
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(!isPreset);

  useEffect(() => {
    if (!isPreset) setCustomMode(true);
  }, [isPreset]);

  if (customMode) {
    return (
      <div className="space-y-1">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your custom follow-up note…"
          rows={3}
          className="text-xs resize-none"
          autoFocus
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={() => {
            setCustomMode(false);
            onChange("");
          }}
        >
          <X className="h-3 w-3 mr-1" /> Cancel custom · pick from list
        </Button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-8 w-full justify-between text-xs font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandList className="max-h-64 overflow-y-auto">
            <CommandGroup heading="Preset notes">
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3 w-3", value === opt ? "opacity-100" : "opacity-0")} />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Custom">
              <CommandItem
                value="__write_custom__"
                onSelect={() => {
                  setCustomMode(true);
                  setOpen(false);
                }}
                className="text-xs text-primary"
              >
                <Pencil className="mr-2 h-3 w-3" />
                Write custom note…
              </CommandItem>
            </CommandGroup>
            <CommandEmpty className="text-xs py-3">No options</CommandEmpty>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}