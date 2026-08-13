import { useEffect, useState } from "react";
import { MoreVertical, CheckCircle2, XCircle, ArrowUpRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DispositionDialog } from "./DispositionDialog";
import {
  getDispositionLabel,
  type LeadDisposition,
} from "@/lib/leadDispositions";

export interface LeadRowActionsProps {
  sourceTable:
    | "leads"
    | "form_leads"
    | "interakt_leads"
    | "email_leads"
    | "google_ads_leads"
    | "call_logs"
    | "manychat_leads";
  sourceRowId: string;
  contactName?: string;
  contactPhone?: string | null;
  currentDisposition?: LeadDisposition | string | null;
  onMoveToProspect?: () => void;
  onDispositionChanged?: () => void;
  /** Render as a compact icon button (default true). When false, used inline. */
  compact?: boolean;
}

export function LeadRowActions({
  sourceTable,
  sourceRowId,
  contactName,
  contactPhone,
  currentDisposition,
  onMoveToProspect,
  onDispositionChanged,
  compact = true,
}: LeadRowActionsProps) {
  const { role } = useAuth();
  const canReevaluate = role === "admin" || role === "sales_manager";

  const [qualifyOpen, setQualifyOpen] = useState(false);
  const [notQualifyOpen, setNotQualifyOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Radix can leave `pointer-events: none` on <body> when a dropdown unmounts
  // in the same tick a dialog mounts — that freezes the whole page.
  useEffect(() => {
    if (!menuOpen && !qualifyOpen && !notQualifyOpen) {
      document.body.style.pointerEvents = "";
    }
  }, [menuOpen, qualifyOpen, notQualifyOpen]);
  useEffect(() => () => {
    document.body.style.pointerEvents = "";
  }, []);

  // Open dialogs only after the dropdown has fully closed.
  const openAfterMenuClose = (fn: () => void) => {
    setMenuOpen(false);
    setTimeout(fn, 0);
  };

  const disposition = (currentDisposition ?? "untouched") as LeadDisposition;
  const isTerminal = disposition === "qualified" || disposition === "not_qualified";

  const handleReevaluate = async () => {
    setSubmitting(true);
    const { error } = await supabase.rpc("set_lead_disposition", {
      _source_table: sourceTable,
      _source_row_id: sourceRowId,
      _new_disposition: "untouched",
      _reason_code: null,
      _reason_note: null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "Could not re-evaluate lead.");
      return;
    }
    toast.success("Disposition cleared — back to New");
    onDispositionChanged?.();
  };

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={compact ? "icon" : "sm"}
            className={compact ? "h-7 w-7" : ""}
            aria-label="Lead actions"
            disabled={submitting}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {isTerminal
              ? `Already ${getDispositionLabel(disposition)}`
              : "Set lead disposition"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {onMoveToProspect && (
            <DropdownMenuItem
              onClick={onMoveToProspect}
              disabled={disposition === "prospect"}
            >
              <ArrowUpRight className="h-4 w-4 mr-2" />
              Move to Prospect
            </DropdownMenuItem>
          )}

          {!isTerminal && (
            <>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  openAfterMenuClose(() => setQualifyOpen(true));
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                Qualify…
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  openAfterMenuClose(() => setNotQualifyOpen(true));
                }}
              >
                <XCircle className="h-4 w-4 mr-2 text-destructive" />
                Not Qualify…
              </DropdownMenuItem>
            </>
          )}

          {isTerminal && canReevaluate && (
            <DropdownMenuItem onClick={handleReevaluate} disabled={submitting}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Re-evaluate
            </DropdownMenuItem>
          )}

          {isTerminal && !canReevaluate && (
            <DropdownMenuItem disabled>
              Only manager/admin can re-evaluate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DispositionDialog
        open={qualifyOpen}
        onOpenChange={setQualifyOpen}
        sourceTable={sourceTable}
        sourceRowId={sourceRowId}
        contactName={contactName}
        contactPhone={contactPhone}
        target="qualified"
        onSuccess={onDispositionChanged}
      />
      <DispositionDialog
        open={notQualifyOpen}
        onOpenChange={setNotQualifyOpen}
        sourceTable={sourceTable}
        sourceRowId={sourceRowId}
        contactName={contactName}
        contactPhone={contactPhone}
        target="not_qualified"
        onSuccess={onDispositionChanged}
      />
    </>
  );
}