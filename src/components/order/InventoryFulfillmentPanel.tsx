import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Package, Plus, Trash2, Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface InventoryProcItem {
  id: string;
  procurement_number: string | null;
  po_number: string | null;
  product_name: string;
  product_category: string;
  quantity: number;
  unit_price: number | null;
  total_amount: number | null;
  supplier_name: string | null;
  inventory_id: string | null;
  order_id: string | null;
}

interface ExistingLink {
  id: string;
  inventory_procurement_id: string;
  order_id: string;
  order_item_id: string | null;
  quantity_used: number;
  linked_at: string;
  procurement?: InventoryProcItem;
}

interface Props {
  orderId: string;
  productName?: string;
}

export function InventoryFulfillmentPanel({ orderId, productName }: Props) {
  const { user, role } = useAuth();
  const canManage = role === 'admin' || role === 'supply_chain' || role === 'finance';

  const [links, setLinks] = useState<ExistingLink[]>([]);
  const [availableProcs, setAvailableProcs] = useState<InventoryProcItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedProcId, setSelectedProcId] = useState<string>('');
  const [qtyUsed, setQtyUsed] = useState<number>(1);

  const fetchData = useCallback(async () => {
    try {
      const [linksRes, procsRes] = await Promise.all([
        supabase
          .from('order_procurement_links')
          .select('*')
          .eq('order_id', orderId),
        supabase
          .from('inventory_procurements')
          .select('id, procurement_number, po_number, product_name, product_category, quantity, unit_price, total_amount, supplier_name, inventory_id, order_id')
          .is('order_id', null)
          .gt('quantity', 0),
      ]);

      const linkRows = (linksRes.data || []) as ExistingLink[];

      if (linkRows.length > 0) {
        const procIds = linkRows.map(l => l.inventory_procurement_id);
        const { data: linkedProcs } = await supabase
          .from('inventory_procurements')
          .select('id, procurement_number, po_number, product_name, product_category, quantity, unit_price, total_amount, supplier_name, inventory_id, order_id')
          .in('id', procIds);

        const procMap = new Map((linkedProcs || []).map(p => [p.id, p as InventoryProcItem]));
        linkRows.forEach(l => { l.procurement = procMap.get(l.inventory_procurement_id); });
      }

      setLinks(linkRows);
      setAvailableProcs((procsRes.data || []) as InventoryProcItem[]);
    } catch (err) {
      console.error('Error fetching inventory links:', err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredProcs = availableProcs.filter(p => {
    if (!productName) return true;
    return p.product_name.toLowerCase().includes(productName.toLowerCase()) ||
      productName.toLowerCase().includes(p.product_name.toLowerCase());
  });

  const allMatchingProcs = [...availableProcs];

  const handleLink = async () => {
    if (!selectedProcId || qtyUsed <= 0 || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('order_procurement_links').insert({
        order_id: orderId,
        inventory_procurement_id: selectedProcId,
        quantity_used: qtyUsed,
        linked_by: user.id,
      } as any);

      if (error) throw error;

      const proc = availableProcs.find(p => p.id === selectedProcId);
      if (proc?.inventory_id) {
        await supabase.from('inventory_transactions').insert({
          inventory_id: proc.inventory_id,
          inventory_procurement_id: selectedProcId,
          order_id: orderId,
          quantity: qtyUsed,
          transaction_type: 'order_fulfilled',
          notes: `Fulfilled from inventory for order`,
          created_by: user.id,
        } as any);
      }

      toast.success('Order linked to inventory procurement');
      setSelectedProcId('');
      setQtyUsed(1);
      await fetchData();
    } catch (err: any) {
      console.error('Link error:', err);
      toast.error(err.message || 'Failed to link');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (linkId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('order_procurement_links').delete().eq('id', linkId);
      if (error) throw error;
      toast.success('Link removed');
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to unlink');
    } finally {
      setSaving(false);
    }
  };

  const totalInvCost = links.reduce((sum, l) => {
    const unitPrice = l.procurement?.unit_price || 0;
    return sum + unitPrice * l.quantity_used;
  }, 0);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading inventory links...
      </div>
    );
  }

  return (
    <div className="p-4 bg-muted/50 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          <Package className="h-4 w-4" />
          Inventory Fulfillment
        </h4>
        {links.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {links.length} linked · ₹{totalInvCost.toLocaleString('en-IN')}
          </Badge>
        )}
      </div>

      {links.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">PO #</TableHead>
                <TableHead className="text-xs">Proc #</TableHead>
                <TableHead className="text-xs">Product</TableHead>
                <TableHead className="text-xs">Supplier</TableHead>
                <TableHead className="text-xs text-right">Qty Used</TableHead>
                <TableHead className="text-xs text-right">Unit Price</TableHead>
                <TableHead className="text-xs text-right">Cost</TableHead>
                {canManage && <TableHead className="text-xs w-8" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((l) => {
                const proc = l.procurement;
                const unitPrice = proc?.unit_price || 0;
                const cost = unitPrice * l.quantity_used;
                return (
                  <TableRow key={l.id} className="text-xs">
                    <TableCell className="font-mono">{proc?.po_number || '—'}</TableCell>
                    <TableCell className="font-mono">{proc?.procurement_number || '—'}</TableCell>
                    <TableCell className="max-w-[120px] truncate">{proc?.product_name || '—'}</TableCell>
                    <TableCell className="max-w-[100px] truncate">{proc?.supplier_name || '—'}</TableCell>
                    <TableCell className="text-right">{l.quantity_used}</TableCell>
                    <TableCell className="text-right">₹{unitPrice.toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-right font-medium">₹{cost.toLocaleString('en-IN')}</TableCell>
                    {canManage && (
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => handleUnlink(l.id)} disabled={saving}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {links.length === 0 && (
        <p className="text-xs text-muted-foreground">No inventory items linked to this order yet.</p>
      )}

      {canManage && (
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-2 pt-2 border-t">
          <div className="flex-1 w-full">
            <label className="text-xs text-muted-foreground mb-1 block">Standalone Procurement</label>
            <Select value={selectedProcId} onValueChange={setSelectedProcId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select procurement to link..." />
              </SelectTrigger>
              <SelectContent>
                {(filteredProcs.length > 0 ? filteredProcs : allMatchingProcs).map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.po_number || p.procurement_number || 'No PO'} — {p.product_name} ({p.quantity} units) — {p.supplier_name || 'Unknown'}
                  </SelectItem>
                ))}
                {availableProcs.length === 0 && (
                  <SelectItem value="__none" disabled className="text-xs text-muted-foreground">
                    No standalone procurements available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="w-20">
            <label className="text-xs text-muted-foreground mb-1 block">Qty</label>
            <Input
              type="number"
              min={1}
              value={qtyUsed}
              onChange={(e) => setQtyUsed(Number(e.target.value) || 1)}
              className="h-8 text-xs"
            />
          </div>
          <Button
            size="sm"
            className="h-8 gap-1"
            onClick={handleLink}
            disabled={!selectedProcId || qtyUsed <= 0 || saving}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Link
          </Button>
        </div>
      )}
    </div>
  );
}