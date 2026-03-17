import { useState } from "react";
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useTrainings, Training, TrainingFormData, TRAINING_TYPES, TRAINING_CATEGORIES, TRAINING_PAYMENT_STATUSES } from "@/hooks/useTrainings";
import { TrainingCard } from "@/components/trainings/TrainingCard";
import { TrainingForm } from "@/components/trainings/TrainingForm";
import { TrainingDialog } from "@/components/trainings/TrainingDialog";
import { EmployeeTrainingPanel } from "@/components/trainings/EmployeeTrainingPanel";
import { Plus, Search, GraduationCap, IndianRupee, Users, Presentation, Loader2, BookOpen } from "lucide-react";

export default function Trainings() {
  const { user, profile, roles } = useAuth();
  const { trainings, loading, createTraining, updateTraining, deleteTraining, removePicture } = useTrainings();
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState<Training | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("client-training");

  const isHrOrAdmin = roles.includes("hr") || roles.includes("admin");

  // Filter trainings
  const filteredTrainings = trainings.filter((training) => {
    const matchesSearch = 
      training.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      training.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      training.model_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      training.training_number?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === "all" || training.type === typeFilter;
    const matchesCategory = categoryFilter === "all" || training.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || training.payment_status === statusFilter;
    
    return matchesSearch && matchesType && matchesCategory && matchesStatus;
  });

  // Calculate stats
  const stats = {
    total: trainings.length,
    demos: trainings.filter(t => t.type === 'demo').length,
    trainings: trainings.filter(t => t.type === 'training').length,
    totalPeople: trainings.reduce((sum, t) => sum + (t.no_of_people || 0), 0),
    totalRevenue: trainings.reduce((sum, t) => sum + (t.amount_quoted || 0), 0),
    pendingPayments: trainings.filter(t => t.payment_status !== 'paid').length,
  };

  const handleCreate = async (data: TrainingFormData, files?: File[]) => {
    if (!user || !profile) return;
    await createTraining(data, user.id, profile.name || "Unknown", files);
    setShowCreateDialog(false);
  };

  const handleUpdate = async (id: string, data: Partial<TrainingFormData>, files?: File[]) => {
    await updateTraining(id, data, files);
  };

  const handleDelete = async (id: string) => {
    await deleteTraining(id);
    setSelectedTraining(null);
  };

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Header />
      
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Training & Demo</h1>
            <p className="text-muted-foreground">Manage training sessions, demos, and employee learning</p>
          </div>
          {activeTab === "client-training" && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Training/Demo
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="client-training" className="gap-2">
              <Presentation className="h-4 w-4" />
              Training / Demo
            </TabsTrigger>
            <TabsTrigger value="employee-training" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Employee Training
            </TabsTrigger>
          </TabsList>

          {/* Client Training Tab */}
          <TabsContent value="client-training" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Total</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{stats.total}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Presentation className="h-4 w-4 text-purple-500" />
                    <span className="text-sm text-muted-foreground">Demos</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{stats.demos}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-indigo-500" />
                    <span className="text-sm text-muted-foreground">Trainings</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{stats.trainings}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">People Trained</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{stats.totalPeople}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">Revenue</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">₹{stats.totalRevenue.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm text-muted-foreground">Pending Pay</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">{stats.pendingPayments}</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by client, city, model, or number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {TRAINING_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {TRAINING_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {TRAINING_PAYMENT_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Content */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTrainings.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No trainings or demos found</h3>
                  <p className="text-muted-foreground mb-4">
                    {searchQuery || typeFilter !== "all" || categoryFilter !== "all" || statusFilter !== "all"
                      ? "Try adjusting your filters"
                      : "Create your first training or demo session"}
                  </p>
                  {!searchQuery && typeFilter === "all" && categoryFilter === "all" && statusFilter === "all" && (
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      New Training/Demo
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTrainings.map((training) => (
                  <TrainingCard
                    key={training.id}
                    training={training}
                    onClick={() => setSelectedTraining(training)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Employee Training Tab */}
          <TabsContent value="employee-training">
            <EmployeeTrainingPanel />
          </TabsContent>
        </Tabs>
      </main>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Create New Training/Demo</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-100px)] pr-4">
            <TrainingForm
              onSubmit={handleCreate}
              onCancel={() => setShowCreateDialog(false)}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <TrainingDialog
        training={selectedTraining}
        open={!!selectedTraining}
        onOpenChange={(open) => !open && setSelectedTraining(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onRemovePicture={removePicture}
      />

      <MobileBottomNav />
    </div>
  );
}
