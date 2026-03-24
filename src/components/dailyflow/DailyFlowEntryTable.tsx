import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Save, RefreshCw, MessageSquare, Pencil, Link2, Plus, X, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import type { DailyFlowEntry } from '@/hooks/useDailyFlow';

interface DailyFlowEntryTableProps {
  entries: DailyFlowEntry[];
  date: string;
  employeeName: string;
  onUpdateEntry: (entryId: string, updates: {
    actual_value?: number;
    notes?: string;
    task_description?: string;
    links?: string[];
    description?: string;
    time_from?: string;
    time_to?: string;
    duration_mins?: number;
  }) => Promise<boolean>;
  onRefresh: () => void;
  onGenerate: () => void;
  hasTemplate: boolean;
}

type LocalUpdates = {
  actual?: number;
  notes?: string;
  task_description?: string;
  links?: string[];
  description?: string;
  time_from?: string;
  time_to?: string;
};

export function DailyFlowEntryTable({ entries, date, employeeName, onUpdateEntry, onRefresh, onGenerate, hasTemplate }: DailyFlowEntryTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [localValues, setLocalValues] = useState<Record<string, LocalUpdates>>({});
  const [newLinkInput, setNewLinkInput] = useState<Record<string, string>>({});

  const getLocal = <K extends keyof LocalUpdates>(id: string, field: K, original: any): any => {
    return localValues[id]?.[field] ?? original;
  };

  const setLocal = (id: string, field: keyof LocalUpdates, value: any) => {
    setLocalValues(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const addLink = (entryId: string) => {
    const url = newLinkInput[entryId]?.trim();
    if (!url) return;
    const entry = entries.find(e => e.id === entryId);
    const currentLinks: string[] = getLocal(entryId, 'links', entry?.links || []);
    setLocal(entryId, 'links', [...currentLinks, url]);
    setNewLinkInput(prev => ({ ...prev, [entryId]: '' }));
  };

  const removeLink = (entryId: string, index: number) => {
    const entry = entries.find(e => e.id === entryId);
    const currentLinks: string[] = [...getLocal(entryId, 'links', entry?.links || [])];
    currentLinks.splice(index, 1);
    setLocal(entryId, 'links', currentLinks);
  };

  const saveEntry = async (entry: DailyFlowEntry) => {
    const local = localValues[entry.id];
    if (!local) return;
    const updates: any = {};
    if (local.actual !== undefined) updates.actual_value = local.actual;
    if (local.notes !== undefined) updates.notes = local.notes;
    if (local.task_description !== undefined) updates.task_description = local.task_description;
    if (local.links !== undefined) updates.links = local.links;
    if (local.description !== undefined) updates.description = local.description;
    if (local.time_from !== undefined) updates.time_from = local.time_from;
    if (local.time_to !== undefined) {
      updates.time_to = local.time_to;
      // Recalculate duration
      const from = local.time_from || entry.time_from;
      const to = local.time_to;
      if (from && to) {
        const [fh, fm] = from.split(':').map(Number);
        const [th, tm] = to.split(':').map(Number);
        const diff = (th * 60 + tm) - (fh * 60 + fm);
        updates.duration_mins = diff > 0 ? diff : 0;
      }
    }
    if (local.time_from !== undefined && local.time_to === undefined) {
      const to = entry.time_to;
      const from = local.time_from;
      if (from && to) {
        const [fh, fm] = from.split(':').map(Number);
        const [th, tm] = to.split(':').map(Number);
        const diff = (th * 60 + tm) - (fh * 60 + fm);
        updates.duration_mins = diff > 0 ? diff : 0;
      }
    }
    const ok = await onUpdateEntry(entry.id, updates);
    if (ok) {
      toast.success('Saved');
      setLocalValues(prev => { const n = { ...prev }; delete n[entry.id]; return n; });
      setEditingTask(null);
      onRefresh();
    } else {
      toast.error('Save failed');
    }
  };

  const totalTarget = entries.filter(e => !e.is_break).reduce((s, e) => s + (e.target_value || 0), 0);
  const totalActual = entries.filter(e => !e.is_break).reduce((s, e) => s + (getLocal(e.id, 'actual', e.actual_value) || 0), 0);
  const totalDuration = entries.reduce((s, e) => s + e.duration_mins, 0);

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground mb-4">No flow entries for {date}</p>
          {hasTemplate ? (
            <Button onClick={onGenerate}>
              <RefreshCw className="h-4 w-4 mr-2" /> Generate from Template
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Create a flow template first.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Daily Report — {employeeName} — {date}</span>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 font-semibold">
                <th className="p-2 text-left w-10">Sl#</th>
                <th className="p-2 text-left min-w-[160px]">Task</th>
                <th className="p-2 text-center w-20">From</th>
                <th className="p-2 text-center w-20">To</th>
                <th className="p-2 text-center w-16">Mins</th>
                <th className="p-2 text-center w-16">Target</th>
                <th className="p-2 text-center w-24">Actual</th>
                <th className="p-2 text-center w-10"></th>
                <th className="p-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                const actualVal = getLocal(entry.id, 'actual', entry.actual_value);
                const hasChanges = localValues[entry.id] !== undefined;
                const achievement = entry.target_value > 0 ? Math.round((actualVal / entry.target_value) * 100) : null;
                const isExpanded = expandedRow === entry.id;
                const isEditing = editingTask === entry.id;
                const descVal = getLocal(entry.id, 'task_description', entry.task_description || '');
                const linksVal: string[] = getLocal(entry.id, 'links', entry.links || []);
                const taskName = getLocal(entry.id, 'description', entry.description);
                const timeFrom = getLocal(entry.id, 'time_from', entry.time_from);
                const timeTo = getLocal(entry.id, 'time_to', entry.time_to);

                return (
                  <>
                    <tr key={entry.id} className={`border-b transition-colors ${entry.is_break ? 'bg-green-500/10' : ''} ${hasChanges ? 'bg-primary/5' : ''}`}>
                      <td className="p-2 font-medium text-muted-foreground">{entry.sl_no}</td>
                      <td className="p-2">
                        {isEditing ? (
                          <Input
                            value={taskName}
                            onChange={e => setLocal(entry.id, 'description', e.target.value)}
                            className="h-7 text-sm"
                          />
                        ) : (
                          <div>
                            <div className="font-medium flex items-center gap-1">
                              {entry.description}
                              {linksVal.length > 0 && (
                                <Link2 className="h-3 w-3 text-primary" />
                              )}
                            </div>
                            {entry.sub_items?.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {entry.sub_items.map(s => `- ${s}`).join(', ')}
                              </div>
                            )}
                            {descVal && !isExpanded && (
                              <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{descVal}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {isEditing ? (
                          <Input type="time" value={timeFrom} onChange={e => setLocal(entry.id, 'time_from', e.target.value)} className="h-7 text-xs w-20" />
                        ) : (
                          <span className="text-muted-foreground">{entry.time_from}</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {isEditing ? (
                          <Input type="time" value={timeTo} onChange={e => setLocal(entry.id, 'time_to', e.target.value)} className="h-7 text-xs w-20" />
                        ) : (
                          <span className="text-muted-foreground">{entry.time_to}</span>
                        )}
                      </td>
                      <td className="p-2 text-center">{entry.duration_mins}</td>
                      <td className="p-2 text-center font-medium">{entry.target_value || '—'}</td>
                      <td className="p-2">
                        {entry.is_break ? (
                          <span className="text-muted-foreground text-center block">—</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={actualVal}
                              onChange={e => setLocal(entry.id, 'actual', Number(e.target.value))}
                              className="h-7 text-sm text-center w-16"
                            />
                            {achievement !== null && (
                              <span className={`text-xs font-medium ${achievement >= 100 ? 'text-green-600' : achievement >= 70 ? 'text-amber-600' : 'text-destructive'}`}>
                                {achievement}%
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-2">
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      </td>
                      <td className="p-2 flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingTask(isEditing ? null : entry.id)} title="Edit task">
                          <Pencil className={`h-3.5 w-3.5 ${isEditing ? 'text-primary' : 'text-muted-foreground'}`} />
                        </Button>
                        {hasChanges && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEntry(entry)}>
                            <Save className="h-3.5 w-3.5 text-primary" />
                          </Button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${entry.id}-expanded`} className="border-b bg-muted/20">
                        <td></td>
                        <td colSpan={8} className="p-3">
                          <div className="space-y-3">
                            {/* Description */}
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">Task Description</label>
                              <Textarea
                                value={descVal}
                                onChange={e => setLocal(entry.id, 'task_description', e.target.value)}
                                placeholder="Describe what needs to be done for this task..."
                                className="text-sm min-h-[60px]"
                              />
                            </div>
                            {/* Notes */}
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">Notes / Remarks</label>
                              <Textarea
                                value={getLocal(entry.id, 'notes', entry.notes || '')}
                                onChange={e => setLocal(entry.id, 'notes', e.target.value)}
                                placeholder="Add any notes or remarks..."
                                className="text-sm min-h-[50px]"
                              />
                            </div>
                            {/* Links */}
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-muted-foreground">Links / References</label>
                              {linksVal.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {linksVal.map((link, idx) => (
                                    <div key={idx} className="flex items-center gap-1 bg-background border rounded-md px-2 py-1 text-xs">
                                      <a href={link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline max-w-[200px] truncate flex items-center gap-1">
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                        {link.replace(/^https?:\/\//, '').slice(0, 40)}
                                      </a>
                                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => removeLink(entry.id, idx)}>
                                        <X className="h-3 w-3 text-destructive" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <Input
                                  value={newLinkInput[entry.id] || ''}
                                  onChange={e => setNewLinkInput(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                  placeholder="https://..."
                                  className="h-8 text-sm flex-1"
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(entry.id); } }}
                                />
                                <Button size="sm" variant="outline" className="h-8" onClick={() => addLink(entry.id)}>
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                                </Button>
                              </div>
                            </div>
                            {/* Save button for expanded section */}
                            {hasChanges && (
                              <div className="flex justify-end">
                                <Button size="sm" onClick={() => saveEntry(entry)}>
                                  <Save className="h-4 w-4 mr-1" /> Save Changes
                                </Button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold bg-muted/30">
                <td className="p-2" colSpan={4}>Total</td>
                <td className="p-2 text-center">{totalDuration} min</td>
                <td className="p-2 text-center">{totalTarget}</td>
                <td className="p-2 text-center">{totalActual}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
