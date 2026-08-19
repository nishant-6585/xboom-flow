import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus, Tag, Trash, Merge, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSalesUsers } from "@/hooks/useSalesUsers";
import { groupDuplicates } from "@/lib/leadDeduplication";
import {
  JUNK_REASONS, NOT_QUALIFIED_REASONS, QUALIFIED_REASONS,
  getDispositionLabel, type LeadDisposition,
} from "@/lib/leadDispositions";

export interface BulkLead {
  source_table: string;
  source_row_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  created_at: string;
  key: string;
}

interface Props {
  selected: BulkLead[];
  onClear: () => void;
  onDone: () => void;
}

const DISPOSITIONS: LeadDisposition[] = ["prospect", "qualified", "not_qualified", "junk"];

function reasonsFor(d: LeadDisposition) {
  if (d === "qualified") return QUALIFIED_REASONS;
  if (d === "not_qualified") return NOT_QUALIFIED_REASONS;
  if (d === "junk") return JUNK_REASONS.filter((r) => r.code !== "auto_no_enquiry");
  return [];
}

/** Bulk action bar for the lead inbox — reuses the existing disposition RPCs. */
export function LeadBulkActionBar({ selected, onClear, onDone }: Props) {
  const { salesUsers } = useSalesUsers();
  const [busy, setBusy] = useState(false);
  const [dispOpen, setDispOpen] = useState(false);
  const [disposition, setDisposition] = useState<LeadDisposition>("prospect");
  const [reasonCode, setReasonCode] = useState("");

  const count = selected.length;

  const runAll = async (
    fn: (lead: BulkLead) => Promise<{ error: unknown }>,
    successMsg: (ok: number) => string,
  ) => {
    setBusy(true);
    let ok = 0;
    let failed = 0;
    for (const lead of selected) {
      const { error } = await fn(lead);
      if (error) failed++;
      else ok++;
    }
    setBusy(false);
    if (ok > 0) toast.success(successMsg(ok));
    if (failed > 0) toast.error(`${failed} lead${failed === 1 ? "" : "s"} could not be updated.`);
    onDone();
    onClear();
  };

  const assignTo = (userId: string, name: string) =>
    runAll(
      (lead) =>
        supabase.rpc("set_lead_assignee" as any, {
          _source_table: lead.source_table,
          _source_row_id: lead.source_row_id,
          _user_id: userId,
        }) as any,
      (ok) => `${ok} lead${ok === 1 ? "" : "s"} assigned to ${name}`,
    );

  const setDispositionBulk = (d: LeadDisposition, code: string | null) =>
    runAll(
      (lead) =>
        supabase.rpc("set_lead_disposition", {
          _source_table: lead.source_table,
          _source_row_id: lead.source_row_id,
          _new_disposition: d as any,
          _reason_code: code,
          _reason_note: null,
        }) as any,
      (ok) => `${ok} lead${ok === 1 ? "" : "s"} set to ${getDispositionLabel(d)}`,
    );

  // Merge duplicates: keep the newest row per contact, mark the older copies as
  // duplicates via the existing not_qualified/duplicate_lead reason (reversible).
  const dupeGroups = useMemo(
    () =>
      groupDuplicates(
        selected,
        (r) => ({ phone: r.phone, email: r.email, name: r.name, company: r.company }),
        (r) => r.created_at,
        (r) => r.key,
      ),
    [selected],
  );
  const olderCopies = useMemo(
    () => dupeGroups.flatMap((g: any) => g.duplicates as BulkLead[]),
    [dupeGroups],
  );

  const mergeDuplicates = async () => {
    if (olderCopies.length === 0) {
      toast.info("No duplicates found in the selected leads.");
      return;
    }
    setBusy(true);
    let ok = 0;
    for (const lead of olderCopies) {
      const { error } = await supabase.rpc("set_lead_disposition", {
        _source_table: lead.source_table,
        _source_row_id: lead.source_row_id,
        _new_disposition: "not_qualified" as any,
        _reason_code: "duplicate_lead",
        _reason_note: null,
      });
      if (!error) ok++;
    }
    setBusy(false);
    toast.success(`${ok} duplicate${ok === 1 ? "" : "s"} merged into the newest lead`);
    onDone();
    onClear();
  };

  const reasons = reasonsFor(disposition);
  const needsReason = reasons.length > 0;

  return (
    <>
      <div className="sticky bottom-3 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
        <span className="text-[13px] font-medium">
          {count} selected
        </span>
        <span className="text-muted-foreground">·</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy}>
              <UserPlus className="h-4 w-4 mr-2" />
              Assign to…
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Assign {count} lead{count === 1 ? "" : "s"} to
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {salesUsers.map((u) => (
              <DropdownMenuItem key={u.user_id} onClick={() => assignTo(u.user_id, u.name)}>
                {u.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => { setDisposition("prospect"); setReasonCode(""); setDispOpen(true); }}
        >
          <Tag className="h-4 w-4 mr-2" />
          Set disposition…
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => setDispositionBulk("junk", "no_enquiry")}
        >
          <Trash className="h-4 w-4 mr-2" />
          Mark junk
        </Button>

        <Button variant="outline" size="sm" disabled={busy} onClick={mergeDuplicates}>
          <Merge className="h-4 w-4 mr-2" />
          Merge duplicates
          {olderCopies.length > 0 && (
            <span className="ml-1.5 font-mono text-[10px] text-primary">
              {olderCopies.length}
            </span>
          )}
        </Button>

        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear} aria-label="Clear selection">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={dispOpen} onOpenChange={(o) => !busy && setDispOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set disposition</DialogTitle>
            <DialogDescription>
              Applies to {count} selected lead{count === 1 ? "" : "s"}. Fully reversible.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-disp">Disposition</Label>
              <Select
                value={disposition}
                onValueChange={(v) => { setDisposition(v as LeadDisposition); setReasonCode(""); }}
              >
                <SelectTrigger id="bulk-disp"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DISPOSITIONS.map((d) => (
                    <SelectItem key={d} value={d}>{getDispositionLabel(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {needsReason && (
              <div className="space-y-2">
                <Label htmlFor="bulk-reason">Reason</Label>
                <Select value={reasonCode} onValueChange={setReasonCode}>
                  <SelectTrigger id="bulk-reason">
                    <SelectValue placeholder="Pick a reason…" />
                  </SelectTrigger>
                  <SelectContent>
                    {reasons
                      .filter((r) => r.code !== "custom")
                      .map((r) => (
                        <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDispOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy || (needsReason && !reasonCode)}
              onClick={async () => {
                setDispOpen(false);
                await setDispositionBulk(disposition, needsReason ? reasonCode : null);
              }}
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
