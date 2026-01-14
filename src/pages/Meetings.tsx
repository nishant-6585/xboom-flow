import { useState, useEffect } from 'react';
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMeetings, Meeting, MeetingFormData, MEETING_TYPES, MEETING_STATUSES, MeetingType, MeetingStatus } from "@/hooks/useMeetings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { 
  Calendar as CalendarIcon, Plus, Search, Filter, Clock, 
  Users, Video, Phone, Building2, User, Loader2, Edit, 
  Trash2, CheckCircle2, XCircle, Target, TrendingUp, Link as LinkIcon, ExternalLink
} from "lucide-react";
import { format, isToday, isTomorrow, isPast, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface LeadOption {
  id: string;
  customer_name: string;
  customer_company: string;
  product_name: string;
  lead_type: 'enquiry' | 'pipeline';
}

const getStatusColor = (status: MeetingStatus) => {
  switch (status) {
    case 'requested': return 'bg-blue-500/20 text-blue-700 dark:text-blue-400';
    case 'scheduled': return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400';
    case 'done': return 'bg-green-500/20 text-green-700 dark:text-green-400';
    case 'cancelled': return 'bg-red-500/20 text-red-700 dark:text-red-400';
    default: return 'bg-muted text-muted-foreground';
  }
};

const getMeetingTypeColor = (type: MeetingType) => {
  switch (type) {
    case 'discovery': return 'bg-purple-500/20 text-purple-700 dark:text-purple-400';
    case 'pricing': return 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-400';
    case 'negotiation': return 'bg-orange-500/20 text-orange-700 dark:text-orange-400';
    case 'closing': return 'bg-green-500/20 text-green-700 dark:text-green-400';
    case 'internal': return 'bg-gray-500/20 text-gray-700 dark:text-gray-400';
    default: return 'bg-muted text-muted-foreground';
  }
};

function MeetingCard({ meeting, onEdit, onComplete, onCancel }: { 
  meeting: Meeting; 
  onEdit: (m: Meeting) => void;
  onComplete: (m: Meeting) => void;
  onCancel: (m: Meeting) => void;
}) {
  const meetingDate = new Date(meeting.meeting_date);
  const isUpcoming = !isPast(meetingDate);
  const isMeetingToday = isToday(meetingDate);
  const isMeetingTomorrow = isTomorrow(meetingDate);

  return (
    <Card className={cn(
      "hover:shadow-md transition-shadow",
      isMeetingToday && "border-primary/50 bg-primary/5"
    )}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={getStatusColor(meeting.status)}>
              {MEETING_STATUSES.find(s => s.value === meeting.status)?.label}
            </Badge>
            <Badge variant="outline" className={getMeetingTypeColor(meeting.meeting_type)}>
              {MEETING_TYPES.find(t => t.value === meeting.meeting_type)?.label}
            </Badge>
          </div>
          {isMeetingToday && (
            <Badge variant="destructive" className="shrink-0">Today</Badge>
          )}
          {isMeetingTomorrow && (
            <Badge variant="secondary" className="shrink-0">Tomorrow</Badge>
          )}
        </div>

        {/* Date & Time */}
        <div className="flex items-center gap-2 text-sm">
          <CalendarIcon className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">{format(meetingDate, 'EEE, dd MMM yyyy')}</span>
          <Clock className="w-4 h-4 text-muted-foreground ml-2" />
          <span>{format(meetingDate, 'h:mm a')}</span>
        </div>

        {/* Lead Info */}
        {meeting.lead_customer_name && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium truncate">{meeting.lead_customer_name}</span>
            </div>
            {meeting.lead_customer_company && (
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground truncate">{meeting.lead_customer_company}</span>
              </div>
            )}
          </div>
        )}

        {/* Meeting Link */}
        {meeting.meeting_link && (
          <div className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-muted-foreground" />
            <a 
              href={meeting.meeting_link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1 truncate"
            >
              Join Meeting <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Agenda */}
        {meeting.agenda && (
          <p className="text-sm text-muted-foreground line-clamp-2">{meeting.agenda}</p>
        )}

        {/* Owner */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="w-3 h-3" />
          <span>Owner: {meeting.owner_name}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onEdit(meeting)}>
            <Edit className="w-4 h-4 mr-1" />
            Edit
          </Button>
          {meeting.status === 'scheduled' && isUpcoming && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onComplete(meeting)}>
                <CheckCircle2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onCancel(meeting)}>
                <XCircle className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const Meetings = () => {
  const { meetings, loading, createMeeting, updateMeeting, meetingsThisMonth, closedLeadMeetings, todaysMeetings } = useMeetings();
  const { role } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<MeetingType | 'all'>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  
  // Lead options for dropdown
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  
  // Form state
  const [formDate, setFormDate] = useState<Date | undefined>(new Date());
  const [formTime, setFormTime] = useState('10:00');
  const [formType, setFormType] = useState<MeetingType>('discovery');
  const [formAgenda, setFormAgenda] = useState('');
  const [formBackground, setFormBackground] = useState('');
  const [formLeadId, setFormLeadId] = useState<string>('');
  const [formLeadType, setFormLeadType] = useState<'enquiry' | 'pipeline' | ''>('');
  const [formMeetingLink, setFormMeetingLink] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch leads for dropdown
  useEffect(() => {
    const fetchLeads = async () => {
      setLeadsLoading(true);
      try {
        // Fetch enquiries
        const { data: enquiries } = await supabase
          .from('enquiries')
          .select('id, customer_name, customer_company, product_name')
          .not('status', 'in', '(order_won,order_lost)')
          .order('customer_name');
        
        // Fetch pipeline orders
        const { data: pipeline } = await supabase
          .from('pipeline_orders')
          .select('id, customer_name, customer_company, product_name')
          .not('status', 'in', '(won,lost)')
          .order('customer_name');
        
        const leads: LeadOption[] = [
          ...(enquiries || []).map(e => ({ ...e, lead_type: 'enquiry' as const })),
          ...(pipeline || []).map(p => ({ ...p, lead_type: 'pipeline' as const })),
        ];
        
        setLeadOptions(leads);
      } catch (error) {
        console.error('Error fetching leads:', error);
      } finally {
        setLeadsLoading(false);
      }
    };
    
    if (createDialogOpen || editMeeting) {
      fetchLeads();
    }
  }, [createDialogOpen, editMeeting]);

  // Filter meetings
  const filteredMeetings = meetings.filter(m => {
    const matchesSearch = 
      (m.lead_customer_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (m.lead_customer_company?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (m.agenda?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    const matchesType = typeFilter === 'all' || m.meeting_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  // Stats
  const upcomingCount = meetings.filter(m => m.status === 'scheduled' && !isPast(new Date(m.meeting_date))).length;
  const doneThisMonth = meetings.filter(m => {
    const meetingDate = new Date(m.meeting_date);
    return m.status === 'done' && isWithinInterval(meetingDate, {
      start: startOfMonth(new Date()),
      end: endOfMonth(new Date())
    });
  }).length;

  const resetForm = () => {
    setFormDate(new Date());
    setFormTime('10:00');
    setFormType('discovery');
    setFormAgenda('');
    setFormBackground('');
    setFormLeadId('');
    setFormLeadType('');
    setFormMeetingLink('');
  };

  const handleCreate = async () => {
    if (!formDate) {
      toast.error('Please select a date');
      return;
    }

    setSaving(true);
    try {
      const [hours, minutes] = formTime.split(':').map(Number);
      const meetingDateTime = new Date(formDate);
      meetingDateTime.setHours(hours, minutes, 0, 0);

      const success = await createMeeting({
        meeting_date: meetingDateTime.toISOString(),
        meeting_type: formType,
        agenda: formAgenda || undefined,
        background: formBackground || undefined,
        status: 'scheduled',
        enquiry_id: formLeadType === 'enquiry' ? formLeadId : undefined,
        pipeline_id: formLeadType === 'pipeline' ? formLeadId : undefined,
        meeting_link: formMeetingLink || undefined,
      });

      if (success) {
        setCreateDialogOpen(false);
        resetForm();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editMeeting || !formDate) return;

    setSaving(true);
    try {
      const [hours, minutes] = formTime.split(':').map(Number);
      const meetingDateTime = new Date(formDate);
      meetingDateTime.setHours(hours, minutes, 0, 0);

      const success = await updateMeeting(editMeeting.id, {
        meeting_date: meetingDateTime.toISOString(),
        meeting_type: formType,
        agenda: formAgenda || null,
        background: formBackground || null,
        enquiry_id: formLeadType === 'enquiry' ? formLeadId : null,
        pipeline_id: formLeadType === 'pipeline' ? formLeadId : null,
        meeting_link: formMeetingLink || null,
      });

      if (success) {
        setEditMeeting(null);
        resetForm();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (meeting: Meeting) => {
    await updateMeeting(meeting.id, { status: 'done' });
  };

  const handleCancel = async (meeting: Meeting) => {
    await updateMeeting(meeting.id, { status: 'cancelled' });
  };

  const openEditDialog = (meeting: Meeting) => {
    setEditMeeting(meeting);
    const meetingDate = new Date(meeting.meeting_date);
    setFormDate(meetingDate);
    setFormTime(format(meetingDate, 'HH:mm'));
    setFormType(meeting.meeting_type);
    setFormAgenda(meeting.agenda || '');
    setFormBackground(meeting.background || '');
    setFormMeetingLink(meeting.meeting_link || '');
    // Set lead info
    if (meeting.enquiry_id) {
      setFormLeadId(meeting.enquiry_id);
      setFormLeadType('enquiry');
    } else if (meeting.pipeline_id) {
      setFormLeadId(meeting.pipeline_id);
      setFormLeadType('pipeline');
    } else {
      setFormLeadId('');
      setFormLeadType('');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-20 sm:pb-0">
      <Header />
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Meetings</h1>
            <p className="text-muted-foreground">
              Schedule and track meetings with leads and customers
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Schedule Meeting
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <CalendarIcon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{todaysMeetings.length}</p>
                  <p className="text-xs text-muted-foreground">Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{upcomingCount}</p>
                  <p className="text-xs text-muted-foreground">Upcoming</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{meetingsThisMonth}</p>
                  <p className="text-xs text-muted-foreground">This Month</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <Target className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{closedLeadMeetings.length}</p>
                  <p className="text-xs text-muted-foreground">Closed Leads</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search meetings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as MeetingStatus | 'all')}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {MEETING_STATUSES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as MeetingType | 'all')}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {MEETING_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Meetings List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredMeetings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CalendarIcon className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No meetings found</h3>
              <p className="text-muted-foreground text-center mb-4">
                {meetings.length === 0 
                  ? "Schedule your first meeting to get started" 
                  : "No meetings match your filters"}
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Schedule Meeting
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMeetings.map((meeting) => (
              <MeetingCard 
                key={meeting.id} 
                meeting={meeting}
                onEdit={openEditDialog}
                onComplete={handleComplete}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}
      </main>

      {/* Create/Edit Dialog */}
      <Dialog 
        open={createDialogOpen || !!editMeeting} 
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false);
            setEditMeeting(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editMeeting ? 'Edit Meeting' : 'Schedule Meeting'}</DialogTitle>
            <DialogDescription>
              {editMeeting ? 'Update the meeting details' : 'Create a new meeting'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-1">
              {/* Lead Selection */}
              <div className="space-y-2">
                <Label>Link to Lead (Optional)</Label>
                <Select 
                  value={formLeadId ? `${formLeadType}:${formLeadId}` : 'none'}
                  onValueChange={(v) => {
                    if (v === 'none') {
                      setFormLeadId('');
                      setFormLeadType('');
                    } else {
                      const [type, id] = v.split(':');
                      setFormLeadType(type as 'enquiry' | 'pipeline');
                      setFormLeadId(id);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={leadsLoading ? "Loading leads..." : "Select a lead"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Lead</SelectItem>
                    {leadOptions.map((lead) => (
                      <SelectItem 
                        key={`${lead.lead_type}:${lead.id}`} 
                        value={`${lead.lead_type}:${lead.id}`}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{lead.customer_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {lead.customer_company || lead.product_name} ({lead.lead_type === 'enquiry' ? 'Enquiry' : 'Pipeline'})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formDate ? format(formDate, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formDate}
                      onSelect={setFormDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Time */}
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                />
              </div>

              {/* Type */}
              <div className="space-y-2">
                <Label>Meeting Type</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as MeetingType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Meeting Link */}
              <div className="space-y-2">
                <Label>Meeting Link (Optional)</Label>
                <div className="flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-muted-foreground" />
                  <Input
                    type="url"
                    placeholder="https://meet.google.com/... or zoom link"
                    value={formMeetingLink}
                    onChange={(e) => setFormMeetingLink(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Agenda */}
              <div className="space-y-2">
                <Label>Agenda</Label>
                <Textarea
                  placeholder="What will be discussed?"
                  value={formAgenda}
                  onChange={(e) => setFormAgenda(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Background */}
              <div className="space-y-2">
                <Label>Background / Context</Label>
                <Textarea
                  placeholder="Any background information..."
                  value={formBackground}
                  onChange={(e) => setFormBackground(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                setEditMeeting(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={editMeeting ? handleUpdate : handleCreate}
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editMeeting ? 'Save Changes' : 'Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav />
    </div>
  );
};

export default Meetings;
