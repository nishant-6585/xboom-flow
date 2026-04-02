import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import * as XLSX from 'npm:xlsx@0.18.5';

const TIME_24H_REGEX = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// Skip rows containing these keywords (case-insensitive)
const SKIP_KEYWORDS = [
  'section', 'managed by', 'reportees', 'team roster', 'daily flow',
  'department', 'designation', 'total hours', 'grand total', 'weekly summary',
  'monthly summary', 'notes:', 'legend', 'instructions', 'prepared by',
  'approved by', 'reviewed by', 'page ', 'sheet ', 'template version',
];

// Time range patterns: "10:00 - 10:30", "10:00-10:30", "10:00 to 10:30", "10:00 AM - 10:30 AM"
const TIME_RANGE_REGEX = /(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*[-–—to]+\s*(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)/i;

function normalizeTime(value: string): string | null {
  if (!value) return null;
  const input = value.trim().toLowerCase().replace(/\./g, ':').replace(/\s+/g, ' ');
  if (!input) return null;

  const exact = input.match(TIME_24H_REGEX);
  if (exact) return `${exact[1].padStart(2, '0')}:${exact[2]}`;

  const ampm = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
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

// Check if a row is mostly empty (>70% cells empty)
function isRowMostlyEmpty(row: Record<string, any>, totalCols: number): boolean {
  const values = Object.values(row);
  const emptyCount = values.filter(v => v === '' || v === null || v === undefined).length;
  return emptyCount / Math.max(totalCols, 1) > 0.7;
}

// Check if row text matches skip keywords
function shouldSkipRow(row: Record<string, any>): boolean {
  const combined = Object.values(row).map(v => String(v ?? '')).join(' ').toLowerCase();
  return SKIP_KEYWORDS.some(kw => combined.includes(kw));
}

// Check if a value looks like an employee name (non-empty text, no time, no number-only)
function looksLikeEmployeeName(value: string): boolean {
  if (!value || value.trim().length < 2) return false;
  const v = value.trim();
  // Skip pure numbers, times, dates
  if (/^\d+$/.test(v)) return false;
  if (TIME_24H_REGEX.test(v)) return false;
  if (TIME_RANGE_REGEX.test(v)) return false;
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(v)) return false;
  // Should have at least one letter, typically 2+ words or a known name
  if (!/[a-zA-Z]/.test(v)) return false;
  return true;
}

// Try to extract time range from a single cell value
function extractTimeRange(value: string): { start: string; end: string } | null {
  if (!value) return null;
  const match = value.trim().match(TIME_RANGE_REGEX);
  if (match) {
    const start = normalizeTime(match[1].trim());
    const end = normalizeTime(match[2].trim());
    if (start && end) return { start, end };
  }
  return null;
}

// ============ STRUCTURED SHEET PARSER ============
interface StructuredRow {
  rowNum: number;
  employee_name: string;
  employee_id: string | null;
  task_name: string;
  sub_tasks: string[];
  start_time: string;
  end_time: string;
  duration_mins: number;
  frequency: string;
  target: number;
  is_break: boolean;
  errors?: string[];
  warning?: string;
  parseMethod?: string;
}

function parseStructuredSheet(
  rawRows: Record<string, any>[],
  totalCols: number,
  empMap: Map<string, { id: string; name: string }>
): { rows: StructuredRow[]; detectedEmployees: string[]; parseMethod: string } {
  const results: StructuredRow[] = [];
  const detectedEmployees: string[] = [];
  let currentEmployee: { name: string; id: string | null } | null = null;

  // Strategy 1: Try flat parsing first (standard column headers)
  const flatResult = tryFlatParse(rawRows, empMap);
  if (flatResult.length > 0) {
    const empNames = [...new Set(flatResult.map(r => r.employee_name))];
    return { rows: flatResult, detectedEmployees: empNames, parseMethod: 'flat' };
  }

  // Strategy 2: Structured parsing — detect employee header rows + task rows
  for (let idx = 0; idx < rawRows.length; idx++) {
    const row = rawRows[idx];
    const rowNum = idx + 2; // Excel 1-indexed + header
    const values = Object.values(row).map(v => String(v ?? '').trim());
    const nonEmptyValues = values.filter(v => v !== '');

    // Skip mostly empty or metadata rows
    if (isRowMostlyEmpty(row, totalCols)) continue;
    if (shouldSkipRow(row)) continue;

    // Detect employee name row: single meaningful value that matches an employee
    if (nonEmptyValues.length <= 2) {
      const candidateName = nonEmptyValues[0] || '';
      if (looksLikeEmployeeName(candidateName)) {
        const emp = empMap.get(candidateName.toLowerCase());
        if (emp) {
          currentEmployee = { name: emp.name, id: emp.id };
          if (!detectedEmployees.includes(emp.name)) detectedEmployees.push(emp.name);
          continue;
        }
        // Fuzzy match: check if any employee name contains this or vice versa
        const fuzzyMatch = findFuzzyEmployee(candidateName, empMap);
        if (fuzzyMatch) {
          currentEmployee = { name: fuzzyMatch.name, id: fuzzyMatch.id };
          if (!detectedEmployees.includes(fuzzyMatch.name)) detectedEmployees.push(fuzzyMatch.name);
          continue;
        }
      }
    }

    if (!currentEmployee) continue;

    // Try to extract task row
    const taskRow = extractTaskFromRow(row, values, rowNum, currentEmployee, empMap);
    if (taskRow) {
      results.push(taskRow);
    }
  }

  return { rows: results, detectedEmployees, parseMethod: 'structured' };
}

function findFuzzyEmployee(name: string, empMap: Map<string, { id: string; name: string }>): { id: string; name: string } | null {
  const lower = name.toLowerCase().trim();
  for (const [key, val] of empMap) {
    if (key.includes(lower) || lower.includes(key)) return val;
    // Check first+last name match
    const parts = lower.split(/\s+/);
    const keyParts = key.split(/\s+/);
    if (parts.length >= 1 && keyParts.length >= 1) {
      if (parts[0] === keyParts[0] && (parts.length === 1 || keyParts.length === 1 || parts[parts.length-1] === keyParts[keyParts.length-1])) {
        return val;
      }
    }
  }
  return null;
}

function extractTaskFromRow(
  row: Record<string, any>,
  values: string[],
  rowNum: number,
  currentEmployee: { name: string; id: string | null },
  empMap: Map<string, { id: string; name: string }>
): StructuredRow | null {
  const keys = Object.keys(row);
  let startTime: string | null = null;
  let endTime: string | null = null;
  let taskName = '';
  let target = 0;
  let frequency = 'daily';
  let isBreak = false;
  let subTasks: string[] = [];

  // Scan each cell for time ranges or individual times
  let timeFound = false;
  const textValues: string[] = [];

  for (let i = 0; i < keys.length; i++) {
    const val = String(row[keys[i]] ?? '').trim();
    if (!val) continue;

    // Check for time range in a single cell
    const range = extractTimeRange(val);
    if (range && !timeFound) {
      startTime = range.start;
      endTime = range.end;
      timeFound = true;
      continue;
    }

    // Check for individual time
    const normalized = normalizeTime(val);
    if (normalized && !timeFound) {
      if (!startTime) { startTime = normalized; continue; }
      if (!endTime) { endTime = normalized; timeFound = true; continue; }
    }

    // Check for number (potential target)
    if (/^\d+$/.test(val) && Number(val) < 1000) {
      target = Number(val);
      continue;
    }

    // Check for frequency keywords
    if (['daily', 'weekly', 'custom'].includes(val.toLowerCase())) {
      frequency = val.toLowerCase();
      continue;
    }

    // Check for break keywords
    if (['break', 'lunch', 'lunch break', 'tea break', 'rest'].includes(val.toLowerCase())) {
      isBreak = true;
    }

    // Collect text values as potential task names
    if (val.length > 1 && /[a-zA-Z]/.test(val)) {
      // Don't add if it's the employee's name
      if (val.toLowerCase() !== currentEmployee.name.toLowerCase()) {
        textValues.push(val);
      }
    }
  }

  // If no times found, skip
  if (!startTime || !endTime) return null;

  // First text value is the task, rest are sub-tasks
  taskName = textValues[0] || 'Unnamed Task';
  subTasks = textValues.slice(1);

  // Check for break indicators in task name
  if (/break|lunch|tea break|rest/i.test(taskName)) isBreak = true;

  const duration = calcDuration(startTime, endTime);
  const errors: string[] = [];
  if (duration <= 0) errors.push('End time must be after start time');

  return {
    rowNum,
    employee_name: currentEmployee.name,
    employee_id: currentEmployee.id,
    task_name: taskName,
    sub_tasks: subTasks,
    start_time: startTime,
    end_time: endTime,
    duration_mins: duration,
    frequency,
    target,
    is_break: isBreak,
    parseMethod: 'structured',
    ...(errors.length > 0 ? { errors } : {}),
  };
}

function tryFlatParse(rawRows: Record<string, any>[], empMap: Map<string, { id: string; name: string }>): StructuredRow[] {
  if (rawRows.length === 0) return [];

  const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
  const colMap: Record<string, string> = {};
  const firstRowKeys = Object.keys(rawRows[0]);

  firstRowKeys.forEach(k => {
    const nk = normalizeKey(k);
    if ((nk.includes('employee') && nk.includes('name')) || nk === 'employeename' || nk === 'employee') colMap['employee_name'] = k;
    else if (nk.includes('task') && nk.includes('name') || nk === 'taskname' || nk === 'task' || nk === 'activity' || nk === 'description') colMap['task_name'] = k;
    else if (nk.includes('sub') && nk.includes('task') || nk === 'subtasks') colMap['sub_tasks'] = k;
    else if (nk.includes('start') && nk.includes('time') || nk === 'starttime' || nk === 'from' || nk === 'timefrom') colMap['start_time'] = k;
    else if (nk.includes('end') && nk.includes('time') || nk === 'endtime' || nk === 'to' || nk === 'timeto') colMap['end_time'] = k;
    else if (nk === 'time' || nk === 'timing' || nk === 'timings' || nk === 'timerange') colMap['time_range'] = k;
    else if (nk === 'frequency' || nk === 'freq') colMap['frequency'] = k;
    else if (nk === 'target' || nk === 'targetvalue') colMap['target'] = k;
    else if (nk === 'break' || nk === 'isbreak') colMap['is_break'] = k;
  });

  // Must have at least employee + (task or time)
  if (!colMap['employee_name'] && !colMap['task_name']) return [];

  const results: StructuredRow[] = [];
  let lastEmployee: { name: string; id: string | null } | null = null;

  rawRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const errors: string[] = [];

    let employeeName = String(row[colMap['employee_name']] || '').trim();
    const taskName = String(row[colMap['task_name']] || '').trim();

    // If employee name is empty, inherit from previous row
    if (!employeeName && lastEmployee) {
      employeeName = lastEmployee.name;
    }

    if (!employeeName) return;
    if (!taskName) return;

    const emp = empMap.get(employeeName.toLowerCase()) || findFuzzyEmployee(employeeName, empMap) ? 
      (empMap.get(employeeName.toLowerCase()) || findFuzzyEmployee(employeeName, empMap)) : null;

    if (emp) {
      lastEmployee = { name: emp.name, id: emp.id };
      employeeName = emp.name;
    } else {
      errors.push(`Employee "${employeeName}" not found`);
      lastEmployee = { name: employeeName, id: null };
    }

    let startTime: string | null = null;
    let endTime: string | null = null;

    // Try time range column first
    if (colMap['time_range']) {
      const range = extractTimeRange(String(row[colMap['time_range']] || ''));
      if (range) { startTime = range.start; endTime = range.end; }
    }

    // Try separate start/end columns
    if (!startTime && colMap['start_time']) {
      startTime = normalizeTime(String(row[colMap['start_time']] || ''));
    }
    if (!endTime && colMap['end_time']) {
      endTime = normalizeTime(String(row[colMap['end_time']] || ''));
    }

    if (!startTime) errors.push('Missing start time');
    if (!endTime) errors.push('Missing end time');

    const frequency = String(row[colMap['frequency']] || 'daily').trim().toLowerCase();
    const target = Number(row[colMap['target']] || 0);
    const isBreakRaw = String(row[colMap['is_break']] || '').trim().toLowerCase();
    const isBreak = ['yes', 'true', '1', 'break'].includes(isBreakRaw) || /break|lunch/i.test(taskName);

    const subTasks = colMap['sub_tasks']
      ? String(row[colMap['sub_tasks']] || '').split(/[,;|\n]/).map(s => s.trim()).filter(Boolean)
      : [];

    const duration = startTime && endTime ? calcDuration(startTime, endTime) : 0;
    if (startTime && endTime && duration <= 0) errors.push('End time must be after start time');

    results.push({
      rowNum,
      employee_name: employeeName,
      employee_id: emp?.id || null,
      task_name: taskName,
      sub_tasks: subTasks,
      start_time: startTime || '',
      end_time: endTime || '',
      duration_mins: duration,
      frequency: ['daily', 'weekly', 'custom'].includes(frequency) ? frequency : 'daily',
      target,
      is_break: isBreak,
      parseMethod: 'flat',
      ...(errors.length > 0 ? { errors } : {}),
    });
  });

  // Only return if we got meaningful results (at least 1 valid)
  const validCount = results.filter(r => !r.errors || r.errors.length === 0).length;
  if (validCount === 0 && results.length > 0) return []; // All invalid = wrong format
  return results;
}

