import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Zap, Clock, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';
import { AIAutoRule } from '@/hooks/useAIAutomation';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  rules: AIAutoRule[];
  onToggle: (id: string, active: boolean) => void;
  onCreate: (rule: Partial<AIAutoRule>) => Promise<boolean>;
  onDelete: (id: string) => void;
}

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-500/10 text-green-600 border-green-500/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  high: 'bg-destructive/10 text-destructive border-destructive/20',
};

const TRIGGER_ICONS: Record<string, typeof Zap> = {
  event: Zap,
  cron: Clock,
  threshold: AlertTriangle,
};

const PRESET_RULES = [
  {
    rule_name: 'Auto follow-up inactive hot leads',
    description: 'Create follow-up task when a hot lead has no activity for 2+ days',
    trigger_type: 'event',
    condition: { field: 'lead_temperature', operator: 'eq', value: 'hot', inactive_days: 2 },
    action_type: 'create_followup',
    risk_level: 'low',
    requires_approval: false,
  },
  {
    rule_name: 'Payment reminder for overdue > ₹1L',
    description: 'Auto send payment reminder when overdue amount exceeds ₹1,00,000',
    trigger_type: 'threshold',
    condition: { field: 'overdue_amount', operator: 'gt', value: 100000 },
    action_type: 'mark_payment_followup',
    risk_level: 'medium',
    requires_approval: true,
  },
  {
    rule_name: 'Notify ops on procurement delay > 3 days',
    description: 'Alert operations when procurement is delayed by more than 3 days',
    trigger_type: 'event',
    condition: { field: 'procurement_delay_days', operator: 'gt', value: 3 },
    action_type: 'create_task',
    risk_level: 'low',
    requires_approval: false,
  },
];

export function AutoRulesPanel({ rules, onToggle, onCreate, onDelete }: Props) {
  const { user, profile } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    rule_name: '', description: '', trigger_type: 'event',
    action_type: 'create_task', risk_level: 'low', requires_approval: false,
    condition: '{}', payload: '{}',
  });

  const handleCreate = async () => {
    let condition = {}, payload = {};
    try { condition = JSON.parse(form.condition); } catch { /* empty */ }
    try { payload = JSON.parse(form.payload); } catch { /* empty */ }

    const success = await onCreate({
      rule_name: form.rule_name,
      description: form.description || null,
      trigger_type: form.trigger_type,
      action_type: form.action_type,
      risk_level: form.risk_level,
      requires_approval: form.requires_approval,
      condition,
      payload,
      created_by: user?.id || '',
      created_by_name: profile?.name || 'Admin',
      allowed_roles: ['admin'],
    });
    if (success) {
      setDialogOpen(false);
      setForm({ rule_name: '', description: '', trigger_type: 'event', action_type: 'create_task', risk_level: 'low', requires_approval: false, condition: '{}', payload: '{}' });
    }
  };

  const applyPreset = async (preset: typeof PRESET_RULES[0]) => {
    await onCreate({
      ...preset,
      created_by: user?.id || '',
      created_by_name: profile?.name || 'Admin',
      allowed_roles: ['admin'],
      payload: {},
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Automation Rules
          </h3>
          <p className="text-sm text-muted-foreground">Define rules that trigger automatic actions</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New Rule</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create Automation Rule</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Rule Name</Label>
                <Input value={form.rule_name} onChange={e => setForm(f => ({ ...f, rule_name: e.target.value }))} placeholder="e.g. Auto follow-up hot leads" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Trigger Type</Label>
                  <Select value={form.trigger_type} onValueChange={v => setForm(f => ({ ...f, trigger_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="event">Event</SelectItem>
                      <SelectItem value="cron">Scheduled</SelectItem>
                      <SelectItem value="threshold">Threshold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Risk Level</Label>
                  <Select value={form.risk_level} onValueChange={v => setForm(f => ({ ...f, risk_level: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Action Type</Label>
                <Select value={form.action_type} onValueChange={v => setForm(f => ({ ...f, action_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create_task">Create Task</SelectItem>
                    <SelectItem value="create_followup">Create Follow-up</SelectItem>
                    <SelectItem value="update_lead_status">Update Lead Status</SelectItem>
                    <SelectItem value="mark_payment_followup">Payment Follow-up</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Condition (JSON)</Label>
                <Textarea value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} rows={2} className="font-mono text-xs" />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.requires_approval} onCheckedChange={v => setForm(f => ({ ...f, requires_approval: v }))} />
                <Label>Requires approval before execution</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!form.rule_name}>Create Rule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Preset quick-add */}
      {rules.length === 0 && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Quick Start — Add Preset Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {PRESET_RULES.map((preset, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div>
                  <p className="text-sm font-medium">{preset.rule_name}</p>
                  <p className="text-xs text-muted-foreground">{preset.description}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => applyPreset(preset)}>
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Rules list */}
      <div className="space-y-2">
        {rules.map(rule => {
          const TriggerIcon = TRIGGER_ICONS[rule.trigger_type] || Zap;
          return (
            <Card key={rule.id} className={`transition-all ${!rule.is_active ? 'opacity-50' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 rounded-lg bg-primary/10 mt-0.5">
                      <TriggerIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{rule.rule_name}</p>
                        <Badge variant="outline" className={RISK_COLORS[rule.risk_level]}>
                          {rule.risk_level}
                        </Badge>
                        {rule.requires_approval && (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                            <ShieldCheck className="w-3 h-3 mr-1" /> Approval Required
                          </Badge>
                        )}
                      </div>
                      {rule.description && (
                        <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                      )}
                      <div className="flex gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        <span>Action: {rule.action_type}</span>
                        <span>•</span>
                        <span>Trigger: {rule.trigger_type}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={rule.is_active} onCheckedChange={v => onToggle(rule.id, v)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(rule.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
