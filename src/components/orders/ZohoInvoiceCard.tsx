import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2, Eye, Download, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { DocumentViewer } from "@/components/hr/DocumentViewer";
import type { ZohoBookInv } from "@/hooks/useZohoBooksInvoicesForOrder";

/**
 * Renders Zoho Books invoices that are LINKED to the order but NOT yet
 * present as an attached order_invoices row. Attached mirrors are shown
 * inline on the unified invoice attachment card instead.
 */
export function ZohoInvoiceCard({
  orderNumber,
  orderId,
  invoices,
  loading,
  onAttached,
}: {
  orderNumber?: string | null;
  orderId?: string | null;
  invoices: ZohoBookInv[];
  loading?: boolean;
  onAttached?: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ open: boolean; url: string | null; name: string }>({
    open: false,
    url: null,
    name: "",
  });

  const fetchPdf = async (invoiceId: string, mode: "preview" | "download", fileName: string) => {
    setBusyId(invoiceId + ":" + mode);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const projectUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const resp = await fetch(
        `${projectUrl}/functions/v1/zoho-invoice-pdf?invoice_id=${encodeURIComponent(invoiceId)}&mode=${mode}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j?.error || `Failed (${resp.status})`);
      }
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (mode === "download") {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      } else {
        if (viewer.url?.startsWith("blob:")) URL.revokeObjectURL(viewer.url);
        setViewer({ open: true, url: blobUrl, name: fileName });
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not load Zoho PDF");
    } finally {
      setBusyId(null);
    }
  };

  const attach = async (invoiceId: string) => {
    if (!orderId) {
      toast.error("Cannot attach: missing order id");
      return;
    }
    setBusyId(invoiceId + ":attach");
    try {
      const { error } = await supabase.functions.invoke("zoho-invoice-attach", {
        body: { zoho_invoice_id: invoiceId, order_id: orderId },
      });
      if (error) throw error;
      toast.success("Invoice PDF attached from Zoho");
      onAttached?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to attach invoice");
    } finally {
      setBusyId(null);
    }
  };

  if (!orderNumber) return null;
  // Nothing to render if all mirrors are already attached and we're not loading.
  if (!loading && invoices.length === 0) return null;

  return (
    <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <BookOpen className="h-4 w-4" /> Zoho Books invoice (not yet attached)
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      {invoices.length > 0 && (
        <div className="space-y-1.5">
          {invoices.map((inv) => {
            const paid = (inv.total ?? 0) - (inv.balance ?? 0);
            const fileName = `${inv.invoice_number ?? inv.invoice_id}.pdf`;
            return (
              <div key={inv.invoice_id} className="text-sm border rounded px-2 py-1.5 bg-background">
                <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-medium">{inv.invoice_number ?? inv.invoice_id}</span>
                  <Badge variant="outline" className="text-xs">{inv.status ?? "—"}</Badge>
                  {inv.match_method && (
                    <Badge variant="secondary" className="text-[10px]">via {inv.match_method}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-xs text-right">
                    <div>{inv.date ? format(new Date(inv.date), "dd MMM yyyy") : ""}</div>
                    <div className="text-muted-foreground">
                      Total <span className="font-medium text-foreground">{Number(inv.total ?? 0).toLocaleString()}</span>
                      {" · "}Balance <span className={`font-medium ${Number(inv.balance ?? 0) > 0 ? "text-amber-600" : "text-emerald-600"}`}>{Number(inv.balance ?? 0).toLocaleString()}</span>
                      {" · "}Paid {Number(paid).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="View PDF"
                      onClick={() => fetchPdf(inv.invoice_id, "preview", fileName)}
                      disabled={busyId === inv.invoice_id + ":preview"}
                    >
                      {busyId === inv.invoice_id + ":preview"
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Download PDF"
                      onClick={() => fetchPdf(inv.invoice_id, "download", fileName)}
                      disabled={busyId === inv.invoice_id + ":download"}
                    >
                      {busyId === inv.invoice_id + ":download"
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Download className="h-3.5 w-3.5" />}
                    </Button>
                    {orderId && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        title="Download the PDF from Zoho and attach it to this order"
                        onClick={() => attach(inv.invoice_id)}
                        disabled={busyId === inv.invoice_id + ":attach"}
                      >
                        {busyId === inv.invoice_id + ":attach"
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Paperclip className="h-3.5 w-3.5" />}
                        Attach PDF
                      </Button>
                    )}
                  </div>
                </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <DocumentViewer
        open={viewer.open}
        onOpenChange={(o) => {
          if (!o && viewer.url?.startsWith("blob:")) {
            const u = viewer.url;
            setTimeout(() => URL.revokeObjectURL(u), 1000);
          }
          setViewer((p) => ({ ...p, open: o }));
        }}
        url={viewer.url}
        name={viewer.name}
        fileType="pdf"
      />
    </div>
  );
}