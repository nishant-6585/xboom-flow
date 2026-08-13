import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MetaLeadRow {
  created_at?: string;
  name?: string;
  email?: string;
  phone?: string;
  form?: string;
  channel?: string;
  source?: string;
  stage?: string;
  owner?: string;
}

const HEADER_MAP: Record<string, keyof MetaLeadRow> = {
  created: "created_at",
  "created time": "created_at",
  "created at": "created_at",
  name: "name",
  "full name": "name",
  "first name": "name",
  email: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  "secondary phone number": "phone",
  "whatsapp number": "phone",
  mobile: "phone",
  form: "form",
  channel: "channel",
  source: "source",
  stage: "stage",
  owner: "owner",
};

/** Normalizes a sheet header into a known Meta lead field. */
export function normalizeMetaHeader(header: string): keyof MetaLeadRow | undefined {
  const cleaned = header.replace(/^\uFEFF/, "").toLowerCase().trim().replace(/[_\-.]/g, " ");
  return HEADER_MAP[cleaned];
}

/** Parses raw sheet objects into Meta lead rows, dropping rows with no email and no phone. */
export function parseMetaRows(rows: Record<string, unknown>[]): MetaLeadRow[] {
  const out: MetaLeadRow[] = [];
  for (const raw of rows) {
    const parsed: MetaLeadRow = {};
    for (const key of Object.keys(raw)) {
      const mapped = normalizeMetaHeader(key);
      if (!mapped) continue;
      const value = String(raw[key] ?? "").trim();
      if (!value) continue;
      if (parsed[mapped]) continue; // keep the first non-empty value (e.g. primary phone)
      parsed[mapped] = value;
    }
    if (!parsed.email && !parsed.phone) continue;
    out.push(parsed);
  }
  return out;
}

const REPS = ["Manoj Kumar", "Srishti Suman", "Mohammed Musthak", "Narasimha", "Suman Das"];

type ImportSummary = { total: number; inserted: number; duplicates: number; skipped: number };

export interface MetaLeadsUploadProps {
  onImported?: () => void;
  /** RPC used to import the parsed rows. */
  rpc?: "import_meta_leads" | "import_indiamart_leads";
  /** Card title, e.g. "Upload IndiaMART Leads". */
  title?: string;
  /** Label used in copy + toasts (e.g. "IndiaMART"). */
  sourceLabel?: string;
}

export function MetaLeadsUpload({
  onImported,
  rpc = "import_meta_leads",
  title = "Upload Meta Leads",
  sourceLabel = "Meta",
}: MetaLeadsUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<MetaLeadRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const queryClient = useQueryClient();

  const reset = () => {
    setRows([]);
    setFileName("");
    setSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSummary(null);
    setParsing(true);
    try {
      const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
      const wb = isCsv
        ? XLSX.read(await file.text(), { type: "string", raw: true })
        : XLSX.read(await file.arrayBuffer(), { type: "array" });
      const all: MetaLeadRow[] = [];
      for (const sheetName of wb.SheetNames) {
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });
        all.push(...parseMetaRows(json));
      }
      setRows(all);
      if (all.length === 0) toast.error("No usable rows found — each lead needs an email or phone.");
    } catch (err) {
      console.error("Meta leads parse error", err);
      toast.error("Could not read that file. Please upload a valid .xlsx, .xls or .csv.");
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setImporting(true);
    try {
      const CHUNK = 500;
      const totals: ImportSummary = { total: 0, inserted: 0, duplicates: 0, skipped: 0 };
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { data, error } = await supabase.rpc(rpc, {
          p_rows: rows.slice(i, i + CHUNK) as any,
        });
        if (error) throw error;
        const r = (data ?? {}) as Partial<ImportSummary>;
        totals.total += r.total ?? 0;
        totals.inserted += r.inserted ?? 0;
        totals.duplicates += r.duplicates ?? 0;
        totals.skipped += r.skipped ?? 0;
      }
      setSummary(totals);
      toast.success(`Imported ${totals.inserted} ${sourceLabel} leads`);
      // Refresh the lead feed + counts so imported rows appear without a manual refresh
      await queryClient.invalidateQueries({ queryKey: ["unified-lead-feed"] });
      await queryClient.invalidateQueries({ queryKey: ["unified-lead-counts"] });
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      onImported?.();
    } catch (err: any) {
      console.error("Meta leads import error", err);
      toast.error(err?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="w-5 h-5 text-primary" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">{fileName || `Click to select the ${sourceLabel} leads sheet`}</p>
            <p className="text-sm text-muted-foreground mt-1">
              .xlsx, .xls or .csv — columns like Created, Name, Email address, Phone, Form, Channel
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFile}
            data-testid="meta-leads-file-input"
          />
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Every imported lead is randomly assigned to one of: {REPS.join(", ")}. Rows matching an existing
              email or phone are skipped.
            </span>
          </div>
        </CardContent>
      </Card>

      {parsing && (
        <Card>
          <CardContent className="p-6 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Reading sheet…
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && !summary && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-lg">Preview ({rows.length} leads)</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} disabled={importing}>
                  Clear
                </Button>
                <Button onClick={handleImport} disabled={importing} data-testid="meta-leads-import">
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    `Import & assign ${rows.length} leads`
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-2 font-medium">#</th>
                    <th className="text-left p-2 font-medium">Name</th>
                    <th className="text-left p-2 font-medium">Email</th>
                    <th className="text-left p-2 font-medium">Phone</th>
                    <th className="text-left p-2 font-medium">Channel</th>
                    <th className="text-left p-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2">{r.name || "-"}</td>
                      <td className="p-2">{r.email || "-"}</td>
                      <td className="p-2">{r.phone || "-"}</td>
                      <td className="p-2">
                        {r.channel ? <Badge variant="outline" className="text-xs">{r.channel}</Badge> : "-"}
                      </td>
                      <td className="p-2 text-muted-foreground">{r.created_at || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && (
                <p className="text-center text-sm text-muted-foreground py-2">
                  Showing 50 of {rows.length} rows
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" /> Import summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{summary.total}</p>
                <p className="text-xs text-muted-foreground">Rows read</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-500/10">
                <p className="text-2xl font-bold text-green-600">{summary.inserted}</p>
                <p className="text-xs text-muted-foreground">Imported &amp; assigned</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-500/10">
                <p className="text-2xl font-bold text-blue-600">{summary.duplicates}</p>
                <p className="text-xs text-muted-foreground">Already existed</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-amber-500/10">
                <p className="text-2xl font-bold text-amber-600">{summary.skipped}</p>
                <p className="text-xs text-muted-foreground">Skipped (no contact)</p>
              </div>
            </div>
            <Button variant="outline" className="mt-4" onClick={reset}>
              Upload another file
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}