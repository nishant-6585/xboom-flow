import { useMemo } from "react";
import { PortalLayout } from "@/portal/components/PortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, ExternalLink } from "lucide-react";
import { usePortalDocuments, DOC_GROUPS, DOC_TYPE_LABELS, type PortalDocument } from "@/portal/hooks/usePortalDocuments";

function formatBytes(b: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function DocRow({ doc }: { doc: PortalDocument }) {
  const url = doc.file_url || doc.external_url;
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
        <FileText className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{doc.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
          <span>{DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</span>
          {doc.version > 1 && <span>v{doc.version}</span>}
          {doc.file_size_bytes ? <span>{formatBytes(doc.file_size_bytes)}</span> : null}
          <span>{formatDate(doc.uploaded_at)}</span>
        </div>
      </div>
      {url ? (
        <Button asChild size="sm" variant="outline">
          <a href={url} target="_blank" rel="noopener noreferrer">
            {doc.file_url ? <Download className="h-3.5 w-3.5 mr-1.5" /> : <ExternalLink className="h-3.5 w-3.5 mr-1.5" />}
            {doc.file_url ? "Download" : "Open"}
          </a>
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">No link</span>
      )}
    </div>
  );
}

export default function PortalDocuments() {
  const { data, isLoading, error } = usePortalDocuments();

  const grouped = useMemo(() => {
    const map = new Map<string, PortalDocument[]>();
    DOC_GROUPS.forEach((g) => map.set(g.key, []));
    (data ?? []).forEach((d) => {
      const group = DOC_GROUPS.find((g) => g.types.includes(d.doc_type))?.key ?? "other";
      map.get(group)!.push(d);
    });
    return map;
  }, [data]);

  return (
    <PortalLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quotes, invoices, manuals, certificates and more — for every order on your account.
        </p>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {error && (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">Couldn't load documents.</CardContent>
        </Card>
      )}

      {!isLoading && !error && (data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <FileText className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No documents yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Documents are added as your orders progress.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {DOC_GROUPS.map((g) => {
          const docs = grouped.get(g.key) ?? [];
          if (docs.length === 0) return null;
          return (
            <Card key={g.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{g.label}</CardTitle>
              </CardHeader>
              <CardContent>
                {docs.map((d) => <DocRow key={d.id} doc={d} />)}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PortalLayout>
  );
}