import { useState, useMemo } from "react";
import { Supplier } from "@/hooks/useSuppliers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, Star, TrendingUp, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface SupplierRecommendation {
  supplier: Supplier;
  frequency: number;
  lastPrice?: number;
  isRecommended: boolean;
}

interface InlineSupplierAssignmentProps {
  currentSupplierName: string | null;
  currentSupplierContact: string | null;
  suppliers: Supplier[];
  productName: string;
  productCategory: string | null;
  orderId: string;
  onAssign: (orderId: string, updates: { supplier_id: string; supplier_name: string; supplier_contact: string }) => Promise<void>;
  onSupplierCreated: () => void;
}

export function InlineSupplierAssignment({
  currentSupplierName,
  currentSupplierContact,
  suppliers,
  productName,
  productCategory,
  orderId,
  onAssign,
  onSupplierCreated,
}: InlineSupplierAssignmentProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // New supplier form
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newGst, setNewGst] = useState("");
  const [creating, setCreating] = useState(false);

  // Smart recommendations based on procurement history
  const [recommendations, setRecommendations] = useState<SupplierRecommendation[]>([]);
  const [recsLoaded, setRecsLoaded] = useState(false);

  const loadRecommendations = async () => {
    if (recsLoaded) return;
    try {
      // Find procurements for similar products
      const { data } = await supabase
        .from('inventory_procurements')
        .select('supplier_id, supplier_name, unit_price')
        .or(`product_name.ilike.%${productName.split(' ')[0]}%${productCategory ? `,product_category.eq.${productCategory}` : ''}`)
        .not('supplier_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data && data.length > 0) {
        const freqMap = new Map<string, { count: number; lastPrice: number | null; name: string }>();
        data.forEach(row => {
          if (!row.supplier_id) return;
          const existing = freqMap.get(row.supplier_id) || { count: 0, lastPrice: null, name: row.supplier_name || '' };
          existing.count += 1;
          if (!existing.lastPrice && row.unit_price) existing.lastPrice = row.unit_price;
          freqMap.set(row.supplier_id, existing);
        });

        const recs: SupplierRecommendation[] = [];
        freqMap.forEach((val, supplierId) => {
          const supplier = suppliers.find(s => s.id === supplierId);
          if (supplier) {
            recs.push({
              supplier,
              frequency: val.count,
              lastPrice: val.lastPrice ?? undefined,
              isRecommended: true,
            });
          }
        });
        recs.sort((a, b) => b.frequency - a.frequency);
        setRecommendations(recs.slice(0, 3));
      }
      setRecsLoaded(true);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
      setRecsLoaded(true);
    }
  };

  const filteredSuppliers = useMemo(() => {
    if (!search) return suppliers.filter(s => s.is_active);
    const q = search.toLowerCase();
    return suppliers.filter(s =>
      s.is_active &&
      (s.name.toLowerCase().includes(q) ||
        s.brand_name?.toLowerCase().includes(q) ||
        s.contact_name?.toLowerCase().includes(q))
    );
  }, [suppliers, search]);

  const recommendedIds = new Set(recommendations.map(r => r.supplier.id));

  const handleSelect = async (supplier: Supplier) => {
    setAssigning(true);
    try {
      await onAssign(orderId, {
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        supplier_contact: supplier.phone || supplier.mobile || supplier.email || '',
      });
      setOpen(false);
    } finally {
      setAssigning(false);
    }
  };

  const handleCreateSupplier = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          name: newName.trim(),
          contact_name: newName.trim(),
          phone: newPhone || null,
          email: newEmail || null,
          gst_number: newGst || null,
          product_category: productCategory || 'General',
          preference: 'medium' as const,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-assign to this order
      await onAssign(orderId, {
        supplier_id: data.id,
        supplier_name: data.name,
        supplier_contact: newPhone || newEmail || '',
      });

      onSupplierCreated();
      setShowNewSupplierModal(false);
      setOpen(false);
      resetNewForm();
    } catch (err: any) {
      console.error('Failed to create supplier:', err);
    } finally {
      setCreating(false);
    }
  };

  const resetNewForm = () => {
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setNewGst("");
  };

  return (
    <>
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) loadRecommendations(); }}>
        <PopoverTrigger asChild>
          <div className="cursor-pointer" onClick={(e) => e.stopPropagation()}>
            {currentSupplierName ? (
              <div className="group">
                <p className="font-medium group-hover:text-primary transition-colors">{currentSupplierName}</p>
                <p className="text-xs text-muted-foreground">{currentSupplierContact}</p>
              </div>
            ) : (
              <Badge variant="outline" className="text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors cursor-pointer">
                Unassigned
              </Badge>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start" onClick={(e) => e.stopPropagation()}>
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search suppliers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          <ScrollArea className="max-h-[300px]">
            {/* Recommended Section */}
            {recommendations.length > 0 && !search && (
              <div className="px-2 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 pb-1 flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-500" />
                  Recommended
                </p>
                {recommendations.map((rec) => (
                  <button
                    key={rec.supplier.id}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-accent/50 flex items-center justify-between transition-colors",
                      "bg-amber-500/5 border border-amber-500/10 mb-1"
                    )}
                    disabled={assigning}
                    onClick={() => handleSelect(rec.supplier)}
                  >
                    <div>
                      <p className="font-medium text-sm">{rec.supplier.name}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <TrendingUp className="w-2.5 h-2.5" />
                          {rec.frequency}x used
                        </span>
                        {rec.lastPrice && <span>Last: ₹{rec.lastPrice.toLocaleString()}</span>}
                      </div>
                    </div>
                    {currentSupplierName === rec.supplier.name && (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* All Suppliers */}
            <div className="px-2 py-1">
              {recommendations.length > 0 && !search && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 pb-1 pt-1">
                  All Suppliers
                </p>
              )}
              {filteredSuppliers
                .filter(s => !recommendedIds.has(s.id) || !!search)
                .map((supplier) => (
                  <button
                    key={supplier.id}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-accent/50 flex items-center justify-between transition-colors"
                    )}
                    disabled={assigning}
                    onClick={() => handleSelect(supplier)}
                  >
                    <div>
                      <p className="font-medium">{supplier.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {supplier.product_category} {supplier.city ? `• ${supplier.city}` : ''}
                      </p>
                    </div>
                    {currentSupplierName === supplier.name && (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    )}
                  </button>
                ))}
              {filteredSuppliers.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">No suppliers found</p>
              )}
            </div>
          </ScrollArea>

          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sm gap-2 text-primary"
              onClick={() => { setShowNewSupplierModal(true); setOpen(false); }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add New Supplier
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* New Supplier Modal */}
      <Dialog open={showNewSupplierModal} onOpenChange={setShowNewSupplierModal}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Add New Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Supplier Name *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Enter supplier name" />
            </div>
            <div>
              <Label className="text-sm">Phone</Label>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone number" />
            </div>
            <div>
              <Label className="text-sm">Email</Label>
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email address" type="email" />
            </div>
            <div>
              <Label className="text-sm">GST Number (Optional)</Label>
              <Input value={newGst} onChange={(e) => setNewGst(e.target.value)} placeholder="GST number" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNewSupplierModal(false); resetNewForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreateSupplier} disabled={!newName.trim() || creating}>
              {creating ? "Creating..." : "Create & Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}