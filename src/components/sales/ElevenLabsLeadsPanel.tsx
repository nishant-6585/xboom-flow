import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Bot,
  Phone,
  Search,
  Sparkles,
  Clock,
  Target,
  Wallet,
  RefreshCw,
  MessageCircle,
  UserPlus,
  CheckCircle2,
  Flame,
  HelpCircle,
  XCircle,
  PhoneCall,
  Link2,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  BadgeCheck,
  Lightbulb,
  UserX,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

type ElevenLead = {
  id: string;
  caller_number: string;
  customer_name: string | null;
  call_duration: number | null;
  requirement: string | null;
  budget: string | null;
  priority: string | null;
  lead_score: number | null;
  lead_status: string | null;
  raw_transcript: string | null;
  notes: string | null;
  created_at: string;
};

type CallMapping = {
  elevenlabs_call_log_id: string;
  myoperator_call_log_id: string | null;
  match_type: "TRANSCRIPT_MATCH" | "TIME_MATCH" | "UNMATCHED";
  match_confidence: number;
  extracted_phone_number: string | null;
  extracted_name: string | null;
};

type AIAnalysis = {
  transcript: string | null;
  summary: string | null;
  intent: string | null;
  budget: string | null;
  extracted_data: any;
};

type ChatTurn = { role: "agent" | "user"; text: string };

// ---------- Helpers ----------

const formatPhone = (raw: string | null | undefined) => {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91"))
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return raw.startsWith("+") ? raw : `+${digits}`;
};

const formatDuration = (s: number | null) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
};

const extractName = (transcript: string | null): string | null => {
  if (!transcript) return null;
  const match = transcript.match(/my name is ([A-Za-z][A-Za-z\s]{1,30})/i);
  if (match) return match[1].trim().split(/\s+/).slice(0, 3).join(" ");
  const m2 = transcript.match(/this is ([A-Za-z][A-Za-z\s]{1,30})/i);
  if (m2) return m2[1].trim().split(/\s+/).slice(0, 3).join(" ");
  return null;
};

/**
 * Resolve the most useful display name for a lead.
 * Priority: extracted_name (mapping) → customer_name → transcript regex → "Unidentified Caller".
 * Phone is shown separately below the name; we never substitute the phone for the name.
 */
const resolveName = (
  lead: ElevenLead,
  mapping?: CallMapping,
): { name: string; isUnidentified: boolean } => {
  const candidate =
    (mapping?.extracted_name && mapping.extracted_name.trim()) ||
    (lead.customer_name && lead.customer_name !== "Unknown" ? lead.customer_name : "") ||
    extractName(lead.raw_transcript) ||
    "";
  if (candidate) return { name: candidate, isUnidentified: false };
  return { name: "Unidentified Caller", isUnidentified: true };
};

/**
 * Build a "Why this matters" reason from transcript + summary signals.
 * Returns null when there's nothing notable to surface.
 */
const whyThisMatters = (
  lead: ElevenLead,
  summary: string | null,
): string | null => {
  const text = `${summary ?? ""} ${lead.raw_transcript ?? ""} ${lead.notes ?? ""}`.toLowerCase();
  const reasons: string[] = [];
  if (/\b(price|pricing|cost|quote|quotation)\b/.test(text)) reasons.push("asked for pricing");
  if (/\b(buy|purchase|order|book|confirm)\b/.test(text)) reasons.push("intent to purchase");
  if (/\b(callback|call back|call me|reach me)\b/.test(text)) reasons.push("requested a callback");
  if (/\b(budget|lakh|crore|inr|rs\.?\s*\d)/i.test(text) || lead.budget) reasons.push("shared budget");
  if (/\b(urgent|asap|today|tomorrow|this week)\b/.test(text)) reasons.push("urgent timeline");
  if (/\b(demo|trial|sample)\b/.test(text)) reasons.push("asked for a demo");
  if (lead.requirement) reasons.push(`confirmed need for ${lead.requirement.toLowerCase()}`);
  if (!reasons.length) return null;
  const first = reasons[0].charAt(0).toUpperCase() + reasons[0].slice(1);
  return [first, ...reasons.slice(1, 2)].join(" • ");
};

