import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useDailyFlow } from '@/hooks/useDailyFlow';
import { supabase } from '@/integrations/supabase/client';
import { FlowTemplateEditor } from './FlowTemplateEditor';
import { TemplateBrowser } from './TemplateBrowser';
import { DailyFlowEntryTable } from './DailyFlowEntryTable';
import { DailyFlowAnalytics } from './DailyFlowAnalytics';
import { DailyFlowImportModal } from './DailyFlowImportModal';
import { DailyFlowAISuggestions } from './DailyFlowAISuggestions';
import { TemplateLibrary } from './TemplateLibrary';
import { format, startOfMonth, subDays, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Employee {
  id: string;
  name: string;
}

export function DailyFlowPanel() {
  const { role, user, profile } = useAuth();
  const isManager = role === 'admin' || role === 'sales_manager' || role === 'hr';
  const {
    templates, entries, fetchTemplates, fetchEntries,
    saveTemplate, generateEntriesFromTemplate, updateEntry, fetchEntriesForRange,
  } = useDailyFlow();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [tab, setTab] = useState('daily');
  const [rangeEntries, setRangeEntries] = useState<any[]>([]);
  const [importModalOpen, setImportModalOpen] = useState(false);

  useEffect(() => {
    const fetchEmployees = async () => {
      const { data } = await supabase
        .from('employees')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (data) {
        setEmployees(data);
        if (!isManager && user) {
          const own = data.find((e: any) => e.id === user.id);
          if (own) {
            setSelectedEmployee(own.id);
            setSelectedEmployeeName(own.name);
          } else if (data.length > 0) {
            setSelectedEmployee(data[0].id);
            setSelectedEmployeeName(data[0].name);
          }
        }
      }
    };
    fetchEmployees();
  }, [user, isManager]);

  useEffect(() => {
    if (selectedEmployee) {
      fetchTemplates(selectedEmployee);
      fetchEntries(selectedEmployee, selectedDate);
    }
  }, [selectedEmployee, selectedDate, fetchTemplates, fetchEntries]);

  useEffect(() => {
    if (selectedEmployee && tab === 'analytics') {
      const from = format(startOfMonth(new Date(selectedDate)), 'yyyy-MM-dd');
      fetchEntriesForRange(selectedEmployee, from, selectedDate).then(setRangeEntries);
    }
  }, [selectedEmployee, selectedDate, tab, fetchEntriesForRange]);

  const handleEmployeeChange = (empId: string) => {
    setSelectedEmployee(empId);
    const emp = employees.find(e => e.id === empId);
    setSelectedEmployeeName(emp?.name || '');
  };

  const handleGenerate = () => {
    if (selectedEmployee && selectedEmployeeName) {
      generateEntriesFromTemplate(selectedEmployee, selectedEmployeeName, selectedDate);
    }
  };

  const handleRefresh = () => {
    if (selectedEmployee) {
      fetchEntries(selectedEmployee, selectedDate);
    }
  };

  const goToPrevDay = () => setSelectedDate(format(subDays(new Date(selectedDate), 1), 'yyyy-MM-dd'));
  const goToNextDay = () => setSelectedDate(format(addDays(new Date(selectedDate), 1), 'yyyy-MM-dd'));
  const goToToday = () => setSelectedDate(format(new Date(), 'yyyy-MM-dd'));

  const templateName = templates.length > 0 ? (templates[0] as any).template_name || 'Default Template' : null;

  const handleImportComplete = () => {
    if (selectedEmployee) {
      fetchTemplates(selectedEmployee);
      fetchEntries(selectedEmployee, selectedDate);
    }
  };

  const exportCurrentTemplate = () => {
    if (!templates.length || !selectedEmployeeName) return;
    const rows = templates.map((t: any) => ({
      'Employee Name': selectedEmployeeName,
      'Task Name': t.description,
      'Sub Tasks': (t.sub_items || []).join(', '),
      'Start Time': t.time_from,
      'End Time': t.time_to,
      'Frequency': t.frequency || 'daily',
      'Target': t.target_value || 0,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `template_${selectedEmployeeName.replace(/\s+/g, '_')}_${selectedDate}.xlsx`);
  };

  // AI suggestion items for analysis
  const aiItems = (tab === 'daily' ? entries : templates).map((item: any) => ({
    sl_no: item.sl_no,
    description: item.description,
    time_from: item.time_from,
    time_to: item.time_to,
    duration_mins: item.duration_mins,
    target_value: item.target_value || 0,
    is_break: item.is_break || false,
    frequency: item.frequency || 'daily',
  }));

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Employee</Label>
          <Select value={selectedEmployee} onValueChange={handleEmployeeChange}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              {employees.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-10 w-8" onClick={goToPrevDay}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-[160px]" />
            <Button size="icon" variant="outline" className="h-10 w-8" onClick={goToNextDay}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={goToToday} className="text-xs">Today</Button>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {isManager && (
            <>
              <Button variant="outline" size="sm" onClick={() => setImportModalOpen(true)}>
                <Upload className="h-4 w-4 mr-1" /> Import
              </Button>
              {templates.length > 0 && (
                <Button variant="outline" size="sm" onClick={exportCurrentTemplate}>
                  <Download className="h-4 w-4 mr-1" /> Export
                </Button>
              )}
            </>
          )}
          {templateName && selectedEmployee && (
            <div className="text-sm text-muted-foreground">
              Template: <span className="font-medium text-foreground">{templateName}</span>
            </div>
          )}
        </div>
      </div>

      {selectedEmployee ? (
        <>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="daily">Daily Report</TabsTrigger>
              {isManager && <TabsTrigger value="template">Template & Targets</TabsTrigger>}
              {isManager && <TabsTrigger value="browse">Browse Templates</TabsTrigger>}
              {isManager && <TabsTrigger value="library">Template Library</TabsTrigger>}
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="daily" className="mt-4 space-y-4">
              <DailyFlowEntryTable
                entries={entries}
                date={selectedDate}
                employeeName={selectedEmployeeName}
                onUpdateEntry={updateEntry}
                onRefresh={handleRefresh}
                onGenerate={handleGenerate}
                hasTemplate={templates.length > 0}
              />
              {entries.length > 0 && (
                <DailyFlowAISuggestions items={aiItems} employeeName={selectedEmployeeName} />
              )}
            </TabsContent>

            {isManager && (
              <TabsContent value="template" className="mt-4 space-y-4">
                <FlowTemplateEditor
                  employeeId={selectedEmployee}
                  employeeName={selectedEmployeeName}
                  templates={templates}
                  onSave={saveTemplate}
                />
                {templates.length > 0 && (
                  <DailyFlowAISuggestions items={aiItems} employeeName={selectedEmployeeName} />
                )}
              </TabsContent>
            )}

            {isManager && (
              <TabsContent value="browse" className="mt-4">
                <TemplateBrowser
                  onSelectTemplate={(empId, empName) => {
                    handleEmployeeChange(empId);
                    setTab('template');
                  }}
                />
              </TabsContent>
            )}

            {isManager && (
              <TabsContent value="library" className="mt-4">
                <TemplateLibrary />
              </TabsContent>
            )}

            <TabsContent value="analytics" className="mt-4">
              <DailyFlowAnalytics entries={entries} rangeEntries={rangeEntries} />
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          Select an employee to view or plan their daily flow.
        </div>
      )}

      {isManager && (
        <DailyFlowImportModal
          open={importModalOpen}
          onOpenChange={setImportModalOpen}
          onImportComplete={handleImportComplete}
          selectedDate={selectedDate}
        />
      )}
    </div>
  );
}
