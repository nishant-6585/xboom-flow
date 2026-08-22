import { createClient } from 'npm:@supabase/supabase-js@2';
import { isAssignableRepName } from '../_shared/assignable-reps.ts';

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
  const authorization = req.headers.get('authorization');
  const bearerSecret = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || null;
  const headerSecret =
    req.headers.get('x-myoperator-secret') ||
    req.headers.get('myoperator-secret') ||
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-secret') ||
    req.headers.get('x-api-key') ||
    bearerSecret ||
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

  // Shared-secret auth: accept MyOperator API Key authentication, a custom
  // secret header, Bearer authentication, or a ?secret= / ?token= parameter.
  // MyOperator delivers through HookRelay, which in some setups strips both
  // custom headers and query strings. As a documented fallback we then verify
  // the payload carries our own configured MyOperator company_id.
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
      let companyIdVerified = false;
      try {
        const admin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        const { data: cfg } = await admin
          .from('myoperator_config')
          .select('company_id, is_connected')
          .limit(1)
          .maybeSingle();
        const companyId = (cfg?.company_id || '').trim();
        if (cfg?.is_connected && companyId.length >= 6 && rawBody.includes(companyId)) {
          companyIdVerified = true;
        }
      } catch (e) {
        console.error('company_id fallback verification failed', e instanceof Error ? e.message : e);
      }

      if (!companyIdVerified) {
        console.warn('MyOperator webhook auth failed', {
          secret_source: headerSecret ? 'header' : querySecret ? 'query' : 'none',
          company_id_match: false,
        });
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log('MyOperator webhook authenticated via payload company_id fallback');
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
      // resolution and hand the lead to the next rep in round-robin order so it
      // never ends up owned by a non-sales user.
      const salesPool = await loadSalesPool(supabase);
      let salesPersonNameOverride: string | null = null;
      let assignmentReason:
        | 'sticky_owner'
        | 'receiver_in_sales'
        | 'round_robin_fallback'
        | 'unresolved' = 'unresolved';

      // Did a rep who can actually own leads pick up this call?
      const answeredByPoolRep = !!resolvedSalesPersonId && salesPool.byId.has(resolvedSalesPersonId);
      const answererId = answeredByPoolRep ? resolvedSalesPersonId! : null;
      const answererName = answererId ? salesPool.byId.get(answererId)! : null;

      const callerLast10 = (callerNumber || '').replace(/\D/g, '').slice(-10);
      const owner = await findOwner(supabase, callerLast10);

      // A placeholder owner only loses the lead while it is still untouched. Once
      // they have worked it, it is theirs regardless of who answers next.
      const canDisplace = !owner || (owner.kind === 'provisional' && !(await isLeadTouched(supabase, callerLast10)));

      if (answererId && canDisplace) {
        // Nobody had spoken to this caller yet — whoever just answered earns the
        // lead and inherits the number's earlier calls, displacing the
        // round-robin placeholder.
        resolvedSalesPersonId = answererId;
        salesPersonNameOverride = answererName;
        assignmentReason = 'receiver_in_sales';
        if (owner && owner.user_id !== answererId) {
          console.log('[myoperator-webhook] lead takeover', {
            caller_last10: callerLast10,
            from: owner.name,
            to: answererName,
          });
        }
        await transferEarlierCalls(supabase, callerLast10, answererId, answererName!);

      } else if (owner) {
        // Held manually, or already earned by the first rep who answered. Later
        // answers by anyone else do not take it.
        resolvedSalesPersonId = owner.user_id;
        salesPersonNameOverride = owner.name;
        assignmentReason = owner.user_id === answererId ? 'receiver_in_sales' : 'sticky_owner';

      } else if (salesPool.list.length > 0) {
        // Unowned, and nobody in the pool answered — missed call, support pickup,
        // AI agent, or an agent with no agent_user_mapping row. Round-robin a
        // provisional owner so the lead is never left unattended; the first rep
        // to actually answer will take it over.
        //
        // Landing here on an answered call means agent_user_mapping is missing a
        // row for whoever picked up — the UNMAPPED_AGENT warning below is the
        // signal to go add it.
        const pick = await nextPoolAssignee(supabase, salesPool.list);
        if (pick) {
          resolvedSalesPersonId = pick.user_id;
          salesPersonNameOverride = pick.name;
          assignmentReason = 'round_robin_fallback';
        }
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

      
      // Build agent display string.
      //
      // This records who actually handled the call and nothing else. A missed
      // call with no agent in the payload stays empty and renders as "Unknown".
      // It used to be backfilled with a random pick of 'Narasimha' or 'Mushtaq',
      // which wrote a real person's name onto a call they never touched and then
      // counted it against them in SalespersonCallStats. Lead *ownership* for
      // these calls is handled by the round-robin assignment above, which is the
      // right place for it — agent_name is a record of fact, not a routing field.
      const agentDisplay = allAgents.length > 0 ? allAgents.join(', ') : assignedAgentName;

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
            ...(resolvedSalesPersonId ? { assignment_reason: assignmentReason } : {}),
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
          assignment_reason: resolvedSalesPersonId ? assignmentReason : null,
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
              // Never fall back to agentDisplay here: that is the agent who
              // handled the call (often support, sometimes a comma-joined list),
              // not the owning rep, and using it puts a name on the enquiry that
              // disagrees with sales_person_id.
              sales_person_name: salesPersonNameOverride || 'Unassigned',
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
 * list (for round-robin fallback assignment).
 *
 * The list is sorted by user_id so the rotation order is stable across
 * invocations — Postgres makes no ordering guarantee without an ORDER BY,
 * and a pool that reshuffles between calls would break the round-robin.
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
      // role='sales' is far wider than the reps who actually work call leads —
      // support staff and non-selling users hold it too. Without this filter the
      // fallback hands leads to people who never touch them.
      if (!isAssignableRepName(p.name)) continue;
      const name = p.name || 'Sales';
      byId.set(p.user_id, name);
      list.push({ user_id: p.user_id, name });
    }
    list.sort((a, b) => a.user_id.localeCompare(b.user_id));
    return { byId, list };
  } catch (e) {
    console.error('[myoperator-webhook] loadSalesPool failed:', e);
    return { byId: new Map(), list: [] };
  }
}

