import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useGoodsReceipts,
  GoodsReceiptItem,
  ThreeWayMatch,
  MATCH_STATUS_LABELS,
  MATCH_STATUS_SEVERITY,
} from '@/hooks/useGoodsReceipts';
import { useImports, ImportItem } from '@/hooks/useImports';
import { useAuth } from '@/hooks/useAuth';
import { formatINR } from '@/lib/currency';
import {
  ClipboardCheck,
  PackageCheck,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';

const SEVERITY_CLASSES: Record<'ok' | 'warn' | 'alert', string> = {
  ok: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  alert: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function MatchBadge({ status }: { status: ThreeWayMatch['match_status'] }) {
  return (
    <Badge className={SEVERITY_CLASSES[MATCH_STATUS_SEVERITY[status]]}>
      {MATCH_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * Receiving and three-way match.
 *
 * The match compares three independent documents — what was ordered (the
 * import), what physically arrived and was accepted (posted goods receipts), and
 * what the supplier has been paid. Any two agreeing is not enough; the control
 * only works when all three line up, which is why `overpayment_exposure` is
 * measured against ACCEPTED quantity rather than received quantity.
 */
export function GoodsReceiptPanel() {
  const { role } = useAuth();
  const { imports } = useImports();
  const { receipts, matches, matchesLoading, createReceipt, postReceipt } = useGoodsReceipts();

  const [receivingImportId, setReceivingImportId] = useState<string | null>(null);
  const [lines, setLines] = useState<GoodsReceiptItem[]>([]);
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Receiving goods is a warehouse act. Finance reads the match but must not be
  // able to create the evidence it approves payment against.
  const canReceive = role === 'admin' || role === 'supply_chain';

  const receivingImport = useMemo(
    () => imports.find(i => i.id === receivingImportId) ?? null,
    [imports, receivingImportId]
  );

  const exposure = useMemo(
    () =>
      matches
        .filter(m => m.overpayment_exposure > 0)
        .reduce((sum, m) => sum + m.overpayment_exposure, 0),
    [matches]
  );

  const needsAttention = useMemo(
    () => matches.filter(m => MATCH_STATUS_SEVERITY[m.match_status] !== 'ok'),
    [matches]
  );

  const openReceiveDialog = (importId: string) => {
    const imp = imports.find(i => i.id === importId);
    if (!imp) return;

    // Older imports predate import_items and carry a single denormalised
    // product on the header — synthesise one line for those.
    const source: ImportItem[] =
      imp.items && imp.items.length > 0
        ? imp.items
        : [
            {
              product_name: imp.product_name,
              product_category: imp.product_category ?? '',
              product_code: '',
              quantity: imp.quantity ?? 0,
              unit_price: imp.unit_price ?? 0,
              total_amount: imp.total_amount ?? 0,
              hsn_code: '',
              notes: '',
            },
          ];

    setLines(
      source.map(item => ({
        import_item_id: item.id ?? null,
        product_name: item.product_name,
        product_code: item.product_code || null,
        hsn_code: item.hsn_code || null,
        quantity_ordered: item.quantity ?? 0,
        // Default to receiving everything ordered — the common case — but the
        // warehouse must still confirm it line by line.
        quantity_received: item.quantity ?? 0,
        quantity_accepted: item.quantity ?? 0,
        rejection_reason: null,
        unit_price: item.unit_price ?? null,
      }))
    );
    setReceivedDate(new Date().toISOString().slice(0, 10));
    setInspectionNotes('');
    setReceivingImportId(importId);
  };

  const updateLine = (index: number, patch: Partial<GoodsReceiptItem>) => {
    setLines(prev =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        // Accepted can never exceed received — the DB enforces it, so keep the
        // form from constructing a row it will reject.
        if (next.quantity_accepted > next.quantity_received) {
          next.quantity_accepted = next.quantity_received;
        }
        return next;
      })
    );
  };

  const hasRejections = lines.some(l => l.quantity_received > l.quantity_accepted);
  const missingReason = hasRejections && !lines.some(l => l.rejection_reason?.trim());

  const handleCreate = async (andPost: boolean) => {
    if (!receivingImport) return;
    setSaving(true);
    try {
      const created = await createReceipt(
        {
          import_id: receivingImport.id,
          supplier_id: receivingImport.supplier_id,
          supplier_name: receivingImport.supplier_name,
          received_date: receivedDate,
          inspection_notes: inspectionNotes || null,
        },
        lines
      );
      if (created && andPost) await postReceipt(created.id);
      if (created) setReceivingImportId(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <PackageCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{receipts.filter(r => r.status === 'posted').length}</p>
                <p className="text-xs text-muted-foreground">Posted receipts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{needsAttention.length}</p>
                <p className="text-xs text-muted-foreground">Imports not matched</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold truncate">{formatINR(exposure)}</p>
                <p
                  className="text-xs text-muted-foreground"
                  title="Paid to suppliers for goods the warehouse has not accepted"
                >
                  Paid ahead of receipt
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5" />
            Three-Way Match
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Ordered against received against paid. Only posted receipts and completed payments count.
          </p>
        </CardHeader>
        <CardContent>
          {matchesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-1">Nothing to match yet</h3>
              <p className="text-muted-foreground">
                Imports appear here as soon as they are raised.
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Import #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Accepted</TableHead>
                    <TableHead className="text-right">Rejected</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Exposure</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map(match => (
                    <TableRow key={match.import_id}>
                      <TableCell className="font-mono text-sm font-medium">
                        {match.import_number || '—'}
                      </TableCell>
                      <TableCell className="text-sm">{match.supplier_name || '—'}</TableCell>
                      <TableCell className="text-right">{match.quantity_ordered ?? 0}</TableCell>
                      <TableCell className="text-right">{match.quantity_accepted}</TableCell>
                      <TableCell className="text-right">
                        {match.quantity_rejected > 0 ? (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            {match.quantity_rejected}
                          </span>
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatINR(match.ordered_value)}</TableCell>
                      <TableCell className="text-right">{formatINR(match.amount_paid)}</TableCell>
                      <TableCell className="text-right">
                        {match.overpayment_exposure > 0 ? (
                          <span
                            className="text-red-600 dark:text-red-400 font-medium"
                            title="Paid for goods not yet accepted"
                          >
                            {formatINR(match.overpayment_exposure)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <MatchBadge status={match.match_status} />
                      </TableCell>
                      <TableCell>
                        {canReceive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openReceiveDialog(match.import_id)}
                          >
                            Receive
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receive dialog */}
      <Dialog open={!!receivingImportId} onOpenChange={open => !open && setReceivingImportId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receive goods — {receivingImport?.import_number}</DialogTitle>
            <DialogDescription>
              Record what physically arrived and how much passed inspection. A posted receipt cannot
              be edited afterwards.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="received_date">Received date</Label>
              <Input
                id="received_date"
                type="date"
                value={receivedDate}
                onChange={e => setReceivedDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Supplier</Label>
              <p className="mt-2 text-sm">{receivingImport?.supplier_name || '—'}</p>
            </div>
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={index} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{line.product_name}</p>
                  <span className="text-xs text-muted-foreground">
                    Ordered {line.quantity_ordered}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Received</Label>
                    <Input
                      type="number"
                      min="0"
                      value={line.quantity_received}
                      onChange={e =>
                        updateLine(index, { quantity_received: parseFloat(e.target.value) || 0 })
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Accepted</Label>
                    <Input
                      type="number"
                      min="0"
                      max={line.quantity_received}
                      value={line.quantity_accepted}
                      onChange={e =>
                        updateLine(index, { quantity_accepted: parseFloat(e.target.value) || 0 })
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
                {line.quantity_received > line.quantity_accepted && (
                  <div>
                    <Label className="text-xs">
                      Rejection reason ({line.quantity_received - line.quantity_accepted} rejected)
                    </Label>
                    <Input
                      value={line.rejection_reason ?? ''}
                      onChange={e => updateLine(index, { rejection_reason: e.target.value })}
                      placeholder="Damaged in transit, wrong model, failed inspection…"
                      className="mt-1"
                    />
                  </div>
                )}
                {line.quantity_received < line.quantity_ordered && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Short by {line.quantity_ordered - line.quantity_received} — the match will flag
                    this import until the balance arrives.
                  </p>
                )}
              </div>
            ))}
          </div>

          <div>
            <Label htmlFor="inspection_notes">Inspection notes</Label>
            <Textarea
              id="inspection_notes"
              value={inspectionNotes}
              onChange={e => setInspectionNotes(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>

          {missingReason && (
            <p role="alert" className="text-sm text-destructive">
              Give a reason for the rejected quantity before posting.
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReceivingImportId(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => handleCreate(false)} disabled={saving}>
              Save draft
            </Button>
            <Button onClick={() => handleCreate(true)} disabled={saving || missingReason}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Post receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
