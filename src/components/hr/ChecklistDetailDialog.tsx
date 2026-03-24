import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, User, Calendar, MessageSquare, Save, Loader2, RotateCcw, AlertCircle, Ban } from "lucide-react";
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
  const { fetchChecklistItems, toggleItem, updateItemNotes, toggleApplicable } = useEmployeeChecklists(checklistType);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<string | null>(null);
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, { checked: boolean; item: ChecklistItem } | null>>({});
  const [applicableLoadingMap, setApplicableLoadingMap] = useState<Record<string, boolean>>({});

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

  const executeToggle = useCallback(async (item: ChecklistItem, checked: boolean, isRetry = false) => {
    const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
    const startTime = performance.now();

    setErrorMap(prev => ({ ...prev, [item.id]: null }));
    setLoadingMap(prev => ({ ...prev, [item.id]: true }));

    // Optimistic update
    setItems(prev => prev.map(i =>
      i.id === item.id ? { ...i, is_completed: checked, completed_at: checked ? new Date().toISOString() : null } : i
    ));

    if (!isRetry) {
      toast.success(`${item.item_name} ${checked ? 'completed' : 'unchecked'}`);
    }

    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollTop;
      }
    });

    const success = await toggleItem(item, checked);
    const latency = performance.now() - startTime;

    console.info(JSON.stringify({
      event: "checklist_interaction",
      itemId: item.id,
      action: checked ? "check" : "uncheck",
      latency_ms: Math.round(latency),
      status: success ? "success" : "failure",
      isRetry,
    }));

    setLoadingMap(prev => ({ ...prev, [item.id]: false }));

    if (success) {
      onUpdated();
    } else {
      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, is_completed: !checked, completed_at: !checked ? item.completed_at : null } : i
      ));
      setErrorMap(prev => ({ ...prev, [item.id]: { checked, item } }));
      toast.error(`Failed to update "${item.item_name}"`);
    }
  }, [toggleItem, onUpdated]);

  const handleToggle = useCallback((item: ChecklistItem, checked: boolean) => {
    executeToggle(item, checked);
  }, [executeToggle]);

  const handleRetry = useCallback((itemId: string) => {
    const err = errorMap[itemId];
    if (!err) return;
    executeToggle(err.item, err.checked, true);
  }, [errorMap, executeToggle]);

  const handleToggleApplicable = useCallback(async (item: ChecklistItem, isApplicable: boolean) => {
    const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
    setApplicableLoadingMap(prev => ({ ...prev, [item.id]: true }));

    // Optimistic update
    setItems(prev => prev.map(i =>
      i.id === item.id ? {
        ...i,
        is_applicable: isApplicable,
        ...(isApplicable ? {} : { is_completed: false, completed_at: null, completed_by: null, completed_by_name: null }),
      } : i
    ));

    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollTop;
      }
    });

    const success = await toggleApplicable(item.id, isApplicable);
    setApplicableLoadingMap(prev => ({ ...prev, [item.id]: false }));

    if (success) {
      toast.success(`${item.item_name} marked as ${isApplicable ? 'applicable' : 'not applicable'}`);
      onUpdated();
    } else {
      // Rollback
      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, is_applicable: !isApplicable } : i
      ));
    }
  }, [toggleApplicable, onUpdated]);

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

  const applicableItems = items.filter(i => i.is_applicable);
  const completedCount = applicableItems.filter(i => i.is_completed).length;
  const totalApplicable = applicableItems.length;
  const notApplicableCount = items.length - totalApplicable;
  const pct = totalApplicable > 0 ? Math.round((completedCount / totalApplicable) * 100) : (items.length > 0 ? 100 : 0);

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
            <span className="text-xs font-medium text-muted-foreground">
              {completedCount}/{totalApplicable} ({pct}%)
              {notApplicableCount > 0 && (
                <span className="ml-1 text-muted-foreground/60">· {notApplicableCount} N/A</span>
              )}
            </span>
          </div>
        </div>

        <div ref={scrollContainerRef} className="max-h-[55vh] pr-2 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => {
                const isEditingNotes = editingNotes[item.id] !== undefined;
                const isItemLoading = !!loadingMap[item.id];
                const isApplicableLoading = !!applicableLoadingMap[item.id];
                const hasError = !!errorMap[item.id];
                const isNA = !item.is_applicable;
                return (
                  <div key={item.id} className={`p-3 rounded-lg border ${hasError ? 'border-destructive/40 bg-destructive/5' : isNA ? 'bg-muted/50 border-muted opacity-60' : item.is_completed ? 'bg-muted/30 border-primary/20' : 'bg-background'}`}>
                    <div className="flex items-start gap-3">
                      <div className="relative mt-0.5">
                        {isItemLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : isNA ? (
                          <Ban className="h-4 w-4 text-muted-foreground/50" />
                        ) : (
                          <Checkbox
                            checked={item.is_completed}
                            onCheckedChange={(checked) => handleToggle(item, !!checked)}
                            disabled={isItemLoading}
                            className="mt-0"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-medium ${isNA ? 'line-through text-muted-foreground/50' : item.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                            {idx + 1}. {item.item_name}
                            {isNA && <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1 font-normal">N/A</Badge>}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Applicable toggle */}
                            <div className="flex items-center gap-1" title={item.is_applicable ? 'Mark as Not Applicable' : 'Mark as Applicable'}>
                              {isApplicableLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                              ) : (
                                <Switch
                                  checked={item.is_applicable}
                                  onCheckedChange={(checked) => handleToggleApplicable(item, checked)}
                                  className="scale-75"
                                />
                              )}
                            </div>
                            {hasError && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                                onClick={() => handleRetry(item.id)}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" /> Retry
                              </Button>
                            )}
                            {item.is_completed && !hasError && !isNA && (
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                            )}
                            {hasError && (
                              <AlertCircle className="h-4 w-4 text-destructive" />
                            )}
                          </div>
                        </div>
                        {item.is_completed && item.completed_by_name && !isNA && (
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><User className="h-3 w-3" /> {item.completed_by_name}</span>
                            {item.completed_at && (
                              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {format(new Date(item.completed_at), 'dd MMM yyyy, hh:mm a')}</span>
                            )}
                          </div>
                        )}
                        {/* Notes section - only for applicable items */}
                        {!isNA && (
                          <>
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
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}