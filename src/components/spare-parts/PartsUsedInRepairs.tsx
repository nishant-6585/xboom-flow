import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wrench } from "lucide-react";

interface Row {
  part_id: string;
  part_name: string;
  part_code: string | null;
  cost_price: number | null;
  qty_used: number;
  total_cost: number;
  repairs_count: number;
}

interface RawTx {
  part_id: string;
  repair_id: string | null;
  quantity_change: number;
  spare_parts_inventory: {
    part_name: string;
    part_code: string | null;
    cost_price: number | null;
  } | null;
}

export function PartsUsedInRepairs() {
  const { data, isLoading } = useQuery({
    queryKey: ["parts_used_in_repairs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("spare_parts_transactions" as never)
        .select(
          "part_id, repair_id, quantity_change, spare_parts_inventory(part_name, part_code, cost_price)",
        )
        .not("repair_id", "is", null)
        .eq("change_type", "REMOVE")
        .eq("reason", "SALE")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data as unknown as RawTx[]) ?? [];
    },
  });

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    const repairsSet = new Map<string, Set<string>>();
    for (const tx of data ?? []) {
      if (!tx.spare_parts_inventory) continue;
      const key = tx.part_id;
      const cost = Number(tx.spare_parts_inventory.cost_price ?? 0);
      const qty = Number(tx.quantity_change ?? 0);
      const prev = map.get(key) ?? {
        part_id: key,
        part_name: tx.spare_parts_inventory.part_name,
        part_code: tx.spare_parts_inventory.part_code,
        cost_price: cost,
        qty_used: 0,
        total_cost: 0,
        repairs_count: 0,
      };
      prev.qty_used += qty;
      prev.total_cost += qty * cost;
      map.set(key, prev);
      if (tx.repair_id) {
        const set = repairsSet.get(key) ?? new Set<string>();
        set.add(tx.repair_id);
        repairsSet.set(key, set);
      }
    }
    for (const [k, v] of map) v.repairs_count = repairsSet.get(k)?.size ?? 0;
    return Array.from(map.values()).sort((a, b) => b.qty_used - a.qty_used).slice(0, 10);
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4" /> Parts used in repairs
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-4">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            No parts have been used in repairs yet.
          </div>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Repairs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.part_id}>
                    <TableCell>
                      <div className="font-medium">{r.part_name}</div>
                      {r.part_code && (
                        <div className="text-xs text-muted-foreground font-mono">{r.part_code}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{r.qty_used}</TableCell>
                    <TableCell className="text-right">
                      ₹{Number(r.total_cost).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right">{r.repairs_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}