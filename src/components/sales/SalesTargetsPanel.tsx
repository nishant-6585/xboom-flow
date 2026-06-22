import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Target, Plus, Edit, TrendingUp, DollarSign, PieChart } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from 'date-fns';

interface SalesTeamMember {
  user_id: string;
  name: string;
}

interface TargetRow {
  id: string;
  user_id: string;
  user_name: string;
  target_period: string;
  period_start: string;
  period_end: string;
  revenue_target: number;
  orders_target: number;
  pipeline_target: number;
  revenue_achieved: number;
  orders_achieved: number;
  pipeline_achieved: number;
  notes: string | null;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

interface InlineEditableTargetCellProps {
  value: number | null;
  isAdmin: boolean;
  onSave: (value: number) => Promise<void>;
  placeholder?: string;
}

function InlineEditableTargetCell({ value, isAdmin, onSave, placeholder = 'Not set' }: InlineEditableTargetCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value != null ? String(value) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value != null ? String(value) : '');
  }, [value]);

  const commit = async () => {
    const num = Number(draft);
    if (!Number.isFinite(num) || num < 0) {
      toast.error('Enter a valid non-negative number');
      setDraft(value != null ? String(value) : '');
      setEditing(false);
      return;
    }
    if (num === (value ?? 0)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(num);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return value != null ? (
      <span className="font-semibold">{formatCurrency(value)}</span>
    ) : (
      <span className="text-muted-foreground text-xs">{placeholder}</span>
    );
  }

  if (editing) {
    return (
      <Input
        type="number"
        autoFocus
        disabled={saving}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { setDraft(value != null ? String(value) : ''); setEditing(false); }
        }}
        className="h-8 text-center"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-full px-2 py-1 rounded hover:bg-muted/60 transition-colors text-center"
      title="Click to edit"
    >
      {value != null ? (
        <span className="font-semibold">{formatCurrency(value)}</span>
      ) : (
        <span className="text-muted-foreground text-xs">{placeholder}</span>
      )}
    </button>
  );
}

