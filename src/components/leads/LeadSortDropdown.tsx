import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowUpDown, ArrowUp, ArrowDown, Check } from 'lucide-react';

export type SortField = 'created_at' | 'updated_at' | 'customer_name' | 'urgency';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

interface LeadSortDropdownProps {
  sort: SortConfig;
  onSortChange: (sort: SortConfig) => void;
}

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'created_at', label: 'Created Date' },
  { field: 'updated_at', label: 'Last Updated' },
  { field: 'customer_name', label: 'Customer Name' },
  { field: 'urgency', label: 'Urgency' },
];

export function LeadSortDropdown({ sort, onSortChange }: LeadSortDropdownProps) {
  const handleFieldChange = (field: SortField) => {
    if (sort.field === field) {
      // Toggle direction
      onSortChange({ field, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      // New field, default to desc (newest first)
      onSortChange({ field, direction: 'desc' });
    }
  };

  const getLabel = () => {
    const option = SORT_OPTIONS.find(o => o.field === sort.field);
    return option?.label || 'Sort';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ArrowUpDown className="w-4 h-4" />
          <span className="hidden sm:inline">{getLabel()}</span>
          {sort.direction === 'asc' ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Sort By</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.field}
            onClick={() => handleFieldChange(option.field)}
            className="flex items-center justify-between"
          >
            <span>{option.label}</span>
            {sort.field === option.field && (
              <div className="flex items-center gap-1">
                {sort.direction === 'asc' ? (
                  <ArrowUp className="w-3 h-3" />
                ) : (
                  <ArrowDown className="w-3 h-3" />
                )}
                <Check className="w-3 h-3" />
              </div>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onSortChange({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}
        >
          Toggle Direction ({sort.direction === 'asc' ? 'Ascending' : 'Descending'})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
