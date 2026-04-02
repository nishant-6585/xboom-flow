import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Search, Plus, Copy, Download, Trash2, Users, Clock, Target,
  FileSpreadsheet, Loader2, LayoutGrid, List, Pencil
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface LibraryTemplate {
  id: string;
  template_name: string;
  description: string | null;
  category: string;
  total_duration_mins: number;
  task_count: number;
  created_by_name: string;
  created_at: string;
}

interface LibraryItem {
  id: string;
  sl_no: number;
  description: string;
  sub_items: string[];
  time_from: string;
  time_to: string;
  duration_mins: number;
  target_value: number;
  is_break: boolean;
  frequency: string;
  frequency_days: string[];
}

interface Employee {
  id: string;
  name: string;
}

const CATEGORIES = ['General', 'Sales', 'HR', 'Operations', 'Marketing', 'Finance', 'IT', 'Support'];

export function TemplateLibrary() {
  const { user, profile } = useAuth();
  const [templates, setTemplates] = useState<LibraryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Create/Edit modal
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<LibraryTemplate | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategory, setFormCategory] = useState('General');
  const [saving, setSaving] = useState(false);

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTemplate, setAssignTemplate] = useState<LibraryTemplate | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  // Detail/Items modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTemplate, setDetailTemplate] = useState<LibraryTemplate | null>(null);
  const [detailItems, setDetailItems] = useState<LibraryItem[]>([]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('flow_template_library')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setTemplates(data as LibraryTemplate[]);
    if (error) console.error(error);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const fetchItems = async (templateId: string) => {
    const { data } = await supabase
      .from('flow_template_library_items')
      .select('*')
      .eq('library_template_id', templateId)
      .order('sl_no');
    return (data || []) as LibraryItem[];
  };

  const filtered = templates.filter(t =>
    t.template_name.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormDesc('');
    setFormCategory('General');
    setCreateOpen(true);
  };

  const openEdit = (t: LibraryTemplate) => {
    setEditingTemplate(t);
    setFormName(t.template_name);
    setFormDesc(t.description || '');
    setFormCategory(t.category);
    setCreateOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !user || !profile) return;
    setSaving(true);
    try {
      if (editingTemplate) {
        await supabase.from('flow_template_library').update({
          template_name: formName.trim(),
          description: formDesc.trim() || null,
          category: formCategory,
          updated_at: new Date().toISOString(),
        }).eq('id', editingTemplate.id);
        toast.success('Template updated');
      } else {
        await supabase.from('flow_template_library').insert({
          template_name: formName.trim(),
          description: formDesc.trim() || null,
          category: formCategory,
          created_by: user.id,
          created_by_name: profile.name || 'Unknown',
        });
        toast.success('Template created');
      }
      setCreateOpen(false);
      fetchTemplates();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template and all its items?')) return;
    await supabase.from('flow_template_library').delete().eq('id', id);
    toast.success('Template deleted');
    fetchTemplates();
  };

  const handleDuplicate = async (t: LibraryTemplate) => {
    if (!user || !profile) return;
    const items = await fetchItems(t.id);
    const { data: newTmpl } = await supabase.from('flow_template_library').insert({
      template_name: `${t.template_name} (Copy)`,
      description: t.description,
      category: t.category,
      total_duration_mins: t.total_duration_mins,
      task_count: t.task_count,
      created_by: user.id,
      created_by_name: profile.name || 'Unknown',
    }).select('id').single();

    if (newTmpl && items.length > 0) {
      await supabase.from('flow_template_library_items').insert(
        items.map(item => ({
          library_template_id: newTmpl.id,
          sl_no: item.sl_no,
          description: item.description,
          sub_items: item.sub_items,
          time_from: item.time_from,
          time_to: item.time_to,
          duration_mins: item.duration_mins,
          target_value: item.target_value,
          is_break: item.is_break,
          frequency: item.frequency,
          frequency_days: item.frequency_days,
        }))
      );
    }
    toast.success('Template duplicated');
    fetchTemplates();
  };

  const openDetail = async (t: LibraryTemplate) => {
    setDetailTemplate(t);
    const items = await fetchItems(t.id);
    setDetailItems(items);
    setDetailOpen(true);
  };

  const openAssign = async (t: LibraryTemplate) => {
    setAssignTemplate(t);
    setSelectedEmployees(new Set());
    const { data } = await supabase.from('employees').select('id, name').eq('is_active', true).order('name');
    setEmployees(data || []);
    setAssignOpen(true);
  };

  const toggleEmployee = (empId: string) => {
    setSelectedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  };

  const handleAssign = async () => {
    if (!assignTemplate || selectedEmployees.size === 0 || !user || !profile) return;
    setAssigning(true);
    try {
      const items = await fetchItems(assignTemplate.id);
      let successCount = 0;

      for (const empId of selectedEmployees) {
        const emp = employees.find(e => e.id === empId);
        if (!emp) continue;

        // Delete existing templates for this employee
        const { data: existing } = await supabase.from('daily_flow_templates').select('id').eq('employee_id', empId);
        const existingIds = (existing || []).map((e: any) => e.id);
        if (existingIds.length > 0) {
          await supabase.from('daily_flow_entries').update({ template_id: null } as any).in('template_id', existingIds);
          await supabase.from('daily_flow_templates').delete().eq('employee_id', empId);
        }

        // Insert new templates
        const rows = items.map((item, idx) => ({
          employee_id: empId,
          employee_name: emp.name,
          template_name: assignTemplate.template_name,
          sl_no: idx + 1,
          description: item.description,
          sub_items: item.sub_items,
          time_from: item.time_from,
          time_to: item.time_to,
          duration_mins: item.duration_mins,
          target_value: item.target_value,
          is_break: item.is_break,
          frequency: item.frequency,
          frequency_days: item.frequency_days,
          created_by: user.id,
          created_by_name: profile.name || 'Unknown',
        }));

        const { error } = await supabase.from('daily_flow_templates').insert(rows as any);
        if (!error) successCount++;
      }

      toast.success(`Template applied to ${successCount} employee(s)`);
      setAssignOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAssigning(false);
    }
  };

  const exportTemplate = async (t: LibraryTemplate) => {
    const items = await fetchItems(t.id);
    const rows = items.map(item => ({
      'Sl No': item.sl_no,
      'Task Name': item.description,
      'Sub Tasks': (item.sub_items || []).join(', '),
      'Start Time': item.time_from,
      'End Time': item.time_to,
      'Duration (min)': item.duration_mins,
      'Target': item.target_value,
      'Frequency': item.frequency,
      'Break': item.is_break ? 'Yes' : 'No',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 6 }];
    XLSX.utils.book_append_sheet(wb, ws, t.template_name.slice(0, 31));
    XLSX.writeFile(wb, `template_${t.template_name.replace(/\s+/g, '_')}.xlsx`);
    toast.success('Template exported');
  };

  const exportAll = async () => {
    const wb = XLSX.utils.book_new();
    for (const t of templates) {
      const items = await fetchItems(t.id);
      const rows = items.map(item => ({
        'Task Name': item.description,
        'Sub Tasks': (item.sub_items || []).join(', '),
        'Start Time': item.time_from,
        'End Time': item.time_to,
        'Duration': item.duration_mins,
        'Target': item.target_value,
        'Frequency': item.frequency,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, t.template_name.slice(0, 31));
    }
    XLSX.writeFile(wb, `template_library_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Library exported');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search templates..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex gap-1 border rounded-lg p-0.5">
          <Button size="icon" variant={viewMode === 'grid' ? 'secondary' : 'ghost'} className="h-7 w-7" onClick={() => setViewMode('grid')}>
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant={viewMode === 'list' ? 'secondary' : 'ghost'} className="h-7 w-7" onClick={() => setViewMode('list')}>
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={exportAll} disabled={templates.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Export All
        </Button>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> New Template
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground animate-pulse">Loading templates...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {search ? 'No templates match your search.' : 'No templates in library yet. Create one to get started!'}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(t => (
            <Card key={t.id} className="hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => openDetail(t)}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-sm">{t.template_name}</h3>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.description}</p>}
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{t.category}</Badge>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs gap-1"><Target className="h-3 w-3" />{t.task_count} tasks</Badge>
                  <Badge variant="outline" className="text-xs gap-1"><Clock className="h-3 w-3" />{t.total_duration_mins} min</Badge>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(t)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleDuplicate(t)}><Copy className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openAssign(t)}><Users className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => exportTemplate(t)}><Download className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleDelete(t.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 text-left">Template</th>
                <th className="p-2 text-left">Category</th>
                <th className="p-2 text-center">Tasks</th>
                <th className="p-2 text-center">Duration</th>
                <th className="p-2 text-left">Created By</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-t hover:bg-muted/50 cursor-pointer" onClick={() => openDetail(t)}>
                  <td className="p-2 font-medium">{t.template_name}</td>
                  <td className="p-2"><Badge variant="secondary" className="text-xs">{t.category}</Badge></td>
                  <td className="p-2 text-center">{t.task_count}</td>
                  <td className="p-2 text-center">{t.total_duration_mins} min</td>
                  <td className="p-2 text-muted-foreground">{t.created_by_name}</td>
                  <td className="p-2" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openAssign(t)}><Users className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => exportTemplate(t)}><Download className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'Create Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Template Name</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g., Sales Team Daily Plan" />
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Brief description" />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formName.trim() || saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              {editingTemplate ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              {detailTemplate?.template_name}
              <Badge variant="secondary" className="text-xs">{detailTemplate?.category}</Badge>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {detailItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No tasks in this template yet. Import from employee templates or add manually.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">#</th>
                    <th className="p-2 text-left">Task</th>
                    <th className="p-2 text-left">Time</th>
                    <th className="p-2 text-center">Duration</th>
                    <th className="p-2 text-center">Target</th>
                    <th className="p-2 text-left">Frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {detailItems.map(item => (
                    <tr key={item.id} className="border-t">
                      <td className="p-2">{item.sl_no}</td>
                      <td className="p-2">{item.description}</td>
                      <td className="p-2">{item.time_from}–{item.time_to}</td>
                      <td className="p-2 text-center">{item.duration_mins}m</td>
                      <td className="p-2 text-center">{item.target_value}</td>
                      <td className="p-2 capitalize">{item.frequency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ScrollArea>
          <DialogFooter>
            {detailTemplate && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { if (detailTemplate) exportTemplate(detailTemplate); }}>
                  <Download className="h-4 w-4 mr-1" /> Export
                </Button>
                <Button size="sm" onClick={() => { setDetailOpen(false); if (detailTemplate) openAssign(detailTemplate); }}>
                  <Users className="h-4 w-4 mr-1" /> Apply to Employees
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Modal */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply "{assignTemplate?.template_name}" to Employees</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">This will replace existing templates for selected employees.</p>
          <ScrollArea className="max-h-[300px] border rounded-lg">
            <div className="p-2 space-y-1">
              {employees.map(emp => (
                <label key={emp.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                  <Checkbox
                    checked={selectedEmployees.has(emp.id)}
                    onCheckedChange={() => toggleEmployee(emp.id)}
                  />
                  <span className="text-sm">{emp.name}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={selectedEmployees.size === 0 || assigning}>
              {assigning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Apply to {selectedEmployees.size} Employee(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
