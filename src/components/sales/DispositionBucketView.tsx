import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CheckCircle2,
  Inbox,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TableSkeleton, EmptyState, DataErrorState } from "@/components/data-states";
import { toast } from "sonner";
import {
  getDispositionBadgeClass,
  getReasonLabel,
  getSourceLabel,
  type LeadDisposition,
} from "@/lib/leadDispositions";

interface UnifiedRow {
  source: string;
  source_table: string;
  source_row_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  subject_or_message: string | null;
  sales_person_id: string | null;
  sales_person_name: string | null;
  disposition: LeadDisposition;
  disposition_reason_code: string | null;
  disposition_reason_note: string | null;
  disposition_at: string | null;
  disposition_by_name: string | null;
  created_at: string;
}

const PAGE_SIZES = [50, 100, 250] as const;

export interface DispositionBucketViewProps {
  target: Exclude<LeadDisposition, "untouched">;
}

export function DispositionBucketView({ target }: DispositionBucketViewProps) {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(50);

  const canReEvaluate = !!(
    roles?.includes("admin") || roles?.includes("sales_manager")
  );

  const queryKey = ["disposition_bucket", target, pageSize] as const;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unified_lead_feed_dispositions")
        .select("*")
        .eq("disposition", target)
        .order("disposition_at", { ascending: false, nullsFirst: false })
        .limit(pageSize);
      if (error) throw error;
      return (data ?? []) as UnifiedRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((r) =>
      [r.name, r.phone, r.email, r.company, r.sales_person_name, r.subject_or_message]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data, search]);

  const handleReEvaluate = async (row: UnifiedRow) => {
    const { error } = await supabase.rpc("set_lead_disposition", {
      _source_table: row.source_table,
      _source_row_id: row.source_row_id,
      _new_disposition: "untouched" as LeadDisposition,
      _reason_code: null,
      _reason_note: null,
    });
    if (error) {
      toast.error(error.message || "Could not re-evaluate this lead.");
      return;
    }
    toast.success("Lead moved back to inbox for re-evaluation.");
    queryClient.invalidateQueries({ queryKey });
  };

  const titleIcon =
    target === "qualified" ? (
      <CheckCircle2 className="h-5 w-5 text-green-600" />
    ) : target === "not_qualified" ? (
      <XCircle className="h-5 w-5 text-destructive" />
    ) : (
      <Inbox className="h-5 w-5 text-amber-600" />
    );

  const titleText =
    target === "qualified"
      ? "Qualified Leads"
      : target === "not_qualified"
        ? "Not Qualified Leads"
        : "Prospects";

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          {titleIcon}
          <h2 className="text-lg font-semibold">{titleText}</h2>
          {data && (
            <Badge variant="secondary" className="ml-1">
              {filtered.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email..."
              className="pl-8 w-64"
            />
          </div>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}/page
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <TableSkeleton rows={8} />}
      {isError && <DataErrorState onRetry={() => refetch()} />}
      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState
          icon={Inbox}
          title={`No ${titleText.toLowerCase()} yet`}
          description="Leads will appear here once a salesperson sets their disposition."
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Set on</TableHead>
                  {target === "not_qualified" && canReEvaluate && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const reasonLabel = getReasonLabel(target, row.disposition_reason_code);
                  return (
                    <TableRow key={`${row.source_table}-${row.source_row_id}`}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getSourceLabel(row.source)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.name || "—"}
                        {row.company && (
                          <div className="text-xs text-muted-foreground">{row.company}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.phone && <div>{row.phone}</div>}
                        {row.email && (
                          <div className="text-xs text-muted-foreground">{row.email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className={getDispositionBadgeClass(target)}
                            >
                              {reasonLabel}
                            </Badge>
                          </TooltipTrigger>
                          {row.disposition_reason_note && (
                            <TooltipContent className="max-w-xs">
                              {row.disposition_reason_note}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.sales_person_name || (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.disposition_at
                          ? format(new Date(row.disposition_at), "dd MMM, HH:mm")
                          : "—"}
                        {row.disposition_by_name && (
                          <div className="text-xs">by {row.disposition_by_name}</div>
                        )}
                      </TableCell>
                      {target === "not_qualified" && canReEvaluate && (
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleReEvaluate(row)}
                            title="Move back to inbox"
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Re-evaluate
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        </div>
      )}
    </Card>
  );
}