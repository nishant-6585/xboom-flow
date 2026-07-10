// Prospects auto follow-up worker.
// Invoked by pg_cron every 15 minutes (business hours, weekdays).
// - Picks eligible active prospects due for their next attempt.
// - Loads context (product, notes, quote, prior touchpoints, prior followups).
// - Asks Lovable AI (Gemini) for a personalized draft.
// - Sends via send-transactional-email (prospect-followup template).
// - Sends a separate copy to each configured CC address (default amit@xboom.in)
//   because the platform email pipeline has no native CC field.
// - Writes prospect_followups row + updates prospect_followup_state.
//
// Shadow mode (settings.shadow_mode = true, default): draft & log only,
// nothing leaves the system. Flip shadow_mode=false + enabled=true to go live.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') || ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''

const MAX_BATCH = 25

interface Settings {
  enabled: boolean
  shadow_mode: boolean
  max_attempts: number
  cc_emails: string[]
  send_window_start: string
  send_window_end: string
  weekdays_only: boolean
  ai_model: string
}

interface Prospect {
  id: string
  customer_name: string | null
  email: string | null
  phone_number: string | null
  company: string | null
  city: string | null
  product_name: string | null
  product_category: string | null
  product_code: string | null
  quantity: number | null
  purpose_of_purchase: string | null
  notes: string | null
  urgency: string | null
  requested_timeline: string | null
  lead_source: string | null
  lead_quality: string | null
  is_a_category: boolean | null
  quoted_price: number | null
  default_price: number | null
  discount_amount: number | null
  status: string | null
  created_at: string
  updated_at: string
  created_by_name: string | null
}

function isBusinessHours(now: Date, s: Settings): boolean {
  // IST offset from UTC: +5:30
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000)
  const dow = ist.getUTCDay() // 0..6
  if (s.weekdays_only && (dow === 0 || dow === 6)) return false
  const [sh, sm] = s.send_window_start.split(':').map(Number)
  const [eh, em] = s.send_window_end.split(':').map(Number)
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  return mins >= sh * 60 + sm && mins <= eh * 60 + em
}

function cadenceDaysFor(p: Prospect, attemptNo: number): number {
  // attemptNo is the attempt about to be sent (1..N).
  const tight = p.urgency === 'high' || p.is_a_category || p.lead_quality === 'hot'
    || (!!p.requested_timeline && new Date(p.requested_timeline).getTime() - Date.now() < 7 * 86400000)
  const schedule = tight ? [1, 3, 6, 10] : [2, 5, 10, 18]
  return schedule[Math.min(attemptNo - 1, schedule.length - 1)]
}

function daysSince(ts?: string | null): number {
  if (!ts) return 999
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
}

