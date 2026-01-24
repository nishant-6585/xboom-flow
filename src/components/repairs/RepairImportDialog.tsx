import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RepairIssueType, RepairPaymentStatus, ISSUE_TYPES, PAYMENT_STATUSES } from "@/hooks/useRepairs";
import * as XLSX from "xlsx";
import { format } from "date-fns";

interface RepairImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ParsedRepair {
  customer_name: string;
  model_name: string;
  date_of_receipt: string;
  contact_no: string;
  issue_details?: string;
  issue_type: RepairIssueType;
  components_replaced: { name: string; cost: number }[];
  total_component_cost: number;
  inspection_charges: number;
  repair_cost_charged: number;
  date_completed?: string | null;
  committed_date?: string | null;
  payment_status: RepairPaymentStatus;
  advance_amount: number;
  total_quote_amount: number;
  notes?: string;
  isValid: boolean;
  errors: string[];
}

const ISSUE_TYPE_MAP: Record<string, RepairIssueType> = {
  'motor failure': 'motor_failure',
  'motor': 'motor_failure',
  'gimbal issue': 'gimbal_issue',
  'gimbal': 'gimbal_issue',
  'camera damage': 'camera_damage',
  'camera': 'camera_damage',
  'battery problem': 'battery_problem',
  'battery': 'battery_problem',
  'gps issue': 'gps_issue',
  'gps': 'gps_issue',
  'remote controller': 'remote_controller',
  'remote': 'remote_controller',
  'controller': 'remote_controller',
  'propeller damage': 'propeller_damage',
  'propeller': 'propeller_damage',
  'frame damage': 'frame_damage',
  'frame': 'frame_damage',
  'flight controller': 'flight_controller',
  'fc': 'flight_controller',
  'esc issue': 'esc_issue',
  'esc': 'esc_issue',
  'software issue': 'software_issue',
  'software': 'software_issue',
  'water damage': 'water_damage',
  'water': 'water_damage',
  'crash damage': 'crash_damage',
  'crash': 'crash_damage',
  'other': 'other',
};

const PAYMENT_STATUS_MAP: Record<string, RepairPaymentStatus> = {
  'pending': 'pending',
  'partial': 'partial',
  'paid': 'paid',
  'completed': 'paid',
  'done': 'paid',
};