/**
 * Sales-friendly match label with thresholds.
 * >90 = Exact, 70–90 = Likely, otherwise "Not linked to call logs".
 */
const getMatchInfo = (matchType: string | undefined, confidence: number) => {
  const conf = confidence || 0;
  const linked = matchType && matchType !== "UNMATCHED";
  if (linked && conf > 90) {
    return {
      label: "Exact Match",
      Icon: ShieldCheck,
      cls: "bg-success/15 text-success border-success/30",
      tooltip: `Confidence ${conf}% — phone number was confirmed in the transcript.`,
      confidence: conf,
      linked: true as const,
    };
  }
  if (linked && conf >= 70) {
    return {
      label: "Likely Match",
      Icon: ShieldAlert,
      cls: "bg-warning/15 text-warning border-warning/30",
      tooltip: `Confidence ${conf}% — matched by call time and duration. Verify before relying on it.`,
      confidence: conf,
      linked: true as const,
    };
  }
  return {
    label: "Not linked to call logs",
    Icon: ShieldX,
    cls: "bg-muted text-muted-foreground border-border",
    tooltip:
      "This lead was captured via AI but not yet matched with MyOperator call records. Use ‘Link manually’ to attach it.",
    confidence: conf,
    linked: false as const,
  };
};

/** Detect whether the lead shows clear buying signals. */
const isHotLead = (lead: ElevenLead): boolean => {
  if ((lead.priority ?? "").toLowerCase() === "high") return true;
  const hay = `${lead.raw_transcript ?? ""} ${lead.notes ?? ""}`.toLowerCase();
  return /\b(buy|price|quote|purchase|order|pay|discount|negotiate)\b/.test(hay);
};

const priorityReason = (transcript: string | null): string | null => {
  if (!transcript) return null;
  const lc = transcript.toLowerCase();
  const hits: string[] = [];
  ["buy", "price", "quote", "purchase", "urgent", "asap", "today"].forEach((w) => {
    if (lc.includes(w)) hits.push(`"${w}"`);
  });
  return hits.length ? `Mentioned ${hits.slice(0, 3).join(" + ")}` : null;
};

const callOutcome = (
  summary: string | null,
  transcript: string | null,
): { label: string; icon: typeof CheckCircle2; tone: string } => {
  const text = `${summary ?? ""} ${transcript ?? ""}`.toLowerCase();
  if (
    /not interested|wrong number|do not call|stop calling|irrelevant/i.test(text)
  )
    return { label: "Not Relevant", icon: XCircle, tone: "text-destructive" };
  if (/buy|price|quote|purchase|urgent|interested in buying|ready/i.test(text))
    return { label: "Interested", icon: CheckCircle2, tone: "text-success" };
  if (/explor|just looking|inquir|curious|info|information/i.test(text))
    return { label: "Just Exploring", icon: HelpCircle, tone: "text-warning" };
  return { label: "Follow-up", icon: HelpCircle, tone: "text-muted-foreground" };
};

const priorityRank = (p: string | null) => {
  switch ((p ?? "").toLowerCase()) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
    default:
      return 3;
  }
};

const priorityClasses = (p: string | null) => {
  switch ((p ?? "").toLowerCase()) {
    case "high":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "medium":
      return "bg-warning/15 text-warning border-warning/30";
    case "low":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
};

const isNewLead = (createdAt: string) =>
  Date.now() - new Date(createdAt).getTime() < 60 * 60 * 1000;

// Parse transcript into chat turns. Supports JSON dumps from ElevenLabs and plain "Agent:/User:" text.
const parseTranscript = (raw: string | null): ChatTurn[] => {
  if (!raw) return [];
  const trimmed = raw.trim();

  // Try JSON first
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : parsed?.transcript ?? [];
      if (Array.isArray(arr)) {
        return arr
          .map((m: any): ChatTurn | null => {
            const text =
              m?.message ??
              m?.text ??
              m?.content ??
              (typeof m === "string" ? m : null);
            const roleRaw = (m?.role ?? m?.speaker ?? "").toString().toLowerCase();
            if (!text) return null;
            const role: ChatTurn["role"] =
              roleRaw.includes("agent") ||
              roleRaw.includes("assistant") ||
              roleRaw.includes("ai")
                ? "agent"
                : "user";
            return { role, text: String(text).trim() };
          })
          .filter((x): x is ChatTurn => !!x && !!x.text);
      }
    } catch {
      // fall through
    }
  }

  // Plain text "Agent: ... User: ..."
  const lineRe = /^(agent|assistant|ai|user|customer|caller)\s*[:\-]\s*(.+)$/i;
  const lines = trimmed.split(/\r?\n/);
  const turns: ChatTurn[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    const m = l.match(lineRe);
    if (m) {
      const role: ChatTurn["role"] = /user|customer|caller/i.test(m[1])
        ? "user"
        : "agent";
      turns.push({ role, text: m[2].trim() });
    } else if (turns.length) {
      turns[turns.length - 1].text += " " + l;
    } else {
      turns.push({ role: "user", text: l });
    }
  }
  return turns;
};

