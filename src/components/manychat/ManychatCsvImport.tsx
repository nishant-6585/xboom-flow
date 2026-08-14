import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  useManychatCsvImport,
  type ManychatImportSummary,
} from "@/hooks/useManychatLeads";
import {
  parseCsv,
  mapCsvRows,
  FIELD_LABELS,
  type FieldKey,
  type ManychatCsvRow,
} from "@/lib/manychatCsv";

interface Props {
  /** Called after a successful import (e.g. to refetch the leads table). */
  onImported?: (summary: ManychatImportSummary) => void;
}

/**
 * ManyChat CSV backfill importer — shared by Admin → Integrations and the
 * Sales → Leads → ManyChat tab. Rows are matched on manychat_contact_id
 * first, then phone_number; new leads go through round-robin assignment.
 */
export function ManychatCsvImport({ onImported }: Props) {
  const csvImport = useManychatCsvImport();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{
    headers: string[];
    mapping: Partial<Record<FieldKey, number>>;
    rows: ManychatCsvRow[];
    usable: ManychatCsvRow[];
    unusable: number;
  } | null>(null);
  const [summary, setSummary] = useState<ManychatImportSummary | null>(null);

  const onFile = async (file: File) => {
    setSummary(null);
    setFileName(file.name);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) {
        setParsed(null);
        toast.error("CSV has no data rows");
        return;
      }
      const [headers, ...dataRows] = rows;
      const mapped = mapCsvRows(headers, dataRows);
      setParsed({ headers, ...mapped });
      if (!mapped.usable.length) {
        toast.error("No rows have a manychat_contact_id or phone_number — nothing can be imported");
      }
    } catch (e) {
      setParsed(null);
      toast.error(`Could not read CSV: ${(e as Error).message}`);
    }
  };

  const runImport = async () => {
    if (!parsed?.usable.length) return;
    setSummary(null);
    try {
      const res = await csvImport.mutateAsync(parsed.usable as unknown as Record<string, unknown>[]);
      setSummary(res);
      onImported?.(res);
    } catch {
      /* toast handled in hook */
    }
  };

  const previewRows = parsed?.rows.slice(0, 5) ?? [];
  const mappedKeys = parsed
    ? (Object.keys(FIELD_LABELS) as FieldKey[]).filter((k) => parsed.mapping[k] !== undefined)
    : [];
  const unmappedKeys = parsed
    ? (Object.keys(FIELD_LABELS) as FieldKey[]).filter((k) => parsed.mapping[k] === undefined)
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="w-3.5 h-3.5 mr-1" /> Choose ManyChat CSV
        </Button>
        {fileName ? <span className="text-xs text-muted-foreground">{fileName}</span> : null}
        {parsed ? (
          <Button size="sm" onClick={runImport} disabled={csvImport.isPending || !parsed.usable.length}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${csvImport.isPending ? "animate-spin" : ""}`} />
            Import {parsed.usable.length} row(s)
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Rows are matched on <code>manychat_contact_id</code> first, then <code>phone_number</code> — the same rules
        as the live webhook. Rows with neither are skipped, unmapped columns are stored in{" "}
        <code>custom_fields</code>, and new leads still go through round-robin assignment.
      </p>

      {parsed ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {mappedKeys.map((k) => (
              <Badge key={k} variant="secondary" className="font-mono text-[10px]">
                {FIELD_LABELS[k]} ← {parsed.headers[parsed.mapping[k]!]}
              </Badge>
            ))}
            {unmappedKeys.map((k) => (
              <Badge key={k} variant="outline" className="font-mono text-[10px] text-muted-foreground">
                {FIELD_LABELS[k]} — not found
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {parsed.rows.length} row(s) parsed · {parsed.usable.length} importable · {parsed.unusable} without an
            id/phone
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-[10px] uppercase text-muted-foreground">
                  <th className="text-left py-1.5 px-2">Contact ID</th>
                  <th className="text-left py-1.5 px-2">Name</th>
                  <th className="text-left py-1.5 px-2">Phone</th>
                  <th className="text-left py-1.5 px-2">Email</th>
                  <th className="text-left py-1.5 px-2">City</th>
                  <th className="text-left py-1.5 px-2">Tags</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1.5 px-2 font-mono">{r.manychat_contact_id || "—"}</td>
                    <td className="py-1.5 px-2">{r.customer_name || "—"}</td>
                    <td className="py-1.5 px-2">{r.phone_number || "—"}</td>
                    <td className="py-1.5 px-2">{r.email || "—"}</td>
                    <td className="py-1.5 px-2">{r.city || "—"}</td>
                    <td className="py-1.5 px-2">{r.tags.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {summary ? (
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <Badge variant="secondary">Received {summary.received}</Badge>
          <Badge variant="secondary">Created {summary.created}</Badge>
          <Badge variant="secondary">Updated {summary.updated}</Badge>
          <Badge variant="outline">Skipped {summary.skipped}</Badge>
          <Badge variant={summary.errored ? "destructive" : "outline"}>Errored {summary.errored}</Badge>
          {summary.errors?.length ? <span className="text-destructive w-full">{summary.errors[0]}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
