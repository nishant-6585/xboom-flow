import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  Phone,
  Search,
  Sparkles,
  Clock,
  Target,
  Wallet,
  FileText,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

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

type AIAnalysis = {
  transcript: string | null;
  summary: string | null;
  intent: string | null;
  budget: string | null;
  extracted_data: any;
};

const priorityColor = (p: string | null) => {
  switch ((p ?? "").toLowerCase()) {
    case "high":
      return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
    case "medium":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
    case "low":
      return "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const formatDuration = (s: number | null) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
};

export function ElevenLabsLeadsPanel() {
  const [leads, setLeads] = useState<ElevenLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [intentFilter, setIntentFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

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
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Realtime updates so new calls appear automatically
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

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (
        priorityFilter !== "all" &&
        (l.priority ?? "").toLowerCase() !== priorityFilter
      )
        return false;
      if (intentFilter !== "all" && (l.requirement ?? "") !== intentFilter)
        return false;
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
  }, [leads, search, priorityFilter, intentFilter]);

  const stats = useMemo(() => {
    const total = leads.length;
    const high = leads.filter((l) => l.priority === "High").length;
    const medium = leads.filter((l) => l.priority === "Medium").length;
    const low = leads.filter((l) => l.priority === "Low").length;
    const avgScore = total
      ? Math.round(leads.reduce((s, l) => s + (l.lead_score ?? 0), 0) / total)
      : 0;
    return { total, high, medium, low, avgScore };
  }, [leads]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">AI Voice Calls (ElevenLabs)</h2>
            <p className="text-sm text-muted-foreground">
              Auto-captured leads from your AI agent — transcript, summary &
              extracted intent
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats.total, icon: Phone },
          { label: "High Priority", value: stats.high, icon: Sparkles },
          { label: "Medium", value: stats.medium, icon: Target },
          { label: "Low", value: stats.low, icon: Clock },
          { label: "Avg Score", value: stats.avgScore, icon: Wallet },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-md bg-muted">
                <s.icon className="h-4 w-4 text-muted-foreground" />
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
            placeholder="Search phone, name, transcript…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={intentFilter} onValueChange={setIntentFilter}>
          <SelectTrigger className="w-[180px]">
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
      </div>

      {/* List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {filtered.length} call{filtered.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No ElevenLabs calls yet — they'll appear here automatically after
              your AI agent finishes a call.
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setSelectedId(l.id)}
                  className="w-full text-left p-4 hover:bg-muted/50 transition flex flex-wrap items-center gap-3"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {l.customer_name && l.customer_name !== "Unknown"
                          ? l.customer_name
                          : "Unknown caller"}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {l.caller_number}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(l.created_at), "dd MMM yyyy, HH:mm")} •{" "}
                      {formatDuration(l.call_duration)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {l.requirement && (
                      <Badge variant="outline">{l.requirement}</Badge>
                    )}
                    {l.budget && (
                      <Badge variant="outline" className="gap-1">
                        <Wallet className="h-3 w-3" />
                        {l.budget}
                      </Badge>
                    )}
                    <Badge className={priorityColor(l.priority)}>
                      {l.priority ?? "—"}
                    </Badge>
                    <Badge variant="secondary">Score {l.lead_score ?? 0}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail drawer */}
      <Sheet
        open={!!selectedId}
        onOpenChange={(o) => !o && setSelectedId(null)}
      >
        <SheetContent className="sm:max-w-xl w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              {selected?.customer_name && selected.customer_name !== "Unknown"
                ? selected.customer_name
                : "Unknown caller"}
            </SheetTitle>
            <SheetDescription>
              {selected?.caller_number} •{" "}
              {selected &&
                format(new Date(selected.created_at), "dd MMM yyyy, HH:mm")}
            </SheetDescription>
          </SheetHeader>

          {selected && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                {selected.requirement && (
                  <Badge variant="outline">{selected.requirement}</Badge>
                )}
                {selected.budget && (
                  <Badge variant="outline" className="gap-1">
                    <Wallet className="h-3 w-3" /> {selected.budget}
                  </Badge>
                )}
                <Badge className={priorityColor(selected.priority)}>
                  {selected.priority ?? "—"}
                </Badge>
                <Badge variant="secondary">
                  Score {selected.lead_score ?? 0}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(selected.call_duration)}
                </Badge>
              </div>

              {analysisLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <>
                  {analysis?.summary && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" /> AI
                          Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm whitespace-pre-wrap">
                        {analysis.summary}
                      </CardContent>
                    </Card>
                  )}

                  {analysis?.extracted_data && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Target className="h-4 w-4 text-primary" /> Extracted
                          Lead Data
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm space-y-1">
                        {Object.entries(analysis.extracted_data).map(
                          ([k, v]) =>
                            v ? (
                              <div key={k} className="flex justify-between">
                                <span className="text-muted-foreground capitalize">
                                  {k}
                                </span>
                                <span className="font-medium">
                                  {String(v)}
                                </span>
                              </div>
                            ) : null,
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {(analysis?.transcript || selected.raw_transcript) && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />{" "}
                          Transcript
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-72 rounded-md border bg-muted/30 p-3">
                          <pre className="text-xs whitespace-pre-wrap font-mono">
                            {analysis?.transcript ?? selected.raw_transcript}
                          </pre>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