export function RepairImportDialog({ open, onOpenChange, onSuccess }: RepairImportDialogProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRepair[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);

  const resetState = () => {
    setFile(null);
    setParsedData([]);
    setImportResult(null);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const parseExcelDate = (value: any): string => {
    if (!value) return format(new Date(), "yyyy-MM-dd");
    
    // If it's already a string in date format
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return format(parsed, "yyyy-MM-dd");
      }
      return format(new Date(), "yyyy-MM-dd");
    }
    
    // Excel serial date number
    if (typeof value === 'number') {
      const date = new Date((value - 25569) * 86400 * 1000);
      return format(date, "yyyy-MM-dd");
    }
    
    return format(new Date(), "yyyy-MM-dd");
  };

  const parseComponents = (value: any): { name: string; cost: number }[] => {
    if (!value) return [];
    
    const str = String(value).trim();
    if (!str) return [];
    
    // Format expected: "Component1:1000, Component2:2000" or "Component1-1000; Component2-2000"
    const components: { name: string; cost: number }[] = [];
    const parts = str.split(/[,;]/);
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      
      // Try different separators
      let name = trimmed;
      let cost = 0;
      
      const colonMatch = trimmed.match(/^(.+?):(\d+(?:\.\d+)?)$/);
      const dashMatch = trimmed.match(/^(.+?)-(\d+(?:\.\d+)?)$/);
      
      if (colonMatch) {
        name = colonMatch[1].trim();
        cost = parseFloat(colonMatch[2]);
      } else if (dashMatch) {
        name = dashMatch[1].trim();
        cost = parseFloat(dashMatch[2]);
      }
      
      if (name) {
        components.push({ name, cost: isNaN(cost) ? 0 : cost });
      }
    }
    
    return components;
  };

  const parseIssueType = (value: any): RepairIssueType => {
    if (!value) return 'other';
    const normalized = String(value).toLowerCase().trim();
    return ISSUE_TYPE_MAP[normalized] || 'other';
  };

  const parsePaymentStatus = (value: any): RepairPaymentStatus => {
    if (!value) return 'pending';
    const normalized = String(value).toLowerCase().trim();
    return PAYMENT_STATUS_MAP[normalized] || 'pending';
  };

  const parseNumber = (value: any): number => {
    if (!value) return 0;
    const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? 0 : num;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsProcessing(true);
    setParsedData([]);
    setImportResult(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      const parsed: ParsedRepair[] = jsonData.map((row: any) => {
        const errors: string[] = [];
        
        // Required fields validation
        const customerName = String(row['Customer Name'] || row['customer_name'] || row['CustomerName'] || '').trim();
        const modelName = String(row['Model Name'] || row['model_name'] || row['ModelName'] || row['Model'] || '').trim();
        const contactNo = String(row['Contact No'] || row['contact_no'] || row['ContactNo'] || row['Contact'] || row['Phone'] || '').trim();
        
        if (!customerName) errors.push('Customer Name is required');
        if (!modelName) errors.push('Model Name is required');
        if (!contactNo) errors.push('Contact No is required');

        const components = parseComponents(row['Components Replaced'] || row['components_replaced'] || row['Components'] || '');
        const totalComponentCost = components.reduce((sum, c) => sum + c.cost, 0);

        return {
          customer_name: customerName,
          model_name: modelName,
          date_of_receipt: parseExcelDate(row['Date of Receipt'] || row['date_of_receipt'] || row['Receipt Date'] || ''),
          contact_no: contactNo,
          issue_details: String(row['Issue Details'] || row['issue_details'] || row['Issue'] || '').trim() || undefined,
          issue_type: parseIssueType(row['Issue Type'] || row['issue_type'] || row['IssueType'] || ''),
          components_replaced: components,
          total_component_cost: totalComponentCost,
          inspection_charges: parseNumber(row['Inspection Charges'] || row['inspection_charges'] || row['Inspection'] || 0),
          repair_cost_charged: parseNumber(row['Repair Cost'] || row['repair_cost_charged'] || row['Repair Cost Charged'] || 0),
          date_completed: row['Date Completed'] || row['date_completed'] ? parseExcelDate(row['Date Completed'] || row['date_completed']) : null,
          committed_date: row['Committed Date'] || row['committed_date'] ? parseExcelDate(row['Committed Date'] || row['committed_date']) : null,
          payment_status: parsePaymentStatus(row['Payment Status'] || row['payment_status'] || row['PaymentStatus'] || ''),
          advance_amount: parseNumber(row['Advance Amount'] || row['advance_amount'] || row['Advance'] || 0),
          total_quote_amount: parseNumber(row['Total Quote'] || row['total_quote_amount'] || row['Quote Amount'] || row['Total'] || 0),
          notes: String(row['Notes'] || row['notes'] || '').trim() || undefined,
          isValid: errors.length === 0,
          errors,
        };
      });

      setParsedData(parsed);
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      toast({
        title: "Error",
        description: "Failed to parse the Excel file. Please check the format.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async () => {
    if (!user || !profile) return;
    
    const validRecords = parsedData.filter(r => r.isValid);
    if (validRecords.length === 0) {
      toast({
        title: "No valid records",
        description: "Please fix the errors in your data before importing.",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    let success = 0;
    let failed = 0;

    for (const record of validRecords) {
      try {
        const { error } = await supabase.from('repairs').insert({
          customer_name: record.customer_name,
          model_name: record.model_name,
          date_of_receipt: record.date_of_receipt,
          contact_no: record.contact_no,
          issue_details: record.issue_details || null,
          issue_type: record.issue_type,
          components_replaced: JSON.parse(JSON.stringify(record.components_replaced)),
          total_component_cost: record.total_component_cost,
          inspection_charges: record.inspection_charges,
          repair_cost_charged: record.repair_cost_charged,
          date_completed: record.date_completed || null,
          committed_date: record.committed_date || null,
          payment_status: record.payment_status,
          advance_amount: record.advance_amount,
          total_quote_amount: record.total_quote_amount,
          notes: record.notes || null,
          created_by: user.id,
          created_by_name: profile.name || 'Unknown',
        });

        if (error) {
          console.error('Insert error:', error);
          failed++;
        } else {
          success++;
        }
      } catch (error) {
        console.error('Import error:', error);
        failed++;
      }
    }

    setImportResult({ success, failed });
    setIsImporting(false);

    if (success > 0) {
      toast({
        title: "Import Complete",
        description: `Successfully imported ${success} repair${success > 1 ? 's' : ''}${failed > 0 ? `, ${failed} failed` : ''}.`,
      });
      onSuccess();
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        'Customer Name': 'John Doe',
        'Model Name': 'DJI Mavic 3',
        'Date of Receipt': format(new Date(), 'yyyy-MM-dd'),
        'Contact No': '9876543210',
        'Issue Type': 'Motor Failure',
        'Issue Details': 'Front left motor not spinning',
        'Components Replaced': 'Motor:2500, ESC:1500',
        'Inspection Charges': 500,
        'Repair Cost': 1500,
        'Total Quote': 6000,
        'Advance Amount': 2000,
        'Payment Status': 'Partial',
        'Committed Date': format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
        'Date Completed': '',
        'Notes': 'Customer requested express repair',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Repairs');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 },
    ];

    XLSX.writeFile(wb, 'repair_import_template.xlsx');
  };

  const validCount = parsedData.filter(r => r.isValid).length;
  const invalidCount = parsedData.filter(r => !r.isValid).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Repairs from Excel
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file to bulk import repair records. Download the template for the correct format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <p className="font-medium">Download Template</p>
              <p className="text-sm text-muted-foreground">Use this template to ensure correct data format</p>
            </div>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label>Select Excel File</Label>
            <div className="flex gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="flex-1"
              />
            </div>
          </div>

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2">Processing file...</span>
            </div>
          )}

          {/* Parsed Data Preview */}
          {parsedData.length > 0 && !isProcessing && (
            <>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span>{validCount} valid record{validCount !== 1 ? 's' : ''}</span>
                </div>
                {invalidCount > 0 && (
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    <span>{invalidCount} invalid record{invalidCount !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>

              <ScrollArea className="h-[300px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30px]">Status</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Issue Type</TableHead>
                      <TableHead>Quote</TableHead>
                      <TableHead>Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.map((record, index) => (
                      <TableRow key={index} className={!record.isValid ? 'bg-red-50 dark:bg-red-950' : ''}>
                        <TableCell>
                          {record.isValid ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-red-600" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{record.customer_name || '-'}</TableCell>
                        <TableCell>{record.model_name || '-'}</TableCell>
                        <TableCell>{record.contact_no || '-'}</TableCell>
                        <TableCell>{ISSUE_TYPES.find(t => t.value === record.issue_type)?.label || record.issue_type}</TableCell>
                        <TableCell>₹{record.total_quote_amount.toLocaleString()}</TableCell>
                        <TableCell>{PAYMENT_STATUSES.find(s => s.value === record.payment_status)?.label}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {invalidCount > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {invalidCount} record{invalidCount !== 1 ? 's have' : ' has'} errors and will be skipped during import.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}

          {/* Import Result */}
          {importResult && (
            <Alert className={importResult.failed > 0 ? 'border-yellow-500' : 'border-green-500'}>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Import complete: {importResult.success} successful, {importResult.failed} failed.
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={handleClose}>
              {importResult ? 'Close' : 'Cancel'}
            </Button>
            {parsedData.length > 0 && validCount > 0 && !importResult && (
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import {validCount} Record{validCount !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
