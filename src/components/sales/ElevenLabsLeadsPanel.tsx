import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import {
  Bot, Phone, Search, Sparkles, Clock, Target, Wallet, RefreshCw,
  MessageCircle, Flame, Mail, ChevronDown, ChevronRight, UserX,
  Lightbulb, CheckCircle2, HelpCircle, XCircle, LayoutGrid, Table as TableIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { CallButton } from "@/components/calls/CallButton";
import { toast } from "sonner";
import { EnquiryConvertButton } from "./EnquiryConvertButton";
import { ProspectButton } from "./ProspectButton";
import { LinkToCompanyButton } from "./LinkToCompanyButton";
import { AttentionButton } from "./AttentionButton";
import { LeadActionsCell } from "./LeadActionsCell";
import { ElevenLabsAnalytics } from "./ElevenLabsAnalytics";
import { BarChart3 } from "lucide-react";

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
  assigned_to: string | null;
  assigned_to_name: string | null;
  last_contacted_at: string | null;
  lead_temperature: string;
  is_enquiry_converted: boolean;
};

type AIAnalysis = {
  transcript: string | null;
  summary: string | null;
  intent: string | null;
  budget: string | null;
  extracted_data: any;
};

type ChatTurn = { role: "agent" | "user"; text: string };

interface SalesUser { user_id: string; name: string }

const STATUSES = ["New", "Contacted", "Qualified", "Closed"] as const;
type Status = typeof STATUSES[number];

const STATUS_COLORS: Record<string, string> = {
  New:       "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  Contacted: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Qualified: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  Closed:    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

const TEMP_COLORS: Record<string, string> = {
  hot:  "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  warm: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  cold: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
};

const formatPhone = (raw: string | null | undefined) => {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91"))
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return raw.startsWith("+") ? raw : `+${digits}`;
};

// A "real" phone number has between 10 and 13 digits (E.164 max 15, but in
// practice Indian/intl customer numbers fit well within 10–13). ElevenLabs
// chat conversations often produce a synthetic 18–22 digit session id in the
// caller_number column — treat anything outside the realistic range as junk.
const isLikelyRealPhone = (raw: string | null | undefined): boolean => {
  if (!raw) return false;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
};

// Try to pull a customer phone number out of the conversation transcript.
// Looks for 10-digit Indian mobiles, optionally prefixed by +91 / 91 / 0,
// and also matches patterns like "my number is 9XXXXXXXXX".
const extractPhone = (transcript: string | null): string | null => {
  if (!transcript) return null;
  // Normalise spaces/dashes inside numbers so "98765 43210" → "9876543210"
  const cleaned = transcript.replace(/(\d)[\s\-](?=\d)/g, "$1");
  // Prefer numbers introduced with a phrase
  const phrase = cleaned.match(/(?:my\s+(?:number|phone|mobile|contact)\s+(?:is|number\s+is)?|number\s+is|contact\s+is|phone\s+is|reach\s+me\s+(?:on|at))\s*[:\-]?\s*(\+?\d[\d\s\-]{8,14}\d)/i);
  if (phrase) {
    const d = phrase[1].replace(/\D/g, "");
    if (d.length >= 10 && d.length <= 13) return phrase[1].trim();
  }
  // Fallback: any 10-digit Indian mobile (starts 6-9), optional +91/91/0 prefix
  const generic = cleaned.match(/(?:\+?91[\s\-]?|0)?([6-9]\d{9})\b/);
  if (generic) return `+91 ${generic[1]}`;
  return null;
};

const resolvePhone = (
  lead: { caller_number: string | null; raw_transcript: string | null; notes: string | null }
): { phone: string | null; isAvailable: boolean } => {
  if (isLikelyRealPhone(lead.caller_number)) {
    return { phone: lead.caller_number, isAvailable: true };
  }
  const fromTranscript =
    extractPhone(lead.raw_transcript) || extractPhone(lead.notes);
  if (fromTranscript) return { phone: fromTranscript, isAvailable: true };
  return { phone: null, isAvailable: false };
};

const formatDuration = (s: number | null) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
};

const extractName = (transcript: string | null): string | null => {
  if (!transcript) return null;
  const m1 = transcript.match(/my name is ([A-Za-z][A-Za-z\s]{1,30})/i);
  if (m1) return m1[1].trim().split(/\s+/).slice(0, 3).join(" ");
  const m2 = transcript.match(/this is ([A-Za-z][A-Za-z\s]{1,30})/i);
  if (m2) return m2[1].trim().split(/\s+/).slice(0, 3).join(" ");
  return null;
};

