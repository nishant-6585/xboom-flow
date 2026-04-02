import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { Ticket } from "@/hooks/useTickets";
import {
  useTicketResolution,
  useRunAiResolution,
  useApproveResolution,
  useRejectResolution,
  ImplementationReport,
} from "@/hooks/useTicketResolution";
import { useSubmitResolutionFeedback } from "@/hooks/useAiResolutionMetrics";
import {
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  ChevronDown,
  RefreshCw,
  Sparkles,
  Shield,
  FileCode,
  ClipboardCheck,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { toast } from "sonner";

interface TicketAiResolutionPanelProps {
  ticket: Ticket;
}

const complexityColors: Record<string, string> = {
  simple: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  moderate: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  complex: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const typeLabels: Record<string, string> = {
  bug_fix: "🐛 Bug Fix",
  enhancement: "✨ Enhancement",
  feature: "🚀 Feature",
  task: "📋 Task",
};

export function TicketAiResolutionPanel({ ticket }: TicketAiResolutionPanelProps) {
  const { role, user } = useAuth();
  const { data: resolution, isLoading } = useTicketResolution(ticket.id);
  const runResolution = useRunAiResolution();
  const approveResolution = useApproveResolution();
  const rejectResolution = useRejectResolution();
  const submitFeedback = useSubmitResolutionFeedback();
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<string | null>(null);
  const autoTriggeredRef = useRef(false);

  const canView = role === "admin" || role === "hr" || ticket.assigned_to === user?.id;

  // Auto-trigger for IT/technical_support + open tickets with no existing resolution
  useEffect(() => {
    if (autoTriggeredRef.current) return;
    if (!canView || isLoading) return;
    if (resolution) return;
    if (ticket.ai_resolution_status === "analyzing") return;
    if (ticket.status !== "open") return;
    if (ticket.category !== "technical_support") return;
    
    autoTriggeredRef.current = true;
    runResolution.mutate(ticket.id);
  }, [canView, isLoading, resolution, ticket.id, ticket.status, ticket.category, ticket.ai_resolution_status]);

  if (!canView) return null;

  const isAnalyzing = ticket.ai_resolution_status === "analyzing";
  const canTrigger =
    (role === "admin" || role === "hr") &&
    (!ticket.ai_resolution_status || ticket.ai_resolution_status === "rejected");

  const handleCopyPrompt = () => {
    if (resolution?.lovable_prompt) {
      navigator.clipboard.writeText(resolution.lovable_prompt);
      toast.success("Lovable prompt copied to clipboard");
    }
  };

  const handleCopyReport = () => {
    if (resolution?.implementation_report) {
      navigator.clipboard.writeText(JSON.stringify(resolution.implementation_report, null, 2));
      toast.success("Implementation report copied to clipboard");
    }
  };

  const handleApprove = () => {
    if (!resolution) return;
    approveResolution.mutate({ resolutionId: resolution.id, ticketId: ticket.id });
  };

  const handleReject = () => {
    if (!resolution || !rejectionReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    rejectResolution.mutate({
      resolutionId: resolution.id,
      ticketId: ticket.id,
      reason: rejectionReason,
    });
    setShowRejectInput(false);
    setRejectionReason("");
  };

  const handleRerun = () => {
    runResolution.mutate(ticket.id);
  };

  // ANALYZING state
  if (isAnalyzing || runResolution.isPending) {
    return (
      <div className="border rounded-lg p-4 bg-gradient-to-br from-violet-50/50 to-indigo-50/50 dark:from-violet-950/20 dark:to-indigo-950/20">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bot className="w-5 h-5 text-violet-500" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-violet-500 rounded-full animate-ping" />
          </div>
          <div>
            <h4 className="font-medium text-sm">🤖 AI Resolution Plan</h4>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Claude is analyzing this ticket...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No resolution + can trigger
  if (!resolution && !isLoading) {
    if (!canTrigger) return null;
    return (
      <div className="border rounded-lg p-4 bg-gradient-to-br from-violet-50/50 to-indigo-50/50 dark:from-violet-950/20 dark:to-indigo-950/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-violet-500" />
            <h4 className="font-medium text-sm">🤖 AI Resolution</h4>
          </div>
          <Button size="sm" variant="outline" onClick={handleRerun} disabled={runResolution.isPending}>
            <Sparkles className="w-3 h-3 mr-1" />
            Run AI Resolution
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !resolution) return null;

  // APPROVED state — show implementation report
  if (resolution.approval_status === "approved") {
    const report = resolution.implementation_report as ImplementationReport | null;
    return (
      <div className="border rounded-lg p-4 bg-green-50/50 dark:bg-green-950/20 space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <h4 className="font-medium text-sm">✅ AI Resolution Applied</h4>
          {resolution.approved_at && (
            <span className="text-xs text-muted-foreground ml-auto">
              Approved by {resolution.approved_by_name} on{" "}
              {new Date(resolution.approved_at).toLocaleDateString()}
            </span>
          )}
        </div>

        {report && (
          <>
            {/* Changes Summary */}
            {report.changes_summary && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase font-medium">Changes Made</p>
                <p className="text-sm bg-muted/30 p-3 rounded-md">{report.changes_summary}</p>
              </div>
            )}

            {/* Files Modified */}
            {report.files_changed && report.files_changed.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase font-medium flex items-center gap-1">
                  <FileCode className="w-3 h-3" /> Files Modified
                </p>
                <ul className="text-sm bg-muted/30 p-3 rounded-md space-y-0.5">
                  {report.files_changed.map((file, i) => (
                    <li key={i} className="font-mono text-xs">• {file}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Test Steps */}
            {report.test_steps && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase font-medium flex items-center gap-1">
                  <ClipboardCheck className="w-3 h-3" /> How to Verify
                </p>
                <p className="text-sm bg-muted/30 p-3 rounded-md whitespace-pre-wrap">{report.test_steps}</p>
              </div>
            )}

            {/* Notes */}
            {report.notes && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase font-medium">Notes</p>
                <p className="text-sm bg-muted/30 p-3 rounded-md">{report.notes}</p>
              </div>
            )}

            <Button size="sm" variant="outline" onClick={handleCopyReport}>
              <Copy className="w-3 h-3 mr-1" />
              📋 Copy Full Implementation Report
            </Button>
          </>
        )}

        {/* Lovable Prompt still visible */}
        {resolution.lovable_prompt && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground uppercase font-medium">Lovable Prompt</p>
              <Button size="sm" variant="ghost" className="h-7" onClick={handleCopyPrompt}>
                <Copy className="w-3 h-3 mr-1" />
                Copy
              </Button>
            </div>
            <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-auto max-h-40 whitespace-pre-wrap font-mono">
              {resolution.lovable_prompt}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // REJECTED state
  if (resolution.approval_status === "rejected") {
    return (
      <div className="border rounded-lg p-4 bg-red-50/50 dark:bg-red-950/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <h4 className="font-medium text-sm">AI Resolution Rejected</h4>
          </div>
          {canTrigger && (
            <Button size="sm" variant="outline" onClick={handleRerun} disabled={runResolution.isPending}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Re-run AI Analysis
            </Button>
          )}
        </div>
        {resolution.rejection_reason && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Reason:</span> {resolution.rejection_reason}
          </p>
        )}
      </div>
    );
  }

  // PENDING APPROVAL state — applying state
  const isApplying = approveResolution.isPending;

  return (
    <div className="border rounded-lg p-4 bg-gradient-to-br from-violet-50/50 to-indigo-50/50 dark:from-violet-950/20 dark:to-indigo-950/20 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Bot className="w-5 h-5 text-violet-500" />
        <h4 className="font-medium text-sm">🤖 AI Resolution Plan</h4>
        {resolution.resolution_type && (
          <Badge variant="secondary" className="text-[10px]">
            {typeLabels[resolution.resolution_type] || resolution.resolution_type}
          </Badge>
        )}
        {resolution.estimated_complexity && (
          <Badge className={`text-[10px] ${complexityColors[resolution.estimated_complexity] || ""}`}>
            {resolution.estimated_complexity}
          </Badge>
        )}
      </div>

      {/* Confidence */}
      {resolution.confidence_score != null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground uppercase font-medium">Confidence</p>
            <span className="text-sm font-medium">{resolution.confidence_score}/100</span>
          </div>
          <Progress value={resolution.confidence_score} className="h-2" />
        </div>
      )}

      {/* Root Cause — default open */}
      {resolution.root_cause && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground uppercase font-medium hover:text-foreground transition-colors">
            <ChevronDown className="w-3 h-3" />
            Root Cause
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1">
            <p className="text-sm bg-muted/30 p-3 rounded-md">{resolution.root_cause}</p>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Resolution Plan — default open */}
      {resolution.resolution_plan && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground uppercase font-medium hover:text-foreground transition-colors">
            <ChevronDown className="w-3 h-3" />
            Resolution Plan
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1">
            <p className="text-sm bg-muted/30 p-3 rounded-md whitespace-pre-wrap">{resolution.resolution_plan}</p>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Comment posted */}
      {resolution.resolution_comment && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase font-medium">Comment posted to reporter</p>
          <div className="text-sm bg-violet-100/50 dark:bg-violet-900/20 p-3 rounded-md border border-violet-200/50 dark:border-violet-800/30">
            {resolution.resolution_comment}
          </div>
        </div>
      )}

      {/* Lovable Prompt — copy button ABOVE the text box */}
      {resolution.lovable_prompt && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground uppercase font-medium">Lovable Prompt</p>
            <Button size="sm" variant="ghost" className="h-7" onClick={handleCopyPrompt}>
              <Copy className="w-3 h-3 mr-1" />
              📋 Copy
            </Button>
          </div>
          <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-auto max-h-48 whitespace-pre-wrap font-mono">
            {resolution.lovable_prompt}
          </pre>
        </div>
      )}

      {/* Human review notice */}
      {resolution.needs_human_review && resolution.review_reason && (
        <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 p-2 rounded-md">
          <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{resolution.review_reason}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={handleApprove}
          disabled={isApplying || rejectResolution.isPending}
        >
          {isApplying ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ⏳ Applying resolution in Lovable...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Approve & Resolve Ticket
            </>
          )}
        </Button>
        {!showRejectInput ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setShowRejectInput(true)}
            disabled={isApplying || rejectResolution.isPending}
          >
            <XCircle className="w-3 h-3 mr-1" />
            Reject
          </Button>
        ) : (
          <div className="flex-1 space-y-2">
            <Textarea
              placeholder="Reason for rejection (required)..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={2}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleReject} disabled={rejectResolution.isPending || !rejectionReason.trim()}>
                {rejectResolution.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Confirm Reject
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowRejectInput(false); setRejectionReason(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
