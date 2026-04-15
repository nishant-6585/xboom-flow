import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek, parseISO, isToday } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, IndianRupee, User, Building2, Package, Flame, ThermometerSun, Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineOrder } from "@/hooks/usePipelineOrders";

interface PipelineCalendarViewProps {
  orders: PipelineOrder[];
  onEditOrder?: (order: PipelineOrder) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending_confirmation: "bg-blue-500",
  negotiation: "bg-amber-500",
  follow_up: "bg-purple-500",
  won: "bg-green-500",
  lost: "bg-red-500",
};

const STATUS_LABELS: Record<string, string> = {
  pending_confirmation: "Pending",
  negotiation: "Negotiation",
  follow_up: "Follow Up",
  won: "Won",
  lost: "Lost",
};

const TEMP_ICON: Record<string, typeof Flame> = {
  hot: Flame,
  warm: ThermometerSun,
  cold: Snowflake,
};

const TEMP_COLOR: Record<string, string> = {
  hot: "text-red-500",
  warm: "text-amber-500",
  cold: "text-blue-400",
};

export function PipelineCalendarView({ orders, onEditOrder }: PipelineCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  // Group orders by expected_closure_date
  const ordersByDate = useMemo(() => {
    const map = new Map<string, PipelineOrder[]>();
    orders.forEach(o => {
      if (!o.expected_closure_date) return;
      const key = format(parseISO(o.expected_closure_date), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    return map;
  }, [orders]);

  // Orders without closure date
  const unscheduled = useMemo(() => orders.filter(o => !o.expected_closure_date && o.status !== "won" && o.status !== "lost"), [orders]);

  // Monthly summary
  const monthOrders = useMemo(() => {
    return orders.filter(o => {
      if (!o.expected_closure_date) return false;
      const d = parseISO(o.expected_closure_date);
      return isSameMonth(d, currentMonth);
    });
  }, [orders, currentMonth]);

  const monthValue = monthOrders.reduce((s, o) => s + (o.expected_price || 0), 0);
  const activeMonthOrders = monthOrders.filter(o => o.status !== "won" && o.status !== "lost");

  const selectedDayOrders = selectedDay
    ? ordersByDate.get(format(selectedDay, "yyyy-MM-dd")) || []
    : [];

  return (
    <div className="space-y-4">
      {/* Month Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Deals This Month</p>
            <p className="text-xl font-bold">{monthOrders.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Active Deals</p>
            <p className="text-xl font-bold text-primary">{activeMonthOrders.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Expected Value</p>
            <p className="text-xl font-bold">₹{(monthValue / 100000).toFixed(1)}L</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Unscheduled</p>
            <p className="text-xl font-bold text-amber-600">{unscheduled.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h3 className="font-semibold text-lg">{format(currentMonth, "MMMM yyyy")}</h3>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Day names */}
          <div className="grid grid-cols-7 mb-1">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-px bg-border/50 rounded-lg overflow-hidden">
            {days.map(day => {
              const key = format(day, "yyyy-MM-dd");
              const dayOrders = ordersByDate.get(key) || [];
              const inMonth = isSameMonth(day, currentMonth);
              const today = isToday(day);
              const totalValue = dayOrders.reduce((s, o) => s + (o.expected_price || 0), 0);
              const hasHot = dayOrders.some(o => o.lead_temperature === "hot");

              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-[80px] md:min-h-[100px] p-1 bg-background cursor-pointer transition-colors hover:bg-muted/50",
                    !inMonth && "opacity-40",
                    today && "ring-2 ring-primary ring-inset",
                    selectedDay && isSameDay(day, selectedDay) && "bg-primary/10"
                  )}
                  onClick={() => dayOrders.length > 0 && setSelectedDay(day)}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={cn("text-xs font-medium", today && "text-primary font-bold")}>{format(day, "d")}</span>
                    {hasHot && <Flame className="w-3 h-3 text-red-500" />}
                  </div>
                  {dayOrders.length > 0 && (
                    <div className="space-y-0.5">
                      {dayOrders.slice(0, 3).map(o => (
                        <div
                          key={o.id}
                          className={cn("text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white", STATUS_COLORS[o.status] || "bg-muted")}
                          title={`${o.customer_name} - ${o.product_name} - ₹${o.expected_price?.toLocaleString()}`}
                        >
                          {o.customer_name.split(" ")[0]}
                        </div>
                      ))}
                      {dayOrders.length > 3 && (
                        <div className="text-[10px] text-muted-foreground text-center">+{dayOrders.length - 3} more</div>
                      )}
                      {totalValue > 0 && (
                        <div className="text-[9px] text-muted-foreground font-medium">₹{(totalValue / 1000).toFixed(0)}K</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t">
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <div className={cn("w-2.5 h-2.5 rounded-sm", STATUS_COLORS[k])} />
                <span className="text-xs text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Day Detail Dialog */}
      <Dialog open={!!selectedDay} onOpenChange={open => !open && setSelectedDay(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" />
              {selectedDay && format(selectedDay, "EEEE, dd MMMM yyyy")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedDayOrders.map(order => {
              const TempIcon = TEMP_ICON[order.lead_temperature] || ThermometerSun;
              return (
                <Card
                  key={order.id}
                  className={cn("cursor-pointer hover:shadow-md transition-shadow", onEditOrder && "hover:border-primary/50")}
                  onClick={() => onEditOrder?.(order)}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">{order.customer_name}</h4>
                      <div className="flex items-center gap-1.5">
                        <TempIcon className={cn("w-3.5 h-3.5", TEMP_COLOR[order.lead_temperature])} />
                        <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[order.status] || order.status}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1"><Package className="w-3 h-3" />{order.product_name}</div>
                      <div className="flex items-center gap-1"><IndianRupee className="w-3 h-3" />₹{order.expected_price?.toLocaleString() || "N/A"}</div>
                      <div className="flex items-center gap-1"><User className="w-3 h-3" />{order.sales_person_name}</div>
                      {order.customer_company && <div className="flex items-center gap-1"><Building2 className="w-3 h-3" />{order.customer_company}</div>}
                    </div>
                    {order.probability != null && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${order.probability}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{order.probability}%</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {selectedDayOrders.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No deals scheduled for this day</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