// ============ AI FALLBACK PARSER ============
async function aiParseFallback(
  rawRows: Record<string, any>[],
  empMap: Map<string, { id: string; name: string }>
): Promise<{ rows: StructuredRow[]; detectedEmployees: string[] }> {
  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) return { rows: [], detectedEmployees: [] };

    // Send first 30 rows as text for AI to parse
    const sampleRows = rawRows.slice(0, 30);
    const sampleText = sampleRows.map((row, i) => {
      const vals = Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(' | ');
      return `Row ${i + 2}: ${vals}`;
    }).join('\n');

    const employeeNames = [...empMap.values()].map(e => e.name).join(', ');

    const prompt = `Analyze this Excel data and extract daily flow schedule entries. 
Known employees: ${employeeNames}

Data:
${sampleText}

Extract structured entries in JSON format. Each entry needs:
- employee_name (must match one of the known employees)
- task_name
- start_time (HH:mm 24h format)  
- end_time (HH:mm 24h format)
- frequency ("daily"|"weekly"|"custom")
- target (number, default 0)
- is_break (boolean)
- row_num (original row number)

Return ONLY a JSON array of entries. No explanation.`;

    const response = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You extract structured schedule data from messy Excel exports. Return only valid JSON arrays.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) return { rows: [], detectedEmployees: [] };

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { rows: [], detectedEmployees: [] };

    const parsed = JSON.parse(jsonMatch[0]);
    const results: StructuredRow[] = [];
    const detectedEmployees: string[] = [];

    for (const entry of parsed) {
      const empName = String(entry.employee_name || '').trim();
      const emp = empMap.get(empName.toLowerCase()) || findFuzzyEmployee(empName, empMap);
      if (!emp) continue;

      if (!detectedEmployees.includes(emp.name)) detectedEmployees.push(emp.name);

      const startTime = normalizeTime(String(entry.start_time || ''));
      const endTime = normalizeTime(String(entry.end_time || ''));
      if (!startTime || !endTime) continue;

      results.push({
        rowNum: entry.row_num || 0,
        employee_name: emp.name,
        employee_id: emp.id,
        task_name: String(entry.task_name || 'Unnamed Task'),
        sub_tasks: [],
        start_time: startTime,
        end_time: endTime,
        duration_mins: calcDuration(startTime, endTime),
        frequency: ['daily', 'weekly', 'custom'].includes(entry.frequency) ? entry.frequency : 'daily',
        target: Number(entry.target) || 0,
        is_break: Boolean(entry.is_break),
        parseMethod: 'ai',
      });
    }

    return { rows: results, detectedEmployees };
  } catch {
    return { rows: [], detectedEmployees: [] };
  }
}

