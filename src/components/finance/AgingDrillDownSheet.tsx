import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { AgingItem, AgingBucket } from "@/hooks/useAgingShared";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const BUCKET_LABELS: Record<AgingBucket, string> = {
  current: "Current (not yet due)",
  "0-30": "1-30 days overdue",
  "31-60": "31-60 days overdue",
  "61-90": "61-90 days overdue",
  "90+": "90+ days overdue",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counterpartyName: string | null;
  items: AgingItem[];
  bucket: AgingBucket | "all";
  rowLabel: string;
  kind: "ar" | "ap";
}

export function AgingDrillDownSheet({
  open,
  onOpenChange,
  counterpartyName,
  items,
  bucket,
  rowLabel,
  kind,
}: Props) {
  const filtered =
    bucket === "all" ? items : items.filter((i) => i.bucket === bucket);
  const outstanding = filtered.reduce((s, i) => s + i.outstanding, 0);
  const oldest = filtered.reduce((m, i) => Math.max(m, i.daysOverdue), 0);

  const outstandingClass = (d: number) =>
    d > 60
      ? "text-destructive font-semibold"
      : d > 30
        ? "text-warning font-medium"
        : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {counterpartyName ?? rowLabel} —{" "}
            {bucket === "all" ? "All buckets" : BUCKET_LABELS[bucket]}
          </SheetTitle>
          <SheetDescription>
            {filtered.length} {filtered.length === 1 ? "item" : "items"},{" "}
            {INR.format(outstanding)} outstanding
            {oldest > 0 ? `, oldest ${oldest} days overdue` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{kind === "ar" ? "Invoice #" : "Procurement #"}</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead>Bucket</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    No items in this bucket.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.number}</TableCell>
                    <TableCell>{format(new Date(it.date), "dd MMM yyyy")}</TableCell>
                    <TableCell>{format(new Date(it.due_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {INR.format(it.total)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${outstandingClass(it.daysOverdue)}`}
                    >
                      {INR.format(it.outstanding)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {it.daysOverdue > 0 ? `${it.daysOverdue}d` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          it.bucket === "current"
                            ? "secondary"
                            : it.bucket === "90+"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {it.bucket}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {kind === "ar" && (
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.info("Reminders coming in a future update", {
                  description: "We'll wire dunning emails/SMS in a separate workflow.",
                })
              }
            >
              <Send className="h-4 w-4 mr-2" />
              Send reminder
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}