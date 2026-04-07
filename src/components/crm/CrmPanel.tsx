import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProspects, Prospect } from '@/hooks/useProspects';
import { useFollowups } from '@/hooks/useFollowups';
import { useAuth } from '@/hooks/useAuth';
import { CrmContactDetail } from './CrmContactDetail';
import { format, isBefore, isToday } from 'date-fns';
import {
  Search, Users, Phone, Mail, Building2, MapPin, Package,
  ChevronRight, Calendar, AlertTriangle, CheckCircle2, Clock,
  Filter, TrendingUp, Target, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  contacted: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
  qualified: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  negotiation: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-400',
  converted: 'bg-green-500/20 text-green-700 dark:text-green-400',
  lost: 'bg-red-500/20 text-red-700 dark:text-red-400',
};

export function CrmPanel() {
  const { prospects, loading } = useProspects();
  const { followups } = useFollowups();
  const { role } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const now = new Date();

  // Compute follow-up stats per prospect
  const prospectFollowupStats = useMemo(() => {
    const stats: Record<string, { pending: number; overdue: number; completed: number; nextDate: string | null }> = {};
    followups.forEach(f => {
      if (f.source_type !== 'prospect') return;
      if (!stats[f.source_id]) stats[f.source_id] = { pending: 0, overdue: 0, completed: 0, nextDate: null };
      const s = stats[f.source_id];
      if (f.status === 'completed') s.completed++;
      else if (f.status === 'pending') {
        if (isBefore(new Date(f.followup_at), now)) s.overdue++;
        else s.pending++;
        if (!s.nextDate || new Date(f.followup_at) < new Date(s.nextDate)) s.nextDate = f.followup_at;
      }
    });
    return stats;
  }, [followups, now]);

  const filtered = useMemo(() => {
    let list = [...prospects];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.customer_name.toLowerCase().includes(q) ||
        p.company?.toLowerCase().includes(q) ||
        p.phone_number?.includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.product_name?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter);
    return list;
  }, [prospects, search, statusFilter]);

  // Summary stats
  const totalContacts = prospects.length;
  const activeContacts = prospects.filter(p => !['converted', 'lost'].includes(p.status)).length;
  const overdueCount = Object.values(prospectFollowupStats).reduce((s, v) => s + v.overdue, 0);
  const todayFollowups = followups.filter(f => f.source_type === 'prospect' && f.status === 'pending' && isToday(new Date(f.followup_at))).length;

  const handleOpenDetail = (prospect: Prospect) => {
    setSelectedProspect(prospect);
    setDetailOpen(true);
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Users className="h-4 w-4 text-primary" /></div>
              <div>
                <div className="text-2xl font-bold">{totalContacts}</div>
                <div className="text-xs text-muted-foreground">Total Contacts</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Target className="h-4 w-4 text-blue-600" /></div>
              <div>
                <div className="text-2xl font-bold">{activeContacts}</div>
                <div className="text-xs text-muted-foreground">Active Contacts</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10"><Calendar className="h-4 w-4 text-amber-600" /></div>
              <div>
                <div className="text-2xl font-bold">{todayFollowups}</div>
                <div className="text-xs text-muted-foreground">Today's Follow-ups</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-red-500/5 to-transparent">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10"><AlertTriangle className="h-4 w-4 text-red-600" /></div>
              <div>
                <div className="text-2xl font-bold">{overdueCount}</div>
                <div className="text-xs text-muted-foreground">Overdue</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contacts Table */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              CRM Contacts
            </CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="negotiation">Negotiation</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Follow-ups</TableHead>
                  <TableHead>Next Action</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No contacts found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(prospect => {
                    const stats = prospectFollowupStats[prospect.id];
                    return (
                      <TableRow
                        key={prospect.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleOpenDetail(prospect)}
                      >
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm flex items-center gap-1.5">
                              {prospect.customer_name}
                              {prospect.is_a_category && <span className="text-red-500 text-xs">★</span>}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              {prospect.phone_number && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{prospect.phone_number}</span>}
                              {prospect.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{prospect.email}</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{prospect.company || '—'}</span>
                          {prospect.city && <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{prospect.city}</div>}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{prospect.product_name || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-[10px] border-0', STATUS_COLORS[prospect.status] || 'bg-muted')}>
                            {prospect.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {stats ? (
                            <div className="flex items-center gap-1.5">
                              {stats.completed > 0 && <Badge variant="outline" className="text-[10px] gap-0.5 text-emerald-600"><CheckCircle2 className="h-2.5 w-2.5" />{stats.completed}</Badge>}
                              {stats.pending > 0 && <Badge variant="outline" className="text-[10px] gap-0.5 text-amber-600"><Clock className="h-2.5 w-2.5" />{stats.pending}</Badge>}
                              {stats.overdue > 0 && <Badge variant="outline" className="text-[10px] gap-0.5 text-red-600"><AlertTriangle className="h-2.5 w-2.5" />{stats.overdue}</Badge>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {stats?.nextDate ? (
                            <div className={cn('text-xs', isBefore(new Date(stats.nextDate), now) ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
                              {format(new Date(stats.nextDate), 'dd MMM, hh:mm a')}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No follow-up</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      <CrmContactDetail prospect={selectedProspect} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </div>
  );
}
