import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { PRODUCT_CATEGORIES, ENQUIRY_STATUSES, QueryStatus } from '@/hooks/useEnquiries';

const LEAD_SOURCES = [
  'Website', 'IndiaMART', 'Trade India', 'Just Dial', 'Google Ads',
  'Facebook', 'Instagram', 'LinkedIn', 'WhatsApp', 'Referral',
  'Cold Call', 'Exhibition', 'Email Campaign', 'Other',
];

const DEPARTMENT_OWNERS = [
  { value: 'sales', label: 'Sales' },
  { value: 'supply_chain', label: 'Supply Chain' },
];

const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export interface LeadFilters {
  status: QueryStatus | 'all';
  category: string;
  source: string;
  department: string;
  priority: string;
  assignedTo: string;
  startDate: Date | undefined;
  endDate: Date | undefined;
}

interface LeadFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: LeadFilters;
  onApply: (filters: LeadFilters) => void;
  salesTeam: { user_id: string; name: string }[];
  /** When false, hide the "Assigned To" filter (sales reps can't switch assignees). */
  isManagerView?: boolean;
}

export function LeadFiltersSheet({ open, onOpenChange, filters, onApply, salesTeam, isManagerView = true }: LeadFiltersSheetProps) {
  const [localFilters, setLocalFilters] = useState<LeadFilters>(filters);

  const handleReset = () => {
    const resetFilters: LeadFilters = {
      status: 'all',
      category: 'all',
      source: 'all',
      department: 'all',
      priority: 'all',
      assignedTo: 'all',
      startDate: undefined,
      endDate: undefined,
    };
    setLocalFilters(resetFilters);
  };

  const handleApply = () => {
    onApply(localFilters);
    onOpenChange(false);
  };

  const activeFilterCount = Object.entries(localFilters).filter(([key, value]) => {
    if (key === 'startDate' || key === 'endDate') return value !== undefined;
    return value !== 'all';
  }).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle>Filters</SheetTitle>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Clear all ({activeFilterCount})
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="overflow-y-auto py-4 space-y-6 max-h-[calc(85vh-140px)]">
          {/* Status Filter */}
          <div className="space-y-2">
            <Label>Lead Status</Label>
            <Select 
              value={localFilters.status} 
              onValueChange={(value) => setLocalFilters(prev => ({ ...prev, status: value as QueryStatus | 'all' }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {ENQUIRY_STATUSES.map(status => (
                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Assigned To */}
          {isManagerView && salesTeam.length > 0 && (
            <div className="space-y-2">
              <Label>Assigned To</Label>
              <Select 
                value={localFilters.assignedTo} 
                onValueChange={(value) => setLocalFilters(prev => ({ ...prev, assignedTo: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All team members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Team Members</SelectItem>
                  {salesTeam.map(member => (
                    <SelectItem key={member.user_id} value={member.user_id}>{member.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Department Owner */}
          <div className="space-y-2">
            <Label>Department Owner</Label>
            <Select 
              value={localFilters.department} 
              onValueChange={(value) => setLocalFilters(prev => ({ ...prev, department: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {DEPARTMENT_OWNERS.map(dept => (
                  <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Select 
              value={localFilters.category} 
              onValueChange={(value) => setLocalFilters(prev => ({ ...prev, category: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {PRODUCT_CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source */}
          <div className="space-y-2">
            <Label>Lead Source</Label>
            <Select 
              value={localFilters.source} 
              onValueChange={(value) => setLocalFilters(prev => ({ ...prev, source: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {LEAD_SOURCES.map(source => (
                  <SelectItem key={source} value={source.toLowerCase()}>{source}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select 
              value={localFilters.priority} 
              onValueChange={(value) => setLocalFilters(prev => ({ ...prev, priority: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {PRIORITY_OPTIONS.map(priority => (
                  <SelectItem key={priority.value} value={priority.value}>{priority.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <Label>Date Range</Label>
            <div className="grid grid-cols-2 gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    className={cn("justify-start text-left font-normal", !localFilters.startDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {localFilters.startDate ? format(localFilters.startDate, 'dd MMM') : 'Start'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={localFilters.startDate}
                    onSelect={(date) => setLocalFilters(prev => ({ ...prev, startDate: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    className={cn("justify-start text-left font-normal", !localFilters.endDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {localFilters.endDate ? format(localFilters.endDate, 'dd MMM') : 'End'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={localFilters.endDate}
                    onSelect={(date) => setLocalFilters(prev => ({ ...prev, endDate: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            {(localFilters.startDate || localFilters.endDate) && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full"
                onClick={() => setLocalFilters(prev => ({ ...prev, startDate: undefined, endDate: undefined }))}
              >
                <X className="w-3 h-3 mr-1" />
                Clear dates
              </Button>
            )}
          </div>
        </div>

        <SheetFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleApply} className="flex-1">
            Apply Filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
