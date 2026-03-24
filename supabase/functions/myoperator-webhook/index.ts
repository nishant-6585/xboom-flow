import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  const headers = Object.fromEntries(req.headers.entries());
  const rawBody = req.method === 'POST' ? await req.text() : '';

  console.log('Webhook hit:', { timestamp, method: req.method, headers, body: rawBody });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response('Webhook is live', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
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

      // Extract fields from actual MyOperator payload structure
      const callerNumber = getString(body, '_cr') || getString(body, '_cl') || null;
      const fullNumber = getString(body, '_cl') || null;
      const duration = getNumber(body, '_dr');
      const recordingUrl = getString(body, '_fu') || null;
      const callType = getString(body, '_ty') || null;
      const department = getString(body, '_dn') || null;
      const startTime = getString(body, '_st') || null;
      const endTime = getString(body, '_et') || null;

      // Extract assigned agent from _ld array
      let assignedAgentName: string | null = null;
      let assignedAgentPhone: string | null = null;

      if (body._ld && Array.isArray(body._ld)) {
        const answeredCall = (body._ld as Record<string, unknown>[]).find(
          (item) => item._ac === 'received'
        );
        if (answeredCall) {
          const receivers = answeredCall._rr;
          if (Array.isArray(receivers) && receivers.length > 0) {
            const firstReceiver = receivers[0] as Record<string, unknown>;
            assignedAgentName = getString(firstReceiver, '_na') || null;
            assignedAgentPhone = getString(firstReceiver, '_ct') || null;
          }
        }
      }

      // Normalize caller number
      const normalizedCaller = normalizePhone(callerNumber || '');
      const storedCallerNumber = normalizedCaller || `unknown:${crypto.randomUUID()}`;

      // Determine call status from payload
      const callStatus = mapCallStatus(getString(body, '_ac') || getString(body, 'status') || 'unknown');

      // Use a unique call ID if available, fallback to random
      const callId = getString(body, '_id') || getString(body, 'call_id') || getString(body, 'uid') || crypto.randomUUID();

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
            recording_url: recordingUrl,
            agent_name: assignedAgentName,
            agent_number: assignedAgentPhone,
            assigned_agent_name: assignedAgentName,
            assigned_agent_phone: assignedAgentPhone,
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
          agent_name: assignedAgentName,
          assigned_agent_name: assignedAgentName,
          assigned_agent_phone: assignedAgentPhone,
          call_status: callStatus,
          call_duration: duration,
          call_type: callType,
          recording_url: recordingUrl,
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
        const last10 = normalizedCaller.replace(/^\+91/, '').slice(-10);

        const { data: existingEnquiry } = await supabase
          .from('enquiries')
          .select('id')
          .or(`customer_name.ilike.%${last10}%,notes.ilike.%${last10}%`)
          .limit(1)
          .maybeSingle();

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
              sales_person_name: assignedAgentName || 'Unassigned',
              status: 'new',
              notes: [
                'Auto-created from MyOperator call.',
                `Caller: ${normalizedCaller}`,
                `Status: ${callStatus}`,
                `Duration: ${duration}s`,
                department ? `Department: ${department}` : null,
                assignedAgentName ? `Agent: ${assignedAgentName}` : null,
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
                assignedAgentName ? `Agent: ${assignedAgentName}` : null,
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
