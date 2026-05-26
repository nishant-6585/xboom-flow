import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { COURIER_PARTNERS } from '@/lib/courierTracking';

const CUSTOM_PROVIDER = 'Custom Provider';

interface Props {
  wooOrderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function AddTrackingDialog({ wooOrderId, open, onOpenChange, onSaved }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [provider, setProvider] = useState<string>(COURIER_PARTNERS[0]?.name || CUSTOM_PROVIDER);
  const [customProvider, setCustomProvider] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [dateShipped, setDateShipped] = useState(today);
  const [busy, setBusy] = useState(false);

  const resolvedProvider = provider === CUSTOM_PROVIDER ? customProvider.trim() : provider;

  const reset = () => {
    setProvider(COURIER_PARTNERS[0]?.name || CUSTOM_PROVIDER);
    setCustomProvider('');
    setTrackingNumber('');
    setTrackingUrl('');
    setDateShipped(today);
  };

  const submit = async () => {
    if (!resolvedProvider) {
      toast({ title: 'Provider required', variant: 'destructive' });
      return;
    }
    if (!trackingNumber.trim()) {
      toast({ title: 'Tracking number required', variant: 'destructive' });
      return;
    }
    if (trackingUrl && !/^https?:\/\//i.test(trackingUrl.trim())) {
      toast({ title: 'Tracking URL must start with http(s)://', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-woo-tracking', {
        body: {
          woo_order_id: wooOrderId,
          provider: resolvedProvider,
          tracking_number: trackingNumber.trim(),
          tracking_url: trackingUrl.trim() || undefined,
          date_shipped: dateShipped,
        },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Failed to push tracking');
      toast({
        title: 'Tracking added',
        description: data?.warning
          ? `Saved locally — Woo: ${data.warning}`
          : `Order #${wooOrderId} marked Shipped on WooCommerce.`,
      });
      reset();
      onOpenChange(false);
      onSaved?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to push tracking';
      toast({ title: 'Push failed', description: msg, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" /> Add Tracking Details
          </DialogTitle>
          <DialogDescription>
            Saves to XBoom, pushes to WooCommerce Shipment Tracking, and marks the order as <strong>Shipped</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="provider">Courier / Provider</Label>
            <Select value={provider} onValueChange={setProvider} disabled={busy}>
              <SelectTrigger id="provider"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COURIER_PARTNERS.map((c) => (
                  <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                ))}
                <SelectItem value={CUSTOM_PROVIDER}>{CUSTOM_PROVIDER}…</SelectItem>
              </SelectContent>
            </Select>
            {provider === CUSTOM_PROVIDER && (
              <Input
                placeholder="Enter custom provider name"
                value={customProvider}
                onChange={(e) => setCustomProvider(e.target.value)}
                disabled={busy}
                maxLength={120}
                className="mt-2"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="awb">Tracking number / AWB</Label>
            <Input
              id="awb"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="e.g. 1234567890"
              disabled={busy}
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="url">Tracking URL (optional)</Label>
            <Input
              id="url"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="https://…"
              disabled={busy}
              maxLength={500}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date">Date shipped</Label>
            <Input
              id="date"
              type="date"
              value={dateShipped}
              onChange={(e) => setDateShipped(e.target.value)}
              disabled={busy}
              max={today}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Pushing…</> : 'Save & Mark Shipped'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}