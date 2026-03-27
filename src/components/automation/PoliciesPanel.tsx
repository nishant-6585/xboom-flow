import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Plus, Shield, IndianRupee } from 'lucide-react';
import { AIPolicy } from '@/hooks/useAIAutomation';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  policies: AIPolicy[];
  onCreate: (policy: Partial<AIPolicy>) => Promise<boolean>;
}

const ROLE_COLORS: Record<string, string> = {
  sales: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  finance: 'bg-green-500/10 text-green-600 border-green-500/20',
  hr: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  supply_chain: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  admin: 'bg-primary/10 text-primary border-primary/20',
};

export function PoliciesPanel({ policies, onCreate }: Props) {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    policy_name: '', description: '', role: 'sales',
    allowed_actions: '', blocked_actions: '',
    amount_threshold: '', requires_approval_above: '',
  });

  const handleCreate = async () => {
    const success = await onCreate({
      policy_name: form.policy_name,
      description: form.description || null,
      role: form.role,
      allowed_actions: form.allowed_actions ? form.allowed_actions.split(',').map(s => s.trim()) : [],
      blocked_actions: form.blocked_actions ? form.blocked_actions.split(',').map(s => s.trim()) : [],
      amount_threshold: form.amount_threshold ? parseFloat(form.amount_threshold) : null,
      requires_approval_above: form.requires_approval_above ? parseFloat(form.requires_approval_above) : null,
      created_by: user?.id || '',
    });
    if (success) {
      setDialogOpen(false);
      setForm({ policy_name: '', description: '', role: 'sales', allowed_actions: '', blocked_actions: '', amount_threshold: '', requires_approval_above: '' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" /> Policies
          </h3>
          <p className="text-sm text-muted-foreground">Control who can auto-execute what, with thresholds</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New Policy</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create Policy</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Policy Name</Label>
                <Input value={form.policy_name} onChange={e => setForm(f => ({ ...f, policy_name: e.target.value }))} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['sales', 'finance', 'hr', 'supply_chain', 'admin'].map(r => (
                      <SelectItem key={r} value={r}>{r.replace('_', ' ').toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Allowed Actions (comma-separated)</Label>
                <Input value={form.allowed_actions} onChange={e => setForm(f => ({ ...f, allowed_actions: e.target.value }))} placeholder="create_followup, create_task" />
              </div>
              <div>
                <Label>Blocked Actions (comma-separated)</Label>
                <Input value={form.blocked_actions} onChange={e => setForm(f => ({ ...f, blocked_actions: e.target.value }))} placeholder="update_order_status" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount Threshold (₹)</Label>
                  <Input type="number" value={form.amount_threshold} onChange={e => setForm(f => ({ ...f, amount_threshold: e.target.value }))} />
                </div>
                <div>
                  <Label>Approval Required Above (₹)</Label>
                  <Input type="number" value={form.requires_approval_above} onChange={e => setForm(f => ({ ...f, requires_approval_above: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!form.policy_name}>Create Policy</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {policies.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center text-muted-foreground">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No policies defined yet. Create policies to control automation behavior per role.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {policies.map(policy => (
          <Card key={policy.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{policy.policy_name}</p>
                    <Badge variant="outline" className={ROLE_COLORS[policy.role] || ROLE_COLORS.admin}>
                      {policy.role.replace('_', ' ')}
                    </Badge>
                  </div>
                  {policy.description && <p className="text-xs text-muted-foreground mt-1">{policy.description}</p>}
                  <div className="flex gap-3 mt-2 flex-wrap">
                    {policy.allowed_actions.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] text-green-600 font-medium">ALLOW:</span>
                        {policy.allowed_actions.map(a => (
                          <Badge key={a} variant="outline" className="text-[10px] h-5 bg-green-500/5 text-green-600 border-green-500/20">{a}</Badge>
                        ))}
                      </div>
                    )}
                    {policy.blocked_actions.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] text-destructive font-medium">BLOCK:</span>
                        {policy.blocked_actions.map(a => (
                          <Badge key={a} variant="outline" className="text-[10px] h-5 bg-destructive/5 text-destructive border-destructive/20">{a}</Badge>
                        ))}
                      </div>
                    )}
                    {policy.requires_approval_above != null && (
                      <div className="flex items-center gap-1 text-[10px] text-amber-600">
                        <IndianRupee className="w-3 h-3" />
                        Approval above ₹{policy.requires_approval_above.toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>
                </div>
                <Badge variant={policy.is_active ? 'default' : 'secondary'} className="text-[10px]">
                  {policy.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
