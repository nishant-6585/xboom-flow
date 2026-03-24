import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { DailyFlowTemplate } from '@/hooks/useDailyFlow';

interface FlowTemplateEditorProps {
  employeeId: string;
  employeeName: string;
  templates: DailyFlowTemplate[];
  onSave: (items: Omit<DailyFlowTemplate, 'id' | 'created_at'>[]) => Promise<boolean>;
}

interface RowData {
  key: string;
  sl_no: number;
  description: string;
  sub_items: string;
  time_from: string;
  time_to: string;
  duration_mins: number;
  target_value: number;
  is_break: boolean;
  frequency: string;
  frequency_days: string[];
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DEFAULT_ROWS: RowData[] = [
  { key: '1', sl_no: 1, description: 'Emails', sub_items: '', time_from: '10:00', time_to: '10:30', duration_mins: 30, target_value: 10, is_break: false },
  { key: '2', sl_no: 2, description: 'Meetings', sub_items: '', time_from: '10:30', time_to: '11:00', duration_mins: 30, target_value: 2, is_break: false },
  { key: '3', sl_no: 3, description: 'Follow-ups', sub_items: 'Mails,Messages', time_from: '11:00', time_to: '11:30', duration_mins: 30, target_value: 5, is_break: false },
  { key: '4', sl_no: 4, description: 'Analysis', sub_items: '', time_from: '11:30', time_to: '12:30', duration_mins: 60, target_value: 3, is_break: false },
  { key: '5', sl_no: 5, description: 'Miscellaneous', sub_items: '', time_from: '12:30', time_to: '13:00', duration_mins: 30, target_value: 0, is_break: false },
  { key: '6', sl_no: 6, description: 'Lunch', sub_items: '', time_from: '13:00', time_to: '13:45', duration_mins: 45, target_value: 0, is_break: true },
  { key: '7', sl_no: 7, description: 'Outbound - Lead Generation', sub_items: '', time_from: '14:00', time_to: '14:30', duration_mins: 30, target_value: 8, is_break: false },
  { key: '8', sl_no: 8, description: 'Outbound - Emails', sub_items: '', time_from: '14:30', time_to: '15:00', duration_mins: 30, target_value: 15, is_break: false },
  { key: '9', sl_no: 9, description: 'Emails + Calls', sub_items: '', time_from: '16:00', time_to: '16:30', duration_mins: 60, target_value: 10, is_break: false },
  { key: '10', sl_no: 10, description: 'Follow Ups & Meetings', sub_items: '', time_from: '16:30', time_to: '17:00', duration_mins: 15, target_value: 4, is_break: false },
  { key: '11', sl_no: 11, description: 'Break', sub_items: '', time_from: '17:00', time_to: '17:15', duration_mins: 15, target_value: 0, is_break: true },
  { key: '12', sl_no: 12, description: 'CRM + Tools', sub_items: '', time_from: '17:15', time_to: '18:00', duration_mins: 45, target_value: 5, is_break: false },
  { key: '13', sl_no: 13, description: 'Others Miscellaneous', sub_items: '', time_from: '18:00', time_to: '18:30', duration_mins: 30, target_value: 0, is_break: false },
];

export function FlowTemplateEditor({ employeeId, employeeName, templates, onSave }: FlowTemplateEditorProps) {
  const { user, profile } = useAuth();
  const [templateName, setTemplateName] = useState('Default Template');
  const [rows, setRows] = useState<RowData[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (templates.length > 0) {
      setTemplateName((templates[0] as any).template_name || 'Default Template');
      setRows(templates.map((t, i) => ({
        key: t.id,
        sl_no: t.sl_no,
        description: t.description,
        sub_items: (t.sub_items || []).join(','),
        time_from: t.time_from,
        time_to: t.time_to,
        duration_mins: t.duration_mins,
        target_value: t.target_value || 0,
        is_break: t.is_break || false,
      })));
    } else {
      setTemplateName('Default Template');
      setRows(DEFAULT_ROWS);
    }
  }, [templates]);

