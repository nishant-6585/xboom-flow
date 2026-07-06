import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, ExternalLink, Download, RotateCcw, X, Loader2, Mail, MailCheck, MailX, MailMinus, BookOpen, AlertOctagon } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DocumentViewer } from '@/components/hr/DocumentViewer';
import { OrderInvoice } from '@/hooks/useOrderInvoices';
import { fetchInvoiceEmailLogs, sendInvoiceEmail, InvoiceEmailLog, isValidEmail, INVOICE_EMAIL_EVENT } from '@/lib/invoiceEmail';
import type { ZohoBookInv } from '@/hooks/useZohoBooksInvoicesForOrder';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  invoices: OrderInvoice[];
  /** Show regenerate action on XBoom proformas */
  canRegenerate?: boolean;
  onRegenerate?: (inv: OrderInvoice) => void;
  /** Allow deletion */
  canDelete?: boolean;
  onDelete?: (inv: OrderInvoice) => void;
  /** Live Zoho Books data keyed by order_invoices.id — merged inline on the matching row. */
  zohoMetaByInvoiceId?: Record<string, ZohoBookInv>;
}

export function InvoiceListCard({ invoices, canRegenerate, onRegenerate, canDelete, onDelete, zohoMetaByInvoiceId }: Props) {
  const [viewer, setViewer] = useState<{ open: boolean; url: string | null; name: string; fileType: string }>({
    open: false, url: null, name: '', fileType: '',
  });
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, InvoiceEmailLog>>({});
  const [resendingId, setResendingId] = useState<string | null>(null);

  const refreshLogs = async () => {
    const ids = invoices.map((i) => i.id);
    if (ids.length === 0) return;
    setLogs(await fetchInvoiceEmailLogs(ids));
  };

  useEffect(() => { refreshLogs(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [invoices.map((i) => i.id).join(',')]);

  // Refresh email-status badges immediately when any send/skip happens elsewhere in the app.
  useEffect(() => {
    const ids = new Set(invoices.map((i) => i.id));
    const handler = (e: Event) => {
      const invoiceId = (e as CustomEvent).detail?.invoiceId;
      if (!invoiceId || ids.has(invoiceId)) refreshLogs();
    };
    window.addEventListener(INVOICE_EMAIL_EVENT, handler);
    return () => window.removeEventListener(INVOICE_EMAIL_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices.map((i) => i.id).join(',')]);

  const handleResend = async (inv: OrderInvoice) => {
    const existing = logs[inv.id];
    const prefill = existing?.to_email || '';
    const email = window.prompt('Send invoice to customer email:', prefill);
    if (!email) return;
    if (!isValidEmail(email)) { toast.error('Invalid email address'); return; }
    setResendingId(inv.id);
    const r = await sendInvoiceEmail({ invoice_id: inv.id, to_email: email.trim(), mode: 'manual', force: true });
    setResendingId(null);
    if (r.ok) refreshLogs();
  };

  const openInvoice = async (inv: OrderInvoice, mode: 'preview' | 'download') => {
    setOpeningId(inv.id);
    try {
      const { data, error } = await supabase.storage
        .from('invoices')
        .createSignedUrl(inv.storage_path, 300);
      if (error || !data?.signedUrl) {
        toast.error('Failed to open invoice.');
        return;
      }
      const fileName = inv.file_name || inv.storage_path.split('/').pop() || 'Invoice';
      const fileType = (fileName.split('.').pop() || '').toLowerCase();

      if (mode === 'download') {
        try {
          const res = await fetch(data.signedUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        } catch {
          // Fallback: just open the signed URL
          window.open(data.signedUrl, '_blank');
        }
        return;
      }

      // Preview path
      try {
        const res = await fetch(data.signedUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        if (viewer.url?.startsWith('blob:')) URL.revokeObjectURL(viewer.url);
        setViewer({ open: true, url: blobUrl, name: fileName, fileType });
      } catch {
        setViewer({ open: true, url: data.signedUrl, name: fileName, fileType });
      }
    } catch (err: any) {
      console.error('Error opening invoice:', err);
      toast.error('Failed to open invoice.');
    } finally {
      setOpeningId(null);
    }
  };

  if (invoices.length === 0) return null;

  return (
    <>
      <div className="space-y-2">
        {invoices.map((inv) => {
          const isXboom = inv.source === 'xboom';
          const isProforma = inv.document_type === 'proforma';
          const zoho = zohoMetaByInvoiceId?.[inv.id];
          const isVoid = zoho?.status?.toLowerCase() === 'void';
          const zohoUrl = zoho ? `https://books.zoho.com/app#/invoices/${zoho.invoice_id}` : null;
          return (
            <div key={inv.id} className="p-3 bg-background rounded-lg border space-y-2">
              <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                <Button
                  variant="link"
                  className="text-primary hover:underline flex items-center gap-2 text-sm p-0 h-auto text-left"
                  onClick={() => openInvoice(inv, 'preview')}
                  disabled={openingId === inv.id}
                >
                  {openingId === inv.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate">
                    {inv.invoice_number ? `${isProforma ? 'Proforma' : 'Invoice'} ${inv.invoice_number}` : (inv.file_name || 'Invoice')}
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </Button>
                <Badge
                  variant="outline"
                  className={isXboom
                    ? 'border-orange-500 text-orange-700 dark:text-orange-400 cursor-pointer'
                    : 'border-blue-500 text-blue-700 dark:text-blue-400 cursor-pointer'}
                  onClick={() => openInvoice(inv, 'preview')}
                  title="Click to preview"
                >
                  {isXboom ? 'XBoom' : 'Zoho'}
                </Badge>
                <Badge
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => openInvoice(inv, 'preview')}
                  title="Click to preview"
                >
                  {isProforma ? 'Proforma' : 'Tax Invoice'}
                </Badge>
                {zoho && !isVoid && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className={
                            zoho.status?.toLowerCase() === 'paid'
                              ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                              : zoho.status?.toLowerCase() === 'overdue'
                                ? 'border-red-500 text-red-700 dark:text-red-400'
                                : 'border-amber-500 text-amber-700 dark:text-amber-400'
                          }
                        >
                          {zoho.status ?? '—'}
                        </Badge>
                      </TooltipTrigger>
                      {zoho.match_method && (
                        <TooltipContent className="text-xs">
                          Matched to Zoho via {zoho.match_method}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
                {isVoid && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertOctagon className="h-3 w-3" /> VOIDED in Zoho
                  </Badge>
                )}
                {(() => {
                  const log = logs[inv.id];
                  if (!log) return null;
                  if (log.status === 'sent') return (
                    <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-400 gap-1" title={`Sent to ${log.to_email} on ${new Date(log.attempted_at).toLocaleString()}`}>
                      <MailCheck className="h-3 w-3" /> Sent
                    </Badge>
                  );
                  if (log.status === 'failed') return (
                    <Badge variant="outline" className="border-red-500 text-red-700 dark:text-red-400 gap-1" title={log.error || 'Send failed'}>
                      <MailX className="h-3 w-3" /> Email failed
                    </Badge>
                  );
                  return (
                    <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400 gap-1" title={log.bypass_reason || 'Skipped'}>
                      <MailMinus className="h-3 w-3" /> Skipped
                    </Badge>
                  );
                })()}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Resend invoice email to customer"
                  onClick={() => handleResend(inv)}
                  disabled={resendingId === inv.id}
                >
                  {resendingId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Download"
                  onClick={() => openInvoice(inv, 'download')}
                  disabled={openingId === inv.id}
                >
                  <Download className="h-4 w-4" />
                </Button>
                {zohoUrl && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Open in Zoho Books"
                    asChild
                  >
                    <a href={zohoUrl} target="_blank" rel="noopener noreferrer">
                      <BookOpen className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                {canRegenerate && isXboom && isProforma && onRegenerate && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Regenerate proforma (overwrites this file, keeps number)"
                    onClick={() => onRegenerate(inv)}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                {canDelete && onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    title="Remove attachment"
                    onClick={() => onDelete(inv)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              </div>
              {zoho && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pl-6">
                  {zoho.date && <span>{format(new Date(zoho.date), 'dd MMM yyyy')}</span>}
                  <span>
                    Total <span className="font-medium text-foreground">{Number(zoho.total ?? 0).toLocaleString()}</span>
                  </span>
                  <span>
                    Balance{' '}
                    <span className={`font-medium ${Number(zoho.balance ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {Number(zoho.balance ?? 0).toLocaleString()}
                    </span>
                  </span>
                  <span>
                    Paid {Number((zoho.total ?? 0) - (zoho.balance ?? 0)).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <DocumentViewer
        open={viewer.open}
        onOpenChange={(o) => {
          if (!o && viewer.url?.startsWith('blob:')) {
            const u = viewer.url;
            setTimeout(() => URL.revokeObjectURL(u), 1000);
          }
          setViewer((prev) => ({ ...prev, open: o }));
        }}
        url={viewer.url}
        name={viewer.name}
        fileType={viewer.fileType}
      />
    </>
  );
}