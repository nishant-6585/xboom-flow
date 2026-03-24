import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Save, RefreshCw, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import type { DailyFlowEntry } from '@/hooks/useDailyFlow';

interface DailyFlowEntryTableProps {
  entries: DailyFlowEntry[];
  date: string;
  employeeName: string;
  onUpdateEntry: (entryId: string, updates: { actual_value?: number; notes?: string }) => Promise<boolean>;
  onRefresh: () => void;
  onGenerate: () => void;
  hasTemplate: boolean;
}

export function DailyFlowEntryTable({ entries, date, employeeName, onUpdateEntry, onRefresh, onGenerate, hasTemplate }: DailyFlowEntryTableProps) {
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [localValues, setLocalValues] = useState<Record<string, { actual?: number; notes?: string }>>({});

  const getLocal = (id: string, field: 'actual' | 'notes', original: any) => {
    return localValues[id]?.[field === 'actual' ? 'actual' : 'notes'] ?? original;
  };

  const setLocal = (id: string, field: 'actual' | 'notes', value: any) => {
    setLocalValues(prev => ({
      ...prev,
      [id]: { ...prev[id], [field === 'actual' ? 'actual' : 'notes']: value },
    }));
  };

  const saveEntry = async (entry: DailyFlowEntry) => {
    const local = localValues[entry.id];
    if (!local) return;
    const updates: any = {};
    if (local.actual !== undefined) updates.actual_value = local.actual;
    if (local.notes !== undefined) updates.notes = local.notes;
    const ok = await onUpdateEntry(entry.id, updates);
    if (ok) {
      toast.success('Saved');
      setLocalValues(prev => { const n = { ...prev }; delete n[entry.id]; return n; });
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
          <span>Flow of the Day — {employeeName} — {date}</span>
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
                <th className="p-2 text-left w-12">Sl#</th>
                <th className="p-2 text-left min-w-[180px]">Description</th>
                <th className="p-2 text-center w-20">From</th>
                <th className="p-2 text-center w-20">To</th>
                <th className="p-2 text-center w-20">Mins</th>
                <th className="p-2 text-center w-20">Target</th>
                <th className="p-2 text-center w-24">Actual</th>
                <th className="p-2 text-center w-24">Notes</th>
                <th className="p-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                const actualVal = getLocal(entry.id, 'actual', entry.actual_value);
                const notesVal = getLocal(entry.id, 'notes', entry.notes);
                const hasChanges = localValues[entry.id] !== undefined;
                const achievement = entry.target_value > 0 ? Math.round((actualVal / entry.target_value) * 100) : null;

                return (
                  <tr key={entry.id} className={`border-b transition-colors ${entry.is_break ? 'bg-green-500/10' : ''} ${hasChanges ? 'bg-primary/5' : ''}`}>
                    <td className="p-2 font-medium text-muted-foreground">{entry.sl_no}</td>
                    <td className="p-2">
                      <div className="font-medium">{entry.description}</div>
                      {entry.sub_items?.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {entry.sub_items.map(s => `- ${s}`).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-center text-muted-foreground">{entry.time_from}</td>
                    <td className="p-2 text-center text-muted-foreground">{entry.time_to}</td>
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
                      {editingNotes === entry.id ? (
                        <Textarea
                          value={notesVal}
                          onChange={e => setLocal(entry.id, 'notes', e.target.value)}
                          onBlur={() => setEditingNotes(null)}
                          autoFocus
                          className="text-xs min-h-[60px]"
                        />
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setEditingNotes(entry.id)}
                          title={notesVal || 'Add note'}
                        >
                          <MessageSquare className={`h-3.5 w-3.5 ${notesVal ? 'text-primary' : 'text-muted-foreground'}`} />
                        </Button>
                      )}
                    </td>
                    <td className="p-2">
                      {hasChanges && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEntry(entry)}>
                          <Save className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                    </td>
                  </tr>
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