async function callAI(model: string, prompt: string): Promise<any> {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are an XBoom senior B2B sales rep writing warm, concise, non-pushy follow-up emails to prospects. Use only facts provided. NEVER invent prices, delivery dates, discounts, or promises. Output STRICT JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI gateway ${res.status}: ${text.slice(0, 300)}`)
  }
  const data = await res.json()
  const raw = data?.choices?.[0]?.message?.content
  if (!raw) throw new Error('AI response empty')
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`AI returned non-JSON: ${String(raw).slice(0, 200)}`)
  }
}

function buildPrompt(p: Prospect, attemptNo: number, priorFollowups: Array<{ subject: string; created_at: string }>, priorActivities: Array<{ activity_type: string; notes: string | null; activity_date: string }>) {
  const priceCtx = p.quoted_price
    ? `A quote of INR ${p.quoted_price} was already shared${p.default_price ? ` (list price INR ${p.default_price})` : ''}.`
    : 'No formal quote has been shared yet.'
  const daysSinceCreated = daysSince(p.created_at)
  const timeline = p.requested_timeline ? `Requested timeline: ${p.requested_timeline}.` : ''
  return `Draft follow-up email #${attemptNo} (of up to 4). Return strict JSON:
{
  "subject": "<max 65 chars, no ALL CAPS, no emojis>",
  "greeting": "Hi <first name>,",
  "paragraphs": ["<opening tying to product & prior context>", "<value/help paragraph>"],
  "cta_text": "<single sentence, one clear ask (reply / short call)>",
  "tone_used": "<gentle|informative|closing>",
  "key_hooks": ["<why this angle>"]
}

PROSPECT
- Name: ${p.customer_name || 'Unknown'}
- Company: ${p.company || '—'}, City: ${p.city || '—'}
- Enquiry age: ${daysSinceCreated} days
- Urgency: ${p.urgency || 'unspecified'}${p.is_a_category ? ', A-CATEGORY prospect' : ''}
- Lead source: ${p.lead_source || '—'}, quality: ${p.lead_quality || '—'}

PRODUCT
- ${p.product_name || 'Unknown product'} (${p.product_category || 'general'})${p.product_code ? ` code ${p.product_code}` : ''}
- Quantity: ${p.quantity || 1}
- Purpose: ${p.purpose_of_purchase || 'not specified'}

COMMERCIAL
- ${priceCtx}

CLIENT NOTES
${p.notes ? p.notes.slice(0, 800) : '(none)'}

${timeline}

PRIOR FOLLOW-UPS SENT (${priorFollowups.length})
${priorFollowups.map((f, i) => `${i + 1}. ${f.created_at.slice(0, 10)} — "${f.subject}"`).join('\n') || '(none — this is first outreach after the enquiry itself)'}

RECENT ACTIVITIES (${priorActivities.length})
${priorActivities.slice(0, 5).map(a => `- ${a.activity_date?.slice(0, 10)} [${a.activity_type}] ${(a.notes || '').slice(0, 120)}`).join('\n') || '(none)'}

GUIDELINES
- Under 130 words total.
- Reference the specific product and, if present, the quote.
- ${attemptNo === 1 ? 'This is the first nudge — be warm and helpful.' : ''}${attemptNo === 2 ? 'Second nudge — offer a call and address likely objections.' : ''}${attemptNo === 3 ? 'Third nudge — add fresh value (spec sheet / customer story) not repetition.' : ''}${attemptNo >= 4 ? 'Final nudge — respectful "closing the loop" message; make it easy to say not-now.' : ''}
- Do NOT invent prices, discounts, delivery dates, or promises.
- Do NOT reuse subjects already sent (see PRIOR FOLLOW-UPS).`
}

async function sendOne(supabase: any, to: string, subject: string, greeting: string, paragraphs: string[], ctaText: string, productName: string | null, signature: string, idemKey: string) {
  return await supabase.functions.invoke('send-transactional-email', {
    body: {
      templateName: 'prospect-followup',
      recipientEmail: to,
      idempotencyKey: idemKey,
      templateData: {
        greeting,
        paragraphs,
        ctaText,
        productName,
        signature,
        signatureRole: 'XBoom Sales',
        subject,
      },
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Auth: accept either CRON_SECRET header (from pg_cron) or service-role bearer
  const cronHeader = req.headers.get('x-cron-secret') || ''
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  let ok = (CRON_SECRET && cronHeader === CRON_SECRET) || (bearer && bearer === SUPABASE_SERVICE_ROLE_KEY)
  // Also allow admin users (for the "Run now" button in the admin UI)
  if (!ok && bearer) {
    try {
      const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      const { data: u } = await authClient.auth.getUser(bearer)
      const uid = u?.user?.id
      if (uid) {
        const { data: roles } = await authClient.from('user_roles').select('role').eq('user_id', uid)
        const allowed = new Set(['admin', 'sales_manager', 'sales'])
        if ((roles || []).some((r: any) => allowed.has(r.role))) ok = true
      }
    } catch { /* ignore */ }
  }
  if (!ok) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const now = new Date()

  // Manual force flag (bypasses window & enabled/shadow gates) for admin "Send now"
  let force = false
  let onlyProspectId: string | null = null
  try {
    const body = req.method === 'POST' ? await req.json() : {}
    force = body?.force === true
    onlyProspectId = typeof body?.prospect_id === 'string' ? body.prospect_id : null
  } catch { /* no body */ }

  // Load settings
  const { data: settings, error: sErr } = await supabase.from('prospect_followup_settings').select('*').eq('id', true).maybeSingle()
  if (sErr || !settings) return new Response(JSON.stringify({ error: 'settings unavailable' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const s = settings as Settings

  if (!force) {
    if (!s.enabled) return new Response(JSON.stringify({ skipped: 'disabled' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (!isBusinessHours(now, s)) return new Response(JSON.stringify({ skipped: 'out_of_window' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Select candidates
  let prospectsQ = supabase
    .from('prospects')
    .select('*')
    .eq('status', 'active')
    .not('email', 'is', null)
    .neq('email', '')
    .order('updated_at', { ascending: true })
    .limit(MAX_BATCH * 3) // over-select; filter after state join
  if (onlyProspectId) prospectsQ = prospectsQ.eq('id', onlyProspectId)
  const { data: prospects, error: pErr } = await prospectsQ
  if (pErr) return new Response(JSON.stringify({ error: pErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (!prospects?.length) return new Response(JSON.stringify({ processed: 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const ids = prospects.map((p: any) => p.id)
  const [{ data: states }, { data: allFups }] = await Promise.all([
    supabase.from('prospect_followup_state').select('*').in('prospect_id', ids),
    supabase.from('prospect_followups').select('prospect_id, attempt_no, subject, created_at, status').in('prospect_id', ids).order('created_at', { ascending: false }),
  ])
  const stateByPid = new Map<string, any>((states || []).map((s: any) => [s.prospect_id, s]))
  const fupsByPid = new Map<string, any[]>()
  for (const f of allFups || []) {
    const arr = fupsByPid.get(f.prospect_id) || []
    arr.push(f)
    fupsByPid.set(f.prospect_id, arr)
  }

  const results: any[] = []
  let sent = 0

  for (const rawP of prospects) {
    if (sent >= MAX_BATCH) break
    const p = rawP as Prospect
    const st = stateByPid.get(p.id) || { attempts_sent: 0, paused: false, stopped: false, next_scheduled_at: null, last_sent_at: null }
    if (st.stopped || st.paused) continue
    if (st.attempts_sent >= s.max_attempts) { results.push({ id: p.id, skip: 'max_attempts' }); continue }

    const prior = fupsByPid.get(p.id) || []
    const lastSent = prior.find((f: any) => f.status === 'sent' || f.status === 'shadow')
    const attemptNo = st.attempts_sent + 1
    const dueDays = cadenceDaysFor(p, attemptNo)
    const anchor = lastSent?.created_at || p.updated_at || p.created_at
    const anchorAgeDays = daysSince(anchor)
    if (!force && anchorAgeDays < dueDays) continue

    // Skip if suppressed
    const { data: suppressed } = await supabase.from('suppressed_emails').select('id').eq('email', (p.email || '').toLowerCase()).maybeSingle()
    if (suppressed) {
      await supabase.from('prospect_followup_state').upsert({ prospect_id: p.id, stopped: true, stop_reason: 'suppressed', updated_at: new Date().toISOString() })
      results.push({ id: p.id, skip: 'suppressed' }); continue
    }

    // Load prior activities
    const { data: acts } = await supabase.from('crm_contact_activities')
      .select('activity_type, notes, activity_date').eq('prospect_id', p.id)
      .order('activity_date', { ascending: false }).limit(10)

    // Draft with AI
    let draft: any
    try {
      draft = await callAI(s.ai_model, buildPrompt(p, attemptNo, prior.map((x: any) => ({ subject: x.subject, created_at: x.created_at })), acts || []))
    } catch (e) {
      await supabase.from('prospect_followups').insert({
        prospect_id: p.id, attempt_no: attemptNo, recipient_email: p.email!, subject: '(ai_failed)',
        body_html: '', body_text: '', ai_model: s.ai_model, status: 'failed', error_message: String((e as Error).message).slice(0, 500),
      })
      results.push({ id: p.id, error: 'ai_failed' }); continue
    }

    const subject = String(draft.subject || 'Following up on your enquiry').slice(0, 100)
    const greeting = String(draft.greeting || `Hi ${(p.customer_name || 'there').split(' ')[0]},`)
    const paragraphs = Array.isArray(draft.paragraphs) ? draft.paragraphs.map((x: any) => String(x)).slice(0, 4) : []
    const ctaText = String(draft.cta_text || 'Would love to hear from you.')
    const signature = p.created_by_name || 'XBoom Sales'
    const idemBase = `prospect-followup-${p.id}-${attemptNo}`

    const isShadow = s.shadow_mode && !force
    if (isShadow) {
      await supabase.from('prospect_followups').insert({
        prospect_id: p.id, attempt_no: attemptNo, recipient_email: p.email!, cc_emails: s.cc_emails,
        subject, body_html: paragraphs.join('\n\n'), body_text: paragraphs.join('\n\n'),
        ai_model: s.ai_model, ai_meta: { tone_used: draft.tone_used, key_hooks: draft.key_hooks },
        status: 'shadow',
      })
      await supabase.from('prospect_followup_state').upsert({
        prospect_id: p.id, attempts_sent: attemptNo, last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
      results.push({ id: p.id, mode: 'shadow', attempt: attemptNo })
      sent++
      continue
    }

    // Send to prospect
    const primary = await sendOne(supabase, p.email!, subject, greeting, paragraphs, ctaText, p.product_name, signature, idemBase)
    const messageId = (primary as any)?.data?.messageId || null
    const primaryOk = !(primary as any)?.error

    // Send copy to each CC address (platform pipeline has no native CC)
    for (let i = 0; i < (s.cc_emails || []).length; i++) {
      const cc = s.cc_emails[i]
      if (!cc || cc.toLowerCase() === p.email!.toLowerCase()) continue
      await sendOne(supabase, cc, `[CC] ${subject}`, greeting, [
        `(This is a CC copy of the auto follow-up sent to ${p.customer_name || p.email} <${p.email}>.)`,
        ...paragraphs,
      ], ctaText, p.product_name, signature, `${idemBase}-cc-${i}`)
    }

    await supabase.from('prospect_followups').insert({
      prospect_id: p.id, attempt_no: attemptNo, recipient_email: p.email!, cc_emails: s.cc_emails,
      subject, body_html: paragraphs.join('\n\n'), body_text: paragraphs.join('\n\n'),
      ai_model: s.ai_model, ai_meta: { tone_used: draft.tone_used, key_hooks: draft.key_hooks },
      email_message_id: messageId, sent_at: primaryOk ? new Date().toISOString() : null,
      status: primaryOk ? 'sent' : 'failed', error_message: primaryOk ? null : String((primary as any)?.error?.message || 'send failed').slice(0, 500),
    })
    await supabase.from('prospect_followup_state').upsert({
      prospect_id: p.id, attempts_sent: attemptNo, last_sent_at: new Date().toISOString(),
      stopped: attemptNo >= s.max_attempts, stop_reason: attemptNo >= s.max_attempts ? 'max_attempts' : null,
      updated_at: new Date().toISOString(),
    })
    results.push({ id: p.id, mode: primaryOk ? 'sent' : 'failed', attempt: attemptNo })
    sent++
  }

  return new Response(JSON.stringify({ processed: results.length, sent, results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})