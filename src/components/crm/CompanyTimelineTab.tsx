import { format, formatDistanceToNow } from 'date-fns';
import { useCompanyTimeline, useCompanyActivities } from '@/hooks/useCompanyCrm';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import {
  Phone, Mail, MessageCircle, Package, FileText, Ticket, Calendar, ListChecks,
  Sparkles, Plus, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props { companyId: string; companyName: string; }

const TYPE_META: Record<string, { icon: any; color: string; label: string }> = {
  call: { icon: Phone, color: 'text-blue-600 bg-blue-500/10', label: 'Call' },
  email: { icon: Mail, color: 'text-purple-600 bg-purple-500/10', label: 'Email' },
  whatsapp: { icon: MessageCircle, color: 'text-green-600 bg-green-500/10', label: 'WhatsApp' },
  order: { icon: Package, color: 'text-emerald-600 bg-emerald-500/10', label: 'Order' },
  note: { icon: FileText, color: 'text-slate-600 bg-slate-500/10', label: 'Note' },
  ticket: { icon: Ticket, color: 'text-red-600 bg-red-500/10', label: 'Ticket' },
  meeting: { icon: Calendar, color: 'text-indigo-600 bg-indigo-500/10', label: 'Meeting' },
  task: { icon: ListChecks, color: 'text-amber-600 bg-amber-500/10', label: 'Task' },
  lead: { icon: Sparkles, color: 'text-pink-600 bg-pink-500/10', label: 'Lead' },
};

export function CompanyTimelineTab({ companyId, companyName }: Props) {
  const { data: items = [], isLoading } = useCompanyTimeline(companyId, companyName);
  const { addActivity, adding } = useCompanyActivities(companyId);
  const [showAdd, setShowAdd] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [form, setForm] = useState({ activity_type: 'note', source: 'manual', title: '', description: '' });

  const filtered = filterType === 'all' ? items : items.filter(i => i.type === filterType);

  const handleAdd = async () => {
    if (!form.title.trim()) return;
    await addActivity({
      company_id: companyId,
      activity_type: form.activity_type,
      source: form.source,
      title: form.title,
      description: form.description || null,
      occurred_at: new Date().toISOString(),
    });
    setForm({ activity_type: 'note', source: 'manual', title: '', description: '' });
    setShowAdd(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activity</SelectItem>
            {Object.entries(TYPE_META).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="gap-1 text-xs h-8" onClick={() => setShowAdd(s => !s)}>
          <Plus className="h-3 w-3" />Log
        </Button>
      </div>

      {showAdd && (
        <Card className="border-border/50">
          <CardContent className="p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={form.activity_type} onValueChange={v => setForm(f => ({ ...f, activity_type: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_META).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Source</Label>
                <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                    <SelectItem value="exotel">Exotel</SelectItem>
                    <SelectItem value="myoperator">MyOperator</SelectItem>
                    <SelectItem value="gmail">Email/Gmail</SelectItem>
                    <SelectItem value="interakt">Interakt (WhatsApp)</SelectItem>
                    <SelectItem value="shopify">Shopify</SelectItem>
                    <SelectItem value="woo">WooCommerce</SelectItem>
                    <SelectItem value="form">Form</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input className="h-8 text-xs" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Discovery call with CEO" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea className="text-xs" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <Button size="sm" className="w-full text-xs" onClick={handleAdd} disabled={adding || !form.title.trim()}>
              {adding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Log activity
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6 text-xs text-muted-foreground">No activity yet</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const meta = TYPE_META[item.type] || TYPE_META.note;
            const Icon = meta.icon;
            return (
              <div key={item.id} className="flex gap-3">
                <div className={cn('shrink-0 h-8 w-8 rounded-lg flex items-center justify-center', meta.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{item.title}</span>
                    <Badge variant="outline" className="text-[9px] uppercase">{item.source}</Badge>
                    {item.amount != null && (
                      <Badge className="text-[9px] bg-emerald-500/15 text-emerald-700 border-0">
                        ₹{Number(item.amount).toLocaleString('en-IN')}
                      </Badge>
                    )}
                  </div>
                  {item.description && <div className="text-xs text-muted-foreground line-clamp-2">{item.description}</div>}
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {format(new Date(item.occurred_at), 'dd MMM yy, HH:mm')} · {formatDistanceToNow(new Date(item.occurred_at), { addSuffix: true })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}