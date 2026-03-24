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
    } else if (authHeader?.startsWith('Bearer ')) {
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

    // Calculate time range: last 15 minutes
    const now = new Date();
    const from = new Date(now.getTime() - 15 * 60 * 1000);
    const fromEpoch = Math.floor(from.getTime() / 1000);
    const toEpoch = Math.floor(now.getTime() / 1000);

    // Fetch call logs from MyOperator API
    const apiUrl = `https://developers.myoperator.co/search/logs?token=${encodeURIComponent(config.api_token)}&from=${fromEpoch}&to=${toEpoch}`;

    console.log(`Fetching MyOperator logs from ${from.toISOString()} to ${now.toISOString()}`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-api-key': config.x_api_key,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`MyOperator API error [${response.status}]:`, errorText);
      return new Response(JSON.stringify({ 
        error: 'MyOperator API call failed', 
        status: response.status 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const logs = Array.isArray(data) ? data : (data?.data || data?.logs || data?.results || []);

    if (!Array.isArray(logs)) {
      console.log('Unexpected API response format:', JSON.stringify(data).substring(0, 500));
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No parseable logs in response',
        inserted: 0, 
        skipped: 0 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let inserted = 0;
    let skipped = 0;
    let updated = 0;

    for (const entry of logs) {
      try {
        const callId = getString(entry, '_ai') || getString(entry, '_id') || null;
        const callerNumber = getString(entry, '_cr') || getString(entry, '_cl') || null;
        const startTime = getString(entry, '_st') || null;

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

        // Parse fields
        const fullNumber = getString(entry, '_cl') || null;
        const durationStr = getString(entry, '_dr') || null;
        const duration = parseDuration(durationStr);
        const recordingUrl = getString(entry, '_fu') || null;
        const callTypeRaw = entry._ty;
        const callType = mapCallType(callTypeRaw);
        const department = getString(entry, '_dn') || null;
        const endTime = getString(entry, '_et') || null;

        // Extract agents from _ld
        let assignedAgentName: string | null = null;
        let assignedAgentPhone: string | null = null;
        const allAgents: string[] = [];

        if (entry._ld && Array.isArray(entry._ld)) {
          for (const leg of entry._ld) {
            const receivers = leg._rr;
            if (Array.isArray(receivers)) {
              for (const r of receivers) {
                const name = getString(r, '_na');
                if (name) allAgents.push(name);
              }
            }
          }
          const answeredCall = entry._ld.find((item: Record<string, unknown>) => item._ac === 'received') || entry._ld[0];
          if (answeredCall) {
            const receivers = answeredCall._rr;
            if (Array.isArray(receivers) && receivers.length > 0) {
              assignedAgentName = getString(receivers[0], '_na') || null;
              assignedAgentPhone = getString(receivers[0], '_ct') || null;
            }
          }
        }

        // Determine call status
        let callStatus = 'unknown';
        if (entry._ld && Array.isArray(entry._ld)) {
          const hasReceived = entry._ld.some((l: Record<string, unknown>) => l._ac === 'received');
          if (hasReceived) callStatus = 'answered';
          else callStatus = 'missed';
        } else {
          callStatus = mapCallStatus(getString(entry, '_ac') || 'unknown');
        }

        const normalizedCaller = normalizePhone(callerNumber || '');
        const storedCaller = normalizedCaller || `unknown:${crypto.randomUUID()}`;
        const agentDisplay = allAgents.length > 0 ? allAgents.join(', ') : assignedAgentName;
        const effectiveCallId = callId || crypto.randomUUID();

        const record = {
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
