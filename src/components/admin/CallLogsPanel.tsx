import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Phone, Play, Pause, Eye, Search, Loader2, PhoneIncoming, PhoneMissed, PhoneOff, Download } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface CallLog {
  id: string;
  call_id: string | null;
  caller_number: string;
  full_number: string | null;
  agent_name: string | null;
  agent_number: string | null;
  assigned_agent_name: string | null;
  assigned_agent_phone: string | null;
  call_status: string;
  call_duration: number | null;
  call_type: string | null;
  department: string | null;
  start_time: string | null;
  end_time: string | null;
  recording_url: string | null;
  raw_payload: unknown;
  lead_created: boolean;
  lead_id: string | null;
  created_at: string;
}

interface LegDetail {
  _ac?: string;
  _rr?: Array<{ _na?: string; _ct?: string }>;
}

function parseRawPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Record<string, unknown>;
}

function deriveCallInfo(log: CallLog) {
  const payload = parseRawPayload(log.raw_payload);
  const legs: LegDetail[] = payload?._ld && Array.isArray(payload._ld) ? payload._ld as LegDetail[] : [];

  // Derive status from _ld legs
  let status = log.call_status;
  if (legs.length > 0) {
    const hasReceived = legs.some(l => l._ac === 'received');
    status = hasReceived ? 'answered' : 'missed';
  }

  // Extract all agent names from _ld[x]._rr[x]._na
  const agentNames: string[] = [];
  for (const leg of legs) {
    if (Array.isArray(leg._rr)) {
      for (const r of leg._rr) {
        if (r._na) agentNames.push(r._na);
      }
    }
  }
  const uniqueAgents = [...new Set(agentNames)];
  const agentDisplay = uniqueAgents.length > 0 ? uniqueAgents.join(', ') : (log.assigned_agent_name || log.agent_name || 'Unknown');

  // Department from _dn
  const department = (payload?._dn as string) || log.department;

  // Duration from _dr
  let duration = log.call_duration;
  if (payload?._dr) {
    duration = parseDurationFromPayload(String(payload._dr));
  }

  // Recording from _fu
  const recording = (payload?._fu as string) || log.recording_url;

  // Start time from _st
  const startTime = (payload?._st as string) || log.start_time;

  // Build "What" text
  let whatText = '';
  if (status === 'answered') {
    whatText = `Call received by ${agentDisplay}`;
  } else {
    whatText = `Call missed by ${agentDisplay}`;
  }
  if (department) {
    whatText += ` at (${department})`;
  }

  // Build missed attempts info from _ld
  const missedAttempts: string[] = [];
  const answeredAttempt: string | null = null;
  for (const leg of legs) {
    const legAgents = Array.isArray(leg._rr) ? leg._rr.map(r => r._na).filter(Boolean).join(', ') : '';
    if (leg._ac === 'received') {
      // answered
    } else if (leg._ac === 'missed' && legAgents) {
      missedAttempts.push(legAgents);
    }
  }

  return { status, agentDisplay, department, duration, recording, startTime, whatText, missedAttempts };
}

