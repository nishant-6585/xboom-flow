import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Download, MoreHorizontal, Eye, Pencil, Trash2, ArrowUpDown, ShoppingCart, History } from "lucide-react";
import { format } from "date-fns";

import { useAuth } from "@/hooks/useAuth";
import { useSpareParts, type SparePart, type SparePartStockStatus } from "@/hooks/useSpareParts";
import { SparePartFormDialog } from "@/components/spare-parts/SparePartFormDialog";
import { AdjustQuantityDialog } from "@/components/spare-parts/AdjustQuantityDialog";
import { SparePartViewDialog, StatusBadge } from "@/components/spare-parts/SparePartViewDialog";
import { SparePartsKpiCards } from "@/components/spare-parts/SparePartsKpiCards";
import { LowStockAlertsWidget } from "@/components/spare-parts/LowStockAlertsWidget";
import { PartsUsedInRepairs } from "@/components/spare-parts/PartsUsedInRepairs";
import { SellSparePartDialog } from "@/components/spare-parts/SellSparePartDialog";
import { SparePartsSalesHistoryDialog } from "@/components/spare-parts/SparePartsSalesHistoryDialog";
import { exportSparePartsCsv } from "@/lib/sparePartsExport";

type SortKey = "recent" | "margin_desc" | "stock_asc";

export default function SpareParts() {
  const { role, loading: authLoading } = useAuth();
  const { list, remove } = useSpareParts();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | SparePartStockStatus>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [sort, setSort] = useState<SortKey>("recent");

  const [formOpen, setFormOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellDefaultPartId, setSellDefaultPartId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selected, setSelected] = useState<SparePart | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!role || !["admin", "supply_chain", "finance", "sales"].includes(role)) {
    return <Navigate to="/" replace />;
  }

  const canEdit = role === "admin" || role === "supply_chain";
  const canSeePricing = role === "admin" || role === "supply_chain" || role === "finance";

  const parts = list.data ?? [];

  const categories = Array.from(
    new Set(parts.map((p) => p.category).filter((c): c is string => !!c)),
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = parts.filter((p) => {
      if (statusFilter !== "ALL" && p.stock_status !== statusFilter) return false;
      if (categoryFilter !== "ALL" && p.category !== categoryFilter) return false;
      if (!term) return true;
      return (
        p.part_name.toLowerCase().includes(term) ||
        (p.vendor_name ?? "").toLowerCase().includes(term) ||
        (p.part_code ?? "").toLowerCase().includes(term)
      );
    });
    if (sort === "margin_desc")
      rows = [...rows].sort((a, b) => Number(b.profit_margin_percent) - Number(a.profit_margin_percent));
    else if (sort === "stock_asc") rows = [...rows].sort((a, b) => a.quantity - b.quantity);
    return rows;
  }, [parts, search, statusFilter, categoryFilter, sort]);

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-4 sm:py-6 flex-1 overflow-x-hidden space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Spare Parts Inventory</h1>
            <p className="text-muted-foreground">
              Track spare parts stock, pricing, vendors and profitability
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportSparePartsCsv(filtered, canSeePricing)}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => setHistoryOpen(true)}>
              <History className="w-4 h-4 mr-2" /> Sales History
            </Button>
            {canEdit && (
              <Button
                variant="outline"
                onClick={() => {
                  setSellDefaultPartId(null);
                  setSellOpen(true);
                }}
              >
                <ShoppingCart className="w-4 h-4 mr-2" /> Sell Spare Part
              </Button>
            )}
            {canEdit && (
              <Button
                onClick={() => {
                  setSelected(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" /> Add Spare Part
              </Button>
            )}
          </div>
        </div>

        <SparePartsKpiCards parts={parts} showProfit={canSeePricing} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search by part name, vendor or code"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="IN_STOCK">In Stock</SelectItem>
                  <SelectItem value="LOW_STOCK">Low Stock</SelectItem>
                  <SelectItem value="SOLD_OUT">Sold Out</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="w-full sm:w-44">
                  <ArrowUpDown className="w-3 h-3 mr-1" /> <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Recently Updated</SelectItem>
                  <SelectItem value="margin_desc">Highest Margin</SelectItem>
                  <SelectItem value="stock_asc">Lowest Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part</TableHead>
                    <TableHead className="hidden md:table-cell">Category</TableHead>
                    <TableHead className="hidden md:table-cell">Vendor</TableHead>
                    <TableHead>Qty</TableHead>
                    {canSeePricing && <TableHead className="hidden lg:table-cell">Cost</TableHead>}
                    {canSeePricing && <TableHead className="hidden lg:table-cell">Selling</TableHead>}
                    {canSeePricing && <TableHead className="hidden md:table-cell">Margin</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Updated</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.isLoading ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">No spare parts found.</TableCell></TableRow>
                  ) : (
                    filtered.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium">{p.part_name}</div>
                          <div className="text-xs text-muted-foreground">{p.part_code}</div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{p.category || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">{p.vendor_name || "—"}</TableCell>
                        <TableCell>{p.quantity}</TableCell>
                        {canSeePricing && (
                          <TableCell className="hidden lg:table-cell">
                            ₹{Number(p.cost_price).toLocaleString("en-IN")}
                          </TableCell>
                        )}
                        {canSeePricing && (
                          <TableCell className="hidden lg:table-cell">
                            ₹{Number(p.selling_price).toLocaleString("en-IN")}
                          </TableCell>
                        )}
                        {canSeePricing && (
                          <TableCell className="hidden md:table-cell">
                            {Number(p.profit_margin_percent).toFixed(1)}%
                          </TableCell>
                        )}
                        <TableCell><StatusBadge status={p.stock_status} /></TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                          {format(new Date(p.updated_at), "dd MMM")}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setSelected(p); setViewOpen(true); }}>
                                <Eye className="w-4 h-4 mr-2" /> View
                              </DropdownMenuItem>
                              {canEdit && (
                                <>
                                  <DropdownMenuItem onClick={() => { setSelected(p); setFormOpen(true); }}>
                                    <Pencil className="w-4 h-4 mr-2" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setSelected(p); setAdjustOpen(true); }}>
                                    <ArrowUpDown className="w-4 h-4 mr-2" /> Adjust Quantity
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={p.quantity <= 0}
                                    onClick={() => { setSellDefaultPartId(p.id); setSellOpen(true); }}
                                  >
                                    <ShoppingCart className="w-4 h-4 mr-2" /> Sell
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => setDeleteId(p.id)}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-4">
            <LowStockAlertsWidget />
            <PartsUsedInRepairs />
          </div>
        </div>
      </main>

      {canEdit && (
        <SparePartFormDialog open={formOpen} onOpenChange={setFormOpen} part={selected} />
      )}
      {canEdit && (
        <AdjustQuantityDialog open={adjustOpen} onOpenChange={setAdjustOpen} part={selected} />
      )}
      {canEdit && (
        <SellSparePartDialog
          open={sellOpen}
          onOpenChange={setSellOpen}
          defaultPartId={sellDefaultPartId}
        />
      )}
      <SparePartsSalesHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
      <SparePartViewDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        part={selected}
        canSeePricing={canSeePricing}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this spare part?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Stock movement history will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteId) await remove.mutateAsync(deleteId);
                setDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}