/** How firmly a number is held. See findOwner(). */
type OwnerKind = 'manual' | 'earned' | 'provisional';
type Owner = { user_id: string; name: string; kind: OwnerKind };

/**
 * Return who currently owns this caller number, and how firmly.
 *
 * Ownership is per-caller, not per-call, and comes in three strengths:
 *
 *   manual      — a human assigned it. Outranks everything, never overridden.
 *   earned      — a pool rep answered a call from this number. The FIRST such
 *                 rep holds it; later answerers do not take it from them.
 *   provisional — round-robined off a missed or unattributable call. Nobody has
 *                 spoken to this caller yet, so it is only a placeholder and the
 *                 first rep to actually answer takes it over.
 *
 * Rows written before assignment_reason existed have NULL and count as
 * provisional — those owners were picked at random and never spoke to the
 * caller, so letting a real answerer claim them is the correction, not a loss.
 */
async function findOwner(
  supabase: ReturnType<typeof createClient>,
  last10: string,
): Promise<Owner | null> {
  if (last10.length < 10) return null;

  const pick = async (kind: OwnerKind): Promise<Owner | null> => {
    let q = supabase
      .from('call_logs')
      .select('sales_person_id, sales_person_name')
      .eq('caller_last10', last10)
      .not('sales_person_id', 'is', null);

    if (kind === 'manual') {
      // Latest human decision wins.
      q = q.eq('assignment_reason', 'manual').order('created_at', { ascending: false });
    } else {
      // First rep to answer wins, so oldest first.
      q = q.eq('assignment_reason', 'receiver_in_sales').order('created_at', { ascending: true });
    }

    const { data } = await q.limit(1).maybeSingle();
    const row = data as { sales_person_id: string | null; sales_person_name: string | null } | null;
    return row?.sales_person_id && row.sales_person_name
      ? { user_id: row.sales_person_id, name: row.sales_person_name, kind }
      : null;
  };

  try {
    const manual = await pick('manual');
    if (manual) return manual;

    const earned = await pick('earned');
    if (earned) return earned;

    // Anything else: the most recent owner, held provisionally.
    const { data } = await supabase
      .from('call_logs')
      .select('sales_person_id, sales_person_name')
      .eq('caller_last10', last10)
      .not('sales_person_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as { sales_person_id: string | null; sales_person_name: string | null } | null;
    if (row?.sales_person_id && row.sales_person_name) {
      return { user_id: row.sales_person_id, name: row.sales_person_name, kind: 'provisional' };
    }
  } catch (e) {
    console.error('[myoperator-webhook] findOwner failed:', e);
  }
  return null;
}

/**
 * Has anyone actually worked this lead yet?
 *
 * A provisional owner can normally be displaced by the first rep to answer —
 * but not once someone has done real work on the number. If the round-robin
 * gave suman das a missed call and he rang the caller back, dispositioned it or
 * converted it, the lead is his; a later inbound call that Musthak happens to
 * pick up must not take it away from him.
 *
 * The signals are all human actions. `disposition` is the canonical one:
 * lead_disposition is NOT NULL DEFAULT 'untouched', so anything else means a
 * person moved it. Neither this webhook nor sync-myoperator-logs writes any of
 * these fields on ingest, so none of them can fire on their own.
 */
async function isLeadTouched(
  supabase: ReturnType<typeof createClient>,
  last10: string,
): Promise<boolean> {
  if (last10.length < 10) return false;
  try {
    const { data } = await supabase
      .from('call_logs')
      .select('id')
      .eq('caller_last10', last10)
      .or(
        'disposition.neq.untouched,' +
        'last_contacted_at.not.is.null,' +
        'is_enquiry_converted.is.true,' +
        'is_prospect.is.true',
      )
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch (e) {
    // Fail closed: if we cannot tell, assume worked and leave ownership alone.
    // Wrongly keeping a lead is recoverable by hand; wrongly moving a worked
    // lead loses the rep's context and their claim to it.
    console.error('[myoperator-webhook] isLeadTouched failed:', e);
    return true;
  }
}

/**
 * Hand every earlier call from this number to the rep who just answered.
 *
 * The lead moves, not just this call — otherwise the call log shows one number
 * split between the placeholder owner and the real one, and SalespersonCallStats
 * keeps crediting the earlier calls to someone who never spoke to the caller.
 *
 * Manual assignments are left alone; they outrank an answered call.
 */
async function transferEarlierCalls(
  supabase: ReturnType<typeof createClient>,
  last10: string,
  userId: string,
  userName: string,
): Promise<void> {
  if (last10.length < 10) return;
  try {
    const { error } = await supabase
      .from('call_logs')
      .update({
        sales_person_id: userId,
        sales_person_name: userName,
        assignment_reason: 'sticky_owner',
      })
      .eq('caller_last10', last10)
      .or('assignment_reason.is.null,assignment_reason.neq.manual');
    if (error) throw error;
  } catch (e) {
    console.error('[myoperator-webhook] transferEarlierCalls failed:', e);
  }
}

/**
 * Pick the next sales rep in round-robin order.
 *
 * The webhook handles one call per invocation, so there is no in-process cursor
 * to advance the way sync-myoperator-logs does across a batch. The position is
 * recovered from the database instead: find the most recent call assigned to
 * anyone in the pool and take the rep after them.
 *
 * On any failure this falls back to the head of the pool rather than throwing —
 * a slightly lopsided assignment is much better than dropping the lead.
 */
async function nextPoolAssignee(
  supabase: ReturnType<typeof createClient>,
  pool: Array<{ user_id: string; name: string }>,
): Promise<{ user_id: string; name: string } | null> {
  if (pool.length === 0) return null;
  try {
    const { data: last } = await supabase
      .from('call_logs')
      .select('sales_person_id')
      .in('sales_person_id', pool.map((p) => p.user_id))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastId = (last as { sales_person_id: string | null } | null)?.sales_person_id;
    const lastIdx = lastId ? pool.findIndex((p) => p.user_id === lastId) : -1;
    return pool[(lastIdx + 1) % pool.length];
  } catch (e) {
    console.error('[myoperator-webhook] nextPoolAssignee failed:', e);
    return pool[0];
  }
}
