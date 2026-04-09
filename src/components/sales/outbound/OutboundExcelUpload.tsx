import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOutboundContacts, ParsedRow, ImportResult } from "@/hooks/useOutboundContacts";
import { useAuth } from "@/hooks/useAuth";
import * as XLSX from "xlsx";

const COLUMN_MAP: Record<string, keyof ParsedRow> = {
  'region': 'region',
  'city': 'city',
  'company': 'company_name',
  'company name': 'company_name',
  'company_name': 'company_name',
  'organization': 'company_name',
  'organisation': 'company_name',
  'name': 'contact_name',
  'contact name': 'contact_name',
  'contact_name': 'contact_name',
  'person name': 'contact_name',
  'designation': 'designation',
  'title': 'designation',
  'position': 'designation',
  'email': 'email',
  'email id': 'email',
  'email address': 'email',
  'phone': 'phone',
  'phone number': 'phone',
  'mobile': 'phone',
  'contact number': 'phone',
  'linkedin': 'linkedin_url',
  'linkedin url': 'linkedin_url',
  'linkedin_url': 'linkedin_url',
  'linkedin profile': 'linkedin_url',
  'address': 'address',
  'website': 'website',
  'notes': 'notes',
  'remarks': 'notes',
  'event': 'notes',
  'event name': 'notes',
  'source': 'source',
};

function normalizeHeader(h: string): keyof ParsedRow | undefined {
  const cleaned = h.toLowerCase().trim().replace(/[_\-\.]/g, ' ');
  return COLUMN_MAP[cleaned];
}

function detectSourceType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.includes('event')) return 'events';
  return 'hospitality';
}

export function OutboundExcelUpload() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [parsing, setParsing] = useState(false);

  const { importContacts, logUpload } = useOutboundContacts();
  const { user, profile } = useAuth();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);
    setParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sourceType = detectSourceType(file.name);
      const allRows: ParsedRow[] = [];

      setSheetNames(wb.SheetNames);

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
        if (jsonData.length === 0) continue;

        const rawHeaders = Object.keys(jsonData[0]);
        const mappedHeaders = rawHeaders.map(normalizeHeader);

        for (const row of jsonData) {
          const parsed: any = {};
          rawHeaders.forEach((h, i) => {
            const mapped = mappedHeaders[i];
            if (mapped) parsed[mapped] = String(row[h] || '').trim();
          });
          if (!parsed.contact_name && !parsed.email) return;
          if (!parsed.contact_name) parsed.contact_name = parsed.email;
          parsed.source_sheet = sheetName;
          parsed.source_type = sourceType;
          allRows.push(parsed as ParsedRow);
        }
      }

      setParsedRows(allRows);
    } catch (err) {
      console.error('Parse error:', err);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) return;
    const result = await importContacts.mutateAsync(parsedRows);
    setImportResult(result);

    logUpload.mutate({
      file_name: fileName,
      total_rows: result.total,
      new_records: result.created,
      updated_records: result.updated,
      failed_rows: result.failed,
      failed_details: result.failedDetails as any,
      uploaded_by: profile?.full_name || user?.email || 'Unknown',
      uploaded_by_id: user?.id || '',
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="w-5 h-5 text-primary" />
            Upload Outbound Contacts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">{fileName || 'Click to select Excel file'}</p>
            <p className="text-sm text-muted-foreground mt-1">Supports .xlsx, .xls, .csv — All sheets will be parsed</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />
        </CardContent>
      </Card>

      {parsing && (
        <Card>
          <CardContent className="p-6 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Parsing all sheets...
          </CardContent>
        </Card>
      )}

      {parsedRows.length > 0 && !importResult && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-lg">Preview ({parsedRows.length} rows)</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Layers className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {sheetNames.length} sheet{sheetNames.length > 1 ? 's' : ''}: {sheetNames.join(', ')}
                  </span>
                </div>
              </div>
              <Button onClick={handleImport} disabled={importContacts.isPending}>
                {importContacts.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</>
                ) : (
                  `Import ${parsedRows.length} Contacts`
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-2 font-medium">#</th>
                    <th className="text-left p-2 font-medium">Sheet</th>
                    <th className="text-left p-2 font-medium">Name</th>
                    <th className="text-left p-2 font-medium">Company</th>
                    <th className="text-left p-2 font-medium">Email</th>
                    <th className="text-left p-2 font-medium">Phone</th>
                    <th className="text-left p-2 font-medium">City</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">{row.source_sheet}</Badge>
                      </td>
                      <td className="p-2">{row.contact_name}</td>
                      <td className="p-2">{row.company_name || '-'}</td>
                      <td className="p-2">{row.email || '-'}</td>
                      <td className="p-2">{row.phone || '-'}</td>
                      <td className="p-2">{row.city || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedRows.length > 50 && (
                <p className="text-center text-sm text-muted-foreground py-2">
                  Showing 50 of {parsedRows.length} rows
                </p>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {importResult && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" /> Import Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{importResult.total}</p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-500/10">
                <p className="text-2xl font-bold text-green-600">{importResult.created}</p>
                <p className="text-xs text-muted-foreground">New Created</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-500/10">
                <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                <p className="text-xs text-muted-foreground">Updated (Deduped)</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-amber-500/10">
                <p className="text-2xl font-bold text-amber-600">{importResult.reviewed}</p>
                <p className="text-xs text-muted-foreground">Flagged for Review</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-500/10">
                <p className="text-2xl font-bold text-red-600">{importResult.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>

            {importResult.sheetStats.length > 1 && (
              <div className="mb-4">
                <p className="text-sm font-medium mb-2">Per-Sheet Breakdown</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {importResult.sheetStats.map(s => (
                    <div key={s.sheet} className="p-2 rounded border text-sm flex items-center justify-between">
                      <Badge variant="outline">{s.sheet}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {s.rows} rows → {s.created} new, {s.updated} updated
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {importResult.failedDetails.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium mb-2 flex items-center gap-1">
                  <XCircle className="w-4 h-4 text-red-500" /> Failed Rows
                </p>
                <ScrollArea className="h-[120px]">
                  {importResult.failedDetails.map((f, i) => (
                    <div key={i} className="text-sm flex gap-2 py-1">
                      <Badge variant="outline" className="text-xs">Row {f.row}</Badge>
                      <span className="text-muted-foreground">{f.reason}</span>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}

            <Button variant="outline" className="mt-4" onClick={() => {
              setImportResult(null);
              setParsedRows([]);
              setFileName('');
              setSheetNames([]);
              if (fileRef.current) fileRef.current.value = '';
            }}>
              Upload Another File
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