// ---------- Component ----------

export function ElevenLabsLeadsPanel() {
  const [leads, setLeads] = useState<ElevenLead[]>([]);
  const [mappings, setMappings] = useState<Record<string, CallMapping>>({});
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [rematching, setRematching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [intentFilter, setIntentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [budgetFilter, setBudgetFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);
  const [linkOptions, setLinkOptions] = useState<Array<{ id: string; caller_number: string; created_at: string; call_duration: number | null }>>([]);
  const [linkSearch, setLinkSearch] = useState("");
  const [linking, setLinking] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("call_logs")
      .select(
        "id,caller_number,customer_name,call_duration,requirement,budget,priority,lead_score,lead_status,raw_transcript,notes,created_at",
      )
      .eq("lead_source", "ElevenLabs")
      .order("created_at", { ascending: false })
      .limit(500);
    if (!error && data) setLeads(data as ElevenLead[]);
    const ids = (data ?? []).map((d: any) => d.id);
    if (ids.length) {
      const [{ data: maps }, { data: ana }] = await Promise.all([
        supabase
          .from("call_mapping")
          .select(
            "elevenlabs_call_log_id,myoperator_call_log_id,match_type,match_confidence,extracted_phone_number,extracted_name",
          )
          .in("elevenlabs_call_log_id", ids),
        supabase
          .from("call_ai_analysis")
          .select("call_log_id,summary")
          .in("call_log_id", ids),
      ]);
      const dict: Record<string, CallMapping> = {};
      (maps ?? []).forEach((m: any) => (dict[m.elevenlabs_call_log_id] = m));
      setMappings(dict);
      const sumDict: Record<string, string> = {};
      (ana ?? []).forEach((a: any) => {
        if (a.summary) sumDict[a.call_log_id] = a.summary;
      });
      setSummaries(sumDict);
    } else {
      setMappings({});
      setSummaries({});
    }
    setLoading(false);
  };

  const triggerRematch = async () => {
    setRematching(true);
    try {
      const { data, error } = await supabase.functions.invoke("backfill-call-mapping", {
        body: { limit: 100 },
      });
      if (error) throw error;
      toast.success(
        `Re-matched ${data?.processed ?? 0} leads — ${data?.matched_transcript ?? 0} via transcript, ${data?.matched_time ?? 0} via time`,
      );
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Re-match failed");
    } finally {
      setRematching(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("elevenlabs-leads")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_logs" },
        (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (row?.lead_source === "ElevenLabs") load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const selected = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId],
  );

  useEffect(() => {
    if (!selectedId) {
      setAnalysis(null);
      return;
    }
    setAnalysisLoading(true);
    supabase
      .from("call_ai_analysis")
      .select("transcript,summary,intent,budget,extracted_data")
      .eq("call_log_id", selectedId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setAnalysis(data as AIAnalysis | null);
        setAnalysisLoading(false);
      });
  }, [selectedId]);

  const budgetMatches = (b: string | null, filter: string) => {
    if (filter === "all") return true;
    if (!b) return filter === "unknown";
    const num = parseFloat(b.replace(/[^\d.]/g, ""));
    const lakhs = /lakh|lac|l\b/i.test(b) ? num : num >= 100000 ? num / 100000 : 0;
    if (filter === "under1") return lakhs > 0 && lakhs < 1;
    if (filter === "1to5") return lakhs >= 1 && lakhs <= 5;
    if (filter === "5plus") return lakhs > 5;
    return true;
  };

  const filtered = useMemo(() => {
    const list = leads.filter((l) => {
      if (
        priorityFilter !== "all" &&
        (l.priority ?? "").toLowerCase() !== priorityFilter
      )
        return false;
      if (intentFilter !== "all" && (l.requirement ?? "") !== intentFilter)
        return false;
      if (
        statusFilter !== "all" &&
        (l.lead_status ?? "New").toLowerCase() !== statusFilter
      )
        return false;
      if (!budgetMatches(l.budget, budgetFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !l.caller_number?.toLowerCase().includes(q) &&
          !(l.customer_name ?? "").toLowerCase().includes(q) &&
          !(l.raw_transcript ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
    // Sort priority: HOT → Exact Match → High Intent → Recent.
    // Lower rank value = appears first.
    const matchRank = (id: string) => {
      const m = mappings[id];
      const conf = m?.match_confidence ?? 0;
      if (m && m.match_type !== "UNMATCHED" && conf > 90) return 0; // Exact
      if (m && m.match_type !== "UNMATCHED" && conf >= 70) return 1; // Likely
      return 2; // Not linked
    };
    return list.sort((a, b) => {
      const aHot = isHotLead(a) ? 0 : 1;
      const bHot = isHotLead(b) ? 0 : 1;
      if (aHot !== bHot) return aHot - bHot;
      const mr = matchRank(a.id) - matchRank(b.id);
      if (mr !== 0) return mr;
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr !== 0) return pr;
      const sc = (b.lead_score ?? 0) - (a.lead_score ?? 0);
      if (sc !== 0) return sc;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [leads, search, priorityFilter, intentFilter, statusFilter, budgetFilter, mappings]);

  const stats = useMemo(() => {
    const total = leads.length;
    const high = leads.filter((l) => l.priority === "High").length;
    const newCount = leads.filter((l) => isNewLead(l.created_at)).length;
    const avgScore = total
      ? Math.round(leads.reduce((s, l) => s + (l.lead_score ?? 0), 0) / total)
      : 0;
    return { total, high, newCount, avgScore };
  }, [leads]);

  const updateLeadStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("call_logs")
      .update({ lead_status: status })
      .eq("id", id);
    if (error) return toast.error("Failed to update status");
    toast.success(`Marked as ${status}`);
    load();
  };

  const callTel = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };
  const openWhatsApp = (phone: string) => {
    const num = phone.replace(/\D/g, "");
    window.open(`https://wa.me/${num}`, "_blank");
  };

  // ---- Manual link recovery (UNMATCHED leads) ----
  const openLinkDialog = async (elevenlabsId: string) => {
    setLinkTargetId(elevenlabsId);
    setLinkSearch("");
    const { data } = await supabase
      .from("call_logs")
      .select("id,caller_number,created_at,call_duration")
      .eq("lead_source", "MyOperator")
      .order("created_at", { ascending: false })
      .limit(50);
    setLinkOptions((data ?? []) as any);
  };

  const linkManually = async (myoperatorId: string) => {
    if (!linkTargetId) return;
    setLinking(true);
    try {
      const existing = mappings[linkTargetId];
      const payload = {
        elevenlabs_call_log_id: linkTargetId,
        myoperator_call_log_id: myoperatorId,
        match_type: "TRANSCRIPT_MATCH" as const,
        match_confidence: 100,
        notes: "Manually linked by sales user",
        matched_at: new Date().toISOString(),
      };
      let error;
      if (existing) {
        ({ error } = await supabase
          .from("call_mapping")
          .update(payload)
          .eq("elevenlabs_call_log_id", linkTargetId));
      } else {
        ({ error } = await supabase.from("call_mapping").insert(payload));
      }
      if (error) throw error;
      toast.success("Lead linked manually ✓");
      setLinkTargetId(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to link");
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              ElevenLabs Leads
            </h2>
            <p className="text-sm text-muted-foreground">
              Sales-ready leads captured by your ElevenLabs AI agent
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={triggerRematch}
            disabled={rematching}
            className="gap-2"
          >
            <Sparkles className={`h-4 w-4 ${rematching ? "animate-pulse" : ""}`} />
            {rematching ? "Re-matching…" : "Re-match Leads"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Leads", value: stats.total, icon: Phone, tone: "text-foreground" },
          { label: "🔥 High Priority", value: stats.high, icon: Flame, tone: "text-destructive" },
          { label: "🟢 New (1h)", value: stats.newCount, icon: Sparkles, tone: "text-success" },
          { label: "Avg Score", value: stats.avgScore, icon: Target, tone: "text-primary" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-md bg-muted">
                <s.icon className={`h-4 w-4 ${s.tone}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-semibold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, transcript…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={intentFilter} onValueChange={setIntentFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Intent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All intents</SelectItem>
            <SelectItem value="Drone">Drone</SelectItem>
            <SelectItem value="Robotics">Robotics</SelectItem>
            <SelectItem value="AI / Automation">AI / Automation</SelectItem>
            <SelectItem value="General Inquiry">General Inquiry</SelectItem>
          </SelectContent>
        </Select>
        <Select value={budgetFilter} onValueChange={setBudgetFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Budget" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any budget</SelectItem>
            <SelectItem value="under1">Under ₹1L</SelectItem>
            <SelectItem value="1to5">₹1L – ₹5L</SelectItem>
            <SelectItem value="5plus">₹5L+</SelectItem>
            <SelectItem value="unknown">Not specified</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="qualified">Qualified</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lead Cards */}
      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No leads match your filters yet — calls will appear here automatically.
          </CardContent>
        </Card>
      ) : (
        <TooltipProvider delayDuration={200}>
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((l) => {
            const isNew = isNewLead(l.created_at);
            const mapping = mappings[l.id];
            const realPhone = mapping?.extracted_phone_number ?? l.caller_number;
            const phone = formatPhone(realPhone);
            const { name, isUnidentified } = resolveName(l, mapping);
            const phoneFromTranscript = !!mapping?.extracted_phone_number;
            const hot = isHotLead(l);
            const matchInfo = getMatchInfo(mapping?.match_type, mapping?.match_confidence ?? 0);
            const reason = whyThisMatters(l, summaries[l.id] ?? null);
            const status = (l.lead_status ?? "New").toString();
            return (
              <Card
                key={l.id}
                className={`group relative overflow-hidden transition-all hover:shadow-md cursor-pointer ${
                  hot
                    ? "ring-1 ring-destructive/40 shadow-destructive/10 border-l-4 border-l-destructive"
                    : isNew
                    ? "ring-1 ring-success/40 shadow-success/10"
                    : ""
                }`}
                onClick={() => setSelectedId(l.id)}
              >
                <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                  {hot && (
                    <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1">
                      <Flame className="h-3 w-3" /> HOT LEAD
                    </Badge>
                  )}
                  {isNew && !hot && (
                    <Badge className="bg-success/15 text-success border-success/30 gap-1 animate-pulse">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" /> New
                    </Badge>
                  )}
                </div>
                <CardContent className="p-4 space-y-3">
                  {/* Identity */}
                  <div className="space-y-0.5 pr-24">
                    {isUnidentified ? (
                      <>
                        <h3 className="font-semibold text-base leading-tight flex items-center gap-1.5 text-muted-foreground italic">
                          <UserX className="h-4 w-4" /> Unidentified Caller
                        </h3>
                        <p className="text-[11px] text-muted-foreground/80">Name not captured</p>
                      </>
                    ) : (
                      <h3 className="font-semibold text-base leading-tight text-foreground">
                        {name}
                      </h3>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <p className="text-sm text-muted-foreground font-mono">{phone}</p>
                      {phoneFromTranscript && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 text-[10px] gap-0.5 border-success/40 text-success bg-success/10"
                            >
                              <BadgeCheck className="h-3 w-3" /> Verified via conversation
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            This number was spoken by the caller during the AI conversation.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Intent + Budget row */}
                  <div className="space-y-1.5 text-sm">
                    {l.requirement && (
                      <div className="flex items-center gap-2 text-foreground">
                        <Target className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">
                          🔍 Requirement:{" "}
                          <span className="font-medium">{l.requirement}</span>
                        </span>
                      </div>
                    )}
                    {l.budget && (
                      <div className="flex items-center gap-2 text-foreground">
                        <Wallet className="h-3.5 w-3.5 text-success shrink-0" />
                        <span>
                          💰 Budget:{" "}
                          <span className="font-medium">{l.budget}</span>
                        </span>
                      </div>
                    )}
                    {l.priority && (
                      <div className="flex items-center gap-2 text-foreground">
                        <Flame className="h-3.5 w-3.5 text-destructive shrink-0" />
                        <span>
                          🔥 Intent:{" "}
                          <span className="font-medium capitalize">{l.priority}</span>
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Clock className="h-3 w-3" />
                      {formatDuration(l.call_duration)} •{" "}
                      {formatDistanceToNow(new Date(l.created_at), {
                        addSuffix: true,
                      })}
                    </div>
                  </div>

                  {/* Why this matters */}
                  {reason && (
                    <div className="flex items-start gap-1.5 rounded-md bg-warning/5 border border-warning/20 px-2 py-1.5">
                      <Lightbulb className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground/80 leading-snug">
                        <span className="font-medium text-warning">Why this matters: </span>
                        {reason}
                      </p>
                    </div>
                  )}

                  {/* Status + Match badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-xs capitalize">
                      {status}
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className={`text-xs gap-1 cursor-help ${matchInfo.cls}`}
                        >
                          <matchInfo.Icon className="h-3 w-3" />
                          {matchInfo.label}
                          {matchInfo.linked && matchInfo.confidence > 0 && (
                            <span className="opacity-80">({matchInfo.confidence}%)</span>
                          )}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">{matchInfo.tooltip}</TooltipContent>
                    </Tooltip>
                  </div>

                  {/* CTAs */}
                  <div
                    className="flex items-center gap-1.5 pt-2 border-t"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1 h-8 gap-1.5"
                      onClick={() => callTel(realPhone)}
                    >
                      <PhoneCall className="h-3.5 w-3.5" /> Call Now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 gap-1.5"
                      onClick={() => openWhatsApp(realPhone)}
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </Button>
                    <Select
                      value={status}
                      onValueChange={(v) => updateLeadStatus(l.id, v)}
                    >
                      <SelectTrigger className="h-8 w-[110px] text-xs" title="Update lead status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="New">New</SelectItem>
                        <SelectItem value="Contacted">Contacted</SelectItem>
                        <SelectItem value="Qualified">Qualified</SelectItem>
                        <SelectItem value="Closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    {!matchInfo.linked && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() => openLinkDialog(l.id)}
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Link manually to a MyOperator call</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        </TooltipProvider>
      )}

      {/* Detail drawer */}
      <Sheet
        open={!!selectedId}
        onOpenChange={(o) => !o && setSelectedId(null)}
      >
        <SheetContent className="sm:max-w-xl w-full overflow-y-auto">
          {selected && (
            <>
              {(() => {
                const m = mappings[selected.id];
                const realPhone = m?.extracted_phone_number ?? selected.caller_number;
                const { name } = resolveName(selected, m);
                return (
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2 text-lg">
                      <Bot className="h-5 w-5 text-primary" />
                      {name}
                    </SheetTitle>
                    <SheetDescription className="font-mono">
                      {formatPhone(realPhone)} •{" "}
                      {format(new Date(selected.created_at), "dd MMM yyyy, HH:mm")}
                    </SheetDescription>
                  </SheetHeader>
                );
              })()}

              <div className="mt-4 space-y-4">
                {/* Quick action bar */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className="gap-2"
                    onClick={() => callTel(mappings[selected.id]?.extracted_phone_number ?? selected.caller_number)}
                  >
                    <PhoneCall className="h-4 w-4" /> Call Now
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => openWhatsApp(mappings[selected.id]?.extracted_phone_number ?? selected.caller_number)}
                  >
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateLeadStatus(selected.id, "Contacted")}
                  >
                    ✅ Mark Contacted
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateLeadStatus(selected.id, "Qualified")}
                  >
                    ⭐ Mark Qualified
                  </Button>
                </div>

                {/* Snapshot */}
                <Card>
                  <CardContent className="p-4 space-y-2 text-sm">
                    {selected.requirement && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          🔍 Requirement
                        </span>
                        <span className="font-medium">{selected.requirement}</span>
                      </div>
                    )}
                    {selected.budget && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">💰 Budget</span>
                        <span className="font-medium">{selected.budget}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">🔥 Intent</span>
                      <Badge
                        variant="outline"
                        className={priorityClasses(selected.priority)}
                      >
                        {selected.priority ?? "—"}
                      </Badge>
                    </div>
                    {priorityReason(selected.raw_transcript) && (
                      <div className="text-xs text-muted-foreground italic">
                        Reason: {priorityReason(selected.raw_transcript)}
                      </div>
                    )}
                    {(() => {
                      const o = callOutcome(
                        analysis?.summary ?? null,
                        selected.raw_transcript,
                      );
                      const Icon = o.icon;
                      return (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            📞 Outcome
                          </span>
                          <span
                            className={`flex items-center gap-1.5 font-medium ${o.tone}`}
                          >
                            <Icon className="h-4 w-4" /> {o.label}
                          </span>
                        </div>
                      );
                    })()}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">⏱ Duration</span>
                      <span>{formatDuration(selected.call_duration)}</span>
                    </div>
                  </CardContent>
                </Card>

                {analysisLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : (
                  <>
                    {analysis?.summary && (
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                            <Sparkles className="h-4 w-4 text-primary" /> AI
                            Summary
                          </div>
                          <p className="text-sm leading-relaxed text-foreground/90">
                            {analysis.summary}
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    {/* Conversation transcript */}
                    {(() => {
                      const turns = parseTranscript(
                        analysis?.transcript ?? selected.raw_transcript,
                      );
                      if (turns.length === 0) return null;
                      return (
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                              <MessageCircle className="h-4 w-4 text-primary" />
                              Conversation
                            </div>
                            <ScrollArea className="h-80 pr-3">
                              <div className="space-y-2.5">
                                {turns.map((t, i) => (
                                  <div
                                    key={i}
                                    className={`flex ${
                                      t.role === "user"
                                        ? "justify-end"
                                        : "justify-start"
                                    }`}
                                  >
                                    <div
                                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                                        t.role === "user"
                                          ? "bg-primary text-primary-foreground rounded-br-sm"
                                          : "bg-muted text-foreground rounded-bl-sm"
                                      }`}
                                    >
                                      <div
                                        className={`text-[10px] uppercase tracking-wide mb-0.5 opacity-70`}
                                      >
                                        {t.role === "user" ? "Caller" : "Agent"}
                                      </div>
                                      {t.text}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </CardContent>
                        </Card>
                      );
                    })()}
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Manual Link Recovery Dialog */}
      <Dialog open={!!linkTargetId} onOpenChange={(o) => !o && setLinkTargetId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link to MyOperator call</DialogTitle>
            <DialogDescription>
              Pick the matching MyOperator call so this AI lead is correctly attributed.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search by phone number…"
            value={linkSearch}
            onChange={(e) => setLinkSearch(e.target.value)}
          />
          <ScrollArea className="h-72 mt-2 -mx-2 px-2">
            <div className="space-y-1.5">
              {linkOptions
                .filter((o) =>
                  linkSearch
                    ? o.caller_number?.includes(linkSearch.replace(/\D/g, ""))
                    : true,
                )
                .map((o) => (
                  <button
                    key={o.id}
                    disabled={linking}
                    onClick={() => linkManually(o.id)}
                    className="w-full text-left flex items-center justify-between gap-3 rounded-md border bg-card hover:bg-accent transition-colors p-2.5 text-sm disabled:opacity-50"
                  >
                    <div>
                      <div className="font-mono font-medium">
                        {formatPhone(o.caller_number)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(o.created_at), "dd MMM yyyy HH:mm")} •{" "}
                        {formatDuration(o.call_duration)}
                      </div>
                    </div>
                    <Link2 className="h-4 w-4 text-primary" />
                  </button>
                ))}
              {linkOptions.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No recent MyOperator calls found.
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkTargetId(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