  const updateRow = (index: number, field: keyof RowData, value: any) => {
    setRows(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'time_from' || field === 'time_to') {
        const from = field === 'time_from' ? value : updated[index].time_from;
        const to = field === 'time_to' ? value : updated[index].time_to;
        if (from && to) {
          const [fh, fm] = from.split(':').map(Number);
          const [th, tm] = to.split(':').map(Number);
          const diff = (th * 60 + tm) - (fh * 60 + fm);
          updated[index].duration_mins = diff > 0 ? diff : 0;
        }
      }
      return updated;
    });
  };

  const addRow = () => {
    const nextSl = rows.length > 0 ? Math.max(...rows.map(r => r.sl_no)) + 1 : 1;
    setRows(prev => [...prev, {
      key: `new-${Date.now()}`,
      sl_no: nextSl,
      description: '',
      sub_items: '',
      time_from: '',
      time_to: '',
      duration_mins: 0,
      target_value: 0,
      is_break: false,
    }]);
  };

  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index).map((r, i) => ({ ...r, sl_no: i + 1 })));
  };

  const handleSave = async () => {
    if (!user || !profile) return;
    if (!templateName.trim()) {
      return;
    }
    setSaving(true);
    const items = rows.map(r => ({
      employee_id: employeeId,
      employee_name: employeeName,
      template_name: templateName.trim(),
      sl_no: r.sl_no,
      description: r.description,
      sub_items: r.sub_items ? r.sub_items.split(',').map(s => s.trim()).filter(Boolean) : [],
      time_from: r.time_from,
      time_to: r.time_to,
      duration_mins: r.duration_mins,
      target_value: r.target_value,
      is_break: r.is_break,
      created_by: user.id,
      created_by_name: profile.name || 'Unknown',
    }));
    await onSave(items as any);
    setSaving(false);
  };

  const totalTarget = rows.filter(r => !r.is_break).reduce((s, r) => s + (r.target_value || 0), 0);
  const totalDuration = rows.reduce((s, r) => s + r.duration_mins, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span>Flow Template for {employeeName}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="h-4 w-4 mr-1" /> Add Row
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving...' : 'Save Template'}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium whitespace-nowrap">Template Name</Label>
            <Input
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="e.g. Sales Daily Plan, Marketing Flow..."
              className="max-w-sm h-9 text-sm"
            />
            <div className="ml-auto flex gap-4 text-xs text-muted-foreground">
              <span>Total Duration: <strong className="text-foreground">{totalDuration} min</strong></span>
              <span>Total Target: <strong className="text-foreground">{totalTarget}</strong></span>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-2 text-left w-12">Sl#</th>
                <th className="p-2 text-left min-w-[180px]">Description</th>
                <th className="p-2 text-left min-w-[120px]">Sub Items</th>
                <th className="p-2 text-center w-24">From</th>
                <th className="p-2 text-center w-24">To</th>
                <th className="p-2 text-center w-20">Mins</th>
                <th className="p-2 text-center w-24">Target KPI</th>
                <th className="p-2 text-center w-16">Break</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.key} className={`border-b ${row.is_break ? 'bg-green-500/10' : ''}`}>
                  <td className="p-1">
                    <span className="text-muted-foreground font-medium">{row.sl_no}</span>
                  </td>
                  <td className="p-1">
                    <Input value={row.description} onChange={e => updateRow(i, 'description', e.target.value)} className="h-8 text-sm" />
                  </td>
                  <td className="p-1">
                    <Input value={row.sub_items} onChange={e => updateRow(i, 'sub_items', e.target.value)} placeholder="comma separated" className="h-8 text-sm" />
                  </td>
                  <td className="p-1">
                    <Input type="time" value={row.time_from} onChange={e => updateRow(i, 'time_from', e.target.value)} className="h-8 text-sm text-center" />
                  </td>
                  <td className="p-1">
                    <Input type="time" value={row.time_to} onChange={e => updateRow(i, 'time_to', e.target.value)} className="h-8 text-sm text-center" />
                  </td>
                  <td className="p-1 text-center">
                    <span className="font-medium">{row.duration_mins}</span>
                  </td>
                  <td className="p-1">
                    <Input
                      type="number"
                      min={0}
                      value={row.target_value}
                      onChange={e => updateRow(i, 'target_value', Number(e.target.value))}
                      className={`h-8 text-sm text-center ${row.is_break ? 'opacity-50' : 'border-primary/30 focus:border-primary'}`}
                      disabled={row.is_break}
                      placeholder="Set target"
                    />
                  </td>
                  <td className="p-1 text-center">
                    <Checkbox checked={row.is_break} onCheckedChange={v => updateRow(i, 'is_break', !!v)} />
                  </td>
                  <td className="p-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRow(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold bg-muted/30">
                <td className="p-2" colSpan={5}>Total</td>
                <td className="p-2 text-center">{totalDuration} min</td>
                <td className="p-2 text-center">{totalTarget}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
