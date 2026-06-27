import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { RentalRecord, useRentals } from "@/hooks/useRentals";
import { ReturnRentalDialog } from "./ReturnRentalDialog";

interface Props {
  rentals: RentalRecord[];
}

const statuses = ["All", "Active", "Returned"];

export function RentalsTable({ rentals }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [returnRental, setReturnRental] = useState<RentalRecord | null>(null);

  const filtered = rentals.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch =
      r.renter_name.toLowerCase().includes(q) ||
      r.renter_contact.toLowerCase().includes(q) ||
      (r.drone?.drone_model?.toLowerCase().includes(q) ?? false) ||
      (r.drone?.serial_number?.toLowerCase().includes(q) ?? false);
    const matchesStatus = statusFilter === "All" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search renter, model, serial..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Drone</TableHead>
              <TableHead>Serial #</TableHead>
              <TableHead>Renter</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Expected Return</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No rentals found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.drone?.drone_model ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.drone?.serial_number ?? "—"}</TableCell>
                  <TableCell>{r.renter_name}</TableCell>
                  <TableCell>{r.renter_contact}</TableCell>
                  <TableCell>{format(new Date(r.rental_start_date), "dd MMM yyyy")}</TableCell>
                  <TableCell>{r.expected_return_date ? format(new Date(r.expected_return_date), "dd MMM yyyy") : "—"}</TableCell>
                  <TableCell className="text-right">₹{Number(r.rental_fee).toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={r.status === "Active"
                        ? "bg-orange-500/10 text-orange-600 border-orange-500/20"
                        : "bg-green-500/10 text-green-600 border-green-500/20"}
                    >
                      {r.status === "Active" ? "On Rent" : "Returned"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "Active" && (
                      <Button size="sm" variant="outline" onClick={() => setReturnRental(r)}>
                        Mark Returned
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">Showing {filtered.length} of {rentals.length} rentals</p>

      <ReturnRentalDialog rental={returnRental} open={!!returnRental} onOpenChange={(o) => !o && setReturnRental(null)} />
    </div>
  );
}
