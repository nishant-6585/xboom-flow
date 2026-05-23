import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Phone, Play, Pause, Eye, Search, Loader2, PhoneIncoming, PhoneMissed, PhoneOff, Download, Volume2, AlertTriangle, ArrowRight, CheckCircle2, XCircle, PhoneOutgoing, MessageSquare } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LogCallDialog } from '@/components/sales/LogCallDialog';
import { CallLogEditDialog } from './CallLogEditDialog';
import { format } from "date-fns";
import { toast } from "sonner";
import { ProspectButton } from "@/components/sales/ProspectButton";
import { AttentionButton } from "@/components/sales/AttentionButton";
import { EnquiryConvertButton } from "@/components/sales/EnquiryConvertButton";
import type { Prospect } from "@/hooks/useProspects";
import { useSalesUsers } from "@/hooks/useSalesUsers";

interface CallLogsPanelProps {
  prospects?: Prospect[];
  prospectSourceIds?: Set<string>;
  attentionSourceIds?: Set<string>;
  onLogsLoaded?: (logs: CallLog[]) => void;
  dateRange?: { start: Date | undefined; end: Date | undefined };
  defaultDepartment?: string;
}

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
  sales_person_name: string | null;
  outcall_info: string | null;
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

  // Use _fn (filename) from payload for recording
  const recordingFile = extractRecordingFilename(payload);
  // Fallback: older/newer webhooks may store the recording as a direct URL on the row
  const recordingUrl = !recordingFile && log.recording_url && log.recording_url.trim().length > 0
    ? log.recording_url.trim()
    : null;
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

  return { status, agentDisplay, finalAgent, department, duration, recordingFile, recordingUrl, startTime, whatText, missedAttempts, legs };
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

/** Merge user-edited fields from source into target when target is missing them */
function mergeEditableFields(target: CallLog, source: CallLog): CallLog {
  const editableKeys = [
    'customer_name', 'customer_company', 'email', 'city', 'product_name',
    'product_category', 'product_code', 'lead_source', 'urgency',
    'requested_timeline', 'purpose_of_purchase', 'notes', 'customer_type',
    'sales_person_id', 'sales_person_name', 'outcall_info',
  ] as const;
  const merged = { ...target } as any;
  const src = source as any;
  // Prefer editable fields from the most recently updated row
  const targetUpdated = (target as any).updated_at || '';
  const sourceUpdated = (src as any).updated_at || '';
  for (const key of editableKeys) {
    if (sourceUpdated > targetUpdated && src[key]) {
      merged[key] = src[key];
    } else if (!merged[key] && src[key]) {
      merged[key] = src[key];
    }
  }
  // Special handling for quantity (default is 1, so prefer the edited value)
  if (src.quantity && src.quantity !== 1 && (!merged.quantity || merged.quantity === 1)) {
    merged.quantity = src.quantity;
  }
  return merged as CallLog;
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
      
      const existingFile = extractRecordingFilename(existingPayload);
      const newFile = extractRecordingFilename(newPayload);
      
      // Prefer: has recording > more legs > newer
      if ((!existingFile && newFile) || (newLegs > existingLegs)) {
        // New log wins for call data, but merge editable fields from existing
        grouped.set(key, mergeEditableFields(log, existing));
      } else {
        // Existing wins for call data, but merge editable fields from new log
        grouped.set(key, mergeEditableFields(existing, log));
      }
    }
  }
  
  return Array.from(grouped.values());
}

