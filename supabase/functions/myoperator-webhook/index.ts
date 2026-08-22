import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  const rawBody = req.method === 'POST' ? await req.text() : '';
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    headers[k] = /secret|token|authorization|apikey|x-api-key/i.test(k) ? '[redacted]' : v;
  }
  // v2 webhooks can send the shared secret in a custom header; v1 config only
  // lets you set a URL, so a ?secret= / ?token= query param is also accepted.

  // MyOperator's webhook config only lets you set a URL (no custom headers),
  // so the shared secret may arrive either as a header or a query parameter.
  const headerSecret =
    req.headers.get('x-myoperator-secret') ||
    req.headers.get('myoperator-secret') ||
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-secret') ||
    null;
  const querySecret =
    url.searchParams.get('secret') || url.searchParams.get('token');

  console.log('Webhook hit:', {
    timestamp,
    method: req.method,
    secret_source: headerSecret ? 'header' : querySecret ? 'query' : 'none',
    header_keys: Object.keys(headers).join(','),
    content_type: req.headers.get('content-type'),
    body_len: rawBody.length,
  });


  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response('Webhook is live', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Shared-secret auth: require the MYOPERATOR_WEBHOOK_SECRET value in either
  // the x-myoperator-secret header or a ?secret= / ?token= query parameter.
  if (req.method === 'POST') {
    const expected = Deno.env.get('MYOPERATOR_WEBHOOK_SECRET');
    if (!expected) {
      console.error('MYOPERATOR_WEBHOOK_SECRET not configured — rejecting request');
      return new Response(JSON.stringify({ error: 'server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const provided = (headerSecret || querySecret || '').trim();
    if (provided !== expected.trim()) {
      console.warn('MyOperator webhook auth failed', {
        secret_source: headerSecret ? 'header' : querySecret ? 'query' : 'none',
      });
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'POST') {
      let body: Record<string, unknown> = {};
      let parseError: string | null = null;

      if (rawBody) {
        try {
          const parsed = JSON.parse(rawBody);
          body = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed
            : {};
        } catch (e) {
          parseError = e instanceof Error ? e.message : 'Unknown JSON parse error';
          console.error('Invalid JSON:', rawBody);
        }
      }

      if (parseError) {
        await insertDebugLog(supabase, {
          raw_payload: rawBody,
          headers,
          request_method: req.method,
          processing_stage: 'json_parse_failed',
          error_message: parseError,
        });
      }

      console.log('MyOperator webhook received, parsed body keys:', Object.keys(body));

      // MyOperator Webhooks v1 uses shorthand keys (_cr, _ld, _ai ...) while
      // Webhooks v2 sends readable, often nested JSON. Normalize both here.
      const evt = extractEvent(body);
      console.log('[myoperator-webhook] payload version:', evt.version);

      const callerNumber = evt.callerNumber;
      const fullNumber = evt.fullNumber;
      const duration = evt.duration;
      const recordingUrl = evt.recordingUrl;
      const callType = evt.callType;
      const department = evt.department;
      const startTime = evt.startTime;
      const endTime = evt.endTime;

      let assignedAgentName: string | null = evt.agentName;
      const assignedAgentPhone: string | null = evt.agentPhone;
      const assignedAgentId: string | null = evt.agentId;
      const allAgents: string[] = evt.allAgents;


      // === Phase 2: resolve sales_person_id via centralized agent_user_mapping ===
      let resolvedSalesPersonId: string | null = null;
      let resolverFallback: 'agent_id' | 'agent_phone' | 'none' = 'none';
      try {
        if (assignedAgentId) {
          const { data } = await supabase.rpc('resolve_agent_user', {
            _provider: 'myoperator',
            _agent_id: assignedAgentId,
            _agent_phone: null,
          });
          if (data) { resolvedSalesPersonId = data as string; resolverFallback = 'agent_id'; }
        }
        if (!resolvedSalesPersonId && assignedAgentPhone) {
          const { data } = await supabase.rpc('resolve_agent_user', {
            _provider: 'myoperator',
            _agent_id: null,
            _agent_phone: assignedAgentPhone,
          });
          if (data) { resolvedSalesPersonId = data as string; resolverFallback = 'agent_phone'; }
        }
      } catch (e) {
        console.error('[myoperator-webhook] resolve_agent_user failed:', e);
      }

      // Load active sales-team pool (role='sales', approved profiles). The
      // receiving agent must belong to this pool — if not, we discard the
      // resolution and randomly assign to one of the sales reps so the lead
      // never ends up owned by a non-sales user.
      const salesPool = await loadSalesPool(supabase);
      let salesPersonNameOverride: string | null = null;
      let assignmentReason: 'receiver_in_sales' | 'random_fallback' | 'unresolved' = 'unresolved';

      if (resolvedSalesPersonId && salesPool.byId.has(resolvedSalesPersonId)) {
        salesPersonNameOverride = salesPool.byId.get(resolvedSalesPersonId)!;
        assignmentReason = 'receiver_in_sales';
      } else if (salesPool.list.length > 0) {
        // Either receiver not in sales team, or no resolution at all → random pick.
        const pick = salesPool.list[Math.floor(Math.random() * salesPool.list.length)];
        resolvedSalesPersonId = pick.user_id;
        salesPersonNameOverride = pick.name;
        assignmentReason = 'random_fallback';
      }

      console.log('[myoperator-webhook] assignment debug', {
        agent_id: assignedAgentId,
        agent_phone: assignedAgentPhone,
        agent_name: assignedAgentName,
        resolved_user_id: resolvedSalesPersonId,
        fallback_used: resolverFallback,
        assignment_reason: assignmentReason,
      });

      if (!resolvedSalesPersonId && (assignedAgentId || assignedAgentPhone)) {
        console.warn('UNMAPPED_AGENT', {
          provider: 'myoperator',
          agent_id: assignedAgentId,
          agent_phone: assignedAgentPhone,
          agent_name: assignedAgentName,
        });
      }

      // Normalize caller number
      const normalizedCaller = normalizePhone(callerNumber || '');
      const storedCallerNumber = normalizedCaller || `unknown:${crypto.randomUUID()}`;

      const callStatus = evt.callStatus;
      const callId = evt.callId;

      
      // Build agent display string
      let agentDisplay = allAgents.length > 0 ? allAgents.join(', ') : assignedAgentName;

      // If missed call with no known agent ("Unknown"), randomly assign to Narasimha or Mushtaq
      if (callStatus === 'missed' && (!agentDisplay || agentDisplay === 'Unknown' || agentDisplay.trim() === '')) {
        const missedCallAgents = ['Narasimha', 'Mushtaq'];
        agentDisplay = missedCallAgents[Math.floor(Math.random() * missedCallAgents.length)];
        assignedAgentName = agentDisplay;
      }

      const rawPayloadForStorage = parseError
        ? { raw_body: rawBody, parse_error: parseError }
        : body;

      // Idempotency: check if call_id already exists
      const { data: existing } = await supabase
        .from('call_logs')
        .select('id')
        .eq('call_id', callId)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await supabase
          .from('call_logs')
          .update({
            call_status: callStatus,
            call_duration: duration,
            recording_url: recordingUrl || null,
            agent_name: agentDisplay,
            agent_number: assignedAgentPhone,
            assigned_agent_name: agentDisplay,
            assigned_agent_phone: assignedAgentPhone,
            ...(resolvedSalesPersonId ? { sales_person_id: resolvedSalesPersonId } : {}),
            ...(salesPersonNameOverride ? { sales_person_name: salesPersonNameOverride } : {}),
            department,
            start_time: startTime,
            end_time: endTime,
            full_number: fullNumber,
            raw_payload: rawPayloadForStorage,
          })
          .eq('call_id', callId);

        if (updateError) {
          console.error('Error updating call log:', updateError.message);
          await insertDebugLog(supabase, {
            raw_payload: rawBody, headers, request_method: req.method,
            processing_stage: 'call_log_update_failed', error_message: updateError.message,
          });
        }

        return new Response(JSON.stringify({ success: true, action: 'updated' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Insert new call log
      const { data: callLog, error: callError } = await supabase
        .from('call_logs')
        .insert({
          call_id: callId,
          caller_number: storedCallerNumber,
          full_number: fullNumber,
          agent_number: assignedAgentPhone,
          agent_name: agentDisplay,
          assigned_agent_name: agentDisplay,
          assigned_agent_phone: assignedAgentPhone,
          sales_person_id: resolvedSalesPersonId,
          sales_person_name: salesPersonNameOverride,
          call_status: callStatus,
          call_duration: duration,
          call_type: callType,
          recording_url: recordingUrl || null,
          department,
          start_time: startTime,
          end_time: endTime,
          raw_payload: rawPayloadForStorage,
        })
        .select('id')
        .single();

      if (callError) {
        console.error('Error inserting call log:', callError.message);
        await insertDebugLog(supabase, {
          raw_payload: rawBody, headers, request_method: req.method,
          processing_stage: 'call_log_insert_failed', error_message: callError.message,
        });

        return new Response(JSON.stringify({ success: true, action: 'debug_logged' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Auto lead creation using normalized caller number
      let leadCreated = false;
      let leadId: string | null = null;

      if (normalizedCaller) {
        // Digit-only guard: `last10` is interpolated into a PostgREST
        // `.or()` filter, so refuse anything other than exactly 10 digits
        // to prevent injection of extra filter clauses.
        const last10Raw = normalizedCaller.replace(/^\+91/, '').slice(-10);
        const last10 = /^\d{10}$/.test(last10Raw) ? last10Raw : null;

        const { data: existingEnquiry } = last10
          ? await supabase
              .from('enquiries')
              .select('id')
              .or(`customer_name.ilike.%${last10}%,notes.ilike.%${last10}%`)
              .limit(1)
              .maybeSingle()
          : { data: null } as { data: null };

        if (!existingEnquiry) {
          const { data: newEnquiry, error: enquiryError } = await supabase
            .from('enquiries')
            .insert({
              customer_name: normalizedCaller,
              customer_company: 'MyOperator Call',
              product_name: 'Incoming Call',
              product_code: 'CALL',
              product_category: 'General',
              quantity: 1,
              urgency: 'normal',
              sales_person_name: salesPersonNameOverride || agentDisplay || 'Unassigned',
              sales_person_id: resolvedSalesPersonId,
              status: 'new',
              notes: [
                'Auto-created from MyOperator call.',
                `Caller: ${normalizedCaller}`,
                `Status: ${callStatus}`,
                `Duration: ${duration}s`,
                department ? `Department: ${department}` : null,
                agentDisplay ? `Agent: ${agentDisplay}` : null,
                recordingUrl ? `Recording: ${recordingUrl}` : null,
              ].filter(Boolean).join('\n'),
            })
            .select('id')
            .single();

          if (!enquiryError && newEnquiry) {
            leadCreated = true;
            leadId = newEnquiry.id;
          }
        } else {
          leadId = existingEnquiry.id;
          await supabase
            .from('enquiries')
            .update({
              notes: [
                `Last call: ${new Date().toISOString()}`,
                `Status: ${callStatus}`,
                `Duration: ${duration}s`,
                agentDisplay ? `Agent: ${agentDisplay}` : null,
                recordingUrl ? `Recording: ${recordingUrl}` : null,
              ].filter(Boolean).join('\n'),
            })
            .eq('id', existingEnquiry.id);
        }
      } else {
        await insertDebugLog(supabase, {
          raw_payload: rawBody, headers, request_method: req.method,
          processing_stage: 'missing_caller_number', error_message: 'No caller number found in payload',
        });
      }

      // Update call log with lead info
      if (leadId) {
        await supabase
          .from('call_logs')
          .update({ lead_created: leadCreated, lead_id: leadId })
          .eq('id', callLog.id);
      }

      return new Response(JSON.stringify({
        success: true, action: 'created',
        call_log_id: callLog.id, lead_created: leadCreated, lead_id: leadId,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('OK', { status: 200, headers: corsHeaders });
  }
});

function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return '';
  // Remove leading 91 country code if present
  const normalized = digits.startsWith('91') && digits.length > 10
    ? digits.substring(digits.length - 10)
    : digits;
  if (normalized.length === 10) return `+91${normalized}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

function mapCallStatus(status: string): string {
  const s = status.toLowerCase();
  if (s === 'received' || s.includes('answer') || s === 'completed' || s === 'connected') return 'answered';
  if (s.includes('miss') || s === 'no-answer' || s === 'noanswer') return 'missed';
  if (s.includes('busy')) return 'busy';
  if (s.includes('ring')) return 'ringing';
  if (s.includes('incoming') || s === 'new') return 'incoming';
  return s;
}

function getString(obj: Record<string, unknown>, key: string): string | null {
  const val = obj?.[key];
  if (typeof val === 'string' && val.trim()) return val.trim();
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  return null;
}

function parseDuration(dur: string | null): number {
  if (!dur) return 0;
  // Handle "HH:MM:SS" format
  const parts = dur.split(':');
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    return h * 3600 + m * 60 + s;
  }
  // Handle plain number
  const parsed = parseInt(dur, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapCallType(raw: unknown): string {
  // MyOperator sends _ty as number: 1=incoming, 2=outgoing
  if (raw === 1 || raw === '1') return 'incoming';
  if (raw === 2 || raw === '2') return 'outgoing';
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return 'incoming';
}

function getNumber(obj: Record<string, unknown>, key: string): number {
  const val = obj?.[key];
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const parsed = Number.parseInt(val, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function insertDebugLog(
  supabase: ReturnType<typeof createClient>,
  entry: {
    raw_payload: string;
    headers: Record<string, string>;
    request_method: string;
    processing_stage: string;
    error_message: string;
  },
) {
  const { error } = await supabase.from('webhook_debug_logs').insert(entry);
  if (error) console.error('Failed to insert debug log:', error.message);
}

/**
 * Fetch the active sales-team pool (role='sales', approved profiles).
 * Returns both a Set keyed by user_id (for membership checks) and a flat
 * list (for random fallback assignment).
 */
async function loadSalesPool(supabase: ReturnType<typeof createClient>): Promise<{
  byId: Map<string, string>;
  list: Array<{ user_id: string; name: string }>;
}> {
  try {
    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'sales');
    const ids = (roleRows ?? []).map((r: { user_id: string }) => r.user_id);
    if (ids.length === 0) return { byId: new Map(), list: [] };

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, name, is_approved')
      .in('user_id', ids);

    const byId = new Map<string, string>();
    const list: Array<{ user_id: string; name: string }> = [];
    for (const p of (profiles ?? []) as Array<{ user_id: string; name: string; is_approved: boolean }>) {
      if (p.is_approved === false) continue;
      const name = p.name || 'Sales';
      byId.set(p.user_id, name);
      list.push({ user_id: p.user_id, name });
    }
    return { byId, list };
  } catch (e) {
    console.error('[myoperator-webhook] loadSalesPool failed:', e);
    return { byId: new Map(), list: [] };
  }
}

// ---------------------------------------------------------------------------
// Payload normalization: supports MyOperator Webhooks v1 (shorthand `_xx`
// keys) and Webhooks v2 (readable / nested keys, optionally wrapped in
// `data` / `call` / `payload`). Unknown v2 field names fall back through a
// list of candidates so a provider rename does not break ingestion.
// ---------------------------------------------------------------------------

type NormalizedEvent = {
  version: 'v1' | 'v2';
  callId: string;
  callerNumber: string | null;
  fullNumber: string | null;
  duration: number;
  recordingUrl: string | null;
  callType: string;
  department: string | null;
  startTime: string | null;
  endTime: string | null;
  callStatus: string;
  agentName: string | null;
  agentPhone: string | null;
  agentId: string | null;
  allAgents: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** First non-empty string found among the given (possibly dotted) paths. */
function pick(obj: Record<string, unknown>, paths: string[]): string | null {
  for (const path of paths) {
    let cur: unknown = obj;
    for (const seg of path.split('.')) {
      if (!isRecord(cur)) { cur = undefined; break; }
      cur = cur[seg];
    }
    if (typeof cur === 'string' && cur.trim()) return cur.trim();
    if (typeof cur === 'number' && Number.isFinite(cur)) return String(cur);
  }
  return null;
}

function extractEvent(raw: Record<string, unknown>): NormalizedEvent {
  const isV1 = Object.keys(raw).some((k) => k.startsWith('_'));
  return isV1 ? extractV1(raw) : extractV2(raw);
}

function extractV1(body: Record<string, unknown>): NormalizedEvent {
  let agentName: string | null = null;
  let agentPhone: string | null = null;
  let agentId: string | null = null;
  const allAgents: string[] = [];
  const legs = Array.isArray(body._ld) ? (body._ld as Record<string, unknown>[]) : [];

  for (const leg of legs) {
    const receivers = leg._rr;
    if (Array.isArray(receivers)) {
      for (const r of receivers as Record<string, unknown>[]) {
        const name = getString(r, '_na');
        if (name) allAgents.push(name);
      }
    }
  }
  const answered = legs.find((l) => l._ac === 'received') || legs[0];
  if (answered && Array.isArray(answered._rr) && answered._rr.length > 0) {
    const first = answered._rr[0] as Record<string, unknown>;
    agentName = getString(first, '_na');
    agentPhone = getString(first, '_ct');
    agentId = getString(first, '_id');
  }

  let callStatus = 'unknown';
  if (legs.length > 0) {
    if (legs.some((l) => l._ac === 'received')) callStatus = 'answered';
    else if (legs.every((l) => l._ac === 'missed')) callStatus = 'missed';
    else callStatus = mapCallStatus(getString(body, '_ac') || 'unknown');
  } else {
    callStatus = mapCallStatus(getString(body, '_ac') || getString(body, 'status') || 'unknown');
  }

  return {
    version: 'v1',
    callId: getString(body, '_ai') || getString(body, '_id') || crypto.randomUUID(),
    callerNumber: getString(body, '_cr') || getString(body, '_cl'),
    fullNumber: getString(body, '_cl'),
    duration: parseDuration(getString(body, '_dr')),
    recordingUrl: getString(body, '_fu'),
    callType: mapCallType(body._ty),
    department: getString(body, '_dn'),
    startTime: getString(body, '_st'),
    endTime: getString(body, '_et'),
    callStatus,
    agentName,
    agentPhone,
    agentId,
    allAgents,
  };
}

function extractV2(raw: Record<string, unknown>): NormalizedEvent {
  // v2 commonly wraps the call object.
  const body = (['data', 'call', 'payload', 'call_details'] as const)
    .map((k) => raw[k])
    .find(isRecord) ?? raw;

  // Agent legs may appear under several names.
  const legsRaw =
    (['legs', 'call_legs', 'agents', 'receivers', 'users', 'call_flow'] as const)
      .map((k) => body[k])
      .find((v) => Array.isArray(v)) as Record<string, unknown>[] | undefined;
  const legs = (legsRaw ?? []).filter(isRecord);

  const allAgents: string[] = [];
  for (const leg of legs) {
    const name = pick(leg, ['name', 'agent_name', 'agent.name', 'user_name', 'user.name']);
    if (name) allAgents.push(name);
  }

  const answeredLeg =
    legs.find((l) => {
      const s = (pick(l, ['status', 'call_status', 'answer_status', 'state']) || '').toLowerCase();
      return s === 'received' || s === 'answered' || s === 'completed' || s === 'connected';
    }) || legs[0];

  const agentSource: Record<string, unknown> = isRecord(body.agent)
    ? (body.agent as Record<string, unknown>)
    : answeredLeg ?? body;

  const agentName =
    pick(agentSource, ['name', 'agent_name', 'agent.name', 'user_name', 'user.name']) ??
    pick(body, ['agent_name', 'agent.name']);
  const agentPhone =
    pick(agentSource, ['number', 'phone', 'contact', 'agent_number', 'agent.number', 'mobile']) ??
    pick(body, ['agent_number', 'agent.number']);
  const agentId =
    pick(agentSource, ['id', 'agent_id', 'agent.id', 'user_id', 'uid']) ??
    pick(body, ['agent_id', 'agent.id']);

  const statusRaw =
    pick(body, ['status', 'call_status', 'call.status', 'disposition', 'answer_status', 'state']) ||
    (answeredLeg ? pick(answeredLeg, ['status', 'call_status']) : null) ||
    'unknown';

  let callStatus = mapCallStatus(statusRaw);
  if (callStatus === 'unknown' && legs.length > 0) {
    const anyAnswered = legs.some((l) => {
      const s = (pick(l, ['status', 'call_status']) || '').toLowerCase();
      return s === 'received' || s === 'answered';
    });
    callStatus = anyAnswered ? 'answered' : 'missed';
  }

  const durationStr = pick(body, [
    'duration', 'call_duration', 'talk_time', 'talktime', 'duration_seconds', 'total_duration',
  ]);

  return {
    version: 'v2',
    callId:
      pick(body, ['call_id', 'callId', 'uuid', 'unique_id', 'uid', 'id']) ??
      pick(raw, ['call_id', 'uuid', 'id']) ??
      crypto.randomUUID(),
    callerNumber: pick(body, [
      'customer.number', 'customer.phone', 'customer_number', 'caller_number',
      'caller', 'from', 'from_number', 'contact_number', 'client_number',
    ]),
    fullNumber: pick(body, [
      'did', 'did_number', 'to', 'to_number', 'virtual_number',
      'company_number', 'ivr_number', 'customer.number',
    ]),
    duration: parseDuration(durationStr),
    recordingUrl: pick(body, [
      'recording_url', 'recording', 'call_recording_url', 'recording.url', 'audio_url', 'file_url',
    ]),
    callType: mapCallType(
      pick(body, ['direction', 'call_type', 'type', 'call.direction']) ?? 'incoming',
    ),
    department: pick(body, ['department.name', 'department_name', 'department', 'team', 'group_name']),
    startTime: pick(body, ['start_time', 'started_at', 'call_time', 'start', 'created_at']),
    endTime: pick(body, ['end_time', 'ended_at', 'end', 'hangup_time']),
    callStatus,
    agentName,
    agentPhone,
    agentId,
    allAgents,
  };
}
