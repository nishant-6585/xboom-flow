import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useTeamMembers } from "@/hooks/useTickets";
import { format } from "date-fns";
import { 
  Filter, 
  X, 
  CalendarIcon, 
  Search,
  Building2,
  User,
  Clock,
  RotateCcw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Database } from "@/integrations/supabase/types";

type TicketStatus = Database["public"]["Enums"]["ticket_status"];
type TicketPriority = Database["public"]["Enums"]["ticket_priority"];
type AppRole = Database["public"]["Enums"]["app_role"];

export interface TicketFiltersState {
  search: string;
  status: string;
  priority: string;
  department: string;
  assignedTo: string;
  raisedBy: string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  slaBreached: boolean;
}

interface TicketFiltersProps {
  filters: TicketFiltersState;
  onFiltersChange: (filters: TicketFiltersState) => void;
}

const statuses: { value: string; label: string }[] = [
  { value: "all", label: "All Status" },
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "pending", label: "Pending" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "removed", label: "Removed" },
];

const priorities: { value: string; label: string }[] = [
  { value: "all", label: "All Priority" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const departments: { value: string; label: string }[] = [
  { value: "all", label: "All Departments" },
  { value: "sales", label: "Sales" },
  { value: "supply_chain", label: "Supply Chain" },
  { value: "finance", label: "Finance" },
  { value: "admin", label: "Admin" },
  { value: "it", label: "IT" },
  { value: "marketing", label: "Marketing" },
  { value: "hr", label: "HR" },
];

export function TicketFilters({ filters, onFiltersChange }: TicketFiltersProps) {
  const { data: teamMembers = [] } = useTeamMembers();
  const [isOpen, setIsOpen] = useState(false);

  const activeFiltersCount = [
    filters.status !== "all" && filters.status,
    filters.priority !== "all" && filters.priority,
    filters.department !== "all" && filters.department,
    filters.assignedTo,
    filters.raisedBy,
    filters.dateFrom,
    filters.dateTo,
    filters.slaBreached,
  ].filter(Boolean).length;

  const resetFilters = () => {
    onFiltersChange({
      search: "",
      status: "all",
      priority: "all",
      department: "all",
      assignedTo: "",
      raisedBy: "",
      dateFrom: undefined,
      dateTo: undefined,
      slaBreached: false,
    });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search tickets..."
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="pl-9"
        />
      </div>

      {/* Quick Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select
          value={filters.status}
          onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.department}
          onValueChange={(value) => onFiltersChange({ ...filters, department: value })}
        >
          <SelectTrigger className="w-[150px]">
            <Building2 className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* SLA Breached Toggle */}
        <Button
          variant={filters.slaBreached ? "destructive" : "outline"}
          size="default"
          onClick={() => onFiltersChange({ ...filters, slaBreached: !filters.slaBreached })}
        >
          <Clock className="w-4 h-4 mr-2" />
          SLA Breached
        </Button>

        {/* Advanced Filters Sheet */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="relative">
              <Filter className="w-4 h-4 mr-2" />
              More Filters
              {activeFiltersCount > 0 && (
                <Badge
                  variant="secondary"
                  className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center"
                >
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[400px] sm:w-[540px]">
            <SheetHeader>
              <SheetTitle className="flex items-center justify-between">
                <span>Advanced Filters</span>
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
              </SheetTitle>
            </SheetHeader>

            <div className="space-y-6 mt-6">
              {/* Priority Filter */}
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={filters.priority}
                  onValueChange={(value) => onFiltersChange({ ...filters, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {priorities.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Assigned To Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Assigned To
                </Label>
                <Select
                  value={filters.assignedTo || "all"}
                  onValueChange={(value) =>
                    onFiltersChange({ ...filters, assignedTo: value === "all" ? "" : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Raised By Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Raised By
                </Label>
                <Select
                  value={filters.raisedBy || "all"}
                  onValueChange={(value) =>
                    onFiltersChange({ ...filters, raisedBy: value === "all" ? "" : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    From Date
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !filters.dateFrom && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.dateFrom ? format(filters.dateFrom, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filters.dateFrom}
                        onSelect={(date) => onFiltersChange({ ...filters, dateFrom: date })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    To Date
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !filters.dateTo && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.dateTo ? format(filters.dateTo, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filters.dateTo}
                        onSelect={(date) => onFiltersChange({ ...filters, dateTo: date })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Active Filters Summary */}
              {activeFiltersCount > 0 && (
                <div className="pt-4 border-t">
                  <Label className="text-muted-foreground mb-2 block">Active Filters</Label>
                  <div className="flex flex-wrap gap-2">
                    {filters.status !== "all" && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        Status: {filters.status}
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => onFiltersChange({ ...filters, status: "all" })}
                        />
                      </Badge>
                    )}
                    {filters.priority !== "all" && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        Priority: {filters.priority}
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => onFiltersChange({ ...filters, priority: "all" })}
                        />
                      </Badge>
                    )}
                    {filters.department !== "all" && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        Dept: {filters.department}
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => onFiltersChange({ ...filters, department: "all" })}
                        />
                      </Badge>
                    )}
                    {filters.slaBreached && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        SLA Breached
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => onFiltersChange({ ...filters, slaBreached: false })}
                        />
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