export function SalesTargetsPanel() {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';

  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [salesTeam, setSalesTeam] = useState<SalesTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    user_id: '',
    user_name: '',
    target_period: 'monthly' as 'monthly' | 'quarterly',
    revenue_target: 0,
    orders_target: 0,
    pipeline_target: 0,
  });

  const fetchAll = async () => {
    setLoading(true);
    const [teamRes, targetsRes] = await Promise.all([
      supabase.rpc('get_sales_team'),
      supabase.from('sales_targets').select('*').order('user_name').order('target_period'),
    ]);
    if (teamRes.data) setSalesTeam(teamRes.data as SalesTeamMember[]);
    if (targetsRes.data) setTargets(targetsRes.data as TargetRow[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Group targets by user for display
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; monthly: TargetRow | null; quarterly: TargetRow | null }>();
    salesTeam.forEach(sp => map.set(sp.user_id, { name: sp.name, monthly: null, quarterly: null }));
    
    const now = new Date();
    targets.forEach(t => {
      // Show the most recent/current target for each period type
      const entry = map.get(t.user_id);
      if (!entry) {
        map.set(t.user_id, { name: t.user_name, monthly: null, quarterly: null });
      }
      const e = map.get(t.user_id)!;
      if (t.target_period === 'monthly') {
        if (!e.monthly || new Date(t.period_start) > new Date(e.monthly.period_start)) e.monthly = t;
      } else {
        if (!e.quarterly || new Date(t.period_start) > new Date(e.quarterly.period_start)) e.quarterly = t;
      }
    });
    return Array.from(map.entries()).map(([id, data]) => ({ user_id: id, ...data }));
  }, [salesTeam, targets]);

  const openSetTarget = (userId: string, userName: string, period: 'monthly' | 'quarterly', existing?: TargetRow | null) => {
    setEditingId(existing?.id || null);
    setForm({
      user_id: userId,
      user_name: userName,
      target_period: period,
      revenue_target: existing?.revenue_target || 0,
      orders_target: existing?.orders_target || 0,
      pipeline_target: existing?.pipeline_target || 0,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !isAdmin) return;

    const now = new Date();
    const periodStart = form.target_period === 'monthly'
      ? format(startOfMonth(now), 'yyyy-MM-dd')
      : format(startOfQuarter(now), 'yyyy-MM-dd');
    const periodEnd = form.target_period === 'monthly'
      ? format(endOfMonth(now), 'yyyy-MM-dd')
      : format(endOfQuarter(now), 'yyyy-MM-dd');

    try {
      if (editingId) {
        const { error } = await supabase.from('sales_targets').update({
          revenue_target: form.revenue_target,
          orders_target: form.orders_target,
          pipeline_target: form.pipeline_target,
        }).eq('id', editingId);
        if (error) throw error;
        toast.success('Target updated');
      } else {
        const { error } = await supabase.from('sales_targets').insert({
          user_id: form.user_id,
          user_name: form.user_name,
          target_period: form.target_period,
          period_start: periodStart,
          period_end: periodEnd,
          revenue_target: form.revenue_target,
          orders_target: form.orders_target,
          pipeline_target: form.pipeline_target,
          created_by: user.id,
        });
        if (error) throw error;
        toast.success('Target created — applies until changed');
      }
      setDialogOpen(false);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save target');
    }
  };

  const saveInlineField = async (
    userId: string,
    userName: string,
    period: 'monthly' | 'quarterly',
    existing: TargetRow | null,
    field: 'revenue_target' | 'pipeline_target',
    newValue: number,
  ) => {
    if (!user || !isAdmin) {
      toast.error('Only admins can edit targets');
      return;
    }
    try {
      if (existing) {
        const { error } = await supabase
          .from('sales_targets')
          .update({ [field]: newValue })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const now = new Date();
        const periodStart = period === 'monthly'
          ? format(startOfMonth(now), 'yyyy-MM-dd')
          : format(startOfQuarter(now), 'yyyy-MM-dd');
        const periodEnd = period === 'monthly'
          ? format(endOfMonth(now), 'yyyy-MM-dd')
          : format(endOfQuarter(now), 'yyyy-MM-dd');
        const { error } = await supabase.from('sales_targets').insert({
          user_id: userId,
          user_name: userName,
          target_period: period,
          period_start: periodStart,
          period_end: periodEnd,
          revenue_target: field === 'revenue_target' ? newValue : 0,
          orders_target: 0,
          pipeline_target: field === 'pipeline_target' ? newValue : 0,
          created_by: user.id,
        });
        if (error) throw error;
      }
      toast.success('Target saved');
      await fetchAll();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save target');
      throw err;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Sales Targets
            </CardTitle>
            <p className="text-xs text-muted-foreground">Targets persist until changed by Admin</p>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <div className="animate-pulse text-muted-foreground">Loading...</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales Person</TableHead>
                  <TableHead className="text-center">Monthly Revenue Target</TableHead>
                  <TableHead className="text-center">Monthly Pipeline Target</TableHead>
                  <TableHead className="text-center">Monthly Orders</TableHead>
                  {isAdmin && <TableHead className="text-center w-[80px]">Edit</TableHead>}
                  <TableHead className="text-center">Quarterly Revenue Target</TableHead>
                  <TableHead className="text-center">Quarterly Pipeline Target</TableHead>
                  <TableHead className="text-center">Quarterly Orders</TableHead>
                  {isAdmin && <TableHead className="text-center w-[80px]">Edit</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map(sp => (
                  <TableRow key={sp.user_id}>
                    <TableCell className="font-medium">{sp.name}</TableCell>
                    
                    {/* Monthly */}
                    <TableCell className="text-center">
                      <InlineEditableTargetCell
                        value={sp.monthly ? sp.monthly.revenue_target : null}
                        isAdmin={isAdmin}
                        onSave={(v) => saveInlineField(sp.user_id, sp.name, 'monthly', sp.monthly, 'revenue_target', v)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <InlineEditableTargetCell
                        value={sp.monthly ? sp.monthly.pipeline_target : null}
                        isAdmin={isAdmin}
                        onSave={(v) => saveInlineField(sp.user_id, sp.name, 'monthly', sp.monthly, 'pipeline_target', v)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {sp.monthly ? (
                        <span className="font-semibold">{sp.monthly.orders_target}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openSetTarget(sp.user_id, sp.name, 'monthly', sp.monthly)}
                        >
                          {sp.monthly ? <Edit className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        </Button>
                      </TableCell>
                    )}

                    {/* Quarterly */}
                    <TableCell className="text-center">
                      <InlineEditableTargetCell
                        value={sp.quarterly ? sp.quarterly.revenue_target : null}
                        isAdmin={isAdmin}
                        onSave={(v) => saveInlineField(sp.user_id, sp.name, 'quarterly', sp.quarterly, 'revenue_target', v)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <InlineEditableTargetCell
                        value={sp.quarterly ? sp.quarterly.pipeline_target : null}
                        isAdmin={isAdmin}
                        onSave={(v) => saveInlineField(sp.user_id, sp.name, 'quarterly', sp.quarterly, 'pipeline_target', v)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {sp.quarterly ? (
                        <span className="font-semibold">{sp.quarterly.orders_target}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openSetTarget(sp.user_id, sp.name, 'quarterly', sp.quarterly)}
                        >
                          {sp.quarterly ? <Edit className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Set/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              {editingId ? 'Edit' : 'Set'} {form.target_period === 'monthly' ? 'Monthly' : 'Quarterly'} Target
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm font-medium">{form.user_name}</p>
              <p className="text-xs text-muted-foreground">
                {form.target_period === 'monthly' ? 'Monthly' : 'Quarterly'} target — applies every {form.target_period === 'monthly' ? 'month' : 'quarter'} until changed
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Revenue Target (₹)
              </Label>
              <Input
                type="number"
                value={form.revenue_target || ''}
                onChange={(e) => setForm(p => ({ ...p, revenue_target: Number(e.target.value) }))}
                placeholder="e.g. 500000"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <PieChart className="w-3.5 h-3.5" /> Pipeline Target (₹)
              </Label>
              <Input
                type="number"
                value={form.pipeline_target || ''}
                onChange={(e) => setForm(p => ({ ...p, pipeline_target: Number(e.target.value) }))}
                placeholder="e.g. 1000000"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> Orders Target
              </Label>
              <Input
                type="number"
                value={form.orders_target || ''}
                onChange={(e) => setForm(p => ({ ...p, orders_target: Number(e.target.value) }))}
                placeholder="e.g. 10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingId ? 'Update' : 'Set'} Target</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
