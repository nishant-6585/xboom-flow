import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response('sync-myoperator-logs is live', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify cron secret for scheduled calls
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    
    // Also allow authenticated admin calls
    const authHeader = req.headers.get('Authorization');
    let isAuthorized = false;

    if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
      isAuthorized = true;
    }

    // Fallback: compare against vault.decrypted_secrets so we don't rely solely
    // on the edge env var staying in sync with vault (cron reads from vault).
    if (!isAuthorized && cronSecret) {
      const { data: vs } = await supabase.rpc('get_cron_secret');
      if (vs && typeof vs === 'string' && vs === cronSecret) isAuthorized = true;
    }

    if (!isAuthorized && authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
      if (!claimsError && claims?.claims?.sub) {
        // Check if user is admin
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', claims.claims.sub)
          .eq('role', 'admin')
          .maybeSingle();
        if (roleData) isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch MyOperator config from database
    const { data: config, error: configError } = await supabase
      .from('myoperator_config')
      .select('api_token, x_api_key, company_id, is_connected')
      .limit(1)
      .maybeSingle();

    if (configError || !config || !config.is_connected) {
      return new Response(JSON.stringify({ error: 'MyOperator not configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate time range: default last 15 minutes, but accept optional
    // { from, to } ISO strings in request body for backfills.
    let fromIso: string | null = null;
    let toIso: string | null = null;
    try {
      const body = await req.clone().json();
      if (body && typeof body === 'object') {
        if (typeof body.from === 'string') fromIso = body.from;
        if (typeof body.to === 'string') toIso = body.to;
      }
    } catch (_) { /* no body */ }

    const now = new Date();
    const from = fromIso ? new Date(fromIso) : new Date(now.getTime() - 15 * 60 * 1000);
    const to = toIso ? new Date(toIso) : now;
    const fromEpoch = Math.floor(from.getTime() / 1000);
    const toEpoch = Math.floor(to.getTime() / 1000);

    console.log(`Fetching MyOperator logs from ${from.toISOString()} to ${to.toISOString()}`);

    // MyOperator API: POST https://developers.myoperator.co/search
    // Paginate via log_from until we drain all hits in the range (max page_size=100).
    const PAGE_SIZE = 100;
    const MAX_PAGES = 100; // hard safety cap (=10k records / call)
    const logs: Array<Record<string, unknown>> = [];
    let totalAvailable = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        token: config.api_token,
        from: String(fromEpoch),
        to: String(toEpoch),
        page_size: String(PAGE_SIZE),
        log_from: String(page * PAGE_SIZE),
      });

      const response = await fetch('https://developers.myoperator.co/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`MyOperator API error [${response.status}]:`, errorText.substring(0, 300));
        return new Response(JSON.stringify({
          error: 'MyOperator API call failed',
          status: response.status,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const data = await response.json();
      if (data?.status !== 'success') {
        console.error('MyOperator API non-success:', JSON.stringify(data).substring(0, 300));
        return new Response(JSON.stringify({ error: 'MyOperator API returned error', detail: data }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const hits = data?.data?.hits;
      totalAvailable = Number(data?.data?.total ?? 0);
      if (!Array.isArray(hits) || hits.length === 0) break;

      for (const h of hits) {
        const src = (h && typeof h === 'object' && h._source && typeof h._source === 'object')
          ? h._source as Record<string, unknown>
          : (h as Record<string, unknown>);
        logs.push(src);
      }

      if (logs.length >= totalAvailable) break;
      if (hits.length < PAGE_SIZE) break;
    }

    console.log(`MyOperator returned ${logs.length} logs (total available in range: ${totalAvailable})`);

    // Missed call round-robin recipients — full sales pool
    const missedCallAssignees = [
      { user_id: 'a790b58d-8e3d-4333-b6d6-08be631c865d', name: 'Narasimha' },
      { user_id: '457fc2d5-9fc5-439a-938e-5b998549b811', name: 'mohammed musthak' },
      { user_id: '456e91f8-34cc-4f92-a1c1-a092f2bbed39', name: 'suman das' },
      { user_id: 'e05f9afe-0160-4956-bb1f-496028386062', name: 'Arjav chauhan' },
      { user_id: '74930912-193a-4081-a87f-46902ee96c4d', name: 'Srishti Suman' },
      { user_id: '7bc60110-5d57-4ae1-bc9f-bf4dd3787a90', name: 'Manoj Kumar' },
    ];

    // Get last assigned missed call to determine round-robin position
    const { data: lastMissedAssignment } = await supabase
      .from('call_logs')
      .select('sales_person_id')
      .eq('call_status', 'missed')
      .not('sales_person_id', 'is', null)
      .in('sales_person_id', missedCallAssignees.map(a => a.user_id))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let missedRoundRobinIndex = 0;
    if (lastMissedAssignment?.sales_person_id) {
      const lastIdx = missedCallAssignees.findIndex(
        (a) => a.user_id === lastMissedAssignment.sales_person_id,
      );
      if (lastIdx >= 0) missedRoundRobinIndex = (lastIdx + 1) % missedCallAssignees.length;
    }

    // Pre-fetch all sales profiles for answered call matching
    const { data: salesProfiles } = await supabase
      .from('profiles')
      .select('user_id, name')
      .eq('is_approved', true)
      .in('user_id', (await supabase.from('user_roles').select('user_id').eq('role', 'sales')).data?.map((r: { user_id: string }) => r.user_id) || []);

    // Pre-fetch existing phone-to-salesperson mappings for sticky assignment
    // Collect all caller numbers from this batch first
    const batchCallerNumbers: string[] = [];
    for (const entry of logs) {
      const cn = extractCallerNumber(entry);
      if (cn) {
        const norm = normalizePhone(cn);
        if (norm) batchCallerNumbers.push(norm);
      }
    }

    // Query existing assignments for these numbers
    const stickyMap = new Map<string, { id: string; name: string }>();
    if (batchCallerNumbers.length > 0) {
      const uniqueNumbers = [...new Set(batchCallerNumbers)];
      const { data: existingAssignments } = await supabase
        .from('call_logs')
        .select('caller_number, sales_person_id, sales_person_name')
        .in('caller_number', uniqueNumbers)
        .not('sales_person_id', 'is', null)
        .order('created_at', { ascending: false });

      if (existingAssignments) {
        for (const row of existingAssignments) {
          // First match wins (most recent due to ordering)
          if (!stickyMap.has(row.caller_number) && row.sales_person_id && row.sales_person_name) {
            stickyMap.set(row.caller_number, { id: row.sales_person_id, name: row.sales_person_name });
          }
        }
      }
    }

    let inserted = 0;
    let skipped = 0;
    let updated = 0;

    for (const entry of logs) {
      try {
        const callId = extractCallId(entry);
        const callerNumber = extractCallerNumber(entry);
        const startTime = extractIsoFromEpoch(entry.start_time) ||
          extractIsoFromEpoch((entry as Record<string, unknown>)._ms) ||
          null;

        if (!callId && (!callerNumber || !startTime)) {
          skipped++;
          continue;
        }

        // Check for existing record by call_id OR (caller_number + start_time)
        let existingId: string | null = null;

        if (callId) {
          const { data: existing } = await supabase
            .from('call_logs')
            .select('id')
            .eq('call_id', callId)
            .maybeSingle();
          if (existing) existingId = existing.id;
        }

        if (!existingId && callerNumber && startTime) {
          const normalizedCaller = normalizePhone(callerNumber);
          const { data: existing } = await supabase
            .from('call_logs')
            .select('id')
            .eq('caller_number', normalizedCaller || callerNumber)
            .eq('start_time', startTime)
            .maybeSingle();
          if (existing) existingId = existing.id;
        }

        // Parse fields from MyOperator /search response (_source)
        const fullNumber = getString(entry, 'caller_number') || getString(entry, '_cl') || null;
        const durationStr = getString(entry, 'duration') || getString(entry, '_dr') || null;
        const duration = parseDuration(durationStr);
        const recordingUrl = getString(entry, 'fileurl') || getString(entry, '_fu') || null;
        const callTypeRaw = (entry as Record<string, unknown>).type ?? (entry as Record<string, unknown>)._ty;
        const callType = mapCallType(callTypeRaw);
        const department = getString(entry, 'department_name') || getString(entry, '_dn') || null;
        const endTime = extractIsoFromEpoch((entry as Record<string, unknown>).end_time) ||
          getString(entry, '_et') || null;

        // Extract agents from log_details (new format) or _ld (legacy)
        const legs = (Array.isArray((entry as Record<string, unknown>).log_details)
          ? (entry as Record<string, unknown>).log_details
          : (Array.isArray((entry as Record<string, unknown>)._ld)
            ? (entry as Record<string, unknown>)._ld
            : null)) as Array<Record<string, unknown>> | null;

        let assignedAgentName: string | null = null;
        let assignedAgentPhone: string | null = null;
        const allAgents: string[] = [];

        if (legs && legs.length) {
          for (const leg of legs) {
            const receivers = (Array.isArray(leg.received_by) ? leg.received_by
              : Array.isArray((leg as Record<string, unknown>)._rr) ? (leg as Record<string, unknown>)._rr
              : []) as Array<Record<string, unknown>>;
            for (const r of receivers) {
              const name = getString(r, 'name') || getString(r, '_na');
              if (name) allAgents.push(name);
            }
          }
          const answeredLeg = legs.find((l) => (l.action === 'received' || (l as Record<string, unknown>)._ac === 'received')) || legs[0];
          if (answeredLeg) {
            const receivers = (Array.isArray((answeredLeg as Record<string, unknown>).received_by)
              ? (answeredLeg as Record<string, unknown>).received_by
              : Array.isArray((answeredLeg as Record<string, unknown>)._rr)
              ? (answeredLeg as Record<string, unknown>)._rr
              : []) as Array<Record<string, unknown>>;
            if (receivers.length > 0) {
              assignedAgentName = getString(receivers[0], 'name') || getString(receivers[0], '_na') || null;
              assignedAgentPhone = getString(receivers[0], 'contact_number') || getString(receivers[0], '_ct') || null;
            }
          }
        }

        // Determine call status
        let callStatus = 'unknown';
        if (legs && legs.length) {
          const hasReceived = legs.some((l) => (l.action === 'received' || (l as Record<string, unknown>)._ac === 'received'));
          callStatus = hasReceived ? 'answered' : 'missed';
        } else {
          callStatus = mapCallStatus(getString(entry, 'action') || getString(entry, '_ac') || 'unknown');
        }

        const normalizedCaller = normalizePhone(callerNumber || '');
        const storedCaller = normalizedCaller || `unknown:${crypto.randomUUID()}`;
        const agentDisplay = allAgents.length > 0 ? allAgents.join(', ') : assignedAgentName;
        const effectiveCallId = callId || crypto.randomUUID();

        // === LEAD ASSIGNMENT LOGIC (Sticky first, then fallback) ===
        let salesPersonId: string | null = null;
        let salesPersonName: string | null = null;

        // 1. Sticky assignment: if this caller was previously assigned, reuse same salesperson
        const stickyAssignment = stickyMap.get(storedCaller);
        if (stickyAssignment) {
          salesPersonId = stickyAssignment.id;
          salesPersonName = stickyAssignment.name;
        } else if (callStatus === 'answered') {
          // 2a. Resolve answering agent via centralized agent_user_mapping (phone is most reliable)
          if (assignedAgentPhone) {
            try {
              const { data: resolved } = await supabase.rpc('resolve_agent_user', {
                _provider: 'myoperator',
                _agent_id: null,
                _agent_phone: assignedAgentPhone,
              });
              if (resolved) {
                const { data: prof } = await supabase
                  .from('profiles')
                  .select('user_id, name')
                  .eq('user_id', resolved as string)
                  .maybeSingle();
                if (prof) {
                  salesPersonId = prof.user_id;
                  salesPersonName = prof.name;
                }
              }
            } catch (e) {
              console.error('[sync-myoperator-logs] resolve_agent_user failed:', e);
            }
          }

          // 2b. Name fallback (spelling-tolerant: strip vowels)
          if (!salesPersonId && assignedAgentName && salesProfiles) {
            const stripVowels = (s: string) => s.toLowerCase().replace(/[aeiou]/g, '');
            const agentNorm = stripVowels(assignedAgentName);
            const matchedProfile = salesProfiles.find((p: { user_id: string; name: string }) =>
            p.name.toLowerCase() === assignedAgentName!.toLowerCase() ||
            p.name.toLowerCase().includes(assignedAgentName!.toLowerCase()) ||
            assignedAgentName!.toLowerCase().includes(p.name.toLowerCase()) ||
            stripVowels(p.name) === agentNorm ||
            stripVowels(p.name.split(' ')[0]) === agentNorm
            );
            if (matchedProfile) {
              salesPersonId = matchedProfile.user_id;
              salesPersonName = matchedProfile.name;
            }
          }
        } else if (callStatus === 'missed') {
          // 3. Round-robin only for brand new missed callers
          const assignee = missedCallAssignees[missedRoundRobinIndex % missedCallAssignees.length];
          salesPersonId = assignee.user_id;
          salesPersonName = assignee.name;
          missedRoundRobinIndex++;
        }

        // Update sticky map so subsequent calls in the same batch also get the same person
        if (salesPersonId && salesPersonName && !stickyMap.has(storedCaller)) {
          stickyMap.set(storedCaller, { id: salesPersonId, name: salesPersonName });
        }

        const record: Record<string, unknown> = {
          call_id: effectiveCallId,
          caller_number: storedCaller,
          full_number: fullNumber,
          agent_number: assignedAgentPhone,
          agent_name: agentDisplay,
          assigned_agent_name: agentDisplay,
          assigned_agent_phone: assignedAgentPhone,
          call_status: callStatus,
          call_duration: duration,
          call_type: callType,
          recording_url: recordingUrl,
          department,
          start_time: startTime,
          end_time: endTime,
          raw_payload: entry,
        };

        // Add sales person assignment for new records
        if (!existingId && salesPersonId) {
          record.sales_person_id = salesPersonId;
          record.sales_person_name = salesPersonName;
        }

        if (existingId) {
          // Update existing record with potentially richer data
          await supabase.from('call_logs').update(record).eq('id', existingId);
          updated++;
        } else {
          // Insert new record
          const { error: insertError } = await supabase.from('call_logs').insert(record);
          if (insertError) {
            console.error('Insert error:', insertError.message);
            skipped++;
          } else {
            inserted++;
          }
        }
      } catch (entryError) {
        console.error('Error processing entry:', entryError);
        skipped++;
      }
    }

    console.log(`Sync complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped out of ${logs.length} total`);

    return new Response(JSON.stringify({
      success: true,
      total: logs.length,
      inserted,
      updated,
      skipped,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return '';
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

function mapCallType(raw: unknown): string {
  if (raw === 1 || raw === '1') return 'incoming';
  if (raw === 2 || raw === '2') return 'outgoing';
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return 'incoming';
}

function extractCallId(entry: Record<string, unknown>): string | null {
  // Try modern fields first
  const direct = getString(entry, 'allcaller_id')
    || getString(entry, 'unique_id')
    || getString(entry, '_ai')
    || getString(entry, '_id');
  if (direct) return direct;

  // unique_id can live inside additional_parameters[{ky,vl}]
  const ap = entry.additional_parameters;
  if (Array.isArray(ap)) {
    for (const item of ap) {
      if (item && typeof item === 'object') {
        const ky = (item as Record<string, unknown>).ky;
        const vl = (item as Record<string, unknown>).vl;
        if (ky === 'unique_id' && typeof vl === 'string' && vl.trim()) return vl.trim();
      }
    }
  }
  return null;
}

function extractCallerNumber(entry: Record<string, unknown>): string | null {
  return getString(entry, 'caller_number')
    || getString(entry, 'caller_number_raw')
    || getString(entry, '_cr')
    || getString(entry, '_cl')
    || null;
}

function extractIsoFromEpoch(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === 'number' && Number.isFinite(val)) {
    // MyOperator returns seconds; _ms returns milliseconds
    const ms = val > 1e12 ? val : val * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof val === 'string' && val.trim()) {
    // Could already be an ISO/datetime string
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) {
      const ms = n > 1e12 ? n : n * 1000;
      return new Date(ms).toISOString();
    }
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    return val;
  }
  return null;
}
