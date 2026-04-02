import { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface ParsedRow {
  rowNum: number;
  employee_name: string;
  employee_id: string | null;
  task_name: string;
  sub_tasks: string[];
  start_time: string;
  end_time: string;
  duration_mins: number;
  frequency: string;
  target: number;
  is_break: boolean;
  errors?: string[];
  warning?: string;
}

interface ValidationResult {
  valid_rows: ParsedRow[];
  invalid_rows: ParsedRow[];
  total: number;
  existing_templates: string[];
}

interface ImportResult {
  success: boolean;
  total: number;
  successful: number;
  failed: number;
  errors: string[];
}

type Step = 'upload' | 'preview' | 'options' | 'result';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
  selectedDate: string;
}

export function DailyFlowImportModal({ open, onOpenChange, onImportComplete, selectedDate }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
  const [importType, setImportType] = useState<'templates' | 'entries'>('templates');
  const [conflictMode, setConflictMode] = useState<'overwrite' | 'merge' | 'skip'>('overwrite');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setValidation(null);
    setRemovedIndices(new Set());
    setImportType('templates');
    setConflictMode('overwrite');
    setImportResult(null);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const downloadSample = () => {
    const sampleData = [
      { 'Employee Name': 'John Doe', 'Task Name': 'Check Emails', 'Sub Tasks': 'Inbox, Follow-ups', 'Start Time': '09:00', 'End Time': '09:30', 'Frequency': 'daily', 'Target': 3 },
      { 'Employee Name': 'John Doe', 'Task Name': 'Team Standup', 'Sub Tasks': '', 'Start Time': '09:30', 'End Time': '10:00', 'Frequency': 'daily', 'Target': 1 },
      { 'Employee Name': 'John Doe', 'Task Name': 'Lunch Break', 'Sub Tasks': '', 'Start Time': '13:00', 'End Time': '14:00', 'Frequency': 'daily', 'Target': 0 },
      { 'Employee Name': 'Jane Smith', 'Task Name': 'Sales Calls', 'Sub Tasks': 'Cold calls, Follow-ups', 'Start Time': '10:00', 'End Time': '12:00', 'Frequency': 'daily', 'Target': 10 },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleData);
    ws['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Flow Template');
    XLSX.writeFile(wb, 'daily_flow_import_template.xlsx');
  };

  const handleFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'csv'].includes(ext || '')) {
      toast.error('Only .xlsx and .csv files are accepted');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error('File size must be under 5MB');
      return;
    }
    setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleValidate = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('action', 'validate');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Not authenticated'); return; }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-daily-flow-excel`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        }
      );

      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Validation failed'); return; }

      setValidation(data);
      setStep('preview');
    } catch (e: any) {
      toast.error(e.message || 'Failed to validate file');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !validation) return;
    setLoading(true);
    try {
      const selectedIndices = validation.valid_rows
        .map((_, i) => i)
        .filter(i => !removedIndices.has(i));

      const formData = new FormData();
      formData.append('file', file);
      formData.append('action', 'import');
      formData.append('importType', importType);
      formData.append('importDate', selectedDate);
      formData.append('conflictMode', conflictMode);
      formData.append('selectedRows', JSON.stringify(selectedIndices));

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Not authenticated'); return; }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-daily-flow-excel`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        }
      );

      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Import failed'); return; }

      setImportResult(data);
      setStep('result');
      onImportComplete();
    } catch (e: any) {
      toast.error(e.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const removeRow = (idx: number) => {
    setRemovedIndices(prev => new Set(prev).add(idx));
  };

  const activeValidRows = validation?.valid_rows.filter((_, i) => !removedIndices.has(i)) || [];
  const hasConflicts = (validation?.existing_templates?.length || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import Daily Flow from Excel
          </DialogTitle>
        </DialogHeader>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
              }`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">
                {file ? file.name : 'Drag & drop your file here, or click to browse'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Accepts .xlsx and .csv (max 500 rows)</p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".xlsx,.csv"
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
              />
            </div>

            {file && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium flex-1">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                <Button size="sm" variant="ghost" onClick={() => setFile(null)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={downloadSample}>
                <Download className="h-4 w-4 mr-1" /> Download Sample Template
              </Button>
              <Button onClick={handleValidate} disabled={!file || loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Validate & Preview
              </Button>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && validation && (
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary">{validation.total} total rows</Badge>
              <Badge className="bg-green-100 text-green-800">{activeValidRows.length} valid</Badge>
              {validation.invalid_rows.length > 0 && (
                <Badge variant="destructive">{validation.invalid_rows.length} errors</Badge>
              )}
              {removedIndices.size > 0 && (
                <Badge variant="outline">{removedIndices.size} removed</Badge>
              )}
            </div>

            <ScrollArea className="flex-1 border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Row</th>
                    <th className="p-2 text-left">Employee</th>
                    <th className="p-2 text-left">Task</th>
                    <th className="p-2 text-left">Time</th>
                    <th className="p-2 text-left">Freq</th>
                    <th className="p-2 text-left">Target</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {validation.valid_rows.map((row, i) => (
                    !removedIndices.has(i) && (
                      <tr key={`v-${i}`} className="border-t hover:bg-muted/50">
                        <td className="p-2">{row.rowNum}</td>
                        <td className="p-2">{row.employee_name}</td>
                        <td className="p-2 max-w-[150px] truncate">{row.task_name}</td>
                        <td className="p-2">{row.start_time}–{row.end_time}</td>
                        <td className="p-2 capitalize">{row.frequency}</td>
                        <td className="p-2">{row.target}</td>
                        <td className="p-2">
                          {row.warning ? (
                            <span className="flex items-center gap-1 text-amber-600">
                              <AlertTriangle className="h-3 w-3" /> {row.warning}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="h-3 w-3" /> Valid
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeRow(i)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    )
                  ))}
                  {validation.invalid_rows.map((row, i) => (
                    <tr key={`e-${i}`} className="border-t bg-destructive/5">
                      <td className="p-2">{row.rowNum}</td>
                      <td className="p-2">{row.employee_name || '—'}</td>
                      <td className="p-2 max-w-[150px] truncate">{row.task_name || '—'}</td>
                      <td className="p-2">{row.start_time}–{row.end_time}</td>
                      <td className="p-2 capitalize">{row.frequency}</td>
                      <td className="p-2">{row.target}</td>
                      <td className="p-2 text-destructive">
                        <span className="flex items-center gap-1">
                          <XCircle className="h-3 w-3" />
                          {row.errors?.join('; ')}
                        </span>
                      </td>
                      <td className="p-2"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={() => setStep('options')} disabled={activeValidRows.length === 0}>
                Continue ({activeValidRows.length} rows)
              </Button>
            </div>
          </div>
        )}

        {/* Step: Options */}
        {step === 'options' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Import As</Label>
              <RadioGroup value={importType} onValueChange={(v) => setImportType(v as any)}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="templates" id="templates" />
                  <Label htmlFor="templates">Create Templates (reusable daily plans)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="entries" id="entries" />
                  <Label htmlFor="entries">Create Daily Entries (for {selectedDate})</Label>
                </div>
              </RadioGroup>
            </div>

            {importType === 'templates' && hasConflicts && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold">
                  Existing templates found for: {validation?.existing_templates?.join(', ')}
                </Label>
                <RadioGroup value={conflictMode} onValueChange={(v) => setConflictMode(v as any)}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="overwrite" id="overwrite" />
                    <Label htmlFor="overwrite">Overwrite existing</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="merge" id="merge" />
                    <Label htmlFor="merge">Merge (add new tasks)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="skip" id="skip" />
                    <Label htmlFor="skip">Skip employees with existing templates</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('preview')}>Back</Button>
              <Button onClick={handleImport} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Import {activeValidRows.length} Rows
              </Button>
            </div>
          </div>
        )}

        {/* Step: Result */}
        {step === 'result' && importResult && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <h3 className="text-lg font-semibold">Import Complete</h3>
            <div className="flex gap-4 justify-center">
              <div className="text-center">
                <p className="text-2xl font-bold">{importResult.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{importResult.successful}</p>
                <p className="text-xs text-muted-foreground">Successful</p>
              </div>
              {importResult.failed > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-destructive">{importResult.failed}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              )}
            </div>
            {importResult.errors.length > 0 && (
              <div className="text-left bg-destructive/10 p-3 rounded text-xs space-y-1">
                {importResult.errors.map((e, i) => <p key={i} className="text-destructive">{e}</p>)}
              </div>
            )}
            <Button onClick={handleClose}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