const resolveName = (lead: ElevenLead): { name: string; isUnidentified: boolean } => {
  const candidate =
    (lead.customer_name && lead.customer_name !== "Unknown" ? lead.customer_name : "") ||
    extractName(lead.raw_transcript) ||
    extractName(lead.notes) ||
    "";
  if (candidate) return { name: candidate, isUnidentified: false };
  return { name: "Unidentified Caller", isUnidentified: true };
};

const isHotLead = (lead: ElevenLead): boolean => {
  if ((lead.priority ?? "").toLowerCase() === "high") return true;
  if (lead.lead_temperature === "hot") return true;
  const hay = `${lead.raw_transcript ?? ""} ${lead.notes ?? ""}`.toLowerCase();
  return /\b(buy|price|quote|purchase|order|pay|discount|negotiate)\b/.test(hay);
};

const whyThisMatters = (lead: ElevenLead, summary: string | null): string | null => {
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

const callOutcome = (summary: string | null, transcript: string | null) => {
  const text = `${summary ?? ""} ${transcript ?? ""}`.toLowerCase();
  if (/not interested|wrong number|do not call|stop calling|irrelevant/i.test(text))
    return { label: "Not Relevant", icon: XCircle, tone: "text-destructive" };
  if (/buy|price|quote|purchase|urgent|interested in buying|ready/i.test(text))
    return { label: "Interested", icon: CheckCircle2, tone: "text-success" };
  if (/explor|just looking|inquir|curious|info|information/i.test(text))
    return { label: "Just Exploring", icon: HelpCircle, tone: "text-warning" };
  return { label: "Follow-up", icon: HelpCircle, tone: "text-muted-foreground" };
};

const isNewLead = (createdAt: string) =>
  Date.now() - new Date(createdAt).getTime() < 60 * 60 * 1000;

const relativeTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isToday(d)) return `Today, ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, "HH:mm")}`;
  return format(d, "dd MMM, HH:mm");
};

const parseTranscript = (raw: string | null): ChatTurn[] => {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : parsed?.transcript ?? [];
      if (Array.isArray(arr)) {
        return arr.map((m: any): ChatTurn | null => {
          const text = m?.message ?? m?.text ?? m?.content ?? (typeof m === "string" ? m : null);
          const roleRaw = (m?.role ?? m?.speaker ?? "").toString().toLowerCase();
          if (!text) return null;
          const role: ChatTurn["role"] =
            roleRaw.includes("agent") || roleRaw.includes("assistant") || roleRaw.includes("ai")
              ? "agent" : "user";
          return { role, text: String(text).trim() };
        }).filter((x): x is ChatTurn => !!x && !!x.text);
      }
    } catch { /* fall through */ }
  }
  const lineRe = /^(agent|assistant|ai|user|customer|caller)\s*[:\-]\s*(.+)$/i;
  const turns: ChatTurn[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    const m = l.match(lineRe);
    if (m) {
      const role: ChatTurn["role"] = /user|customer|caller/i.test(m[1]) ? "user" : "agent";
      turns.push({ role, text: m[2].trim() });
    } else if (turns.length) {
      turns[turns.length - 1].text += " " + l;
    } else {
      turns.push({ role: "user", text: l });
    }
  }
  return turns;
};

