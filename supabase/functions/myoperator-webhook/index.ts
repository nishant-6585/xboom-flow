import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  const headers = Object.fromEntries(req.headers.entries());
  const rawBody = req.method === 'POST' ? await req.text() : '';

  console.log('Webhook hit:', {
    timestamp,
    method: req.method,
    headers,
    body: rawBody,
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'POST') {
      let payload: unknown = rawBody;
      let payloadObject: Record<string, unknown> | null = null;
      let parseError: string | null = null;

      if (rawBody) {
        try {
          const parsed = JSON.parse(rawBody);
          payload = parsed;
          payloadObject = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
        } catch (error) {
          parseError = error instanceof Error ? error.message : 'Unknown JSON parse error';
          console.error('Failed to parse webhook payload:', parseError);
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

      console.log('MyOperator webhook received');

      // Extract fields from standard MyOperator webhook payload
      const callId = getStringValue(payloadObject, ['call_id', 'uid', 'id']) || crypto.randomUUID();
      const callerNumberRaw = getStringValue(payloadObject, ['caller_number', 'caller', 'from']);
      const callerNumber = normalizePhone(callerNumberRaw);
      const storedCallerNumber = callerNumber || `unknown:${callId}`;
      const agentNumber = getStringValue(payloadObject, ['agent_number', 'agent', 'to']);
      const agentName = getStringValue(payloadObject, ['agent_name', 'agent_display_name']);
      const callStatus = mapCallStatus(getStringValue(payloadObject, ['status', 'call_status', 'event']) || 'unknown');
      const callDuration = parseIntegerValue(payloadObject, ['duration', 'call_duration']);
      const callType = getStringValue(payloadObject, ['direction', 'call_type']) || 'incoming';
      const recordingUrl = getStringValue(payloadObject, ['recording_url', 'recording']);
      const ivrInput = getStringValue(payloadObject, ['ivr_input', 'dtmf', 'ivr']);
      const rawPayloadForStorage = parseError
        ? { raw_body: rawBody, parse_error: parseError }
        : payload;

      // Idempotency: check if call_id already exists
      const { data: existing } = await supabase
        .from('call_logs')
        .select('id')
        .eq('call_id', callId)
        .maybeSingle();

      if (existing) {
        // Update existing call log
        const { error: updateError } = await supabase
          .from('call_logs')
          .update({
            call_status: callStatus,
            call_duration: callDuration,
            recording_url: recordingUrl,
            raw_payload: rawPayloadForStorage,
          })
          .eq('call_id', callId);

        if (updateError) {
          console.error('Error updating call log:', updateError.message);
          await insertDebugLog(supabase, {
            raw_payload: rawBody,
            headers,
            request_method: req.method,
            processing_stage: 'call_log_update_failed',
            error_message: updateError.message,
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
          agent_number: agentNumber,
          agent_name: agentName,
          call_status: callStatus,
          call_duration: callDuration,
          call_type: callType,
          recording_url: recordingUrl,
          ivr_input: ivrInput,
          raw_payload: rawPayloadForStorage,
        })
        .select('id')
        .single();

      if (callError) {
        console.error('Error inserting call log:', callError.message);
        await insertDebugLog(supabase, {
          raw_payload: rawBody,
          headers,
          request_method: req.method,
          processing_stage: 'call_log_insert_failed',
          error_message: callError.message,
        });

        return new Response(JSON.stringify({ success: true, action: 'debug_logged' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Auto lead creation: check if lead exists by phone
      let leadCreated = false;
      let leadId: string | null = null;

      if (callerNumber) {
        // Search in enquiries by customer name matching phone
        const { data: existingEnquiry } = await supabase
          .from('enquiries')
          .select('id')
          .or(`customer_name.ilike.%${callerNumber.slice(-10)}%,notes.ilike.%${callerNumber.slice(-10)}%`)
          .limit(1)
          .maybeSingle();

        if (!existingEnquiry) {
          // Create new enquiry from call
          const { data: newEnquiry, error: enquiryError } = await supabase
            .from('enquiries')
            .insert({
              customer_name: callerNumber,
              customer_company: 'MyOperator Call',
              product_name: 'Incoming Call',
              product_code: 'CALL',
              product_category: 'General',
              quantity: 1,
              urgency: 'normal',
              sales_person_name: agentName || 'Unassigned',
              status: 'new',
              notes: `Auto-created from MyOperator call.\nCaller: ${callerNumber}\nStatus: ${callStatus}\nDuration: ${callDuration}s${recordingUrl ? `\nRecording: ${recordingUrl}` : ''}`,
            })
            .select('id')
            .single();

          if (!enquiryError && newEnquiry) {
            leadCreated = true;
            leadId = newEnquiry.id;
          }
        } else {
          leadId = existingEnquiry.id;
          // Update last activity
          const { error: enquiryUpdateError } = await supabase
            .from('enquiries')
            .update({
              notes: `Last call: ${new Date().toISOString()}\nStatus: ${callStatus}\nDuration: ${callDuration}s`,
            })
            .eq('id', existingEnquiry.id);

          if (enquiryUpdateError) {
            console.error('Error updating enquiry:', enquiryUpdateError.message);
            await insertDebugLog(supabase, {
              raw_payload: rawBody,
              headers,
              request_method: req.method,
              processing_stage: 'enquiry_update_failed',
              error_message: enquiryUpdateError.message,
            });
          }
        }
      } else {
        await insertDebugLog(supabase, {
          raw_payload: rawBody,
          headers,
          request_method: req.method,
          processing_stage: 'missing_caller_number',
          error_message: 'No caller number found in payload',
        });
      }

      // Update call log with lead info
      if (leadId) {
        const { error: leadUpdateError } = await supabase
          .from('call_logs')
          .update({ lead_created: leadCreated, lead_id: leadId })
          .eq('id', callLog.id);

        if (leadUpdateError) {
          console.error('Error updating call log with lead info:', leadUpdateError.message);
          await insertDebugLog(supabase, {
            raw_payload: rawBody,
            headers,
            request_method: req.method,
            processing_stage: 'lead_update_failed',
            error_message: leadUpdateError.message,
          });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        action: 'created',
        call_log_id: callLog.id,
        lead_created: leadCreated,
        lead_id: leadId,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, message: 'Method acknowledged' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ success: true, message: 'Webhook received with processing error' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith('91')) return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

function mapCallStatus(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('answer') || s === 'completed' || s === 'connected') return 'answered';
  if (s.includes('miss') || s === 'no-answer' || s === 'noanswer') return 'missed';
  if (s.includes('busy')) return 'busy';
  if (s.includes('ring')) return 'ringing';
  if (s.includes('incoming') || s === 'new') return 'incoming';
  return s;
}

function getStringValue(payload: Record<string, unknown> | null, keys: string[]): string | null {
  if (!payload) return null;

  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  return null;
}

function parseIntegerValue(payload: Record<string, unknown> | null, keys: string[]): number {
  const value = getStringValue(payload, keys);
  if (!value) return 0;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
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
  const { error } = await supabase
    .from('webhook_debug_logs')
    .insert(entry);

  if (error) {
    console.error('Failed to insert webhook debug log:', error.message);
  }
}
