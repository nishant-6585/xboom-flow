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

    console.log(`Auto-checkout job running at IST: ${istNow.toISOString()}, date: ${todayIST}`);

    // Fetch all active attendance logs for today that haven't been checked out
    const { data: logs, error: fetchError } = await supabase
      .from('attendance_logs')
      .select('id, check_in_time, break_start_time, break_end_time, total_break_minutes')
      .eq('date', todayIST)
      .not('check_in_time', 'is', null)
      .is('check_out_time', null);

    if (fetchError) {
      console.error('Error fetching attendance logs:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${logs?.length ?? 0} active attendance logs for today.`);

    const AUTO_CHECKOUT_HOURS = 9;
    const autoCheckedOut: string[] = [];

    for (const log of logs ?? []) {
      const checkInTime = new Date(log.check_in_time);
      const elapsedMs = now.getTime() - checkInTime.getTime();
      const elapsedMinutes = elapsedMs / (1000 * 60);

      // Calculate committed break minutes (completed breaks already stored)
      let totalBreakMinutes = log.total_break_minutes ?? 0;

      // If currently on break (break_start_time set but no break_end_time),
      // add the ongoing break duration to total break so we don't count it as work time
      if (log.break_start_time && !log.break_end_time) {
        const breakStart = new Date(log.break_start_time);
        const ongoingBreakMinutes = (now.getTime() - breakStart.getTime()) / (1000 * 60);
        totalBreakMinutes += ongoingBreakMinutes;
      }

      const netWorkingMinutes = elapsedMinutes - totalBreakMinutes;
      const netWorkingHours = netWorkingMinutes / 60;

      console.log(`Log ${log.id}: elapsed=${elapsedMinutes.toFixed(1)}m, breaks=${totalBreakMinutes.toFixed(1)}m, net=${netWorkingHours.toFixed(2)}h`);

      if (netWorkingHours >= AUTO_CHECKOUT_HOURS) {
        // Build update payload
        const checkoutTime = now.toISOString();
        const updatePayload: Record<string, unknown> = {
          check_out_time: checkoutTime,
          checkout_missing: false,
        };

        // If on break, also end the break
        if (log.break_start_time && !log.break_end_time) {
          const breakStart = new Date(log.break_start_time);
          const breakDuration = (now.getTime() - breakStart.getTime()) / (1000 * 60);
          const newTotalBreak = (log.total_break_minutes ?? 0) + breakDuration;

          updatePayload.break_end_time = checkoutTime;
          updatePayload.total_break_minutes = newTotalBreak;

          // Also close the active attendance_break record
          await supabase
            .from('attendance_breaks')
            .update({
              break_end_time: checkoutTime,
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
          console.log(`Auto-checked out log ${log.id} after ${netWorkingHours.toFixed(2)} working hours.`);
          autoCheckedOut.push(log.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: logs?.length ?? 0,
        autoCheckedOut: autoCheckedOut.length,
        ids: autoCheckedOut,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Unexpected error in auto-checkout:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
