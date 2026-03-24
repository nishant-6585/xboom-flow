import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save, GripVertical, Copy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { DailyFlowTemplate } from '@/hooks/useDailyFlow';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  { key: '1', sl_no: 1, description: 'Emails', sub_items: '', time_from: '10:00', time_to: '10:30', duration_mins: 30, target_value: 10, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '2', sl_no: 2, description: 'Meetings', sub_items: '', time_from: '10:30', time_to: '11:00', duration_mins: 30, target_value: 2, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '3', sl_no: 3, description: 'Follow-ups', sub_items: 'Mails,Messages', time_from: '11:00', time_to: '11:30', duration_mins: 30, target_value: 5, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '4', sl_no: 4, description: 'Analysis', sub_items: '', time_from: '11:30', time_to: '12:30', duration_mins: 60, target_value: 3, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '5', sl_no: 5, description: 'Miscellaneous', sub_items: '', time_from: '12:30', time_to: '13:00', duration_mins: 30, target_value: 0, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '6', sl_no: 6, description: 'Lunch', sub_items: '', time_from: '13:00', time_to: '13:45', duration_mins: 45, target_value: 0, is_break: true, frequency: 'daily', frequency_days: [] },
  { key: '7', sl_no: 7, description: 'Outbound - Lead Generation', sub_items: '', time_from: '14:00', time_to: '14:30', duration_mins: 30, target_value: 8, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '8', sl_no: 8, description: 'Outbound - Emails', sub_items: '', time_from: '14:30', time_to: '15:00', duration_mins: 30, target_value: 15, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '9', sl_no: 9, description: 'Emails + Calls', sub_items: '', time_from: '16:00', time_to: '16:30', duration_mins: 60, target_value: 10, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '10', sl_no: 10, description: 'Follow Ups & Meetings', sub_items: '', time_from: '16:30', time_to: '17:00', duration_mins: 15, target_value: 4, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '11', sl_no: 11, description: 'Break', sub_items: '', time_from: '17:00', time_to: '17:15', duration_mins: 15, target_value: 0, is_break: true, frequency: 'daily', frequency_days: [] },
  { key: '12', sl_no: 12, description: 'CRM + Tools', sub_items: '', time_from: '17:15', time_to: '18:00', duration_mins: 45, target_value: 5, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '13', sl_no: 13, description: 'Others Miscellaneous', sub_items: '', time_from: '18:00', time_to: '18:30', duration_mins: 30, target_value: 0, is_break: false, frequency: 'daily', frequency_days: [] },
];