export function ElevenLabsLeadsPanel() {
  const { user, role } = useAuth();
  const canManage = role === "admin" || role === "sales_manager";

  const [leads, setLeads] = useState<ElevenLead[]>([]);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [salesPool, setSalesPool] = useState<SalesUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [intentFilter, setIntentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [budgetFilter, setBudgetFilter] = useState("all");
  const [tempFilter, setTempFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [prospectIds, setProspectIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("call_logs")
      .select(
        "id,caller_number,customer_name,call_duration,requirement,budget,priority,lead_score,lead_status,raw_transcript,notes,created_at,assigned_to,assigned_to_name,last_contacted_at,lead_temperature,is_enquiry_converted",
      )
      .eq("lead_source", "ElevenLabs")
      .order("created_at", { ascending: false })
      .limit(500);

    if (assigneeFilter === "unassigned") q = q.is("assigned_to", null);
    else if (assigneeFilter === "mine" && user) q = q.eq("assigned_to", user.id);
    else if (assigneeFilter !== "all") q = q.eq("assigned_to", assigneeFilter);

    const { data, error } = await q;
    if (!error && data) setLeads(data as any as ElevenLead[]);
    const ids = (data ?? []).map((d: any) => d.id);
    if (ids.length) {
      const { data: ana } = await supabase
        .from("call_ai_analysis")
        .select("call_log_id,summary")
        .in("call_log_id", ids);
      const sumDict: Record<string, string> = {};
      (ana ?? []).forEach((a: any) => { if (a.summary) sumDict[a.call_log_id] = a.summary; });
      setSummaries(sumDict);

      // Fetch prospects converted from these call logs
      const { data: pros } = await supabase
        .from("prospects")
        .select("source_id")
        .eq("source_type", "lead")
        .in("source_id", ids);
      setProspectIds(new Set((pros ?? []).map((p: any) => p.source_id)));
    } else { setSummaries({}); setProspectIds(new Set()); }
    setLoading(false);
  };

  const loadPool = async () => {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id,role")
      .in("role", ["sales", "sales_manager"]);
    const userIds = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (!userIds.length) { setSalesPool([]); return; }
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id,name,is_approved")
      .in("user_id", userIds)
      .eq("is_approved", true);
    const pool: SalesUser[] = (profs ?? []).map((p: any) => ({ user_id: p.user_id, name: p.name }));
    setSalesPool(pool.sort((a, b) => a.name.localeCompare(b.name)));
  };

  useEffect(() => { load(); }, [assigneeFilter, user?.id]);
  useEffect(() => { loadPool(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel("elevenlabs-leads")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "call_logs" },
        (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (row?.lead_source === "ElevenLabs") load();
        },
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const selected = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId],
  );

  useEffect(() => {
    if (!selectedId) { setAnalysis(null); return; }
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
    return leads.filter((l) => {
      if (priorityFilter !== "all" && (l.priority ?? "").toLowerCase() !== priorityFilter) return false;
      if (intentFilter !== "all" && (l.requirement ?? "") !== intentFilter) return false;
      if (statusFilter !== "all" && (l.lead_status ?? "New").toLowerCase() !== statusFilter) return false;
      if (tempFilter !== "all" && (l.lead_temperature ?? "warm") !== tempFilter) return false;
      if (!budgetMatches(l.budget, budgetFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        const { name } = resolveName(l);
        if (!l.caller_number?.toLowerCase().includes(q) &&
            !(l.customer_name ?? "").toLowerCase().includes(q) &&
            !name.toLowerCase().includes(q) &&
            !(l.assigned_to_name ?? "").toLowerCase().includes(q) &&
            !(l.raw_transcript ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [leads, search, priorityFilter, intentFilter, statusFilter, budgetFilter, tempFilter]);

  const stats = useMemo(() => {
    const total = leads.length;
    const high = leads.filter((l) => (l.priority ?? "").toLowerCase() === "high").length;
    const newCount = leads.filter((l) => isNewLead(l.created_at)).length;
    const avgScore = total
      ? Math.round(leads.reduce((s, l) => s + (l.lead_score ?? 0), 0) / total)
      : 0;
    const unassigned = leads.filter(l => !l.assigned_to).length;
    return { total, high, newCount, avgScore, unassigned };
  }, [leads]);

  const updateLead = async (id: string, patch: Partial<ElevenLead>) => {
    const prev = leads;
    setLeads(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
    const { error } = await supabase.from("call_logs").update(patch as any).eq("id", id);
    if (error) {
      setLeads(prev);
      toast.error(`Update failed: ${error.message}`);
    }
  };

  const updateLeadStatus = async (id: string, status: string) => {
    await updateLead(id, { lead_status: status });
    toast.success(`Marked as ${status}`);
  };

  const assignTo = async (lead: ElevenLead, userId: string) => {
    const target = salesPool.find(s => s.user_id === userId);
    if (!target) return;
    await updateLead(lead.id, { assigned_to: target.user_id, assigned_to_name: target.name });
    toast.success(`Assigned to ${target.name}`);
  };

  const markContacted = async (lead: ElevenLead) => {
    await updateLead(lead.id, {
      lead_status: "Contacted",
      last_contacted_at: new Date().toISOString(),
    });
  };

  const openWhatsApp = (phone: string) => {
    const num = phone.replace(/\D/g, "");
    window.open(`https://wa.me/${num}`, "_blank");
  };

  const toggleRow = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
            <h2 className="text-xl font-semibold tracking-tight">ElevenLabs Leads</h2>
            <p className="text-sm text-muted-foreground">
              Sales-ready leads captured by your ElevenLabs AI agent
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border/50 bg-muted/40 p-0.5">
            <Button size="sm" variant={viewMode === "table" ? "secondary" : "ghost"} className="h-7 px-2" onClick={() => setViewMode("table")} title="Table view">
              <TableIcon className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant={viewMode === "cards" ? "secondary" : "ghost"} className="h-7 px-2" onClick={() => setViewMode("cards")} title="Card view">
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowAnalytics(s => !s)} className="gap-2">
            <BarChart3 className="h-4 w-4" /> {showAnalytics ? "Hide" : "Show"} Analytics
          </Button>
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Leads", value: stats.total, icon: Phone, tone: "text-foreground" },
          { label: "🔥 High Priority", value: stats.high, icon: Flame, tone: "text-destructive" },
          { label: "🟢 New (1h)", value: stats.newCount, icon: Sparkles, tone: "text-success" },
          { label: "Unassigned", value: stats.unassigned, icon: UserX, tone: "text-warning" },
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

      {/* Analytics dashboard */}
      {showAnalytics && (
        <ElevenLabsAnalytics leads={leads} prospectIds={prospectIds} />
      )}

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, transcript, assignee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={intentFilter} onValueChange={setIntentFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Intent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All intents</SelectItem>
              <SelectItem value="Drone">Drone</SelectItem>
              <SelectItem value="Robotics">Robotics</SelectItem>
              <SelectItem value="AI / Automation">AI / Automation</SelectItem>
              <SelectItem value="General Inquiry">General Inquiry</SelectItem>
            </SelectContent>
          </Select>
          <Select value={budgetFilter} onValueChange={setBudgetFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Budget" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any budget</SelectItem>
              <SelectItem value="under1">Under ₹1L</SelectItem>
              <SelectItem value="1to5">₹1L – ₹5L</SelectItem>
              <SelectItem value="5plus">₹5L+</SelectItem>
              <SelectItem value="unknown">Not specified</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tempFilter} onValueChange={setTempFilter}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="Temp" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All temps</SelectItem>
              <SelectItem value="hot">🔥 Hot</SelectItem>
              <SelectItem value="warm">Warm</SelectItem>
              <SelectItem value="cold">Cold</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value="mine">Assigned to me</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {salesPool.map(s => (
                <SelectItem key={s.user_id} value={s.user_id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      {viewMode === "table" && (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-[200px]">Actions</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Caller</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Intent / Budget</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Temp</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Last contact</TableHead>
              <TableHead className="w-[130px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={12} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                No leads match your filters yet — calls will appear here automatically.
              </TableCell></TableRow>
            )}
            {!loading && filtered.map(r => {
              const isOpen = expanded.has(r.id);
              const { name, isUnidentified } = resolveName(r);
              const { phone: resolvedPhone, isAvailable: phoneAvailable } = resolvePhone(r);
              const phone = phoneAvailable ? formatPhone(resolvedPhone) : "Not available";
              const phoneForActions = phoneAvailable ? (resolvedPhone as string) : "";
              const status = (r.lead_status ?? "New") as Status;
              const tempClass = TEMP_COLORS[r.lead_temperature] ?? TEMP_COLORS.warm;
              const hot = isHotLead(r);
              const newish = isNewLead(r.created_at);
              return (
                <>
                  <TableRow
                    key={r.id}
                    className={`cursor-pointer hover:bg-muted/30 ${hot ? "border-l-2 border-l-destructive" : newish ? "border-l-2 border-l-success" : ""}`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <TableCell className="w-8 px-2" onClick={(e) => { e.stopPropagation(); toggleRow(r.id); }}>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <LeadActionsCell
                        sourceType="lead"
                        sourceId={r.id}
                        customerName={isUnidentified ? "Unknown" : name}
                        phone={phoneForActions}
                        company={(r as any).company}
                        productName={r.requirement || ""}
                        urgency={r.priority}
                        notes={r.notes || r.raw_transcript}
                        isAlreadyConverted={r.is_enquiry_converted}
                        sourceLabel="Call"
                        onContacted={() => markContacted(r)}
                        openWhatsApp={openWhatsApp}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {format(new Date(r.created_at), "dd MMM, HH:mm")}
                      {newish && <Badge className="ml-1 h-4 px-1 text-[10px] bg-success/15 text-success border-success/30">New</Badge>}
                    </TableCell>
                    <TableCell className={isUnidentified ? "italic text-muted-foreground" : "font-medium"}>
                      {isUnidentified ? (
                        <span className="inline-flex items-center gap-1">
                          <UserX className="h-3.5 w-3.5" /> Unidentified Caller
                        </span>
                      ) : name}
                    </TableCell>
                    <TableCell className="text-xs font-mono" onClick={(e) => e.stopPropagation()}>
                      {phoneAvailable ? (
                        <a className="text-primary hover:underline" href={`tel:${resolvedPhone}`}>{phone}</a>
                      ) : (
                        <span className="italic text-muted-foreground">Not available</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1">
                        <Target className="h-3 w-3 text-primary" />
                        <span className={r.requirement ? "" : "italic text-muted-foreground"}>
                          {r.requirement ?? "Not captured"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Wallet className="h-3 w-3" />
                        <span className={r.budget ? "" : "italic"}>{r.budget ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDuration(r.call_duration)}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={r.lead_temperature ?? "warm"}
                        onValueChange={(v) => updateLead(r.id, { lead_temperature: v })}
                      >
                        <SelectTrigger className={`h-7 px-2 text-[11px] border ${tempClass}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hot">🔥 Hot</SelectItem>
                          <SelectItem value="warm">Warm</SelectItem>
                          <SelectItem value="cold">Cold</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs">{(r as any).company || '—'}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {canManage ? (
                        <Select
                          value={r.assigned_to ?? "unassigned"}
                          onValueChange={(v) => v !== "unassigned" && assignTo(r, v)}
                        >
                          <SelectTrigger className="h-7 text-xs w-[140px]">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent className="max-h-80">
                            <SelectItem value="unassigned" disabled>Unassigned</SelectItem>
                            {salesPool.map(s => (
                              <SelectItem key={s.user_id} value={s.user_id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className={`text-xs ${r.assigned_to_name ? "" : "italic text-muted-foreground"}`}>
                          {r.assigned_to_name ?? "Unassigned"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={`text-xs whitespace-nowrap ${r.last_contacted_at ? "text-muted-foreground" : "italic text-muted-foreground/70"}`}>
                      {relativeTime(r.last_contacted_at)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select value={status} onValueChange={(v) => updateLeadStatus(r.id, v)}>
                        <SelectTrigger className={`h-7 text-xs ${STATUS_COLORS[status] ?? ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow key={`${r.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={12} className="p-4">
                        <RowDetail lead={r} summary={summaries[r.id]} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      )}

      {viewMode === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {loading && (
            <div className="col-span-full text-center text-muted-foreground py-8">Loading…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-8">
              No leads match your filters yet — calls will appear here automatically.
            </div>
          )}
          {!loading && filtered.map(r => {
            const { name, isUnidentified } = resolveName(r);
            const phone = formatPhone(r.caller_number);
            const status = (r.lead_status ?? "New") as Status;
            const tempClass = TEMP_COLORS[r.lead_temperature] ?? TEMP_COLORS.warm;
            const hot = isHotLead(r);
            const newish = isNewLead(r.created_at);
            return (
              <Card
                key={r.id}
                className={`p-3 cursor-pointer hover:border-primary/40 transition-colors space-y-2 ${hot ? "border-l-2 border-l-destructive" : newish ? "border-l-2 border-l-success" : ""}`}
                onClick={() => setSelectedId(r.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={isUnidentified ? "italic text-muted-foreground truncate" : "font-medium truncate"}>
                      {isUnidentified ? (
                        <span className="inline-flex items-center gap-1"><UserX className="h-3.5 w-3.5" /> Unidentified Caller</span>
                      ) : name}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {format(new Date(r.created_at), "dd MMM, HH:mm")}
                      {newish && <Badge className="ml-1 h-4 px-1 text-[10px] bg-success/15 text-success border-success/30">New</Badge>}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground whitespace-nowrap flex items-center gap-1">
                    <Clock className="h-3 w-3" />{formatDuration(r.call_duration)}
                  </div>
                </div>

                <div className="text-xs font-mono" onClick={(e) => e.stopPropagation()}>
                  <a className="text-primary hover:underline" href={`tel:${r.caller_number}`}>{phone}</a>
                </div>

                <div className="text-xs space-y-0.5">
                  <div className="flex items-center gap-1">
                    <Target className="h-3 w-3 text-primary" />
                    <span className={r.requirement ? "" : "italic text-muted-foreground"}>
                      {r.requirement ?? "Not captured"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Wallet className="h-3 w-3" />
                    <span className={r.budget ? "" : "italic"}>{r.budget ?? "—"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  <Select value={r.lead_temperature ?? "warm"} onValueChange={(v) => updateLead(r.id, { lead_temperature: v })}>
                    <SelectTrigger className={`h-7 px-2 text-[11px] border w-auto ${tempClass}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hot">🔥 Hot</SelectItem>
                      <SelectItem value="warm">Warm</SelectItem>
                      <SelectItem value="cold">Cold</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={status} onValueChange={(v) => updateLeadStatus(r.id, v)}>
                    <SelectTrigger className={`h-7 text-xs w-auto ${STATUS_COLORS[status] ?? ""}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40" onClick={(e) => e.stopPropagation()}>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {r.assigned_to_name ? `→ ${r.assigned_to_name}` : <span className="italic">Unassigned</span>}
                    <span className="mx-1">·</span>
                    {relativeTime(r.last_contacted_at)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0" title="Call">
                      <a href={`tel:${r.caller_number}`} onClick={() => markContacted(r)}>
                        <Phone className="h-3.5 w-3.5 text-blue-600" />
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="WhatsApp" onClick={() => { openWhatsApp(r.caller_number); markContacted(r); }}>
                      <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                    </Button>
                    <ProspectButton sourceType="lead" sourceId={r.id} customerName={isUnidentified ? "Unknown" : name} phoneNumber={r.caller_number} email={null} company={null} city={null} productName={r.requirement || ""} notes={r.notes || r.raw_transcript} />
                    <AttentionButton sourceType="lead" sourceId={r.id} customerName={isUnidentified ? "Unknown" : name} phoneNumber={r.caller_number} email={null} company={null} city={null} productName={r.requirement || ""} notes={r.notes || r.raw_transcript} />
                    <EnquiryConvertButton sourceType="lead" sourceId={r.id} customerName={isUnidentified ? "Unknown" : name} phoneNumber={r.caller_number} email={null} company={null} city={null} productName={r.requirement || ""} urgency={r.priority} notes={r.notes || r.raw_transcript} isAlreadyConverted={r.is_enquiry_converted} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail drawer */}
      <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="sm:max-w-xl w-full overflow-y-auto">
          {selected && (() => {
            const { name, isUnidentified } = resolveName(selected);
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2 text-lg">
                    <Bot className="h-5 w-5 text-primary" />
                    <span className={isUnidentified ? "text-muted-foreground italic" : ""}>{name}</span>
                  </SheetTitle>
                  <SheetDescription className="font-mono flex flex-wrap items-center gap-1.5">
                    <span>{formatPhone(selected.caller_number)}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{format(new Date(selected.created_at), "dd MMM yyyy, HH:mm")}</span>
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <CallButton
                      phoneNumber={selected.caller_number}
                      entityType="lead"
                      entityId={selected.id}
                      label="Call Now"
                      variant="default"
                    />
                    <Button variant="outline" className="gap-2" onClick={() => openWhatsApp(selected.caller_number)}>
                      <MessageCircle className="h-4 w-4" /> WhatsApp
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => updateLeadStatus(selected.id, "Contacted")}>
                      ✅ Mark Contacted
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => updateLeadStatus(selected.id, "Qualified")}>
                      ⭐ Mark Qualified
                    </Button>
                    <div className="col-span-2 flex flex-wrap gap-2">
                      <ProspectButton
                        sourceType="lead" sourceId={selected.id}
                        customerName={isUnidentified ? "Unknown" : name}
                        phoneNumber={selected.caller_number}
                        email={null} company={null} city={null}
                        productName={selected.requirement || ""}
                        notes={selected.notes || selected.raw_transcript}
                      />
                      <AttentionButton
                        sourceType="lead" sourceId={selected.id}
                        customerName={isUnidentified ? "Unknown" : name}
                        phoneNumber={selected.caller_number}
                        email={null} company={null} city={null}
                        productName={selected.requirement || ""}
                        notes={selected.notes || selected.raw_transcript}
                      />
                      <EnquiryConvertButton
                        sourceType="lead" sourceId={selected.id}
                        customerName={isUnidentified ? "Unknown" : name}
                        phoneNumber={selected.caller_number}
                        email={null} company={null} city={null}
                        productName={selected.requirement || ""}
                        urgency={selected.priority}
                        notes={selected.notes || selected.raw_transcript}
                        isAlreadyConverted={selected.is_enquiry_converted}
                      />
                    </div>
                  </div>

                  {(() => {
                    const reason = whyThisMatters(selected, summaries[selected.id] ?? analysis?.summary ?? null);
                    if (!reason) return null;
                    return (
                      <Card className="border-warning/30 bg-warning/5">
                        <CardContent className="p-3 flex items-start gap-2">
                          <Lightbulb className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                          <div className="text-sm">
                            <div className="font-semibold text-warning mb-0.5">Why this matters</div>
                            <p className="text-foreground/80 leading-snug">{reason}</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()}

                  <Card>
                    <CardContent className="p-4 space-y-2 text-sm">
                      <Row label="🔍 Requirement" value={selected.requirement} />
                      <Row label="💰 Budget" value={selected.budget} />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">🔥 Intent</span>
                        <span className={selected.priority ? "font-medium capitalize" : "italic text-muted-foreground"}>
                          {selected.priority ?? "Unknown"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">👤 Assigned</span>
                        <span className={selected.assigned_to_name ? "font-medium" : "italic text-muted-foreground"}>
                          {selected.assigned_to_name ?? "Unassigned"}
                        </span>
                      </div>
                      {(() => {
                        const o = callOutcome(analysis?.summary ?? null, selected.raw_transcript);
                        const Icon = o.icon;
                        return (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">📞 Outcome</span>
                            <span className={`flex items-center gap-1.5 font-medium ${o.tone}`}>
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
                              <Sparkles className="h-4 w-4 text-primary" /> AI Summary
                            </div>
                            <p className="text-sm leading-relaxed text-foreground/90">{analysis.summary}</p>
                          </CardContent>
                        </Card>
                      )}

                      {(() => {
                        const turns = parseTranscript(analysis?.transcript ?? selected.raw_transcript);
                        if (turns.length === 0) return null;
                        return (
                          <Card>
                            <CardContent className="p-4">
                              <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                                <MessageCircle className="h-4 w-4 text-primary" /> Conversation
                              </div>
                              <ScrollArea className="h-80 pr-3">
                                <div className="space-y-2.5">
                                  {turns.map((t, i) => (
                                    <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                                        t.role === "user"
                                          ? "bg-primary text-primary-foreground rounded-br-sm"
                                          : "bg-muted text-foreground rounded-bl-sm"
                                      }`}>
                                        <div className="text-[10px] uppercase tracking-wide mb-0.5 opacity-70">
                                          {t.role === "user" ? "Caller" : "Agent"}
                                        </div>
                                        <div>{t.text}</div>
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
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={value ? "font-medium" : "italic text-muted-foreground"}>{value ?? "Not captured"}</span>
    </div>
  );
}

function RowDetail({ lead, summary }: { lead: ElevenLead; summary?: string }) {
  const reason = whyThisMatters(lead, summary ?? null);
  return (
    <div className="grid sm:grid-cols-2 gap-4 text-sm">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-foreground">
          <Target className="h-3.5 w-3.5 text-primary" />
          🔍 Requirement: <span className={lead.requirement ? "font-medium" : "italic text-muted-foreground"}>{lead.requirement ?? "Not captured"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-foreground">
          <Wallet className="h-3.5 w-3.5 text-success" />
          💰 Budget: <span className={lead.budget ? "font-medium" : "italic text-muted-foreground"}>{lead.budget ?? "Not shared"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-foreground">
          <Flame className="h-3.5 w-3.5 text-destructive" />
          🔥 Priority: <span className={lead.priority ? "font-medium capitalize" : "italic text-muted-foreground"}>{lead.priority ?? "Unrated"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Clock className="h-3 w-3" />
          {formatDuration(lead.call_duration)} • {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
        </div>
      </div>
      <div className="space-y-2">
        {reason && (
          <div className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5 flex items-start gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/80">
              <span className="font-medium text-warning">Why this matters: </span>{reason}
            </p>
          </div>
        )}
        {summary && (
          <div className="text-xs text-muted-foreground line-clamp-4 italic">"{summary}"</div>
        )}
        {!summary && (
          <div className="text-xs italic text-muted-foreground">No AI summary yet — open detail to view full transcript.</div>
        )}
      </div>
    </div>
  );
}
