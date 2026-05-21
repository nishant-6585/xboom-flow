import { useState, useMemo } from "react";
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TicketCard } from "@/components/tickets/TicketCard";
import { TicketTable } from "@/components/tickets/TicketTable";
import { TicketFormDialog } from "@/components/tickets/TicketFormDialog";
import { TicketDetailDialog } from "@/components/tickets/TicketDetailDialog";
import { TicketFilters, TicketFiltersState } from "@/components/tickets/TicketFilters";
import { TicketPerformanceDashboard } from "@/components/tickets/TicketPerformanceDashboard";
import { useTickets, Ticket } from "@/hooks/useTickets";
import { useAuth } from "@/hooks/useAuth";
import { isPast } from "date-fns";
import {
  Plus,
  Ticket as TicketIcon,
  Clock,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  TableIcon,
  BarChart3,
} from "lucide-react";
import { TableSkeleton, EmptyState } from "@/components/data-states";

type ViewMode = "cards" | "table";

export default function Tickets() {
  const { role, user } = useAuth();
  const { tickets, isLoading } = useTickets();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [filters, setFilters] = useState<TicketFiltersState>({
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

  const isOverdue = (ticket: Ticket) => {
    return ticket.sla_breached === true;
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const matchesSearch =
        ticket.subject.toLowerCase().includes(filters.search.toLowerCase()) ||
        ticket.ticket_number?.toLowerCase().includes(filters.search.toLowerCase()) ||
        ticket.raised_by_name.toLowerCase().includes(filters.search.toLowerCase());

      const matchesDepartment =
        filters.department === "all" || ticket.assigned_department === filters.department;

      const matchesStatus = filters.status === "all" || ticket.status === filters.status;

      const matchesPriority = filters.priority === "all" || ticket.priority === filters.priority;

      const matchesAssignedTo = !filters.assignedTo || ticket.assigned_to === filters.assignedTo;

      const matchesRaisedBy = !filters.raisedBy || ticket.raised_by === filters.raisedBy;

      const matchesDateFrom =
        !filters.dateFrom ||
        new Date(ticket.created_at) >= new Date(filters.dateFrom);

      const matchesDateTo =
        !filters.dateTo ||
        new Date(ticket.created_at) <= new Date(filters.dateTo);

      const matchesSlaBreached = !filters.slaBreached || isOverdue(ticket);

      return (
        matchesSearch &&
        matchesDepartment &&
        matchesStatus &&
        matchesPriority &&
        matchesAssignedTo &&
        matchesRaisedBy &&
        matchesDateFrom &&
        matchesDateTo &&
        matchesSlaBreached
      );
    });
  }, [tickets, filters]);

  // For "My Tickets" and "Assigned to Me", hide removed tickets (soft delete)
  const myTickets = filteredTickets.filter((t) => t.raised_by === user?.id && t.status !== "removed");
  const assignedToMe = filteredTickets.filter((t) => t.assigned_to === user?.id && t.status !== "removed");
  const departmentTickets = filteredTickets.filter(
    (t) => t.assigned_department === role && t.raised_by !== user?.id && t.status !== "removed"
  );

  // Stats
  const openCount = tickets.filter((t) => t.status === "open").length;
  const inProgressCount = tickets.filter(
    (t) => t.status === "in_progress" || t.status === "assigned"
  ).length;
  const resolvedCount = tickets.filter(
    (t) => t.status === "resolved" || t.status === "closed"
  ).length;
  const overdueCount = tickets.filter((t) => isOverdue(t)).length;

  const renderTickets = (ticketList: Ticket[], emptyMessage: string) => {
    if (ticketList.length === 0) {
      return (
        <EmptyState
          icon={TicketIcon}
          title={emptyMessage}
          description="Raise a ticket to ask another team for help."
          action={
            <Button onClick={() => setShowCreateDialog(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Create ticket
            </Button>
          }
        />
      );
    }

    if (viewMode === "table") {
      return <TicketTable tickets={ticketList} onView={setSelectedTicket} />;
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ticketList.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            onView={setSelectedTicket}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-20 sm:pb-6">
      <Header />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TicketIcon className="w-6 h-6" />
              Support Tickets
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Raise and manage inter-department tickets
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === "cards" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("cards")}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
              >
                <TableIcon className="w-4 h-4" />
              </Button>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Raise Ticket
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${
              filters.status === "open" ? "bg-primary/10 border-primary border-2" : ""
            }`}
            onClick={() => setFilters({ ...filters, status: filters.status === "open" ? "all" : "open", slaBreached: false })}
          >
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium ${
                filters.status === "open" ? "text-primary" : "text-muted-foreground"
              }`}>
                Open
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TicketIcon className={`w-5 h-5 ${filters.status === "open" ? "text-primary" : "text-primary"}`} />
                <span className={`text-2xl font-bold ${filters.status === "open" ? "text-primary" : ""}`}>{openCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${
              filters.status === "in_progress" ? "bg-primary/10 border-primary border-2" : ""
            }`}
            onClick={() => setFilters({ ...filters, status: filters.status === "in_progress" ? "all" : "in_progress", slaBreached: false })}
          >
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium ${
                filters.status === "in_progress" ? "text-primary" : "text-muted-foreground"
              }`}>
                In Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className={`w-5 h-5 ${filters.status === "in_progress" ? "text-primary" : "text-yellow-500"}`} />
                <span className={`text-2xl font-bold ${filters.status === "in_progress" ? "text-primary" : ""}`}>{inProgressCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${
              filters.status === "resolved" ? "bg-primary/10 border-primary border-2" : ""
            }`}
            onClick={() => setFilters({ ...filters, status: filters.status === "resolved" ? "all" : "resolved", slaBreached: false })}
          >
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium ${
                filters.status === "resolved" ? "text-primary" : "text-muted-foreground"
              }`}>
                Resolved
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-5 h-5 ${filters.status === "resolved" ? "text-primary" : "text-green-500"}`} />
                <span className={`text-2xl font-bold ${filters.status === "resolved" ? "text-primary" : ""}`}>{resolvedCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${
              filters.slaBreached ? "bg-primary/10 border-primary border-2" : overdueCount > 0 ? "border-destructive" : ""
            }`}
            onClick={() => setFilters({ ...filters, slaBreached: !filters.slaBreached, status: "all" })}
          >
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium ${
                filters.slaBreached ? "text-primary" : "text-muted-foreground"
              }`}>
                SLA Breached
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <AlertCircle className={`w-5 h-5 ${filters.slaBreached ? "text-primary" : "text-destructive"}`} />
                <span className={`text-2xl font-bold ${filters.slaBreached ? "text-primary" : overdueCount > 0 ? "text-destructive" : ""}`}>
                  {overdueCount}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <TicketFilters filters={filters} onFiltersChange={setFilters} />

        {/* Tabs */}
        <Tabs defaultValue="my-tickets" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="my-tickets" className="gap-2">
              My Tickets
              {myTickets.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5">
                  {myTickets.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="assigned" className="gap-2">
              Assigned to Me
              {assignedToMe.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5">
                  {assignedToMe.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="department" className="gap-2">
              {role === "supply_chain" ? "Supply Chain" : role?.charAt(0).toUpperCase() + role?.slice(1)} Tickets
              {departmentTickets.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5">
                  {departmentTickets.length}
                </Badge>
              )}
            </TabsTrigger>
            {(role === "admin" || role === "hr") && (
              <>
                <TabsTrigger value="all" className="gap-2">
                  All Tickets
                  <Badge variant="secondary" className="h-5 px-1.5">
                    {filteredTickets.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="dashboard" className="gap-2">
                  <BarChart3 className="w-4 h-4 mr-1" />
                  Performance
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {isLoading ? (
            <div className="rounded-lg border bg-card">
              <TableSkeleton rows={6} columns={6} />
            </div>
          ) : (
            <>
              <TabsContent value="my-tickets">
                {renderTickets(myTickets, "You haven't raised any tickets yet")}
              </TabsContent>

              <TabsContent value="assigned">
                {renderTickets(assignedToMe, "No tickets assigned to you")}
              </TabsContent>

              <TabsContent value="department">
                {renderTickets(departmentTickets, "No tickets for your department")}
              </TabsContent>

              {(role === "admin" || role === "hr") && (
                <>
                  <TabsContent value="all">
                    {renderTickets(filteredTickets, "No tickets found")}
                  </TabsContent>
                  <TabsContent value="dashboard">
                    <TicketPerformanceDashboard tickets={tickets} />
                  </TabsContent>
                </>
              )}
            </>
          )}
        </Tabs>
      </main>

      <TicketFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      <TicketDetailDialog
        key={selectedTicket?.id ?? "none"}
        ticket={selectedTicket}
        open={!!selectedTicket}
        onOpenChange={(open) => !open && setSelectedTicket(null)}
      />

      <MobileBottomNav />
    </div>
  );
}
