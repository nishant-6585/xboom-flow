const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'x-api-key, content-type',
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.length > 0 && r.some((v) => v && v.trim() !== ''));
}

function num(v: string | undefined): number {
  if (!v) return 0;
  const cleaned = v.replace(/[₹$,\s]/g, '').replace(/[^0-9.\-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function findIdx(header: string[], candidates: string[]): number {
  const norm = header.map((h) => h.trim().toLowerCase());
  for (const cand of candidates) {
    const idx = norm.indexOf(cand.toLowerCase());
    if (idx !== -1) return idx;
  }
  for (let i = 0; i < norm.length; i++) {
    if (candidates.some((c) => norm[i].includes(c.toLowerCase()))) return i;
  }
  return -1;
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  const s = v.trim();
  // Try ISO
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  // Try DD/MM/YYYY or MM/DD/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [_, a, b, y] = m;
    let year = Number(y);
    if (year < 100) year += 2000;
    // Assume DD/MM/YYYY
    d = new Date(Date.UTC(year, Number(b) - 1, Number(a)));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const expected = Deno.env.get('JARVIS_ADS_API_KEY');
  const provided = req.headers.get('x-api-key');
  if (!expected || !provided || provided !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const sheetUrl = Deno.env.get('GOOGLE_SHEET_CSV_URL');
  if (!sheetUrl) {
    return new Response(JSON.stringify({ error: 'GOOGLE_SHEET_CSV_URL not configured' }), {
      status: 502,
      headers: jsonHeaders,
    });
  }

  try {
    const res = await fetch(sheetUrl, { redirect: 'follow' });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return new Response(
        JSON.stringify({ error: `Sheet fetch failed ${res.status}`, details: body.slice(0, 500) }),
        { status: 502, headers: jsonHeaders },
      );
    }
    const csv = await res.text();
    const rows = parseCsv(csv);
    if (rows.length < 2) {
      return new Response(JSON.stringify({ error: 'Sheet is empty or has no data rows' }), {
        status: 502,
        headers: jsonHeaders,
      });
    }

    const header = rows[0];
    const dateIdx = findIdx(header, ['date', 'day']);
    const spendIdx = findIdx(header, ['spend', 'cost', 'amount spent']);
    const impIdx = findIdx(header, ['impressions', 'impr']);
    const clicksIdx = findIdx(header, ['clicks', 'link clicks']);
    const leadsIdx = findIdx(header, ['leads', 'conversions']);

    if (dateIdx === -1 || spendIdx === -1) {
      return new Response(
        JSON.stringify({
          error: 'Sheet missing required columns',
          details: `Need date and spend columns. Found: ${header.join(', ')}`,
        }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    let spend = 0;
    let impressions = 0;
    let clicks = 0;
    let leads = 0;
    const byDate: Record<string, number> = {};

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const d = parseDate(r[dateIdx] ?? '');
      if (!d) continue;
      const dateKey = ymd(d);
      const rowSpend = num(r[spendIdx]);
      byDate[dateKey] = (byDate[dateKey] ?? 0) + rowSpend;

      if (d >= monthStart && d <= now) {
        spend += rowSpend;
        if (impIdx !== -1) impressions += num(r[impIdx]);
        if (clicksIdx !== -1) clicks += num(r[clicksIdx]);
        if (leadsIdx !== -1) leads += num(r[leadsIdx]);
      }
    }

    const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
    const cpl = leads > 0 ? Number((spend / leads).toFixed(2)) : null;

    const today = new Date();
    const since = new Date(today);
    since.setUTCDate(since.getUTCDate() - 29);
    const daily_spend: number[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      daily_spend.push(Number((byDate[ymd(d)] ?? 0).toFixed(2)));
    }

    return new Response(
      JSON.stringify({
        google: {
          spend: Number(spend.toFixed(2)),
          impressions,
          clicks,
          ctr,
          leads,
          cpl,
          daily_spend,
        },
        fetched_at: new Date().toISOString(),
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (e) {
    const err = e as { message?: string };
    console.error('jarvis-google error', e);
    return new Response(
      JSON.stringify({ error: err?.message ?? String(e) }),
      { status: 502, headers: jsonHeaders },
    );
  }
});