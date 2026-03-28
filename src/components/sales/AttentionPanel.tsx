import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAttentionItems } from '@/hooks/useAttentionItems';
import { useAuth } from '@/hooks/useAuth';
import { AlertTriangle, Search, CheckCircle, Loader2, Calendar, User, Building2, Package, Phone, Mail } from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';

const SOURCE_LABELS: Record<string, string> = {
  enquiry: 'Leads',
  interakt: 'Interakt',
  myoperator: 'MyOperator',
  email: 'Email',
};

const SOURCE_COLORS: Record<string, string> = {
  enquiry: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  interakt: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  myoperator: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  email: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
};

export function AttentionPanel() {
  const { items, loading, resolveItem } = useAttentionItems();
  const { user, profile } = useAuth();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchSearch = !search ||
        item.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        item.company?.toLowerCase().includes(search.toLowerCase()) ||
        item.product_name?.toLowerCase().includes(search.toLowerCase()) ||
        item.phone_number?.includes(search) ||
        item.email?.toLowerCase().includes(search.toLowerCase());
      const matchSource = sourceFilter === 'all' || item.source_type === sourceFilter;
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchSearch && matchSource && matchStatus;
    });
  }, [items, search, sourceFilter, statusFilter]);

  const todayStart = startOfDay(new Date());
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const monthStart = startOfMonth(new Date());

  const activeItems = items.filter(i => i.status === 'active');
  const todayCount = items.filter(i => new Date(i.created_at) >= todayStart).length;
  const weekCount = items.filter(i => new Date(i.created_at) >= weekStart).length;
  const monthCount = items.filter(i => new Date(i.created_at) >= monthStart).length;

  const handleResolve = async (id: string) => {
    if (!user || !profile) return;
    setResolvingId(id);
    try {
      await resolveItem({ id, userId: user.id, userName: profile.name });
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/20">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeItems.length}</p>
                <p className="text-xs text-muted-foreground">Active Attention</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <Calendar className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{todayCount}</p>
                <p className="text-xs text-muted-foreground">Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{weekCount}</p>
                <p className="text-xs text-muted-foreground">This Week</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Calendar className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{monthCount}</p>
                <p className="text-xs text-muted-foreground">This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Attention Items ({filtered.length})
          </CardTitle>
          <CardDescription>
            Contacts flagged for immediate attention across all lead sources
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, company, product..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="enquiry">Leads</SelectItem>
                <SelectItem value="interakt">Interakt</SelectItem>
                <SelectItem value="myoperator">MyOperator</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No attention items</h3>
              <p className="text-muted-foreground">
                Mark contacts with the ⚠ button in Leads, Interakt, MyOperator, or Email tabs
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[100px]">Source</TableHead>
                      <TableHead className="w-[160px]">Customer</TableHead>
                      <TableHead className="w-[120px]">Company</TableHead>
                      <TableHead className="w-[120px]">Product</TableHead>
                      <TableHead className="w-[120px]">Phone</TableHead>
                      <TableHead className="w-[120px]">Marked By</TableHead>
                      <TableHead className="w-[100px]">Date</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                      <TableHead className="w-[80px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => (
                      <TableRow key={item.id} className={`hover:bg-muted/50 ${item.status === 'active' ? 'bg-destructive/5' : ''}`}>
                        <TableCell>
                          <Badge variant="outline" className={SOURCE_COLORS[item.source_type] || ''}>
                            {SOURCE_LABELS[item.source_type] || item.source_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.customer_name}</p>
                            {item.email && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {item.email}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{item.company || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{item.product_name || '—'}</span>
                        </TableCell>
                        <TableCell>
                          {item.phone_number ? (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm font-mono">{item.phone_number}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{item.marked_by_name}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(item.created_at), 'dd/MM/yyyy HH:mm')}
                          </span>
                        </TableCell>
                        <TableCell>
                          {item.status === 'active' ? (
                            <Badge className="bg-destructive/20 text-destructive border-destructive/30">Active</Badge>
                          ) : (
                            <Badge className="bg-green-500/20 text-green-600 border-green-500/30">Resolved</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                              onClick={() => handleResolve(item.id)}
                              disabled={resolvingId === item.id}
                              title="Resolve"
                            >
                              {resolvingId === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