// ============ MAIN HANDLER ============
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
    const action = formData.get('action') as string;
    const importType = formData.get('importType') as string;
    const importDate = formData.get('importDate') as string;
    const conflictMode = formData.get('conflictMode') as string;
    const selectedRowsJson = formData.get('selectedRows') as string;

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

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

    const totalCols = rawRows.length > 0 ? Object.keys(rawRows[0]).length : 0;

    // Smart parsing
    let parsed = parseStructuredSheet(rawRows, totalCols, empMap);
    let usedAiFallback = false;

    // AI fallback: if parsing confidence is low
    const validCount = parsed.rows.filter(r => !r.errors || r.errors.length === 0).length;
    const confidence = rawRows.length > 0 ? (validCount / rawRows.length) * 100 : 0;

    if (confidence < 60 && parsed.rows.length < 3) {
      const aiResult = await aiParseFallback(rawRows, empMap);
      if (aiResult.rows.length > validCount) {
        parsed = {
          rows: aiResult.rows,
          detectedEmployees: aiResult.detectedEmployees,
          parseMethod: 'ai',
        };
        usedAiFallback = true;
      }
    }

    const validRows = parsed.rows.filter(r => !r.errors || r.errors.length === 0);
    const invalidRows = parsed.rows.filter(r => r.errors && r.errors.length > 0);

    // Check time overlaps within same employee
    const empGroups = new Map<string, StructuredRow[]>();
    validRows.forEach(r => {
      const group = empGroups.get(r.employee_id || r.employee_name) || [];
      group.push(r);
      empGroups.set(r.employee_id || r.employee_name, group);
    });

    empGroups.forEach((rows) => {
      rows.sort((a, b) => a.start_time.localeCompare(b.start_time));
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].start_time < rows[i - 1].end_time) {
          rows[i].warning = `Time overlap with row ${rows[i - 1].rowNum}`;
        }
      }
    });

    if (action === 'validate') {
      const employeeIds = [...new Set(validRows.filter(r => r.employee_id).map(r => r.employee_id))];
      const existingTemplates: string[] = [];
      if (employeeIds.length > 0) {
        const { data: existing } = await adminClient
          .from('daily_flow_templates')
          .select('employee_id')
          .in('employee_id', employeeIds);
        const uniqueIds = [...new Set((existing || []).map((e: any) => e.employee_id))];
        for (const eid of uniqueIds) {
          const emp = validRows.find(r => r.employee_id === eid);
          if (emp) existingTemplates.push(emp.employee_name);
        }
      }

      return new Response(JSON.stringify({
        valid_rows: validRows,
        invalid_rows: invalidRows,
        total: rawRows.length,
        existing_templates: existingTemplates,
        detected_employees: parsed.detectedEmployees,
        parse_method: parsed.parseMethod,
        ai_fallback_used: usedAiFallback,
        confidence: Math.round(confidence),
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

      const grouped = new Map<string, StructuredRow[]>();
      selectedRows.forEach(r => {
        if (!r.employee_id) return;
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

            let startSlNo = 1;
            if (conflictMode === 'merge') {
              const { data: existing } = await adminClient
                .from('daily_flow_templates').select('sl_no').eq('employee_id', empId).order('sl_no', { ascending: false }).limit(1);
              if (existing && existing.length > 0) startSlNo = existing[0].sl_no + 1;
            }

            const templateRows = rows.map((r, idx) => ({
              employee_id: empId,
              employee_name: empName,
              template_name: 'Imported Template',
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
        const flowDate = importDate || new Date().toISOString().split('T')[0];
        for (const [empId, rows] of grouped) {
          try {
            const empName = rows[0].employee_name;
            const entryRows = rows.map((r, idx) => ({
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
