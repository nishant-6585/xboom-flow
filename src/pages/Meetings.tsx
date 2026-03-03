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
import { useMeetings, Meeting, MeetingFormData, MEETING_TYPES, MEETING_STATUSES, MEETING_OUTCOMES, MeetingType, MeetingStatus, MeetingOutcome } from "@/hooks/useMeetings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { TeamCalendar } from "@/components/calendar/TeamCalendar";
import type { CalendarMeeting } from "@/components/calendar/CalendarMonthView";
import { 
  Calendar as CalendarIcon, Plus, Search, Filter, Clock, 
  Users, Video, Phone, Building2, User, Loader2, Edit, 
  Trash2, CheckCircle2, XCircle, Target, TrendingUp, Link as LinkIcon, ExternalLink,
  LayoutGrid, List
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

interface UserOption {
  user_id: string;
  name: string;
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
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<MeetingType | 'all'>('all');
  const [hostFilter, setHostFilter] = useState<string>('all');
  const [participantFilter, setParticipantFilter] = useState<string>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  
  // Lead and user options for dropdown
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  
  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState<Date | undefined>(new Date());
  const [formTime, setFormTime] = useState('10:00');
  const [formEndTime, setFormEndTime] = useState('11:00');
  const [formType, setFormType] = useState<MeetingType>('discovery');
  const [formAgenda, setFormAgenda] = useState('');
  const [formBackground, setFormBackground] = useState('');
  const [formLeadId, setFormLeadId] = useState<string>('');
  const [formLeadType, setFormLeadType] = useState<'enquiry' | 'pipeline' | ''>('');
  const [formMeetingLink, setFormMeetingLink] = useState('');
  const [formHostId, setFormHostId] = useState<string>('');
  const [formParticipants, setFormParticipants] = useState<string[]>([]);
  const [formMeetingOutcome, setFormMeetingOutcome] = useState<MeetingOutcome | ''>('');
  const [formVisibility, setFormVisibility] = useState<string>('team');
  const [saving, setSaving] = useState(false);

  // Fetch leads and users for dropdown
  useEffect(() => {
    const fetchData = async () => {
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

        // Fetch all approved users for host/participants
        const { data: users } = await supabase
          .from('profiles')
          .select('user_id, name')
          .eq('is_approved', true)
          .order('name');
        
        setUserOptions((users as UserOption[]) || []);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLeadsLoading(false);
      }
    };
    
    if (createDialogOpen || editMeeting) {
      fetchData();
    }
  }, [createDialogOpen, editMeeting]);

  // Filter meetings
  const filteredMeetings = meetings.filter(m => {
    const matchesSearch = 
      (m.lead_customer_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (m.lead_customer_company?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (m.agenda?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (m.host_name?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    const matchesType = typeFilter === 'all' || m.meeting_type === typeFilter;
    const matchesHost = hostFilter === 'all' || m.host_id === hostFilter;
    const matchesParticipant = participantFilter === 'all' || 
      (m.participants && m.participants.includes(participantFilter));
    return matchesSearch && matchesStatus && matchesType && matchesHost && matchesParticipant;
  });

  // Get unique hosts and participants for filter
  const uniqueHosts = [...new Map(
    meetings
      .filter(m => m.host_id && m.host_name)
      .map(m => [m.host_id, { id: m.host_id!, name: m.host_name! }])
  ).values()];

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
    setFormTitle('');
    setFormDescription('');
    setFormDate(new Date());
    setFormTime('10:00');
    setFormEndTime('11:00');
    setFormType('discovery');
    setFormAgenda('');
    setFormBackground('');
    setFormLeadId('');
    setFormLeadType('');
    setFormMeetingLink('');
    setFormHostId('');
    setFormParticipants([]);
    setFormMeetingOutcome('');
    setFormVisibility('team');
  };

  const handleCreate = async () => {
    if (!formDate) {
      toast.error('Please select a date');
      return;
    }
    if (!formTitle.trim()) {
      toast.error('Please enter a meeting title');
      return;
    }

    const selectedHost = userOptions.find(u => u.user_id === formHostId);

    setSaving(true);
    try {
      const [hours, minutes] = formTime.split(':').map(Number);
      const meetingDateTime = new Date(formDate);
      meetingDateTime.setHours(hours, minutes, 0, 0);

      const [endH, endM] = formEndTime.split(':').map(Number);
      const endDateTime = new Date(formDate);
      endDateTime.setHours(endH, endM, 0, 0);

      if (endDateTime <= meetingDateTime) {
        toast.error('End time must be after start time');
        setSaving(false);
        return;
      }

      const success = await createMeeting({
        title: formTitle,
        description: formDescription || undefined,
        meeting_date: meetingDateTime.toISOString(),
        end_datetime: endDateTime.toISOString(),
        meeting_type: formType,
        agenda: formAgenda || undefined,
        background: formBackground || undefined,
        status: 'scheduled',
        enquiry_id: formLeadType === 'enquiry' ? formLeadId : undefined,
        pipeline_id: formLeadType === 'pipeline' ? formLeadId : undefined,
        meeting_link: formMeetingLink || undefined,
        host_id: formHostId || undefined,
        host_name: selectedHost?.name || undefined,
        participants: formParticipants.length > 0 ? formParticipants : undefined,
        meeting_outcome: formMeetingOutcome || undefined,
        visibility: formVisibility,
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

    const selectedHost = userOptions.find(u => u.user_id === formHostId);

    setSaving(true);
    try {
      const [hours, minutes] = formTime.split(':').map(Number);
      const meetingDateTime = new Date(formDate);
      meetingDateTime.setHours(hours, minutes, 0, 0);

      const [endH, endM] = formEndTime.split(':').map(Number);
      const endDateTime = new Date(formDate);
      endDateTime.setHours(endH, endM, 0, 0);

      const success = await updateMeeting(editMeeting.id, {
        title: formTitle || null,
        description: formDescription || null,
        meeting_date: meetingDateTime.toISOString(),
        end_datetime: endDateTime.toISOString(),
        meeting_type: formType,
        agenda: formAgenda || null,
        background: formBackground || null,
        enquiry_id: formLeadType === 'enquiry' ? formLeadId : null,
        pipeline_id: formLeadType === 'pipeline' ? formLeadId : null,
        meeting_link: formMeetingLink || null,
        host_id: formHostId || null,
        host_name: selectedHost?.name || null,
        participants: formParticipants,
        meeting_outcome: formMeetingOutcome || null,
        visibility: formVisibility,
      } as any);

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
    setFormTitle((meeting as any).title || '');
    setFormDescription((meeting as any).description || '');
    setFormDate(meetingDate);
    setFormTime(format(meetingDate, 'HH:mm'));
    const endDt = (meeting as any).end_datetime ? new Date((meeting as any).end_datetime) : null;
    setFormEndTime(endDt ? format(endDt, 'HH:mm') : format(new Date(meetingDate.getTime() + 3600000), 'HH:mm'));
    setFormType(meeting.meeting_type);
    setFormAgenda(meeting.agenda || '');
    setFormBackground(meeting.background || '');
    setFormMeetingLink(meeting.meeting_link || '');
    setFormHostId(meeting.host_id || '');
    setFormParticipants(meeting.participants || []);
    setFormMeetingOutcome(meeting.meeting_outcome || '');
    setFormVisibility((meeting as any).visibility || 'team');
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

        {/* View Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              className="text-xs h-7 px-3"
              onClick={() => setViewMode('calendar')}
            >
              <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />
              Calendar
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="text-xs h-7 px-3"
              onClick={() => setViewMode('list')}
            >
              <List className="w-3.5 h-3.5 mr-1.5" />
              List
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <CalendarIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{todaysMeetings.length}</p>
                  <p className="text-xs text-muted-foreground">Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Clock className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{upcomingCount}</p>
                  <p className="text-xs text-muted-foreground">Upcoming</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary">
                  <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{meetingsThisMonth}</p>
                  <p className="text-xs text-muted-foreground">This Month</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary">
                  <Target className="h-5 w-5 text-muted-foreground" />
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
            <SelectTrigger className="w-full sm:w-[140px]">
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
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {MEETING_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={hostFilter} onValueChange={setHostFilter}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <User className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Host" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Hosts</SelectItem>
              {uniqueHosts.map(h => (
                <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Content: Calendar or List */}
        {viewMode === 'calendar' ? (
          loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <TeamCalendar
              meetings={filteredMeetings.map(m => ({
                id: m.id,
                title: (m as any).title || m.agenda?.slice(0, 60) || `${m.meeting_type} Meeting`,
                meeting_date: m.meeting_date,
                end_datetime: (m as any).end_datetime || null,
                meeting_type: m.meeting_type,
                status: m.status,
                meeting_link: m.meeting_link,
                host_name: m.host_name,
                owner_name: m.owner_name,
                visibility: (m as any).visibility || 'team',
                agenda: m.agenda,
                description: (m as any).description || null,
                participants: m.participants || [],
                participant_names: m.participant_names,
              }))}
            />
          )
        ) : (
          loading ? (
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
          )
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
              {/* Title */}
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  placeholder="Meeting title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>

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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                  />
                </div>
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

              {/* Host */}
              <div className="space-y-2">
                <Label>Host</Label>
                <Select value={formHostId || 'none'} onValueChange={(v) => setFormHostId(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select host" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Host</SelectItem>
                    {userOptions.map(u => (
                      <SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Participants */}
              <div className="space-y-2">
                <Label>Participants</Label>
                <div className="space-y-2">
                  {userOptions.map(u => (
                    <label key={u.user_id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={formParticipants.includes(u.user_id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormParticipants([...formParticipants, u.user_id]);
                          } else {
                            setFormParticipants(formParticipants.filter(p => p !== u.user_id));
                          }
                        }}
                        className="rounded"
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              </div>

              {/* Meeting Outcome (for done meetings) */}
              <div className="space-y-2">
                <Label>Meeting Outcome</Label>
                <Select value={formMeetingOutcome || 'none'} onValueChange={(v) => setFormMeetingOutcome(v === 'none' ? '' : v as MeetingOutcome)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Set outcome" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not Set</SelectItem>
                    {MEETING_OUTCOMES.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
                    placeholder="https://meet.google.com/..."
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
                  rows={2}
                />
              </div>

              {/* Background */}
              <div className="space-y-2">
                <Label>Background / Context</Label>
                <Textarea
                  placeholder="Any background information..."
                  value={formBackground}
                  onChange={(e) => setFormBackground(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Detailed description..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Visibility */}
              <div className="space-y-2">
                <Label>Visibility</Label>
                <Select value={formVisibility} onValueChange={setFormVisibility}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team">Team (All employees)</SelectItem>
                    <SelectItem value="department">Department</SelectItem>
                    <SelectItem value="private">Private (Host + Participants)</SelectItem>
                  </SelectContent>
                </Select>
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
