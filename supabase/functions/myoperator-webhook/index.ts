import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'POST') {
      const payload = await req.json();
      console.log('MyOperator webhook received');

      // Extract fields from standard MyOperator webhook payload
      const callId = payload.call_id || payload.uid || payload.id || crypto.randomUUID();
      const callerNumber = normalizePhone(payload.caller_number || payload.caller || payload.from || '');
      const agentNumber = payload.agent_number || payload.agent || payload.to || null;
      const agentName = payload.agent_name || payload.agent_display_name || null;
      const callStatus = mapCallStatus(payload.status || payload.call_status || payload.event || 'unknown');
      const callDuration = parseInt(payload.duration || payload.call_duration || '0', 10);
      const callType = payload.direction || payload.call_type || 'incoming';
      const recordingUrl = payload.recording_url || payload.recording || null;
      const ivrInput = payload.ivr_input || payload.dtmf || payload.ivr || null;

      if (!callerNumber) {
        return new Response(JSON.stringify({ error: 'Missing caller number' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Idempotency: check if call_id already exists
      const { data: existing } = await supabase
        .from('call_logs')
        .select('id')
        .eq('call_id', callId)
        .maybeSingle();

      if (existing) {
        // Update existing call log
        await supabase
          .from('call_logs')
          .update({
            call_status: callStatus,
            call_duration: callDuration,
            recording_url: recordingUrl,
            raw_payload: payload,
          })
          .eq('call_id', callId);

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
          caller_number: callerNumber,
          agent_number: agentNumber,
          agent_name: agentName,
          call_status: callStatus,
          call_duration: callDuration,
          call_type: callType,
          recording_url: recordingUrl,
          ivr_input: ivrInput,
          raw_payload: payload,
        })
        .select('id')
        .single();

      if (callError) {
        console.error('Error inserting call log:', callError.message);
        return new Response(JSON.stringify({ error: 'Failed to log call' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Auto lead creation: check if lead exists by phone
      let leadCreated = false;
      let leadId: string | null = null;

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
        await supabase
          .from('enquiries')
          .update({
            notes: `Last call: ${new Date().toISOString()}\nStatus: ${callStatus}\nDuration: ${callDuration}s`,
          })
          .eq('id', existingEnquiry.id);
      }

      // Update call log with lead info
      if (leadId) {
        await supabase
          .from('call_logs')
          .update({ lead_created: leadCreated, lead_id: leadId })
          .eq('id', callLog.id);
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

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
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
