import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Authentication: require admin JWT or cron secret
    const authHeader = req.headers.get('Authorization');
    const cronSecret = req.headers.get('X-Cron-Secret');
    const expectedCronSecret = Deno.env.get('CRON_SECRET');

    // Check if this is a scheduled/cron invocation
    let isScheduled = false;
    try {
      const body = await req.clone().json();
      isScheduled = body?.scheduled === true;
    } catch { /* not json, that's fine */ }

    if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
      // Authenticated via cron secret
    } else if (isScheduled) {
      // pg_cron invocation via pg_net — trusted internal call
    } else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      // Verify it's a valid user with admin/hr role
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: userData, error: userError } = await adminClient.auth.getUser(token);
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: roles } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .in('role', ['admin', 'hr']);
      if (!roles || roles.length === 0) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get current time in IST (UTC+5:30)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const todayIST = istNow.toISOString().split('T')[0];

    // Calculate yesterday's date in IST
    const yesterdayDate = new Date(istNow);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayIST = yesterdayDate.toISOString().split('T')[0];

    console.log(`Auto-checkout running at IST: ${istNow.toISOString()}, today: ${todayIST}, yesterday: ${yesterdayIST}`);

    // Fetch auto checkout threshold from policy settings
    const { data: policyData } = await supabase
      .from('attendance_policy_settings')
      .select('auto_checkout_hours')
      .limit(1)
      .maybeSingle();

    const AUTO_CHECKOUT_HOURS = policyData?.auto_checkout_hours ?? 9;
    const allAutoCheckedOut: string[] = [];

    // ─── Process BOTH today and yesterday's unclosed logs ───
    const datesToProcess = [todayIST, yesterdayIST];

    for (const dateToProcess of datesToProcess) {
      const { data: logs, error: fetchError } = await supabase
        .from('attendance_logs')
        .select('id, employee_id, check_in_time, break_start_time, break_end_time, total_break_minutes, auto_checkout_applied')
        .eq('date', dateToProcess)
        .not('check_in_time', 'is', null)
        .is('check_out_time', null)
        .eq('auto_checkout_applied', false);

      if (fetchError) {
        console.error(`Error fetching logs for ${dateToProcess}:`, fetchError);
        continue;
      }

      console.log(`[${dateToProcess}] Found ${logs?.length ?? 0} unclosed attendance logs.`);

      for (const log of logs ?? []) {
        const checkInTime = new Date(log.check_in_time);
        const elapsedMs = now.getTime() - checkInTime.getTime();
        const elapsedMinutes = elapsedMs / (1000 * 60);

        // Calculate total break minutes including ongoing breaks
        let totalBreakMinutes = log.total_break_minutes ?? 0;

        if (log.break_start_time && !log.break_end_time) {
          const breakStart = new Date(log.break_start_time);
          const ongoingBreakMinutes = (now.getTime() - breakStart.getTime()) / (1000 * 60);
          totalBreakMinutes += ongoingBreakMinutes;
        }

        const netWorkingMinutes = elapsedMinutes - totalBreakMinutes;
        const netWorkingHours = netWorkingMinutes / 60;

        console.log(`[${dateToProcess}] Log ${log.id}: elapsed=${elapsedMinutes.toFixed(1)}m, breaks=${totalBreakMinutes.toFixed(1)}m, net=${netWorkingHours.toFixed(2)}h`);

        if (netWorkingHours >= AUTO_CHECKOUT_HOURS) {
          // Calculate the provisional checkout time = check_in + threshold + breaks
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
            working_hours: AUTO_CHECKOUT_HOURS,
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
            console.log(`[${dateToProcess}] Soft auto-checked out log ${log.id} (provisional checkout at ${provisionalCheckoutISO})`);
            allAutoCheckedOut.push(log.id);

            // Write audit log entry
            await supabase
              .from('attendance_audit_log')
              .insert({
                attendance_log_id: log.id,
                employee_id: log.employee_id,
                event_type: 'AUTO_CHECKOUT_APPLIED',
                old_checkout_time: null,
                new_checkout_time: provisionalCheckoutISO,
                notes: `Auto-checkout applied after ${netWorkingHours.toFixed(2)} net working hours (threshold: ${AUTO_CHECKOUT_HOURS}h). Date: ${dateToProcess}. Checkout set to ${provisionalCheckoutISO} (provisional).`,
                metadata: {
                  threshold_hours: AUTO_CHECKOUT_HOURS,
                  net_working_hours: netWorkingHours,
                  is_provisional: true,
                  log_date: dateToProcess,
                  sweep_type: dateToProcess === todayIST ? 'same_day' : 'previous_day_sweep',
                },
              });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        autoCheckedOut: allAutoCheckedOut.length,
        ids: allAutoCheckedOut,
        mode: 'soft_provisional',
        dates_processed: datesToProcess,
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
