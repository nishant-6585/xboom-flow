import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save, GripVertical, Copy, AlertTriangle, Clock, ArrowRight } from 'lucide-react';
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
import { toast } from 'sonner';
import { calculateDurationMinutes, normalizeFlexibleTimeInput, isValidNormalizedTime } from './timeUtils';
import { TimePickerSelect, QuickAdjustButtons, formatDurationDisplay } from './TimePickerSelect';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  { key: '6', sl_no: 6, description: 'Lunch', sub_items: '', time_from: '13:00', time_to: '13:45', duration_mins: 45, target_value: 0, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '7', sl_no: 7, description: 'Outbound - Lead Generation', sub_items: '', time_from: '14:00', time_to: '14:30', duration_mins: 30, target_value: 8, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '8', sl_no: 8, description: 'Outbound - Emails', sub_items: '', time_from: '14:30', time_to: '15:00', duration_mins: 30, target_value: 15, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '9', sl_no: 9, description: 'Emails + Calls', sub_items: '', time_from: '16:00', time_to: '16:30', duration_mins: 30, target_value: 10, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '10', sl_no: 10, description: 'Follow Ups & Meetings', sub_items: '', time_from: '16:30', time_to: '17:00', duration_mins: 30, target_value: 4, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '11', sl_no: 11, description: 'Break', sub_items: '', time_from: '17:00', time_to: '17:15', duration_mins: 15, target_value: 0, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '12', sl_no: 12, description: 'CRM + Tools', sub_items: '', time_from: '17:15', time_to: '18:00', duration_mins: 45, target_value: 5, is_break: false, frequency: 'daily', frequency_days: [] },
  { key: '13', sl_no: 13, description: 'Others Miscellaneous', sub_items: '', time_from: '18:00', time_to: '18:30', duration_mins: 30, target_value: 0, is_break: false, frequency: 'daily', frequency_days: [] },
];

interface TimeIssue {
  type: 'overlap' | 'gap';
  message: string;
}

function toMinutes(time: string): number | null {
  const normalized = normalizeFlexibleTimeInput(time);
  if (!normalized) return null;
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutesAsTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function detectTimeIssues(rows: RowData[]): Map<string, TimeIssue[]> {
  const issues = new Map<string, TimeIssue[]>();
  const parsed = rows
    .map(r => ({ key: r.key, sl_no: r.sl_no, desc: r.description, from: toMinutes(r.time_from), to: toMinutes(r.time_to) }))
    .filter(r => r.from !== null && r.to !== null && r.to! > r.from!) as
    { key: string; sl_no: number; desc: string; from: number; to: number }[];

  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i], b = parsed[j];
      if (a.from < b.to && b.from < a.to) {
        const msg = `Overlaps with #${b.sl_no} "${b.desc}"`;
        const msgB = `Overlaps with #${a.sl_no} "${a.desc}"`;
        issues.set(a.key, [...(issues.get(a.key) || []), { type: 'overlap', message: msg }]);
        issues.set(b.key, [...(issues.get(b.key) || []), { type: 'overlap', message: msgB }]);
      }
    }
  }
  return issues;
}

function detectGaps(rows: RowData[]): { afterKey: string; fromTime: string; toTime: string; durationMins: number }[] {
  const parsed = rows
    .map(r => ({ key: r.key, from: toMinutes(r.time_from), to: toMinutes(r.time_to) }))
    .filter(r => r.from !== null && r.to !== null && r.to! > r.from!) as
    { key: string; from: number; to: number }[];

  if (parsed.length < 2) return [];
  const sorted = [...parsed].sort((a, b) => a.from - b.from);
  const gaps: { afterKey: string; fromTime: string; toTime: string; durationMins: number }[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].to;
    const gapEnd = sorted[i + 1].from;
    if (gapEnd > gapStart + 5) {
      gaps.push({
        afterKey: sorted[i].key,
        fromTime: formatMinutesAsTime(gapStart),
        toTime: formatMinutesAsTime(gapEnd),
        durationMins: gapEnd - gapStart,
      });
    }
  }
  return gaps;
}