function parseDurationFromPayload(dur: string): number {
  if (!dur) return 0;
  const parts = dur.split(':');
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    return h * 3600 + m * 60 + s;
  }
  const parsed = parseInt(dur, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCallTime(startTime: string | null, createdAt: string): string {
  if (startTime) {
    // Handle epoch timestamp (MyOperator sends epoch seconds)
    const num = Number(startTime);
    if (!isNaN(num) && num > 1000000000) {
      const d = new Date(num * 1000);
      if (!isNaN(d.getTime())) return format(d, "hh:mm a");
    }
    // Try ISO date
    const d = new Date(startTime);
    if (!isNaN(d.getTime())) return format(d, "hh:mm a");
  }
  return format(new Date(createdAt), "hh:mm a");
}

function formatCallDate(startTime: string | null, createdAt: string): string {
  if (startTime) {
    const num = Number(startTime);
    if (!isNaN(num) && num > 1000000000) {
      const d = new Date(num * 1000);
      if (!isNaN(d.getTime())) return format(d, "dd MMM yyyy");
    }
    const d = new Date(startTime);
    if (!isNaN(d.getTime())) return format(d, "dd MMM yyyy");
  }
  return format(new Date(createdAt), "dd MMM yyyy");
}

export function CallLogsPanel() {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchPhone, setSearchPhone] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<CallLog | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const fetchLogs = useCallback(async () => {
    let query = supabase
      .from("call_logs")
      .select("*")
      .order("start_time", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100);

    if (searchPhone.trim()) {
      query = query.or(`caller_number.ilike.%${searchPhone.trim()}%,full_number.ilike.%${searchPhone.trim()}%`);
    }

    const { data, error } = await query;
    if (!error && data) {
      let filtered = data as CallLog[];

      // Client-side status filter (derived from raw_payload)
      if (statusFilter !== "all") {
        filtered = filtered.filter(log => {
          const info = deriveCallInfo(log);
          return info.status === statusFilter;
        });
      }

      const currentIds = new Set(filtered.map((l) => l.id));
      if (prevIdsRef.current.size > 0) {
        const fresh = new Set<string>();
        currentIds.forEach((id) => {
          if (!prevIdsRef.current.has(id)) fresh.add(id);
        });
        if (fresh.size > 0) {
          setNewIds(fresh);
          setTimeout(() => setNewIds(new Set()), 8000);
        }
      }
      prevIdsRef.current = currentIds;
      setLogs(filtered);
    }
    setLoading(false);
  }, [searchPhone, statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 8000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-myoperator-logs', {
        method: 'POST',
      });
      if (error) throw error;
      toast.success(`Sync complete: ${data?.inserted || 0} new, ${data?.updated || 0} updated`);
      fetchLogs();
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const toggleAudio = (url: string) => {
    if (playingAudio === url) {
      audioRef.current?.pause();
      setPlayingAudio(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audio.play();
      audio.onended = () => setPlayingAudio(null);
      audioRef.current = audio;
      setPlayingAudio(url);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "answered":
        return <PhoneIncoming className="w-4 h-4 text-green-500" />;
      case "missed":
        return <PhoneMissed className="w-4 h-4 text-red-500" />;
      case "busy":
        return <PhoneOff className="w-4 h-4 text-orange-500" />;
      default:
        return <Phone className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              MyOperator Call Logs
            </CardTitle>
            <CardDescription>
              Real-time call logs via webhook + API sync ({logs.length} records)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={triggerSync}
              disabled={syncing}
            >
              <Download className={`w-4 h-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Backfill Now"}
            </Button>
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? "Auto-Refresh ON" : "Auto-Refresh OFF"}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search phone number..."
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="answered">Received</SelectItem>
              <SelectItem value="missed">Missed</SelectItem>
              <SelectItem value="busy">Busy</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Phone className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No call logs received yet.</p>
            <p className="text-sm">Check webhook configuration or click "Backfill Now" to sync.</p>
          </div>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Recording</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const info = deriveCallInfo(log);

                  return (
                    <TableRow
                      key={log.id}
                      className={newIds.has(log.id)
                        ? "bg-primary/10 animate-pulse border-l-4 border-l-primary"
                        : ""
                      }
                    >
                      <TableCell className="pr-0">
                        {statusIcon(info.status)}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium text-primary">
                        {log.full_number || log.caller_number}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{info.whatText}</div>
                        {info.missedAttempts.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Missed by: {info.missedAttempts.join(' → ')} before received
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        <div>{formatCallTime(info.startTime, log.created_at)}</div>
                        <div className="text-xs">{formatCallDate(info.startTime, log.created_at)}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {info.duration ? formatDuration(info.duration) : "—"}
                      </TableCell>
                      <TableCell>
                        {info.recording ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleAudio(info.recording!)}
                          >
                            {playingAudio === info.recording ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Call Log Details
            </DialogTitle>
          </DialogHeader>
          {selectedLog && <CallLogDetails log={selectedLog} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CallLogDetails({ log }: { log: CallLog }) {
  const info = deriveCallInfo(log);
  const payload = parseRawPayload(log.raw_payload);
  const legs: LegDetail[] = payload?._ld && Array.isArray(payload._ld) ? payload._ld as LegDetail[] : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Detail label="Caller Number" value={log.full_number || log.caller_number} />
        <Detail label="Call ID" value={log.call_id} />
        <Detail label="Status" value={info.status === 'answered' ? 'Call Received' : 'Call Missed'} />
        <Detail label="Call Type" value={log.call_type} />
        <Detail label="Duration" value={info.duration ? formatDuration(info.duration) : null} />
        <Detail label="Department" value={info.department} />
        <Detail label="Agent(s)" value={info.agentDisplay} />
        <Detail label="Time" value={formatCallTime(info.startTime, log.created_at) + ' · ' + formatCallDate(info.startTime, log.created_at)} />
        <Detail label="Lead Created" value={log.lead_created ? "Yes" : "No"} />
        <Detail label="Lead ID" value={log.lead_id} />
      </div>

      {/* Call Attempts Timeline */}
      {legs.length > 1 && (
        <div>
          <p className="text-sm font-medium mb-2">Call Routing Timeline</p>
          <div className="space-y-1">
            {legs.map((leg, idx) => {
              const agents = Array.isArray(leg._rr) ? leg._rr.map(r => r._na).filter(Boolean).join(', ') : 'Unknown';
              const isReceived = leg._ac === 'received';
              return (
                <div key={idx} className={`flex items-center gap-2 text-sm px-2 py-1 rounded ${isReceived ? 'bg-green-500/10 text-green-700' : 'bg-red-500/10 text-red-700'}`}>
                  {isReceived ? <PhoneIncoming className="w-3 h-3" /> : <PhoneMissed className="w-3 h-3" />}
                  <span>{isReceived ? 'Received' : 'Missed'} by {agents}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {info.recording && (
        <div>
          <p className="text-sm font-medium mb-1">Recording</p>
          <audio controls src={info.recording} className="w-full" />
        </div>
      )}
      <div>
        <p className="text-sm font-medium mb-1">Raw Payload</p>
        <pre className="bg-muted p-3 rounded-md text-xs overflow-auto max-h-60 whitespace-pre-wrap">
          {JSON.stringify(log.raw_payload, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
