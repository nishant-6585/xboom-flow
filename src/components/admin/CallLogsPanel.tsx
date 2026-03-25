import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Phone, Play, Pause, Eye, Search, Loader2, PhoneIncoming, PhoneMissed, PhoneOff, Download, Volume2, AlertTriangle, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
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

/** Extract the _fn (filename) directly from the raw payload */
function extractRecordingFilename(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const fn = payload._fn;
  if (fn && typeof fn === 'string' && fn.trim().length > 0) return fn.trim();
  return null;
}

function deriveCallInfo(log: CallLog) {
  const payload = parseRawPayload(log.raw_payload);
  const legs: LegDetail[] = payload?._ld && Array.isArray(payload._ld) ? payload._ld as LegDetail[] : [];

  let status = log.call_status;
  if (legs.length > 0) {
    const hasReceived = legs.some(l => l._ac === 'received');
    status = hasReceived ? 'answered' : 'missed';
  }

  const agentNames: string[] = [];
  let finalAgent: string | null = null;
  for (const leg of legs) {
    if (Array.isArray(leg._rr)) {
      for (const r of leg._rr) {
        if (r._na) agentNames.push(r._na);
      }
    }
    if (leg._ac === 'received' && Array.isArray(leg._rr)) {
      const received = leg._rr.filter(r => r._na).map(r => r._na!);
      if (received.length > 0) finalAgent = received[received.length - 1];
    }
  }
  const uniqueAgents = [...new Set(agentNames)];
  const agentDisplay = uniqueAgents.length > 0 ? uniqueAgents.join(', ') : (log.assigned_agent_name || log.agent_name || 'Unknown');

  const department = (payload?._dn as string) || log.department;

  let duration = log.call_duration;
  if (payload?._dr) {
    duration = parseDurationFromPayload(String(payload._dr));
  }

  const recording = sanitizeRecordingUrl((payload?._fu as string) || log.recording_url);
  const startTime = payload?._st != null ? String(payload._st) : log.start_time;

  let whatText = '';
  if (status === 'answered') {
    whatText = `Call received by ${agentDisplay}`;
  } else {
    whatText = `Call missed by ${agentDisplay}`;
  }
  if (department) {
    whatText += ` at (${department})`;
  }

  const missedAttempts: string[] = [];
  for (const leg of legs) {
    const legAgents = Array.isArray(leg._rr) ? leg._rr.map(r => r._na).filter(Boolean).join(', ') : '';
    if (leg._ac !== 'received' && legAgents) {
      missedAttempts.push(legAgents);
    }
  }

  return { status, agentDisplay, finalAgent, department, duration, recording, startTime, whatText, missedAttempts, legs };
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
    const num = Number(startTime);
    if (!isNaN(num) && num > 1000000000) {
      const d = new Date(num * 1000);
      if (!isNaN(d.getTime())) return format(d, "hh:mm a");
    }
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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Group logs by call_id (_ai), keeping the most complete record per call session */
function groupLogsByCallId(logs: CallLog[]): CallLog[] {
  const grouped = new Map<string, CallLog>();
  
  for (const log of logs) {
    const key = log.call_id || log.id; // fallback to id if no call_id
    
    if (!grouped.has(key)) {
      grouped.set(key, log);
    } else {
      const existing = grouped.get(key)!;
      // Keep the one with more data (prefer one with recording, longer duration, or raw_payload with _ld)
      const existingPayload = parseRawPayload(existing.raw_payload);
      const newPayload = parseRawPayload(log.raw_payload);
      const existingLegs = existingPayload?._ld && Array.isArray(existingPayload._ld) ? existingPayload._ld.length : 0;
      const newLegs = newPayload?._ld && Array.isArray(newPayload._ld) ? newPayload._ld.length : 0;
      
      const existingRecording = sanitizeRecordingUrl((existingPayload?._fu as string) || existing.recording_url);
      const newRecording = sanitizeRecordingUrl((newPayload?._fu as string) || log.recording_url);
      
      // Prefer: has recording > more legs > newer
      if ((!existingRecording && newRecording) || (newLegs > existingLegs)) {
        grouped.set(key, log);
      }
    }
  }
  
  return Array.from(grouped.values());
}

export function CallLogsPanel() {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchPhone, setSearchPhone] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<CallLog | null>(null);
  const [expandedAudio, setExpandedAudio] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const fetchLogs = useCallback(async () => {
    let query = supabase
      .from("call_logs")
      .select("*")
      .order("start_time", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (searchPhone.trim()) {
      query = query.or(`caller_number.ilike.%${searchPhone.trim()}%,full_number.ilike.%${searchPhone.trim()}%`);
    }

    const { data, error } = await query;
    if (!error && data) {
      let allLogs = data as CallLog[];
      
      // Group by call_id to remove duplicates
      let grouped = groupLogsByCallId(allLogs);

      // Client-side status filter
      if (statusFilter !== "all") {
        grouped = grouped.filter(log => {
          const info = deriveCallInfo(log);
          return info.status === statusFilter;
        });
      }

      // Sort by start_time desc
      grouped.sort((a, b) => {
        const aInfo = deriveCallInfo(a);
        const bInfo = deriveCallInfo(b);
        const aTime = String(aInfo.startTime || a.created_at);
        const bTime = String(bInfo.startTime || b.created_at);
        return bTime.localeCompare(aTime);
      });

      const currentIds = new Set(grouped.map((l) => l.id));
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
      setLogs(grouped);
    }
    setLoading(false);
  }, [searchPhone, statusFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 8000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-myoperator-logs', { method: 'POST' });
      if (error) throw error;
      toast.success(`Sync complete: ${data?.inserted || 0} new, ${data?.updated || 0} updated`);
      fetchLogs();
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
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
              Real-time call logs via webhook + API sync ({logs.length} calls)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={triggerSync} disabled={syncing}>
              <Download className={`w-4 h-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Backfill Now"}
            </Button>
            <Button variant={autoRefresh ? "default" : "outline"} size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
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
            <Input placeholder="Search phone number..." value={searchPhone} onChange={(e) => setSearchPhone(e.target.value)} className="pl-8" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
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
                  const logKey = log.call_id || log.id;

                  return (
                    <React.Fragment key={log.id}>
                      <TableRow
                        key={log.id}
                        className={newIds.has(log.id) ? "bg-primary/10 animate-pulse border-l-4 border-l-primary" : ""}
                      >
                        <TableCell className="pr-0">{statusIcon(info.status)}</TableCell>
                        <TableCell className="font-mono text-sm font-medium text-primary">
                          {log.full_number || log.caller_number}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{info.whatText}</div>
                          {info.finalAgent && info.status === 'answered' && (
                            <div className="text-xs text-green-600 font-medium mt-0.5">
                              Final Agent: {info.finalAgent}
                            </div>
                          )}
                          {info.missedAttempts.length > 0 && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              {info.missedAttempts.map((name, i) => (
                                <span key={i} className="flex items-center gap-0.5">
                                  <XCircle className="w-3 h-3 text-red-400" />
                                  <span>{name}</span>
                                  {i < info.missedAttempts.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                                </span>
                              ))}
                              {info.status === 'answered' && (
                                <>
                                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                                  <span className="text-green-600">Received</span>
                                </>
                              )}
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
                              className="h-8 w-8 hover:bg-primary/10"
                              onClick={() => setExpandedAudio(expandedAudio === logKey ? null : logKey)}
                            >
                              {expandedAudio === logKey ? (
                                <Pause className="w-4 h-4 text-primary" />
                              ) : (
                                <Play className="w-4 h-4 text-primary" />
                              )}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                            <Eye className="w-4 h-4 mr-1" /> Details
                          </Button>
                        </TableCell>
                      </TableRow>
                      {/* Inline audio player row */}
                      {expandedAudio === logKey && info.recording && (
                        <TableRow key={`${log.id}-audio`}>
                          <TableCell colSpan={7} className="py-2 px-4">
                            <InlineAudioPlayer url={info.recording} duration={info.duration} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
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
            <DialogDescription>
              Detailed view of the call session
            </DialogDescription>
          </DialogHeader>
          {selectedLog && <CallLogDetails log={selectedLog} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ─── Inline Audio Player ─── */
function InlineAudioPlayer({ url, duration }: { url: string; duration: number | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);

  // Fetch recording via MyOperator API (extracts filename, calls get-myoperator-recording)
  const fetchRecording = useCallback(async () => {
    const isMyOperator = url.includes('myoperator.com');
    if (!isMyOperator) return;

    const file = extractRecordingFile(url);
    if (!file) {
      console.warn('Could not extract recording filename from:', url);
      setError(true);
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const endpoint = `${supabaseUrl}/functions/v1/get-myoperator-recording?file=${encodeURIComponent(file)}`;

      const resp = await fetch(endpoint, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (!resp.ok) {
        const errorBody = await resp.text().catch(() => '');
        console.warn('Recording API response:', resp.status, errorBody);
        setError(true);
        return;
      }

      const contentType = resp.headers.get('content-type') || '';

      // If API returned JSON, either use the URL or mark as unavailable
      if (contentType.includes('application/json')) {
        const data = await resp.json();
        if (data.recording_url) {
          setStreamUrl(data.recording_url);
          return;
        }
        console.warn('Recording unavailable:', data);
        setError(true);
        return;
      }

      // If API streamed audio directly, create a blob URL
      const blob = await resp.blob();
      if (blob.size === 0) throw new Error('Empty recording response');
      const objUrl = URL.createObjectURL(blob);
      setStreamUrl(objUrl);
    } catch (err) {
      console.warn('Recording fetch failed:', url, err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    return () => {
      if (streamUrl?.startsWith('blob:')) URL.revokeObjectURL(streamUrl);
    };
  }, [streamUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const onTimeUpdate = () => setCurrentTime(Math.floor(audio.currentTime));
    const onLoaded = () => { if (audio.duration && isFinite(audio.duration)) setAudioDuration(Math.floor(audio.duration)); };
    const onEnded = () => setIsPlaying(false);
    const onError = () => { 
      if (!streamUrl && !loading) { setError(true); console.warn("Recording URL failed:", url); }
    };
    
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [url, streamUrl, loading]);

  const togglePlay = async () => {
    // Lazy-load recording via API on first play
    if (!streamUrl && url.includes('myoperator.com') && !error) {
      await fetchRecording();
      return; // Will auto-play after streamUrl is set
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); } else { audio.play().catch(() => setError(true)); }
    setIsPlaying(!isPlaying);
  };

  // Auto-play once stream URL is ready
  useEffect(() => {
    if (streamUrl && audioRef.current) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setError(true));
    }
  }, [streamUrl]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
        <AlertTriangle className="w-4 h-4" />
        <span>Recording not available — check MyOperator credentials in Admin settings</span>
      </div>
    );
  }

  const audioSrc = streamUrl || (url.includes('myoperator.com') ? undefined : url);

  return (
    <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-2.5">
      <audio ref={audioRef} preload="none" src={audioSrc} />
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={togglePlay} disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </Button>
      <span className="text-xs font-mono text-muted-foreground w-10 shrink-0">{formatTime(currentTime)}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: audioDuration > 0 ? `${(currentTime / audioDuration) * 100}%` : '0%' }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-10 shrink-0">{formatTime(audioDuration)}</span>
      <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
    </div>
  );
}

/* ─── Call Log Details ─── */
function CallLogDetails({ log }: { log: CallLog }) {
  const info = deriveCallInfo(log);

  return (
    <div className="space-y-5">
      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Detail label="Caller Number" value={log.full_number || log.caller_number} />
        <Detail label="Call ID" value={log.call_id} />
        <Detail label="Status" value={
          <Badge variant={info.status === 'answered' ? 'default' : 'destructive'} className={info.status === 'answered' ? 'bg-green-600' : ''}>
            {info.status === 'answered' ? 'Call Received' : 'Call Missed'}
          </Badge>
        } />
        <Detail label="Call Type" value={log.call_type} />
        <Detail label="Duration" value={info.duration ? formatDuration(info.duration) : null} />
        <Detail label="Department" value={info.department} />
        <Detail label="Agent(s)" value={info.agentDisplay} />
        {info.finalAgent && <Detail label="Final Agent" value={<span className="text-green-600 font-semibold">{info.finalAgent}</span>} />}
        <Detail label="Time" value={formatCallTime(info.startTime, log.created_at) + ' · ' + formatCallDate(info.startTime, log.created_at)} />
        <Detail label="Lead Created" value={log.lead_created ? "Yes" : "No"} />
      </div>

      {/* Call Routing Timeline */}
      {info.legs.length > 0 ? (
        <div>
          <p className="text-sm font-semibold mb-2">Call Routing Timeline</p>
          <div className="flex items-center gap-1 flex-wrap">
            {info.legs.map((leg, idx) => {
              const agents = Array.isArray(leg._rr) ? leg._rr.map(r => r._na).filter(Boolean).join(', ') : 'Unknown';
              const isReceived = leg._ac === 'received';
              return (
                <div key={idx} className="flex items-center gap-1">
                  {idx > 0 && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full ${isReceived ? 'bg-green-500/15 text-green-700 border border-green-500/30' : 'bg-red-500/10 text-red-600 border border-red-500/20'}`}>
                    {isReceived ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    <span className="font-medium">{isReceived ? 'Received' : 'Missed'}</span>
                    <span className="text-xs opacity-75">({agents})</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
          No routing data available
        </div>
      )}

      {/* Recording Section */}
      {info.recording ? (
        <div>
          <p className="text-sm font-semibold mb-2">Recording</p>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <InlineAudioPlayer url={info.recording} duration={info.duration} />
            {info.duration && (
              <p className="text-xs text-muted-foreground text-right">Duration: {formatDuration(info.duration)}</p>
            )}
          </div>
        </div>
      ) : null}

      {/* Raw Payload (collapsed by default) */}
      <details className="text-sm">
        <summary className="font-semibold cursor-pointer text-muted-foreground hover:text-foreground">Raw Payload</summary>
        <pre className="bg-muted p-3 rounded-md text-xs overflow-auto max-h-60 whitespace-pre-wrap mt-2">
          {JSON.stringify(log.raw_payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode | string | null | undefined }) {
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="font-medium mt-0.5">{value || "—"}</div>
    </div>
  );
}
