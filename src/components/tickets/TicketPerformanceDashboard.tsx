import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Ticket } from "@/hooks/useTickets";
import { useOrders } from "@/hooks/useOrders";
import { useEnquiries } from "@/hooks/useEnquiries";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Trophy,
  Target,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  User,
  Medal,
} from "lucide-react";
import { differenceInHours, differenceInMinutes, isPast } from "date-fns";

interface TicketPerformanceDashboardProps {
  tickets: Ticket[];
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

interface UserPerformance {
  userId: string;
  userName: string;
  ticketsResolved: number;
  avgResolutionTime: number;
  slaMet: number;
  slaBreached: number;
  slaComplianceRate: number;
  salesOrders: number;
  enquiriesHandled: number;
  totalScore: number;
}

export function TicketPerformanceDashboard({ tickets }: TicketPerformanceDashboardProps) {
  const { orders } = useOrders();
  const { enquiries } = useEnquiries();

  const userPerformance = useMemo(() => {
    const performanceMap = new Map<string, UserPerformance>();

    // Process tickets
    tickets.forEach((ticket) => {
      if (!ticket.assigned_to) return;

      let perf = performanceMap.get(ticket.assigned_to);
      if (!perf) {
        perf = {
          userId: ticket.assigned_to,
          userName: ticket.assigned_to_name || "Unknown",
          ticketsResolved: 0,
          avgResolutionTime: 0,
          slaMet: 0,
          slaBreached: 0,
          slaComplianceRate: 0,
          salesOrders: 0,
          enquiriesHandled: 0,
          totalScore: 0,
        };
        performanceMap.set(ticket.assigned_to, perf);
      }

      if (ticket.status === "resolved" || ticket.status === "closed") {
        perf.ticketsResolved++;

        if (ticket.resolved_at && ticket.created_at) {
          const resolutionHours = differenceInHours(
            new Date(ticket.resolved_at),
            new Date(ticket.created_at)
          );
          perf.avgResolutionTime = 
            (perf.avgResolutionTime * (perf.ticketsResolved - 1) + resolutionHours) / 
            perf.ticketsResolved;
        }

        if (ticket.sla_due_at) {
          const resolvedAt = ticket.resolved_at ? new Date(ticket.resolved_at) : new Date();
          const slaDue = new Date(ticket.sla_due_at);
          if (resolvedAt <= slaDue) {
            perf.slaMet++;
          } else {
            perf.slaBreached++;
          }
        }
      } else if (ticket.sla_due_at && isPast(new Date(ticket.sla_due_at))) {
        perf.slaBreached++;
      }
    });

    // Add sales data
    orders.forEach((order) => {
      if (!order.sales_person_id) return;
      
      let perf = performanceMap.get(order.sales_person_id);
      if (!perf) {
        perf = {
          userId: order.sales_person_id,
          userName: order.sales_person_name || "Unknown",
          ticketsResolved: 0,
          avgResolutionTime: 0,
          slaMet: 0,
          slaBreached: 0,
          slaComplianceRate: 0,
          salesOrders: 0,
          enquiriesHandled: 0,
          totalScore: 0,
        };
        performanceMap.set(order.sales_person_id, perf);
      }
      perf.salesOrders++;
    });

    // Add enquiry data
    enquiries.forEach((enquiry) => {
      if (!enquiry.sales_person_id) return;
      
      let perf = performanceMap.get(enquiry.sales_person_id);
      if (perf) {
        perf.enquiriesHandled++;
      }
    });

    // Calculate final metrics
    const results: UserPerformance[] = [];
    performanceMap.forEach((perf) => {
      const totalSlaTickets = perf.slaMet + perf.slaBreached;
      perf.slaComplianceRate = totalSlaTickets > 0 ? (perf.slaMet / totalSlaTickets) * 100 : 100;
      
      // Calculate score: tickets resolved (30%) + SLA compliance (40%) + sales orders (20%) + enquiries (10%)
      perf.totalScore = Math.round(
        (perf.ticketsResolved * 10) +
        (perf.slaComplianceRate * 0.5) +
        (perf.salesOrders * 5) +
        (perf.enquiriesHandled * 2)
      );
      
      results.push(perf);
    });

    return results.sort((a, b) => b.totalScore - a.totalScore);
  }, [tickets, orders, enquiries]);

  const ticketStats = useMemo(() => {
    const resolved = tickets.filter(t => t.status === "resolved" || t.status === "closed").length;
    const open = tickets.filter(t => t.status === "open").length;
    const inProgress = tickets.filter(t => t.status === "in_progress" || t.status === "assigned").length;
    const breached = tickets.filter(t => 
      t.sla_due_at && 
      isPast(new Date(t.sla_due_at)) && 
      t.status !== "resolved" && 
      t.status !== "closed"
    ).length;

    return { resolved, open, inProgress, breached };
  }, [tickets]);

  const departmentData = useMemo(() => {
    const deptCounts: Record<string, number> = {};
    tickets.forEach(t => {
      deptCounts[t.assigned_department] = (deptCounts[t.assigned_department] || 0) + 1;
    });
    
    return Object.entries(deptCounts).map(([name, value]) => ({
      name: name === "supply_chain" ? "Supply Chain" : name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));
  }, [tickets]);

  const resolutionTimeData = useMemo(() => {
    return userPerformance
      .filter(p => p.ticketsResolved > 0 || p.slaMet > 0 || p.slaBreached > 0)
      .map(p => ({
        name: p.userName.split(' ')[0],
        hours: Math.round(p.avgResolutionTime * 10) / 10,
        tickets: p.ticketsResolved,
      }));
  }, [userPerformance]);

  const top5 = userPerformance.slice(0, 5);
  const overallSlaCompliance = useMemo(() => {
    const total = userPerformance.reduce((acc, p) => acc + p.slaMet + p.slaBreached, 0);
    const met = userPerformance.reduce((acc, p) => acc + p.slaMet, 0);
    return total > 0 ? Math.round((met / total) * 100) : 100;
  }, [userPerformance]);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Resolved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ticketStats.resolved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-500" />
              In Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ticketStats.inProgress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              SLA Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallSlaCompliance}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive" />
              SLA Breached
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{ticketStats.breached}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[280px]">
              <div className="space-y-4">
                {top5.map((user, index) => (
                  <div
                    key={user.userId}
                    className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                      {index === 0 ? (
                        <Medal className="w-5 h-5 text-yellow-500" />
                      ) : index === 1 ? (
                        <Medal className="w-5 h-5 text-gray-400" />
                      ) : index === 2 ? (
                        <Medal className="w-5 h-5 text-amber-600" />
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground">
                          {index + 1}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium truncate">{user.userName}</span>
                        <Badge variant="secondary">{user.totalScore} pts</Badge>
                      </div>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        <span>{user.ticketsResolved} tickets</span>
                        <span>•</span>
                        <span>{user.salesOrders} orders</span>
                        <span>•</span>
                        <span className={user.slaComplianceRate >= 90 ? "text-green-600" : "text-yellow-600"}>
                          {Math.round(user.slaComplianceRate)}% SLA
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {top5.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No performance data available</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Tickets by Department */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Tickets by Department
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={departmentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {departmentData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Resolution Time by User */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Average Resolution Time (hours)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resolutionTimeData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis 
                    type="category" 
                    dataKey="name" 
                    angle={-45} 
                    textAnchor="end" 
                    height={60} 
                    interval={0}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis type="number" />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${value} hours`,
                      name === "hours" ? "Avg Time" : name,
                    ]}
                  />
                  <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
