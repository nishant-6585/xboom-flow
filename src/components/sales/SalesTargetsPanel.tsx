import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Target, Plus, Edit, Trash2, TrendingUp, DollarSign, ShoppingCart, PieChart } from 'lucide-react';
import { useSalesTargets, SalesTargetFormData, TargetPeriod } from '@/hooks/useSalesTargets';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, addMonths, addQuarters } from 'date-fns';

interface SalesTeamMember {
  user_id: string;
  name: string;
}

export function SalesTargetsPanel() {
  const { user, role } = useAuth();
  const { targets, loading, createTarget, updateTarget, deleteTarget } = useSalesTargets();
  const isAdmin = role === 'admin';
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [salesTeam, setSalesTeam] = useState<SalesTeamMember[]>([]);
  const [periodFilter, setPeriodFilter] = useState<'all' | 'monthly' | 'quarterly'>('all');
  
  const [formData, setFormData] = useState<SalesTargetFormData>({
    user_id: '',
    user_name: '',
    target_period: 'monthly',
    period_start: '',
    period_end: '',
    revenue_target: 0,
    orders_target: 0,
    pipeline_target: 0,
  });

  // Fetch sales team
  useEffect(() => {
    const fetchSalesTeam = async () => {
      const { data, error } = await supabase.rpc('get_sales_team');
      if (!error && data) {
        setSalesTeam(data as SalesTeamMember[]);
      }
    };
    fetchSalesTeam();
  }, []);

  const filteredTargets = useMemo(() => {
    if (periodFilter === 'all') return targets;
    return targets.filter(t => t.target_period === periodFilter);
  }, [targets, periodFilter]);

  const myTargets = useMemo(() => {
    if (!user) return [];
    const now = new Date();
    return targets.filter(t => 
      t.user_id === user.id &&
      new Date(t.period_start) <= now &&
      new Date(t.period_end) >= now
    );
  }, [targets, user]);

  const handlePeriodChange = (period: TargetPeriod) => {
    const now = new Date();
    let start: Date, end: Date;
    
    if (period === 'monthly') {
      start = startOfMonth(now);
      end = endOfMonth(now);
    } else {
      start = startOfQuarter(now);
      end = endOfQuarter(now);
    }
    
    setFormData(prev => ({
      ...prev,
      target_period: period,
      period_start: format(start, 'yyyy-MM-dd'),
      period_end: format(end, 'yyyy-MM-dd'),
    }));
  };

  const handleUserChange = (userId: string) => {
    const member = salesTeam.find(m => m.user_id === userId);
    setFormData(prev => ({
      ...prev,
      user_id: userId,
      user_name: member?.name || '',
    }));
  };

  const handleSubmit = async () => {
    if (!formData.user_id || !formData.period_start || !formData.period_end) {
      return;
    }

    if (editingTarget) {
      await updateTarget(editingTarget, {
        revenue_target: formData.revenue_target,
        orders_target: formData.orders_target,
        pipeline_target: formData.pipeline_target,
        notes: formData.notes || null,
      });
    } else {
      await createTarget(formData);
    }
    
    setDialogOpen(false);
    resetForm();
  };

  const handleEdit = (target: typeof targets[0]) => {
    setEditingTarget(target.id);
    setFormData({
      user_id: target.user_id,
      user_name: target.user_name,
      target_period: target.target_period as TargetPeriod,
      period_start: target.period_start,
      period_end: target.period_end,
      revenue_target: target.revenue_target,
      orders_target: target.orders_target,
      pipeline_target: target.pipeline_target,
      notes: target.notes || undefined,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this target?')) {
      await deleteTarget(id);
    }
  };

  const resetForm = () => {
    setEditingTarget(null);
    setFormData({
      user_id: '',
      user_name: '',
      target_period: 'monthly',
      period_start: '',
      period_end: '',
      revenue_target: 0,
      orders_target: 0,
      pipeline_target: 0,
    });
  };

  const getProgress = (achieved: number, target: number) => {
    if (target === 0) return 0;
    return Math.min(100, Math.round((achieved / target) * 100));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Current User's Targets Summary */}
      {myTargets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {myTargets.map(target => (
            <Card key={target.id} className="border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  {target.target_period === 'monthly' ? 'Monthly' : 'Quarterly'} Target
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> Revenue
                    </span>
                    <span>{getProgress(target.revenue_achieved, target.revenue_target)}%</span>
                  </div>
                  <Progress value={getProgress(target.revenue_achieved, target.revenue_target)} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatCurrency(target.revenue_achieved)} / {formatCurrency(target.revenue_target)}
                  </p>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-1">
                      <ShoppingCart className="w-3 h-3" /> Orders
                    </span>
                    <span>{getProgress(target.orders_achieved, target.orders_target)}%</span>
                  </div>
                  <Progress value={getProgress(target.orders_achieved, target.orders_target)} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {target.orders_achieved} / {target.orders_target} orders
                  </p>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-1">
                      <PieChart className="w-3 h-3" /> Pipeline
                    </span>
                    <span>{getProgress(target.pipeline_achieved, target.pipeline_target)}%</span>
                  </div>
                  <Progress value={getProgress(target.pipeline_achieved, target.pipeline_target)} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatCurrency(target.pipeline_achieved)} / {formatCurrency(target.pipeline_target)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* All Targets Table (Admin) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Sales Targets
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as any)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Periods</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
              {isAdmin && (
                <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Target
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <div className="animate-pulse text-muted-foreground">Loading targets...</div>
            </div>
          ) : filteredTargets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No targets found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales Person</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Revenue Target</TableHead>
                  <TableHead className="text-right">Orders Target</TableHead>
                  <TableHead className="text-right">Pipeline Target</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTargets.map((target) => (
                  <TableRow key={target.id}>
                    <TableCell className="font-medium">{target.user_name}</TableCell>
                    <TableCell>
                      <Badge variant={target.target_period === 'monthly' ? 'secondary' : 'outline'}>
                        {target.target_period === 'monthly' ? 'Monthly' : 'Quarterly'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(target.period_start), 'MMM d')} - {format(new Date(target.period_end), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div>
                        {formatCurrency(target.revenue_target)}
                        <div className="text-xs text-muted-foreground">
                          Achieved: {formatCurrency(target.revenue_achieved)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div>
                        {target.orders_target}
                        <div className="text-xs text-muted-foreground">
                          Achieved: {target.orders_achieved}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div>
                        {formatCurrency(target.pipeline_target)}
                        <div className="text-xs text-muted-foreground">
                          Achieved: {formatCurrency(target.pipeline_achieved)}
                        </div>
                      </div>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(target)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(target.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTarget ? 'Edit Target' : 'Add Sales Target'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sales Person</Label>
                <Select
                  value={formData.user_id}
                  onValueChange={handleUserChange}
                  disabled={!!editingTarget}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select person" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesTeam.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Period</Label>
                <Select
                  value={formData.target_period}
                  onValueChange={(v) => handlePeriodChange(v as TargetPeriod)}
                  disabled={!!editingTarget}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input
                  type="date"
                  value={formData.period_start}
                  onChange={(e) => setFormData(prev => ({ ...prev, period_start: e.target.value }))}
                  disabled={!!editingTarget}
                />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input
                  type="date"
                  value={formData.period_end}
                  onChange={(e) => setFormData(prev => ({ ...prev, period_end: e.target.value }))}
                  disabled={!!editingTarget}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Revenue Target (₹)</Label>
                <Input
                  type="number"
                  value={formData.revenue_target}
                  onChange={(e) => setFormData(prev => ({ ...prev, revenue_target: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Orders Target</Label>
                <Input
                  type="number"
                  value={formData.orders_target}
                  onChange={(e) => setFormData(prev => ({ ...prev, orders_target: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Pipeline Target (₹)</Label>
                <Input
                  type="number"
                  value={formData.pipeline_target}
                  onChange={(e) => setFormData(prev => ({ ...prev, pipeline_target: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional notes about this target..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingTarget ? 'Update' : 'Create'} Target
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