export function CallLogsPanel({ prospects = [], prospectSourceIds = new Set(), attentionSourceIds = new Set(), onLogsLoaded, dateRange, defaultDepartment }: CallLogsPanelProps) {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchPhone, setSearchPhone] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [salesPersonFilter, setSalesPersonFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState(defaultDepartment || "all");
  const [missedOnly, setMissedOnly] = useState(false);
  const [uniqueOnly, setUniqueOnly] = useState(false);
  const [selectedLog, setSelectedLog] = useState<CallLog | null>(null);
  const [expandedAudio, setExpandedAudio] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [editingLog, setEditingLog] = useState<CallLog | null>(null);
  const [updatingAssign, setUpdatingAssign] = useState<string | null>(null);
  const [logCallData, setLogCallData] = useState<{ id: string; name: string; phone: string; company?: string; created_at?: string } | null>(null);

  // Fixed assignment pool — only these 6 reps can be assigned to call logs.
  // Match is case-insensitive and uses substring matching to handle minor
  // name variations (e.g. "mohammed musthak" vs "Musthak").
  const ASSIGNABLE_REP_KEYWORDS = [
    "suman das",
    "narasimha",
    "musthak",
    "arjav",
    "srishti",
    "manoj kumar",
  ];
  const { salesUsers } = useSalesUsers();
  const allowedSalesUsers = React.useMemo(
    () =>
      salesUsers.filter(u => {
        const n = (u.name || "").trim().toLowerCase();
        return ASSIGNABLE_REP_KEYWORDS.some(k => n.includes(k));
      }),
    [salesUsers]
  );
  const SALES_PERSONS_LIST = React.useMemo(
    () => allowedSalesUsers.map(u => u.name.trim()).filter(Boolean).sort(),
    [allowedSalesUsers]
  );

  // Extract unique sales persons and agents from current logs for filter options
  const { salesPersons, agents } = React.useMemo(() => {
    const spSet = new Set<string>();
    const agSet = new Set<string>();
    logs.forEach(log => {
      if (log.sales_person_name) spSet.add(log.sales_person_name);
      const info = deriveCallInfo(log);
      if (info.finalAgent) agSet.add(info.finalAgent);
      // Also add individual agents from legs
      const payload = parseRawPayload(log.raw_payload);
      const legs: LegDetail[] = payload?._ld && Array.isArray(payload._ld) ? payload._ld as LegDetail[] : [];
      for (const leg of legs) {
        if (Array.isArray(leg._rr)) {
          for (const r of leg._rr) {
            if (r._na) agSet.add(r._na);
          }
        }
      }
    });
    return {
      salesPersons: Array.from(spSet).sort(),
      agents: Array.from(agSet).sort(),
    };
  }, [logs]);

  const filteredLogs = React.useMemo(() => {
    let result = logs;
    if (departmentFilter !== "all") {
      result = result.filter(log => {
        const info = deriveCallInfo(log);
        return info.department?.toLowerCase() === departmentFilter.toLowerCase();
      });
    }
    if (missedOnly) {
      result = result.filter(log => {
        const info = deriveCallInfo(log);
        return info.status === 'missed';
      });
    }
    if (salesPersonFilter !== "all") {
      result = result.filter(log => log.sales_person_name === salesPersonFilter);
    }
    if (agentFilter !== "all") {
      result = result.filter(log => {
        const info = deriveCallInfo(log);
        const payload = parseRawPayload(log.raw_payload);
        const legs: LegDetail[] = payload?._ld && Array.isArray(payload._ld) ? payload._ld as LegDetail[] : [];
        for (const leg of legs) {
          if (Array.isArray(leg._rr)) {
            for (const r of leg._rr) {
              if (r._na === agentFilter) return true;
            }
          }
        }
        return info.finalAgent === agentFilter || info.agentDisplay.includes(agentFilter);
      });
    }
    // Dedupe by unique caller number (keep most recent per number)
    if (uniqueOnly) {
      const seen = new Set<string>();
      result = result.filter(log => {
        const num = (log.caller_number || '').replace(/\D/g, '').slice(-10);
        if (!num || seen.has(num)) return false;
        seen.add(num);
        return true;
      });
    }
    return result;
  }, [logs, salesPersonFilter, agentFilter, missedOnly, departmentFilter, uniqueOnly]);

  const handleAssignChange = async (logId: string, newName: string) => {
    setUpdatingAssign(logId);
    try {
      const trimmed = newName.trim();
      const matched = allowedSalesUsers.find(
        u => u.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      const updatePayload: { sales_person_name: string | null; sales_person_id: string | null } = {
        sales_person_name: trimmed || null,
        sales_person_id: matched?.user_id ?? null,
      };
      const { error } = await supabase
        .from('call_logs')
        .update(updatePayload)
        .eq('id', logId);
      if (error) throw error;
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, ...updatePayload } : l));
      toast.success('Assigned person updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setUpdatingAssign(null);
    }
  };

  const fetchLogs = useCallback(async () => {
    let query = supabase
      .from("call_logs")
      .select("*")
      .order("start_time", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    // Apply date range filter if provided
    if (dateRange?.start) {
      query = query.gte("created_at", dateRange.start.toISOString());
    }
    if (dateRange?.end) {
      const endOfDay = new Date(dateRange.end);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte("created_at", endOfDay.toISOString());
    }

    // Only apply limit when no date filter (to avoid missing data)
    if (!dateRange?.start && !dateRange?.end) {
      query = query.limit(200);
    } else {
      query = query.limit(1000);
    }

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

      // Sort by start_time desc — normalize mixed formats (Unix seconds vs ISO)
      // to a millisecond timestamp before comparing, otherwise lexicographic
      // sort places old numeric `_st` values above ISO "2026-…" timestamps.
      const toMs = (v: string | number | null | undefined): number => {
        if (v == null) return 0;
        const s = String(v).trim();
        if (!s) return 0;
        if (/^\d+$/.test(s)) {
          const n = Number(s);
          // 10-digit = seconds, 13-digit = ms
          return n < 1e12 ? n * 1000 : n;
        }
        const t = Date.parse(s);
        return Number.isNaN(t) ? 0 : t;
      };
      grouped.sort((a, b) => {
        const aInfo = deriveCallInfo(a);
        const bInfo = deriveCallInfo(b);
        const aMs = toMs(aInfo.startTime) || toMs(a.created_at);
        const bMs = toMs(bInfo.startTime) || toMs(b.created_at);
        return bMs - aMs;
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
      onLogsLoaded?.(allLogs);
    }
    setLoading(false);
  }, [searchPhone, statusFilter, dateRange?.start?.getTime(), dateRange?.end?.getTime()]);

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

  const openWhatsApp = (phone: string) => {
    const num = (phone || '').replace(/\D/g, '');
    if (!num) return;
    window.open(`https://wa.me/${num}`, '_blank');
  };

  const bestPhone = (log: CallLog): string => log.full_number || log.caller_number;

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
              Real-time call logs via webhook + API sync ({filteredLogs.length}{filteredLogs.length !== logs.length ? ` of ${logs.length}` : ''} calls)
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
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 max-w-xs min-w-[180px]">
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
          <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Sales Person" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sales Persons</SelectItem>
              {salesPersons.map(sp => (
                <SelectItem key={sp} value={sp}>{sp}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Agent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agents.map(ag => (
                <SelectItem key={ag} value={ag}>{ag}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={missedOnly ? "destructive" : "outline"}
            size="sm"
            onClick={() => setMissedOnly(!missedOnly)}
            className="shrink-0"
          >
            <PhoneMissed className="w-4 h-4 mr-1" />
            {missedOnly ? 'Showing Missed' : 'Missed Calls'}
          </Button>
          {!defaultDepartment && (
            <div className="flex border rounded-md">
              <Button
                variant={departmentFilter === "all" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setDepartmentFilter("all")}
                className="rounded-r-none text-xs px-3"
              >
                All
              </Button>
              <Button
                variant={departmentFilter === "sales" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setDepartmentFilter(departmentFilter === "sales" ? "all" : "sales")}
                className="rounded-none border-x text-xs px-3"
              >
                Sales
              </Button>
              <Button
                variant={departmentFilter === "support" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setDepartmentFilter(departmentFilter === "support" ? "all" : "support")}
                className="rounded-l-none text-xs px-3"
              >
                Support
              </Button>
            </div>
          )}
          <Button
            variant={uniqueOnly ? "secondary" : "outline"}
            size="sm"
            onClick={() => setUniqueOnly(!uniqueOnly)}
            className={`shrink-0 text-xs ${uniqueOnly ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30' : ''}`}
          >
            {uniqueOnly ? '✓ Unique Numbers' : 'Unique Numbers'}
          </Button>
        </div>

        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredLogs.length === 0 ? (
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
                  <TableHead className="w-[40px]">P</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Recording</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => {
                  const info = deriveCallInfo(log);
                  const logKey = log.call_id || log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <TableRow
                        key={log.id}
                        className={`cursor-pointer ${info.status === 'missed' ? 'bg-destructive/5' : ''} ${newIds.has(log.id) ? "bg-primary/10 animate-pulse border-l-4 border-l-primary" : ''}`}
                        onClick={() => setEditingLog(log)}
                      >
                        <TableCell className="pr-0">{statusIcon(info.status)}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <ProspectButton
                              sourceType="myoperator"
                              sourceId={log.id}
                              customerName={log.full_number || log.caller_number}
                              phoneNumber={log.full_number || log.caller_number}
                              notes={info.whatText}
                              isAlreadyProspect={prospectSourceIds.has(`myoperator:${log.id}`)}
                            />
                            <AttentionButton
                              sourceType="myoperator"
                              sourceId={log.id}
                              customerName={log.full_number || log.caller_number}
                              phoneNumber={log.full_number || log.caller_number}
                              notes={info.whatText}
                              isAlreadyAttention={attentionSourceIds.has(`myoperator:${log.id}`)}
                            />
                            <EnquiryConvertButton
                              sourceType="myoperator"
                              sourceId={log.id}
                              customerName={(log as any).customer_name || log.full_number || log.caller_number}
                              phoneNumber={log.full_number || log.caller_number}
                              company={(log as any).customer_company}
                              city={(log as any).city}
                              productName={(log as any).product_name}
                              productCategory={(log as any).product_category}
                              productCode={(log as any).product_code}
                              quantity={(log as any).quantity}
                              urgency={(log as any).urgency}
                              requestedTimeline={(log as any).requested_timeline}
                              purposeOfPurchase={(log as any).purpose_of_purchase}
                              notes={info.whatText}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="space-y-0.5">
                            <div className={`font-semibold ${info.status === 'missed' ? 'text-destructive' : 'text-foreground'}`}>
                              {(log as any).customer_name || 'Unknown'}
                            </div>
                            <div className={`font-mono text-xs ${info.status === 'missed' ? 'text-destructive/80' : 'text-primary'}`}>
                              {log.full_number || log.caller_number}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className={info.status === 'missed' ? 'text-red-500 font-medium' : ''}>{info.whatText}</div>
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
                        <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={(log.sales_person_name || '').trim() || 'unassigned'}
                            onValueChange={(v) => handleAssignChange(log.id, v === 'unassigned' ? '' : v)}
                            disabled={updatingAssign === log.id}
                          >
                            <SelectTrigger className="h-8 w-36 text-xs">
                              <SelectValue placeholder="Assign..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">— Unassigned —</SelectItem>
                              {SALES_PERSONS_LIST.map(sp => (
                                <SelectItem key={sp} value={sp}>{sp}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          <div>{formatCallTime(info.startTime, log.created_at)}</div>
                          <div className="text-xs">{formatCallDate(info.startTime, log.created_at)}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {info.duration ? formatDuration(info.duration) : "—"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {(info.recordingFile || info.recordingUrl) ? (
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
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary hover:text-primary"
                              onClick={() => setLogCallData({
                                id: log.id,
                                name: (log as any).customer_name || log.full_number || log.caller_number,
                                phone: log.full_number || log.caller_number,
                                company: (log as any).customer_company,
                                created_at: log.created_at,
                              })}
                              title="Log Outbound Call"
                            >
                              <PhoneOutgoing className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                              onClick={() => openWhatsApp(bestPhone(log))}
                              title="WhatsApp"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                              <Eye className="w-4 h-4 mr-1" /> Details
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedAudio === logKey && (info.recordingFile || info.recordingUrl) && (
                        <TableRow key={`${log.id}-audio`}>
                          <TableCell colSpan={9} className="py-2 px-4">
                            <InlineAudioPlayer recordingFile={info.recordingFile} directUrl={info.recordingUrl} duration={info.duration} autoPlay />
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
          {selectedLog && (
            <CallLogDetails log={selectedLog} />
          )}
        </DialogContent>
      </Dialog>

      <CallLogEditDialog
        open={!!editingLog}
        onOpenChange={(open) => { if (!open) setEditingLog(null); }}
        callLog={editingLog}
        onSuccess={fetchLogs}
      />

      <LogCallDialog
        open={!!logCallData}
        onOpenChange={(open) => { if (!open) setLogCallData(null); }}
        leadSource="myoperator"
        leadId={logCallData?.id || ''}
        leadName={logCallData?.name || ''}
        leadPhone={logCallData?.phone || ''}
        leadCompany={logCallData?.company}
        leadCreatedAt={logCallData?.created_at}
      />
    </Card>
  );
}

/* ─── Inline Audio Player ─── */
function InlineAudioPlayer({ recordingFile, directUrl, duration, autoPlay = false }: { recordingFile: string | null; directUrl?: string | null; duration: number | null; autoPlay?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(directUrl || null);
  const hasAutoStarted = useRef(false);

  // Fetch recording via MyOperator recordings/link API
  const fetchRecording = useCallback(async () => {
    if (directUrl) {
      setStreamUrl(directUrl);
      return;
    }
    if (!recordingFile) {
      setError(true);
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const endpoint = `${supabaseUrl}/functions/v1/get-myoperator-recording?file=${encodeURIComponent(recordingFile)}`;

      const resp = await fetch(endpoint, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      const data = await resp.json();
      
      if (data.recording_url) {
        setStreamUrl(data.recording_url);
        return;
      }
      
      console.warn('Recording unavailable:', data);
      setError(true);
    } catch (err) {
      console.warn('Recording fetch failed:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [recordingFile, directUrl]);

  // Auto-start loading on mount when autoPlay is true
  useEffect(() => {
    if (autoPlay && !hasAutoStarted.current && !streamUrl && !error && !loading) {
      hasAutoStarted.current = true;
      fetchRecording();
    }
  }, [autoPlay, fetchRecording]);

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
      if (!streamUrl && !loading) { setError(true); }
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
  }, [streamUrl, loading]);

  const togglePlay = async () => {
    // Lazy-load recording via API on first play
    if (!streamUrl && !error) {
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

  const audioSrc = streamUrl || undefined;

  return (
    <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-2.5">
      <audio ref={audioRef} preload="none" src={audioSrc} />
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={togglePlay} disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </Button>
      <span className="text-xs font-mono text-muted-foreground w-10 shrink-0">{formatTime(currentTime)}</span>
      <input
        type="range"
        min={0}
        max={audioDuration || 0}
        value={currentTime}
        onChange={(e) => {
          const time = Number(e.target.value);
          setCurrentTime(time);
          if (audioRef.current) audioRef.current.currentTime = time;
        }}
        className="flex-1 h-1.5 accent-primary cursor-pointer"
        disabled={!streamUrl}
      />
      <span className="text-xs font-mono text-muted-foreground w-10 shrink-0">{formatTime(audioDuration)}</span>
      <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
    </div>
  );
}

/* ─── Call Log Details ─── */
interface CallLogDetailsProps {
  log: CallLog;
}

function CallLogDetails({ log }: CallLogDetailsProps) {
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
      {info.recordingFile ? (
        <div>
          <p className="text-sm font-semibold mb-2">Recording</p>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <InlineAudioPlayer recordingFile={info.recordingFile} duration={info.duration} />
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
