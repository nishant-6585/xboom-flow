import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useInventoryProcurements, InventoryProcurement } from '@/hooks/useInventoryProcurements';
import { useOrderProcurementLinks } from '@/hooks/useOrderProcurementLinks';
import { Loader2, Link2, Package, Search } from 'lucide-react';

interface LinkProcurementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber?: string;
  productName?: string;
  onLinked?: () => void;
}

export function LinkProcurementDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  productName,
  onLinked,
}: LinkProcurementDialogProps) {
  const { procurements, loading: procurementsLoading } = useInventoryProcurements();
  const { createLink, getLinksForOrder } = useOrderProcurementLinks();
  
  const [selectedProcurementId, setSelectedProcurementId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Get already linked procurements for this order
  const existingLinks = getLinksForOrder(orderId);
  const linkedProcurementIds = new Set(existingLinks.map(l => l.inventory_procurement_id));

  // Filter procurements
  const filteredProcurements = useMemo(() => {
    return procurements.filter(p => {
      // Exclude already linked
      if (linkedProcurementIds.has(p.id)) return false;
      
      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          p.product_name.toLowerCase().includes(searchLower) ||
          p.procurement_number?.toLowerCase().includes(searchLower) ||
          p.supplier_name?.toLowerCase().includes(searchLower)
        );
      }
      return true;
    });
  }, [procurements, linkedProcurementIds, search]);

  const selectedProcurement = procurements.find(p => p.id === selectedProcurementId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProcurementId) return;

    setSaving(true);
    const success = await createLink(
      orderId,
      selectedProcurementId,
      parseInt(quantity) || 1,
      undefined,
      notes
    );
    setSaving(false);

    if (success) {
      setSelectedProcurementId('');
      setQuantity('1');
      setNotes('');
      setSearch('');
      onOpenChange(false);
      onLinked?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Link Procurement to Order
          </DialogTitle>
          <DialogDescription>
            Link an existing inventory procurement to {orderNumber ? `Order ${orderNumber}` : 'this order'}
            {productName && ` (${productName})`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Search */}
          <div className="space-y-2">
            <Label className="text-sm">Search Procurements</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by product, procurement number, or supplier..."
                className="pl-9"
              />
            </div>
          </div>

          {/* Procurement Selection */}
          <div className="space-y-2">
            <Label>Select Procurement *</Label>
            {procurementsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredProcurements.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                {search ? 'No matching procurements found' : 'No available procurements to link'}
              </div>
            ) : (
              <Select value={selectedProcurementId} onValueChange={setSelectedProcurementId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a procurement to link" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {filteredProcurements.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.procurement_number || 'No number'}</span>
                        <span className="text-muted-foreground">-</span>
                        <span>{p.product_name}</span>
                        {p.supplier_name && (
                          <span className="text-xs text-muted-foreground">({p.supplier_name})</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Selected Procurement Details */}
          {selectedProcurement && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{selectedProcurement.product_name}</span>
                <Badge variant="outline">{selectedProcurement.procurement_number}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Supplier:</span>{' '}
                  {selectedProcurement.supplier_name || '-'}
                </div>
                <div>
                  <span className="text-muted-foreground">Qty:</span>{' '}
                  {selectedProcurement.quantity}
                </div>
                <div>
                  <span className="text-muted-foreground">Amount:</span>{' '}
                  ₹{(selectedProcurement.total_amount || 0).toLocaleString()}
                </div>
                <div>
                  <span className="text-muted-foreground">Payment:</span>{' '}
                  <Badge variant="secondary" className="text-xs">
                    {selectedProcurement.payment_status}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* Quantity */}
          <div className="space-y-2">
            <Label>Quantity Used</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this link..."
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !selectedProcurementId}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Linking...
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  Link Procurement
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