// Sortable row component
function SortableRow({ row, index, updateRow, toggleDay, removeRow, duplicateRow }: {
  row: RowData;
  index: number;
  updateRow: (i: number, field: keyof RowData, value: any) => void;
  toggleDay: (i: number, day: string) => void;
  removeRow: (i: number) => void;
  duplicateRow: (i: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className="border-b">
      <td className="p-1">
        <div className="flex items-center gap-1">
          <button type="button" className="cursor-grab touch-none text-muted-foreground hover:text-foreground" {...attributes} {...listeners}>
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-muted-foreground font-medium text-xs">{row.sl_no}</span>
        </div>
      </td>
      <td className="p-1">
        <Input value={row.description} onChange={e => updateRow(index, 'description', e.target.value)} className="h-8 text-sm" />
      </td>
      <td className="p-1">
        <Input value={row.sub_items} onChange={e => updateRow(index, 'sub_items', e.target.value)} placeholder="comma separated" className="h-8 text-sm" />
      </td>
      <td className="p-1">
        <Input type="time" value={row.time_from} onChange={e => updateRow(index, 'time_from', e.target.value)} className="h-8 text-sm text-center" />
      </td>
      <td className="p-1">
        <Input type="time" value={row.time_to} onChange={e => updateRow(index, 'time_to', e.target.value)} className="h-8 text-sm text-center" />
      </td>
      <td className="p-1 text-center">
        <span className="font-medium">{row.duration_mins}</span>
      </td>
      <td className="p-1">
        <Input
          type="number"
          min={0}
          value={row.target_value}
          onChange={e => updateRow(index, 'target_value', Number(e.target.value))}
          className="h-8 text-sm text-center border-primary/30 focus:border-primary"
          placeholder="Set target"
        />
      </td>
      <td className="p-1">
        <div className="space-y-1">
          <Select value={row.frequency} onValueChange={v => updateRow(index, 'frequency', v)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="custom">Custom Days</SelectItem>
            </SelectContent>
          </Select>
          {(row.frequency === 'weekly' || row.frequency === 'custom') && (
            <div className="flex flex-wrap gap-0.5">
              {DAYS_OF_WEEK.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(index, day)}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                    (row.frequency_days || []).includes(day)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>
      <td className="p-1">
        <div className="flex gap-0.5">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateRow(index)} title="Duplicate row">
            <Copy className="h-3 w-3 text-muted-foreground" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRow(index)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function FlowTemplateEditor({ employeeId, employeeName, templates, onSave }: FlowTemplateEditorProps) {
  const { user, profile } = useAuth();
  const [templateName, setTemplateName] = useState('Default Template');
  const [rows, setRows] = useState<RowData[]>([]);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (templates.length > 0) {
      setTemplateName((templates[0] as any).template_name || 'Default Template');
      setRows(templates.map((t) => ({
        key: t.id,
        sl_no: t.sl_no,
        description: t.description,
        sub_items: (t.sub_items || []).join(','),
        time_from: t.time_from,
        time_to: t.time_to,
        duration_mins: t.duration_mins,
        target_value: t.target_value || 0,
        is_break: t.is_break || false,
        frequency: t.frequency || 'daily',
        frequency_days: t.frequency_days || [],
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
      if (field === 'frequency' && value === 'daily') {
        updated[index].frequency_days = [];
      }
      return updated;
    });
  };

  const toggleDay = (index: number, day: string) => {
    setRows(prev => {
      const updated = [...prev];
      const days = [...(updated[index].frequency_days || [])];
      const idx = days.indexOf(day);
      if (idx >= 0) days.splice(idx, 1);
      else days.push(day);
      updated[index] = { ...updated[index], frequency_days: days };
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
      frequency: 'daily',
      frequency_days: [],
    }]);
  };

  const duplicateRow = (index: number) => {
    setRows(prev => {
      const source = prev[index];
      const newRow: RowData = {
        ...source,
        key: `dup-${Date.now()}`,
        sl_no: prev.length + 1,
      };
      const updated = [...prev];
      updated.splice(index + 1, 0, newRow);
      return updated.map((r, i) => ({ ...r, sl_no: i + 1 }));
    });
  };

  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index).map((r, i) => ({ ...r, sl_no: i + 1 })));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setRows(prev => {
        const oldIndex = prev.findIndex(r => r.key === active.id);
        const newIndex = prev.findIndex(r => r.key === over.id);
        return arrayMove(prev, oldIndex, newIndex).map((r, i) => ({ ...r, sl_no: i + 1 }));
      });
    }
  };

  const handleSave = async () => {
    if (!user || !profile) return;
    if (!templateName.trim()) return;
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
      frequency: r.frequency,
      frequency_days: r.frequency === 'daily' ? null : r.frequency_days,
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-left w-16">Sl#</th>
                  <th className="p-2 text-left min-w-[160px]">Description</th>
                  <th className="p-2 text-left min-w-[100px]">Sub Items</th>
                  <th className="p-2 text-center w-24">From</th>
                  <th className="p-2 text-center w-24">To</th>
                  <th className="p-2 text-center w-16">Mins</th>
                  <th className="p-2 text-center w-20">Target</th>
                  <th className="p-2 text-center min-w-[140px]">Frequency</th>
                  <th className="p-2 text-center w-14">Break</th>
                  <th className="p-2 w-16"></th>
                </tr>
              </thead>
              <SortableContext items={rows.map(r => r.key)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {rows.map((row, i) => (
                    <SortableRow
                      key={row.key}
                      row={row}
                      index={i}
                      updateRow={updateRow}
                      toggleDay={toggleDay}
                      removeRow={removeRow}
                      duplicateRow={duplicateRow}
                    />
                  ))}
                </tbody>
              </SortableContext>
              <tfoot>
                <tr className="border-t-2 font-semibold bg-muted/30">
                  <td className="p-2" colSpan={5}>Total</td>
                  <td className="p-2 text-center">{totalDuration} min</td>
                  <td className="p-2 text-center">{totalTarget}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </DndContext>
        </div>
      </CardContent>
    </Card>
  );
}
