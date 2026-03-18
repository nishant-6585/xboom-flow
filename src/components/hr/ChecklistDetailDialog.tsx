import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, User, Calendar, MessageSquare, Save } from "lucide-react";
import { EmployeeChecklist, ChecklistItem, useEmployeeChecklists } from "@/hooks/useEmployeeChecklists";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checklist: EmployeeChecklist | null;
  checklistType: 'onboarding' | 'offboarding';
  onUpdated: () => void;
}

export function ChecklistDetailDialog({ open, onOpenChange, checklist, checklistType, onUpdated }: Props) {
  const { fetchChecklistItems, toggleItem, updateItemNotes } = useEmployeeChecklists(checklistType);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    if (!checklist) return;
    setLoading(true);
    const data = await fetchChecklistItems(checklist.id);
    setItems(data);
    setLoading(false);
  }, [checklist, fetchChecklistItems]);

  useEffect(() => {
    if (open && checklist) loadItems();
  }, [open, checklist, loadItems]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleToggle = async (item: ChecklistItem, checked: boolean) => {
    // Capture scroll position
    const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;

    // Optimistic update
    setItems(prev => prev.map(i =>
      i.id === item.id ? { ...i, is_completed: checked, completed_at: checked ? new Date().toISOString() : null } : i
    ));
    toast.success(`${item.item_name} ${checked ? 'completed' : 'unchecked'}`);

    // Restore scroll after render
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollTop;
      }
    });

    // Sync to API in background
    const success = await toggleItem(item, checked);
    if (success) {
      onUpdated();
    } else {
      // Rollback on failure
      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, is_completed: !checked, completed_at: !checked ? item.completed_at : null } : i
      ));
      toast.error('Failed to update item');
    }
  };

  const handleSaveNotes = async (itemId: string) => {
    setSavingNotes(itemId);
    const notes = editingNotes[itemId] ?? '';
    const success = await updateItemNotes(itemId, notes);
    if (success) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, notes } : i));
      setEditingNotes(prev => { const n = { ...prev }; delete n[itemId]; return n; });
      toast.success('Notes saved');
    }
    setSavingNotes(null);
  };

  const completedCount = items.filter(i => i.is_completed).length;
  const totalCount = items.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (!checklist) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {checklistType === 'onboarding' ? '🟢' : '🔴'} {checklistType === 'onboarding' ? 'Onboarding' : 'Offboarding'} Checklist
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 pb-2 border-b">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium">{checklist.employee_name}</span>
            <Badge variant="outline">{checklist.employee_number}</Badge>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {checklistType === 'onboarding' && checklist.joining_date && (
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> DOJ: {format(new Date(checklist.joining_date), 'dd MMM yyyy')}</span>
            )}
            {checklistType === 'offboarding' && checklist.exit_date && (
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Exit: {format(new Date(checklist.exit_date), 'dd MMM yyyy')}</span>
            )}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Progress value={pct} className="h-2 flex-1" />
            <span className="text-xs font-medium text-muted-foreground">{completedCount}/{totalCount} ({pct}%)</span>
          </div>
        </div>

        <div ref={scrollContainerRef} className="max-h-[55vh] pr-2 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => {
                const isEditingNotes = editingNotes[item.id] !== undefined;
                return (
                  <div key={item.id} className={`p-3 rounded-lg border ${item.is_completed ? 'bg-muted/30 border-primary/20' : 'bg-background'}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={item.is_completed}
                        onCheckedChange={(checked) => handleToggle(item, !!checked)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-medium ${item.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                            {idx + 1}. {item.item_name}
                          </span>
                          {item.is_completed && (
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </div>
                        {item.is_completed && item.completed_by_name && (
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><User className="h-3 w-3" /> {item.completed_by_name}</span>
                            {item.completed_at && (
                              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {format(new Date(item.completed_at), 'dd MMM yyyy, hh:mm a')}</span>
                            )}
                          </div>
                        )}
                        {/* Notes section */}
                        {item.notes && !isEditingNotes && (
                          <p className="text-xs text-muted-foreground mt-1 italic cursor-pointer" onClick={() => setEditingNotes(prev => ({ ...prev, [item.id]: item.notes || '' }))}>
                            <MessageSquare className="h-3 w-3 inline mr-1" />{item.notes}
                          </p>
                        )}
                        {isEditingNotes && (
                          <div className="mt-2 space-y-1">
                            <Textarea
                              value={editingNotes[item.id]}
                              onChange={(e) => setEditingNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className="text-xs min-h-[50px]"
                              placeholder="Add notes..."
                            />
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingNotes(prev => { const n = { ...prev }; delete n[item.id]; return n; })}>Cancel</Button>
                              <Button size="sm" className="h-6 text-xs" onClick={() => handleSaveNotes(item.id)} disabled={savingNotes === item.id}>
                                <Save className="h-3 w-3 mr-1" /> Save
                              </Button>
                            </div>
                          </div>
                        )}
                        {!item.notes && !isEditingNotes && (
                          <button className="text-xs text-muted-foreground/50 hover:text-muted-foreground mt-1" onClick={() => setEditingNotes(prev => ({ ...prev, [item.id]: '' }))}>
                            + Add notes
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
