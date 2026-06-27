import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { BuybackDrone } from "@/hooks/useBuybackDrones";
import { format } from "date-fns";
import { BuybackDroneDetailDialog } from "./BuybackDroneDetailDialog";

interface Props {
  drones: BuybackDrone[];
}

const categories = ["All", "Mini", "Air", "Mavic", "FPV", "Enterprise", "Other"];
const statuses = ["All", "In Stock", "On Rent", "Sold Out"];

export function BuybackDroneTable({ drones }: Props) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedDrone, setSelectedDrone] = useState<BuybackDrone | null>(null);

  const filtered = drones.filter((d) => {
    const matchesSearch =
      d.drone_model.toLowerCase().includes(search.toLowerCase()) ||
      d.serial_number.toLowerCase().includes(search.toLowerCase()) ||
      d.seller_name.toLowerCase().includes(search.toLowerCase()) ||
      (d.buyer_name?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesCategory = categoryFilter === "All" || d.drone_category === categoryFilter;
    const matchesStatus = statusFilter === "All" || d.stock_status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search model, serial, name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Serial #</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead className="text-right">Buyback ₹</TableHead>
              <TableHead className="text-right">Selling ₹</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Profit/Loss</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No drones found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => (
                <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedDrone(d)}>
                  <TableCell>
                    <Badge variant="outline">{d.drone_category}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{d.drone_model}</TableCell>
                  <TableCell className="font-mono text-xs">{d.serial_number}</TableCell>
                  <TableCell>{d.condition}</TableCell>
                  <TableCell className="text-right">₹{d.buyback_price.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">
                    {d.selling_price ? `₹${d.selling_price.toLocaleString("en-IN")}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        d.stock_status === "In Stock"
                          ? "bg-green-500/10 text-green-600 border-green-500/20"
                          : d.stock_status === "On Rent"
                            ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                            : "bg-orange-500/10 text-orange-600 border-orange-500/20"
                      }
                      variant="outline"
                    >
                      {d.stock_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {d.profit_loss !== null ? (
                      <span className={d.profit_loss >= 0 ? "text-green-600" : "text-red-600"}>
                        {d.profit_loss >= 0 ? "+" : ""}₹{d.profit_loss.toLocaleString("en-IN")}
                      </span>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">Showing {filtered.length} of {drones.length} drones</p>
      <BuybackDroneDetailDialog drone={selectedDrone} open={!!selectedDrone} onOpenChange={(open) => !open && setSelectedDrone(null)} />
    </div>
  );
}
