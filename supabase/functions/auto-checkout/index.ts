import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get today's date in IST (UTC+5:30)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const todayIST = istNow.toISOString().split('T')[0];

    console.log(`Soft auto-checkout job running at IST: ${istNow.toISOString()}, date: ${todayIST}`);

    // Fetch active attendance logs for today that haven't been checked out yet
    const { data: logs, error: fetchError } = await supabase
      .from('attendance_logs')
      .select('id, employee_id, check_in_time, break_start_time, break_end_time, total_break_minutes, auto_checkout_applied')
      .eq('date', todayIST)
      .not('check_in_time', 'is', null)
      .is('check_out_time', null)
      .eq('auto_checkout_applied', false); // Skip already auto-checked-out logs

    if (fetchError) {
      console.error('Error fetching attendance logs:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${logs?.length ?? 0} active attendance logs for today.`);

    // Fetch auto checkout threshold from policy settings
    const { data: policyData } = await supabase
      .from('attendance_policy_settings')
      .select('auto_checkout_hours')
      .limit(1)
      .maybeSingle();

    const AUTO_CHECKOUT_HOURS = policyData?.auto_checkout_hours ?? 9;
    const autoCheckedOut: string[] = [];

    for (const log of logs ?? []) {
      const checkInTime = new Date(log.check_in_time);
      const elapsedMs = now.getTime() - checkInTime.getTime();
      const elapsedMinutes = elapsedMs / (1000 * 60);

      // Calculate committed break minutes (completed breaks already stored)
      let totalBreakMinutes = log.total_break_minutes ?? 0;

      // If currently on break, account for the ongoing break duration
      if (log.break_start_time && !log.break_end_time) {
        const breakStart = new Date(log.break_start_time);
        const ongoingBreakMinutes = (now.getTime() - breakStart.getTime()) / (1000 * 60);
        totalBreakMinutes += ongoingBreakMinutes;
      }

      const netWorkingMinutes = elapsedMinutes - totalBreakMinutes;
      const netWorkingHours = netWorkingMinutes / 60;

      console.log(`Log ${log.id}: elapsed=${elapsedMinutes.toFixed(1)}m, breaks=${totalBreakMinutes.toFixed(1)}m, net=${netWorkingHours.toFixed(2)}h`);

      if (netWorkingHours >= AUTO_CHECKOUT_HOURS) {
        // Calculate the provisional checkout time = check_in_time + threshold hours + breaks
        const thresholdMs = AUTO_CHECKOUT_HOURS * 60 * 60 * 1000;
        const totalBreakMs = (log.total_break_minutes ?? 0) * 60 * 1000;
        const provisionalCheckoutTime = new Date(checkInTime.getTime() + thresholdMs + totalBreakMs);
        const provisionalCheckoutISO = provisionalCheckoutTime.toISOString();
        const autoCheckoutTimeISO = now.toISOString();

        // Build update payload — SOFT checkout (provisional)
        const updatePayload: Record<string, unknown> = {
          check_out_time: provisionalCheckoutISO,
          auto_checkout_applied: true,
          auto_checkout_time: autoCheckoutTimeISO,
          is_provisional_checkout: true,
          checkout_missing: false,
        };

        // If on break, also end the break
        if (log.break_start_time && !log.break_end_time) {
          const breakStart = new Date(log.break_start_time);
          const breakDuration = (now.getTime() - breakStart.getTime()) / (1000 * 60);
          const newTotalBreak = (log.total_break_minutes ?? 0) + breakDuration;

          updatePayload.break_end_time = autoCheckoutTimeISO;
          updatePayload.total_break_minutes = newTotalBreak;

          // Close the active attendance_break record
          await supabase
            .from('attendance_breaks')
            .update({
              break_end_time: autoCheckoutTimeISO,
              break_duration_minutes: breakDuration,
            })
            .eq('attendance_id', log.id)
            .is('break_end_time', null);
        }

        const { error: updateError } = await supabase
          .from('attendance_logs')
          .update(updatePayload)
          .eq('id', log.id);

        if (updateError) {
          console.error(`Failed to auto-checkout log ${log.id}:`, updateError);
        } else {
          console.log(`Soft auto-checked out log ${log.id} (provisional checkout at ${provisionalCheckoutISO})`);
          autoCheckedOut.push(log.id);

          // Write audit log entry
          await supabase
            .from('attendance_audit_log')
            .insert({
              attendance_log_id: log.id,
              employee_id: log.employee_id,
              event_type: 'AUTO_CHECKOUT_APPLIED',
              old_checkout_time: null,
              new_checkout_time: provisionalCheckoutISO,
              notes: `Auto-checkout applied after ${netWorkingHours.toFixed(2)} net working hours (threshold: ${AUTO_CHECKOUT_HOURS}h). Checkout set to ${provisionalCheckoutISO} (provisional).`,
              metadata: {
                threshold_hours: AUTO_CHECKOUT_HOURS,
                net_working_hours: netWorkingHours,
                is_provisional: true,
              },
            });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: logs?.length ?? 0,
        autoCheckedOut: autoCheckedOut.length,
        ids: autoCheckedOut,
        mode: 'soft_provisional',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Unexpected error in soft auto-checkout:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