function SortableRow({ row, updateRow, toggleDay, removeRow, duplicateRow, issues }: {
  row: RowData;
  updateRow: (rowKey: string, field: keyof RowData, value: any) => void;
  toggleDay: (rowKey: string, day: string) => void;
  removeRow: (rowKey: string) => void;
  duplicateRow: (rowKey: string) => void;
  issues: TimeIssue[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasOverlap = issues.some(i => i.type === 'overlap');

  return (
    <tr ref={setNodeRef} style={style} className={`border-b ${hasOverlap ? 'bg-destructive/10' : ''}`}>
      <td className="p-1">
        <div className="flex items-center gap-1">
          <button type="button" className="cursor-grab touch-none text-muted-foreground hover:text-foreground" {...attributes} {...listeners}>
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-muted-foreground font-medium text-xs">{row.sl_no}</span>
          {hasOverlap && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[200px]">
                  {issues.map((issue, idx) => (
                    <p key={idx} className="text-xs">{issue.message}</p>
                  ))}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </td>
      <td className="p-1">
        <Input value={row.description} onChange={e => updateRow(row.key, 'description', e.target.value)} className="h-8 text-sm" />
      </td>
      <td className="p-1">
        <Input value={row.sub_items} onChange={e => updateRow(row.key, 'sub_items', e.target.value)} placeholder="comma separated" className="h-8 text-sm" />
      </td>
      <td className="p-1">
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1">
            <TimePickerSelect
              value={row.time_from}
              onChange={v => updateRow(row.key, 'time_from', v)}
            />
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <TimePickerSelect
              value={row.time_to}
              onChange={v => updateRow(row.key, 'time_to', v)}
              minTime={row.time_from}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              row.duration_mins > 0 ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
            }`}>
              {formatDurationDisplay(row.duration_mins)}
            </span>
            <QuickAdjustButtons
              time={row.time_to}
              onChange={v => updateRow(row.key, 'time_to', v)}
            />
          </div>
        </div>
      </td>
      <td className="p-1">
        <Input
          type="number"
          min={0}
          value={row.target_value}
          onChange={e => updateRow(row.key, 'target_value', Number(e.target.value))}
          className="h-8 text-sm text-center border-primary/30 focus:border-primary"
          placeholder="Set target"
        />
      </td>
      <td className="p-1">
        <div className="space-y-1">
          <Select value={row.frequency} onValueChange={v => updateRow(row.key, 'frequency', v)}>
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
                  onClick={() => toggleDay(row.key, day)}
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
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateRow(row.key)} title="Duplicate row">
            <Copy className="h-3 w-3 text-muted-foreground" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRow(row.key)}>
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
        time_from: normalizeFlexibleTimeInput(t.time_from) || t.time_from || '',
        time_to: normalizeFlexibleTimeInput(t.time_to) || t.time_to || '',
        duration_mins: t.duration_mins || calculateDurationMinutes(t.time_from, t.time_to),
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

  const updateRow = (rowKey: string, field: keyof RowData, value: any) => {
    setRows(prev => prev.map(row => {
      if (row.key !== rowKey) return row;
      const updatedRow = { ...row, [field]: value } as RowData;

      if (field === 'time_from' || field === 'time_to') {
        updatedRow.duration_mins = calculateDurationMinutes(updatedRow.time_from, updatedRow.time_to);
      }

      if (field === 'frequency' && value === 'daily') {
        updatedRow.frequency_days = [];
      }

      return updatedRow;
    }));
  };

  const toggleDay = (rowKey: string, day: string) => {
    setRows(prev => prev.map(row => {
      if (row.key !== rowKey) return row;
      const days = [...(row.frequency_days || [])];
      const idx = days.indexOf(day);
      if (idx >= 0) days.splice(idx, 1);
      else days.push(day);
      return { ...row, frequency_days: days };
    }));
  };

  const addRow = () => {
    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
    const lastEndMins = lastRow ? toMinutes(lastRow.time_to) : null;

    let newFrom = '';
    let newTo = '';
    let newDuration = 0;

    if (lastEndMins !== null && lastEndMins !== null) {
      newFrom = formatMinutesAsTime(lastEndMins);
      const endMins = Math.min(23 * 60 + 45, lastEndMins + 30);
      newTo = formatMinutesAsTime(endMins);
      newDuration = endMins - lastEndMins;
    }

    const nextSl = rows.length > 0 ? Math.max(...rows.map(r => r.sl_no)) + 1 : 1;
    setRows(prev => [...prev, {
      key: `new-${crypto.randomUUID()}`,
      sl_no: nextSl,
      description: '',
      sub_items: '',
      time_from: newFrom,
      time_to: newTo,
      duration_mins: newDuration,
      target_value: 0,
      is_break: false,
      frequency: 'daily',
      frequency_days: [],
    }]);
  };

  const fillGap = (fromTime: string, toTime: string) => {
    const nextSl = rows.length > 0 ? Math.max(...rows.map(r => r.sl_no)) + 1 : 1;
    const duration = calculateDurationMinutes(fromTime, toTime);

    setRows(prev => {
      // Find the position to insert: after the row whose end = gap start
      const insertIdx = prev.findIndex(r => {
        const endMins = toMinutes(r.time_to);
        const gapStartMins = toMinutes(fromTime);
        return endMins !== null && gapStartMins !== null && endMins === gapStartMins;
      });

      const newRow: RowData = {
        key: `fill-${crypto.randomUUID()}`,
        sl_no: nextSl,
        description: '',
        sub_items: '',
        time_from: fromTime,
        time_to: toTime,
        duration_mins: duration,
        target_value: 0,
        is_break: false,
        frequency: 'daily',
        frequency_days: [],
      };

      const updated = [...prev];
      if (insertIdx >= 0) {
        updated.splice(insertIdx + 1, 0, newRow);
      } else {
        updated.push(newRow);
      }
      return updated.map((r, i) => ({ ...r, sl_no: i + 1 }));
    });

    toast.success(`Gap filled: ${fromTime} – ${toTime}`);
  };

  const duplicateRow = (rowKey: string) => {
    setRows(prev => {
      const sourceIndex = prev.findIndex(row => row.key === rowKey);
      if (sourceIndex === -1) return prev;
      const source = prev[sourceIndex];
      const newRow: RowData = {
        ...source,
        key: `dup-${crypto.randomUUID()}`,
      };
      const updated = [...prev];
      updated.splice(sourceIndex + 1, 0, newRow);
      return updated.map((r, i) => ({ ...r, sl_no: i + 1 }));
    });
  };

  const removeRow = (rowKey: string) => {
    setRows(prev => prev.filter(row => row.key !== rowKey).map((r, i) => ({ ...r, sl_no: i + 1 })));
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
    const normalizedRows = rows.map((row) => {
      const timeFrom = normalizeFlexibleTimeInput(row.time_from);
      const timeTo = normalizeFlexibleTimeInput(row.time_to);

      return {
        ...row,
        time_from: timeFrom ?? row.time_from.trim(),
        time_to: timeTo ?? row.time_to.trim(),
        duration_mins: timeFrom && timeTo ? calculateDurationMinutes(timeFrom, timeTo) : 0,
      };
    });

    const filledRows = normalizedRows.filter(
      (row) => row.description.trim() || row.time_from || row.time_to
    );

    if (filledRows.length === 0) {
      toast.error('Please add at least one row with a description and times');
      return;
    }

    const invalidRow = filledRows.find((row) => !row.time_from || !row.time_to);
    if (invalidRow) {
      toast.error(`Please enter valid start and end times for row ${invalidRow.sl_no}`);
      return;
    }

    const invalidDurationRow = filledRows.find((row) => row.duration_mins <= 0);
    if (invalidDurationRow) {
      toast.error(`End time must be after start time for row ${invalidDurationRow.sl_no}`);
      return;
    }

    const renumberedRows = filledRows.map((row, idx) => ({ ...row, sl_no: idx + 1 }));
    setRows(renumberedRows);
    setSaving(true);
    const items = renumberedRows.map(r => ({
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
    try {
      await onSave(items as any);
    } finally {
      setSaving(false);
    }
  };

  const totalTarget = rows.reduce((s, r) => s + (r.target_value || 0), 0);
  const totalDuration = rows.reduce((s, r) => s + r.duration_mins, 0);
  const timeIssues = detectTimeIssues(rows);
  const gaps = detectGaps(rows);
  const overlapCount = new Set([...timeIssues.entries()].filter(([, v]) => v.some(i => i.type === 'overlap')).map(([k]) => k)).size;

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
              {overlapCount > 0 && (
                <span className="text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {overlapCount} overlap{overlapCount > 1 ? 's' : ''}
                </span>
              )}
              {gaps.length > 0 && (
                <span className="text-amber-500 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {gaps.length} gap{gaps.length > 1 ? 's' : ''}
                </span>
              )}
              <span>Total Duration: <strong className="text-foreground">{formatDurationDisplay(totalDuration)}</strong></span>
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
                  <th className="p-2 text-center min-w-[280px]">Time</th>
                  <th className="p-2 text-center w-20">Target</th>
                  <th className="p-2 text-center min-w-[140px]">Frequency</th>
                  <th className="p-2 w-16"></th>
                </tr>
              </thead>
              <SortableContext items={rows.map(r => r.key)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {rows.map((row) => {
                    const rowIssues = timeIssues.get(row.key) || [];
                    const gapAfter = gaps.find(g => g.afterKey === row.key);
                    return (
                      <React.Fragment key={row.key}>
                        <SortableRow
                          row={row}
                          updateRow={updateRow}
                          toggleDay={toggleDay}
                          removeRow={removeRow}
                          duplicateRow={duplicateRow}
                          issues={rowIssues}
                        />
                        {gapAfter && (
                          <tr className="border-b bg-amber-500/5">
                            <td colSpan={7} className="p-1">
                              <div className="flex items-center gap-2 text-xs px-2 py-1">
                                <Clock className="h-3.5 w-3.5 text-amber-500" />
                                <span className="font-medium text-amber-600">
                                  Gap: {gapAfter.fromTime} – {gapAfter.toTime} ({formatDurationDisplay(gapAfter.durationMins)} unassigned)
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] px-2 ml-2 border-amber-400 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                                  onClick={() => fillGap(gapAfter.fromTime, gapAfter.toTime)}
                                >
                                  <Plus className="h-3 w-3 mr-0.5" /> Fill Gap
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </SortableContext>
              <tfoot>
                <tr className="border-t-2 font-semibold bg-muted/30">
                  <td className="p-2" colSpan={3}>Total</td>
                  <td className="p-2 text-center">{formatDurationDisplay(totalDuration)}</td>
                  <td className="p-2 text-center">{totalTarget}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </DndContext>
        </div>
      </CardContent>
    </Card>
  );
}
