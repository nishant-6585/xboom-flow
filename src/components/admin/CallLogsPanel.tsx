import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Phone, Play, Pause, Eye, Search, Loader2, PhoneIncoming, PhoneMissed, PhoneOff } from "lucide-react";
import { format } from "date-fns";

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

export function CallLogsPanel() {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchPhone, setSearchPhone] = useState("");
  const [callTypeFilter, setCallTypeFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<CallLog | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const fetchLogs = useCallback(async () => {
    let query = supabase
      .from("call_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (searchPhone.trim()) {
      query = query.ilike("caller_number", `%${searchPhone.trim()}%`);
    }
    if (callTypeFilter !== "all") {
      query = query.eq("call_type", callTypeFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      const currentIds = new Set(data.map((l: CallLog) => l.id));
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
      setLogs(data as CallLog[]);
    }
    setLoading(false);
  }, [searchPhone, callTypeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 8000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

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

  const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "answered": return "default";
      case "missed": return "destructive";
      case "busy": return "secondary";
      default: return "outline";
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
              Real-time call logs from MyOperator webhook ({logs.length} records)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
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
          <Select value={callTypeFilter} onValueChange={setCallTypeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Call Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="incoming">Incoming</SelectItem>
              <SelectItem value="outgoing">Outgoing</SelectItem>
              <SelectItem value="missed">Missed</SelectItem>
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
            <p className="text-sm">Check webhook configuration in MyOperator dashboard.</p>
          </div>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12"></TableHead>
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
                  const agent = log.assigned_agent_name || log.agent_name;
                  const dept = log.department;
                  const whatParts: string[] = [];
                  if (log.call_status === 'answered') {
                    whatParts.push(`Call received by ${agent || 'Unknown'}`);
                  } else if (log.call_status === 'missed') {
                    whatParts.push(`Call missed by ${agent || 'Unknown'}`);
                  } else if (log.call_status === 'busy') {
                    whatParts.push(`Call busy`);
                  } else {
                    whatParts.push(`Call ${log.call_status}`);
                  }
                  const whatText = whatParts[0] + (dept ? ` at (${dept})` : '');

                  return (
                    <TableRow
                      key={log.id}
                      className={newIds.has(log.id)
                        ? "bg-primary/10 animate-pulse border-l-4 border-l-primary"
                        : ""
                      }
                    >
                      <TableCell>
                        {statusIcon(log.call_status)}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium text-primary">
                        {log.full_number || log.caller_number}
                      </TableCell>
                      <TableCell className="text-sm">
                        {whatText}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), "hh:mma")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.call_duration ? formatDuration(log.call_duration) : "—"}
                      </TableCell>
                      <TableCell>
                        {log.recording_url ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleAudio(log.recording_url!)}
                          >
                            {playingAudio === log.recording_url ? (
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
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Detail label="Caller Number" value={selectedLog.caller_number} />
                <Detail label="Full Number" value={selectedLog.full_number} />
                <Detail label="Call ID" value={selectedLog.call_id} />
                <Detail label="Call Status" value={selectedLog.call_status} />
                <Detail label="Call Type" value={selectedLog.call_type} />
                <Detail label="Duration" value={selectedLog.call_duration ? `${selectedLog.call_duration}s` : null} />
                <Detail label="Department" value={selectedLog.department} />
                <Detail label="Agent Name" value={selectedLog.assigned_agent_name || selectedLog.agent_name} />
                <Detail label="Agent Phone" value={selectedLog.assigned_agent_phone || selectedLog.agent_number} />
                <Detail label="Start Time" value={selectedLog.start_time} />
                <Detail label="End Time" value={selectedLog.end_time} />
                <Detail label="Lead Created" value={selectedLog.lead_created ? "Yes" : "No"} />
                <Detail label="Lead ID" value={selectedLog.lead_id} />
                <Detail label="Timestamp" value={format(new Date(selectedLog.created_at), "dd MMM yyyy, HH:mm:ss")} />
              </div>
              {selectedLog.recording_url && (
                <div>
                  <p className="text-sm font-medium mb-1">Recording</p>
                  <audio controls src={selectedLog.recording_url} className="w-full" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium mb-1">Raw Payload</p>
                <pre className="bg-muted p-3 rounded-md text-xs overflow-auto max-h-60 whitespace-pre-wrap">
                  {JSON.stringify(selectedLog.raw_payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
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
