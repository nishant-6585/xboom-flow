import { useState } from "react";
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TicketCard } from "@/components/tickets/TicketCard";
import { TicketFormDialog } from "@/components/tickets/TicketFormDialog";
import { TicketDetailDialog } from "@/components/tickets/TicketDetailDialog";
import { useTickets, Ticket } from "@/hooks/useTickets";
import { useAuth } from "@/hooks/useAuth";
import {
  Plus,
  Search,
  Ticket as TicketIcon,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Filter,
} from "lucide-react";

export default function Tickets() {
  const { role, user } = useAuth();
  const { tickets, isLoading } = useTickets();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch =
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.ticket_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.raised_by_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDepartment =
      departmentFilter === "all" || ticket.assigned_department === departmentFilter;

    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;

    return matchesSearch && matchesDepartment && matchesStatus;
  });

  const myTickets = filteredTickets.filter((t) => t.raised_by === user?.id);
  const assignedToMe = filteredTickets.filter((t) => t.assigned_to === user?.id);
  const departmentTickets = filteredTickets.filter(
    (t) => t.assigned_department === role && t.raised_by !== user?.id
  );

  // Stats
  const openCount = tickets.filter((t) => t.status === "open").length;
  const inProgressCount = tickets.filter(
    (t) => t.status === "in_progress" || t.status === "assigned"
  ).length;
  const resolvedCount = tickets.filter(
    (t) => t.status === "resolved" || t.status === "closed"
  ).length;
  const overdueCount = tickets.filter(
    (t) =>
      t.sla_due_at &&
      new Date(t.sla_due_at) < new Date() &&
      t.status !== "resolved" &&
      t.status !== "closed"
  ).length;

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
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Raise Ticket
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Open
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TicketIcon className="w-5 h-5 text-blue-500" />
                <span className="text-2xl font-bold">{openCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                In Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-500" />
                <span className="text-2xl font-bold">{inProgressCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Resolved
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="text-2xl font-bold">{resolvedCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                SLA Breached
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-2xl font-bold">{overdueCount}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-[140px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Depts</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="supply_chain">Supply Chain</SelectItem>
                <SelectItem value="finance">Finance</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

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
            {role === "admin" && (
              <TabsTrigger value="all" className="gap-2">
                All Tickets
                <Badge variant="secondary" className="h-5 px-1.5">
                  {filteredTickets.length}
                </Badge>
              </TabsTrigger>
            )}
          </TabsList>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <TabsContent value="my-tickets">
                {myTickets.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <TicketIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>You haven't raised any tickets yet</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => setShowCreateDialog(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Raise a Ticket
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {myTickets.map((ticket) => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        onView={setSelectedTicket}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="assigned">
                {assignedToMe.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <TicketIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No tickets assigned to you</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {assignedToMe.map((ticket) => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        onView={setSelectedTicket}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="department">
                {departmentTickets.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <TicketIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No tickets for your department</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {departmentTickets.map((ticket) => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        onView={setSelectedTicket}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              {role === "admin" && (
                <TabsContent value="all">
                  {filteredTickets.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <TicketIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No tickets found</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {filteredTickets.map((ticket) => (
                        <TicketCard
                          key={ticket.id}
                          ticket={ticket}
                          onView={setSelectedTicket}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
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
        ticket={selectedTicket}
        open={!!selectedTicket}
        onOpenChange={(open) => !open && setSelectedTicket(null)}
      />

      <MobileBottomNav />
    </div>
  );
}
