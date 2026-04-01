import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  useTicketAiSuggestions,
  useApplyAiSuggestion,
  TicketAiSuggestion,
} from "@/hooks/useTicketAi";
import { Ticket } from "@/hooks/useTickets";
import { useAuth } from "@/hooks/useAuth";
import {
  Sparkles,
  ArrowUpCircle,
  User,
  MessageSquare,
  Check,
  Loader2,
} from "lucide-react";

interface TicketAiSuggestionsCardProps {
  ticket: Ticket;
  onUseReply?: (reply: string) => void;
}

export function TicketAiSuggestionsCard({ ticket, onUseReply }: TicketAiSuggestionsCardProps) {
  const { role, user } = useAuth();
  const { data: suggestions = [], isLoading } = useTicketAiSuggestions(ticket.id);
  const applySuggestion = useApplyAiSuggestion();
  const [editedReply, setEditedReply] = useState<string | null>(null);

  // Only show to Admin, HR, or the assignee
  const canView =
    role === "admin" ||
    role === "hr" ||
    ticket.assigned_to === user?.id;

  if (!canView) return null;

  const latestSuggestion = suggestions[0];
  if (isLoading || !latestSuggestion) return null;

  const isLocked = ticket.status === "closed" || ticket.status === "removed";

  const handleApplyPriority = () => {
    if (!latestSuggestion.suggested_priority) return;
    applySuggestion.mutate({
      suggestionId: latestSuggestion.id,
      ticketId: ticket.id,
      field: "priority",
      value: { priority: latestSuggestion.suggested_priority },
    });
  };

  const handleApplyAssignee = () => {
    if (!latestSuggestion.suggested_assignee_id) return;
    applySuggestion.mutate({
      suggestionId: latestSuggestion.id,
      ticketId: ticket.id,
      field: "assignee",
      value: {
        assigned_to: latestSuggestion.suggested_assignee_id,
        assigned_to_name: latestSuggestion.suggested_assignee_name,
        status: "assigned",
        assigned_at: new Date().toISOString(),
      },
    });
  };

  const handleUseReply = () => {
    const reply = editedReply ?? latestSuggestion.draft_reply;
    if (reply && onUseReply) {
      onUseReply(reply);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-gradient-to-br from-violet-50/50 to-blue-50/50 dark:from-violet-950/20 dark:to-blue-950/20 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-violet-500" />
        <h4 className="font-medium text-sm">AI Suggestions</h4>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300">
          Claude
        </Badge>
        {latestSuggestion.applied && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600">
            <Check className="w-3 h-3 mr-0.5" />
            Applied
          </Badge>
        )}
      </div>

      {/* AI Summary */}
      {ticket.ai_summary && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase font-medium">AI Summary</p>
          <p className="text-sm">{ticket.ai_summary}</p>
        </div>
      )}

      <Separator className="bg-violet-200/50 dark:bg-violet-800/30" />

      {/* Suggested Priority */}
      {latestSuggestion.suggested_priority && (
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground uppercase font-medium">Suggested Priority</p>
            </div>
            <p className="text-sm">
              <Badge variant="outline" className="mr-2 capitalize">
                {latestSuggestion.suggested_priority}
              </Badge>
              <span className="text-muted-foreground">{latestSuggestion.priority_reason}</span>
            </p>
          </div>
          {!isLocked && !latestSuggestion.applied && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs shrink-0"
              onClick={handleApplyPriority}
              disabled={applySuggestion.isPending}
            >
              {applySuggestion.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Sparkles className="w-3 h-3 mr-1" />
              )}
              Apply
            </Button>
          )}
        </div>
      )}

      {/* Suggested Assignee */}
      {latestSuggestion.suggested_assignee_name && (
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground uppercase font-medium">Suggested Assignee</p>
            </div>
            <p className="text-sm">{latestSuggestion.suggested_assignee_name}</p>
          </div>
          {!isLocked && !latestSuggestion.applied && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs shrink-0"
              onClick={handleApplyAssignee}
              disabled={applySuggestion.isPending}
            >
              {applySuggestion.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Sparkles className="w-3 h-3 mr-1" />
              )}
              Apply
            </Button>
          )}
        </div>
      )}

      {/* Draft Reply */}
      {latestSuggestion.draft_reply && (
        <DraftReplySection
          value={editedReply ?? latestSuggestion.draft_reply}
          onChange={(v) => setEditedReply(v)}
          isLocked={isLocked}
          onUseReply={onUseReply ? handleUseReply : undefined}
        />
      )}
    </div>
  );
}

function DraftReplySection({
  value,
  onChange,
  isLocked,
  onUseReply,
}: {
  value: string;
  onChange: (v: string) => void;
  isLocked: boolean;
  onUseReply?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = 0;
    }
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground uppercase font-medium">Draft Reply</p>
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="text-sm bg-background/80"
      />
      {!isLocked && onUseReply && (
        <Button size="sm" variant="outline" className="text-xs" onClick={onUseReply}>
          <MessageSquare className="w-3 h-3 mr-1" />
          Use This Reply
        </Button>
      )}
    </div>
  );
}
