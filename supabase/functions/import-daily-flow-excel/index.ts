import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import * as XLSX from 'npm:xlsx@0.18.5';

const TIME_24H_REGEX = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function normalizeTime(value: string): string | null {
  const input = value.trim().toLowerCase().replace(/\./g, ':').replace(/\s+/g, ' ');
  if (!input) return null;
  const exact = input.match(TIME_24H_REGEX);
  if (exact) return `${exact[1].padStart(2, '0')}:${exact[2]}`;
  const ampm = input.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2] ?? '0');
    const p = ampm[3];
    if (h < 1 || h > 12 || m > 59) return null;
    if (p === 'am') h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const hourOnly = input.match(/^(\d{1,2})$/);
  if (hourOnly) {
    const h = Number(hourOnly[1]);
    if (h > 23) return null;
    return `${String(h).padStart(2, '0')}:00`;
  }
  return null;
}

function calcDuration(from: string, to: string): number {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const diff = th * 60 + tm - (fh * 60 + fm);
  return diff > 0 ? diff : 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseKey);
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check role
    const { data: roles } = await adminClient.from('user_roles').select('role').eq('user_id', user.id);
    const userRoles = (roles || []).map((r: any) => r.role);
    if (!userRoles.some((r: string) => ['admin', 'hr'].includes(r))) {
      return new Response(JSON.stringify({ error: 'Access denied. Admin/HR only.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await adminClient.from('profiles').select('name').eq('user_id', user.id).single();
    const userName = profile?.name || 'Unknown';

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const action = formData.get('action') as string; // 'validate' or 'import'
    const importType = formData.get('importType') as string; // 'templates' or 'entries'
    const importDate = formData.get('importDate') as string;
    const conflictMode = formData.get('conflictMode') as string; // 'overwrite', 'merge', 'skip'
    const selectedRowsJson = formData.get('selectedRows') as string;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rawRows.length === 0) {
      return new Response(JSON.stringify({ error: 'File is empty' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (rawRows.length > 500) {
      return new Response(JSON.stringify({ error: 'Maximum 500 rows allowed per upload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all active employees
    const { data: employees } = await adminClient.from('employees').select('id, name').eq('is_active', true);
    const empMap = new Map<string, { id: string; name: string }>();
    (employees || []).forEach((e: any) => {
      empMap.set(e.name.toLowerCase().trim(), { id: e.id, name: e.name });
    });

    // Normalize column names
    const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
    const colMap: Record<string, string> = {};
    if (rawRows.length > 0) {
      Object.keys(rawRows[0]).forEach(k => {
        const nk = normalizeKey(k);
        if (nk.includes('employee') && nk.includes('name')) colMap['employee_name'] = k;
        else if (nk.includes('task') && nk.includes('name') || (nk === 'taskname' || nk === 'task')) colMap['task_name'] = k;
        else if (nk.includes('sub') && nk.includes('task') || nk === 'subtasks') colMap['sub_tasks'] = k;
        else if (nk.includes('start') && nk.includes('time') || nk === 'starttime' || nk === 'from') colMap['start_time'] = k;
        else if (nk.includes('end') && nk.includes('time') || nk === 'endtime' || nk === 'to') colMap['end_time'] = k;
        else if (nk === 'frequency' || nk === 'freq') colMap['frequency'] = k;
        else if (nk === 'target' || nk === 'targetvalue') colMap['target'] = k;
        else if (nk === 'break' || nk === 'isbreak') colMap['is_break'] = k;
      });
    }

    // Parse and validate rows
    const validRows: any[] = [];
    const invalidRows: any[] = [];

    rawRows.forEach((row, idx) => {
      const rowNum = idx + 2; // Excel row (header is 1)
      const errors: string[] = [];

      const employeeName = String(row[colMap['employee_name']] || '').trim();
      const taskName = String(row[colMap['task_name']] || '').trim();
      const subTasks = String(row[colMap['sub_tasks']] || '').trim();
      const startTimeRaw = String(row[colMap['start_time']] || '').trim();
      const endTimeRaw = String(row[colMap['end_time']] || '').trim();
      const frequency = String(row[colMap['frequency']] || 'daily').trim().toLowerCase();
      const target = Number(row[colMap['target']] || 0);
      const isBreakRaw = String(row[colMap['is_break']] || '').trim().toLowerCase();
      const isBreak = ['yes', 'true', '1', 'break'].includes(isBreakRaw);

      if (!employeeName) errors.push('Missing employee name');
      if (!taskName) errors.push('Missing task name');

      const emp = empMap.get(employeeName.toLowerCase());
      if (employeeName && !emp) errors.push(`Employee "${employeeName}" not found`);

      const startTime = normalizeTime(startTimeRaw);
      const endTime = normalizeTime(endTimeRaw);
      if (!startTimeRaw) errors.push('Missing start time');
      else if (!startTime) errors.push(`Invalid start time: "${startTimeRaw}"`);
      if (!endTimeRaw) errors.push('Missing end time');
      else if (!endTime) errors.push(`Invalid end time: "${endTimeRaw}"`);

      if (startTime && endTime) {
        const dur = calcDuration(startTime, endTime);
        if (dur <= 0) errors.push('End time must be after start time');
      }

      const validFreqs = ['daily', 'weekly', 'custom'];
      if (!validFreqs.includes(frequency)) errors.push(`Invalid frequency: "${frequency}"`);

      const subItemsArr = subTasks
        ? subTasks.split(/[,;|\n]/).map((s: string) => s.trim()).filter(Boolean)
        : [];

      const parsed = {
        rowNum,
        employee_name: emp?.name || employeeName,
        employee_id: emp?.id || null,
        task_name: taskName,
        sub_tasks: subItemsArr,
        start_time: startTime || startTimeRaw,
        end_time: endTime || endTimeRaw,
        duration_mins: startTime && endTime ? calcDuration(startTime, endTime) : 0,
        frequency,
        target,
        is_break: isBreak,
      };

      if (errors.length > 0) {
        invalidRows.push({ ...parsed, errors });
      } else {
        validRows.push(parsed);
      }
    });

    // Check time overlaps within same employee
    const empGroups = new Map<string, any[]>();
    validRows.forEach(r => {
      const group = empGroups.get(r.employee_id) || [];
      group.push(r);
      empGroups.set(r.employee_id, group);
    });

    empGroups.forEach((rows) => {
      rows.sort((a: any, b: any) => a.start_time.localeCompare(b.start_time));
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].start_time < rows[i - 1].end_time) {
          rows[i].warning = `Time overlap with row ${rows[i - 1].rowNum}`;
        }
      }
    });

    if (action === 'validate') {
      // Check existing templates for conflict detection
      const employeeIds = [...new Set(validRows.map((r: any) => r.employee_id))];
      const existingTemplates: string[] = [];
      if (employeeIds.length > 0) {
        const { data: existing } = await adminClient
          .from('daily_flow_templates')
          .select('employee_id')
          .in('employee_id', employeeIds);
        const uniqueIds = [...new Set((existing || []).map((e: any) => e.employee_id))];
        for (const eid of uniqueIds) {
          const emp = validRows.find((r: any) => r.employee_id === eid);
          if (emp) existingTemplates.push(emp.employee_name);
        }
      }

      return new Response(JSON.stringify({
        valid_rows: validRows,
        invalid_rows: invalidRows,
        total: rawRows.length,
        existing_templates: existingTemplates,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // IMPORT action
    if (action === 'import') {
      let selectedRows = validRows;
      if (selectedRowsJson) {
        const selectedIndices: number[] = JSON.parse(selectedRowsJson);
        selectedRows = validRows.filter((_: any, i: number) => selectedIndices.includes(i));
      }

      if (selectedRows.length === 0) {
        return new Response(JSON.stringify({ error: 'No valid rows to import' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const grouped = new Map<string, any[]>();
      selectedRows.forEach((r: any) => {
        const group = grouped.get(r.employee_id) || [];
        group.push(r);
        grouped.set(r.employee_id, group);
      });

      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];

      if (importType === 'templates') {
        for (const [empId, rows] of grouped) {
          try {
            const empName = rows[0].employee_name;

            if (conflictMode === 'overwrite') {
              // Delete existing templates
              const { data: existingTmpl } = await adminClient
                .from('daily_flow_templates').select('id').eq('employee_id', empId);
              const ids = (existingTmpl || []).map((t: any) => t.id);
              if (ids.length > 0) {
                await adminClient.from('daily_flow_entries').update({ template_id: null }).in('template_id', ids);
                await adminClient.from('daily_flow_templates').delete().eq('employee_id', empId);
              }
            } else if (conflictMode === 'skip') {
              const { data: existing } = await adminClient
                .from('daily_flow_templates').select('id').eq('employee_id', empId).limit(1);
              if (existing && existing.length > 0) {
                successCount += rows.length;
                continue;
              }
            }

            // Get max sl_no for merge
            let startSlNo = 1;
            if (conflictMode === 'merge') {
              const { data: existing } = await adminClient
                .from('daily_flow_templates').select('sl_no').eq('employee_id', empId).order('sl_no', { ascending: false }).limit(1);
              if (existing && existing.length > 0) startSlNo = existing[0].sl_no + 1;
            }

            const templateRows = rows.map((r: any, idx: number) => ({
              employee_id: empId,
              employee_name: empName,
              template_name: `Imported Template`,
              sl_no: startSlNo + idx,
              description: r.task_name,
              sub_items: r.sub_tasks,
              time_from: r.start_time,
              time_to: r.end_time,
              duration_mins: r.duration_mins,
              target_value: r.target,
              is_break: r.is_break,
              frequency: r.frequency,
              created_by: user.id,
              created_by_name: userName,
            }));

            const { error: insertErr } = await adminClient.from('daily_flow_templates').insert(templateRows);
            if (insertErr) {
              failCount += rows.length;
              errors.push(`${empName}: ${insertErr.message}`);
            } else {
              successCount += rows.length;
            }
          } catch (e: any) {
            failCount += rows.length;
            errors.push(`${rows[0].employee_name}: ${e.message}`);
          }
        }
      } else {
        // Daily entries
        const flowDate = importDate || new Date().toISOString().split('T')[0];
        for (const [empId, rows] of grouped) {
          try {
            const empName = rows[0].employee_name;
            const entryRows = rows.map((r: any, idx: number) => ({
              employee_id: empId,
              employee_name: empName,
              flow_date: flowDate,
              sl_no: idx + 1,
              description: r.task_name,
              sub_items: r.sub_tasks,
              time_from: r.start_time,
              time_to: r.end_time,
              duration_mins: r.duration_mins,
              target_value: r.target,
              actual_value: 0,
              is_break: r.is_break,
              frequency: r.frequency,
              created_by: user.id,
              created_by_name: userName,
            }));

            const { error: insertErr } = await adminClient.from('daily_flow_entries').insert(entryRows);
            if (insertErr) {
              failCount += rows.length;
              errors.push(`${empName}: ${insertErr.message}`);
            } else {
              successCount += rows.length;
            }
          } catch (e: any) {
            failCount += rows.length;
            errors.push(`${rows[0].employee_name}: ${e.message}`);
          }
        }
      }

      return new Response(JSON.stringify({
        success: true,
        total: selectedRows.length,
        successful: successCount,
        failed: failCount,
        errors,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use "validate" or "import".' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
