import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

interface ImportRow {
  shopify_order_id: string | null;
  order_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_company: string | null;
  shipping_address: string | null;
  billing_address: string | null;
}

interface ImportResult {
  supplied: number;
  matched: number;
  updated: number;
  unmatched: number;
  skipped: number;
  unmatched_sample?: string[];
  errors?: string[];
  dry_run?: boolean;
}

const str = (v: unknown): string | null => {
  const s = v == null ? '' : String(v).trim();
  return s.length > 0 ? s : null;
};

/**
 * Shopify's export writes one row per line item. Only the first row of an order
 * carries the customer columns; continuation rows repeat `Name` and leave the
 * rest blank. Keeping the first non-empty value per order is therefore the whole
 * grouping rule.
 */
function joinAddress(row: Record<string, unknown>, prefix: 'Shipping' | 'Billing'): string | null {
  const parts = [
    str(row[`${prefix} Address1`]),
    str(row[`${prefix} Address2`]),
    str(row[`${prefix} City`]),
    str(row[`${prefix} Province`]) ?? str(row[`${prefix} Province Name`]),
    str(row[`${prefix} Zip`]),
    str(row[`${prefix} Country`]),
  ].filter(Boolean);
  // Province + country alone is what a redacted address looks like; treat that
  // as no address rather than importing a value with no street or city in it.
  const hasSpecific =
    str(row[`${prefix} Address1`]) || str(row[`${prefix} City`]) || str(row[`${prefix} Zip`]);
  return hasSpecific && parts.length ? parts.join(', ') : null;
}

function parseShopifyCsv(rows: Record<string, unknown>[]): { rows: ImportRow[]; missingColumns: string[] } {
  const byOrder = new Map<string, ImportRow>();

  const first = rows[0] ?? {};
  const missingColumns = ['Name', 'Email', 'Shipping Address1', 'Billing Name']
    .filter((c) => !(c in first));

  for (const raw of rows) {
    // `Id` is Shopify's numeric order id. Some exports omit it, in which case
    // `Name` (#SG5521) is the only handle we have.
    const shopifyOrderId = str(raw['Id']);
    const displayName = str(raw['Name']);
    const orderNumber = displayName ? displayName.replace(/^#/, '') : null;
    const key = shopifyOrderId ?? orderNumber;
    if (!key) continue;

    const incoming: ImportRow = {
      shopify_order_id: shopifyOrderId,
      order_number: orderNumber,
      customer_name:
        str(raw['Shipping Name']) ??
        str(raw['Billing Name']) ??
        str([raw['Customer First Name'], raw['Customer Last Name']].filter(Boolean).join(' ')),
      customer_email: str(raw['Email']),
      customer_phone:
        str(raw['Shipping Phone']) ?? str(raw['Billing Phone']) ?? str(raw['Phone']),
      customer_company: str(raw['Shipping Company']) ?? str(raw['Billing Company']),
      shipping_address: joinAddress(raw, 'Shipping'),
      billing_address: joinAddress(raw, 'Billing'),
    };

    const held = byOrder.get(key);
    if (!held) {
      byOrder.set(key, incoming);
      continue;
    }
    // Continuation row — fill anything the first row left blank.
    for (const k of Object.keys(incoming) as (keyof ImportRow)[]) {
      if (!held[k] && incoming[k]) held[k] = incoming[k];
    }
  }

  return { rows: [...byOrder.values()], missingColumns };
}

export function ShopifyCustomerImportDialog({ open, onOpenChange, onImported }: Props) {
  const { toast } = useToast();
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parsed, setParsed] = useState<ImportRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setParsed(null);
    setWarnings([]);
    setResult(null);
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    reset();
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const { rows, missingColumns } = parseShopifyCsv(json);

      const notes: string[] = [];
      if (missingColumns.length) {
        notes.push(
          `This does not look like a Shopify Orders export — missing column(s): ${missingColumns.join(', ')}.`,
        );
      }
      const withContact = rows.filter((r) => r.customer_email || r.customer_phone).length;
      if (rows.length && withContact === 0) {
        notes.push('No email or phone found in any row. Export from Shopify admin → Orders → Export, choosing "All orders" and "Plain CSV file".');
      }

      setParsed(rows);
      setWarnings(notes);
      if (rows.length === 0) {
        toast({ title: 'No orders found in file', variant: 'destructive' });
      }
    } catch (e) {
      toast({
        title: 'Could not read file',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setParsing(false);
    }
  };

  const send = async (dryRun: boolean) => {
    if (!parsed?.length) return;
    setUploading(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-customer-import', {
        body: { rows: parsed, dry_run: dryRun },
      });
      if (error) throw error;
      setResult(data as ImportResult);
      if (!dryRun) {
        toast({ title: `Updated ${(data as ImportResult).updated} order(s)` });
        onImported?.();
      }
    } catch (e) {
      toast({
        title: dryRun ? 'Preview failed' : 'Import failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import customer details from Shopify CSV</DialogTitle>
          <DialogDescription>
            Shopify only exposes customer names, emails, phones and addresses over the API on
            the Shopify, Advanced and Plus plans, so orders arrive here with those fields
            stripped. The admin&apos;s own CSV export is not restricted that way — upload it here
            to fill in the gaps.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Getting the file</p>
            <p>Shopify admin → <strong>Orders</strong> → <strong>Export</strong> → choose the orders to export → <strong>Plain CSV file</strong>.</p>
            <p>Existing values are never overwritten — only blank fields are filled in.</p>
          </div>

          <div>
            <Label htmlFor="shopify-csv">CSV file</Label>
            <Input
              id="shopify-csv"
              type="file"
              accept=".csv,text/csv"
              disabled={parsing || uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          {parsing && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading file…
            </p>
          )}

          {warnings.map((w) => (
            <div key={w} className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}

          {parsed && !result && (
            <div className="text-sm">
              <p className="font-medium">{parsed.length} order(s) found in file</p>
              <p className="text-muted-foreground text-xs">
                {parsed.filter((r) => r.customer_email).length} with email ·{' '}
                {parsed.filter((r) => r.customer_phone).length} with phone ·{' '}
                {parsed.filter((r) => r.shipping_address).length} with shipping address
              </p>
            </div>
          )}

          {result && (
            <div className="rounded-md border border-border/60 p-3 text-sm space-y-1">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {result.dry_run ? 'Preview' : 'Import complete'}
              </p>
              <p className="text-muted-foreground text-xs">
                {result.updated} {result.dry_run ? 'would be updated' : 'updated'} ·{' '}
                {result.matched} matched · {result.unmatched} not found here ·{' '}
                {result.skipped} already complete
              </p>
              {!!result.unmatched_sample?.length && (
                <p className="text-muted-foreground text-xs">
                  Not found: {result.unmatched_sample.join(', ')}
                  {result.unmatched > result.unmatched_sample.length ? ' …' : ''}
                </p>
              )}
              {!!result.errors?.length && (
                <p className="text-destructive text-xs">{result.errors.join(' · ')}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Close
          </Button>
          <Button
            variant="secondary"
            onClick={() => send(true)}
            disabled={!parsed?.length || uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Preview
          </Button>
          <Button onClick={() => send(false)} disabled={!parsed?.length || uploading}>
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Import
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
