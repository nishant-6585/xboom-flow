/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface DlqBreakdownRow {
  template?: string
  reason?: string
  count?: number
}

interface Props {
  totalCount?: number
  templateBreakdown?: DlqBreakdownRow[]
  reasonBreakdown?: DlqBreakdownRow[]
  sampleEvents?: Array<{
    template?: string
    recipient?: string
    reason?: string
    message_id?: string | null
    queue?: string
  }>
  runAt?: string
}

const Email = (p: Props = {}) => {
  const total = p.totalCount ?? 0
  const runAt = p.runAt ? new Date(p.runAt).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${total} email(s) dead-lettered in the last dispatcher run`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>
              x<span style={{ color: '#d4af37' }}>boom</span>
              <span style={tag}>EMAIL DISPATCHER ALERT</span>
            </Text>
          </Section>
          <Section style={card}>
            <Heading as="h1" style={h1}>{total} email(s) moved to DLQ</Heading>
            <Text style={{ margin: '0 0 8px', fontSize: '14px', color: '#334155' }}>
              The email dispatcher dead-lettered messages during the run at {runAt}. This alert
              is fired once per run — a broken template will not cause an alert flood.
            </Text>

            <Heading as="h2" style={h2}>By template</Heading>
            <table style={t}>
              <tbody>
                {(p.templateBreakdown ?? []).map((row, i) => (
                  <tr key={i}>
                    <td style={l}>{row.template || '—'}</td>
                    <td style={r}>{row.count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Heading as="h2" style={h2}>By reason</Heading>
            <table style={t}>
              <tbody>
                {(p.reasonBreakdown ?? []).map((row, i) => (
                  <tr key={i}>
                    <td style={l}>{row.reason || '—'}</td>
                    <td style={r}>{row.count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {p.sampleEvents && p.sampleEvents.length > 0 ? (
              <>
                <Heading as="h2" style={h2}>Sample events (first {p.sampleEvents.length})</Heading>
                <table style={t}>
                  <tbody>
                    {p.sampleEvents.map((e, i) => (
                      <tr key={i}>
                        <td style={l}>
                          <div style={{ fontWeight: 600 }}>{e.template || '—'}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{e.recipient || '—'}</div>
                        </td>
                        <td style={{ ...r, textAlign: 'left', fontSize: '12px', color: '#334155' }}>
                          {e.reason || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}

            <Text style={{ margin: '18px 0 0', fontSize: '12px', color: '#64748b' }}>
              View the full log and per-template breakdown in the Admin → KYC Email Log page (DLQ card).
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif', color: '#0f172a' }
const container = { maxWidth: '640px', margin: '0 auto', padding: '24px' }
const header = { background: '#7f1d1d', padding: '22px 28px', borderRadius: '12px 12px 0 0' }
const brand = { margin: 0, color: '#fff', fontSize: '20px', fontWeight: 700 as const }
const tag = { fontSize: '11px', letterSpacing: '1.5px', color: 'rgba(255,255,255,.75)', marginLeft: '8px' }
const card = { background: '#ffffff', padding: '28px', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 12px 12px' }
const h1 = { margin: '0 0 12px', fontSize: '20px' }
const h2 = { margin: '18px 0 8px', fontSize: '14px', color: '#334155', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const t = { width: '100%', borderCollapse: 'collapse' as const, fontSize: '14px' }
const l = { padding: '6px 8px 6px 0', color: '#0f172a', borderBottom: '1px solid #f1f5f9' }
const r = { padding: '6px 0 6px 8px', color: '#0f172a', textAlign: 'right' as const, fontWeight: 600 as const, borderBottom: '1px solid #f1f5f9' }

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) =>
    `Email dispatcher: ${data?.totalCount ?? 0} message(s) dead-lettered`,
  displayName: 'Email Dispatcher — DLQ Alert',
  transactional: true,
  // Fixed recipient: infra alert, not a customer-facing send. Ops mailbox
  // is the same one used for Reply-To in send-transactional-email.
  to: 'support@xboom.in',
  previewData: {
    totalCount: 3,
    templateBreakdown: [
      { template: 'kyc-onboarding', count: 2 },
      { template: 'kyc-reminder', count: 1 },
    ],
    reasonBreakdown: [
      { reason: 'Max retries (5) exceeded (attempted 5 times)', count: 2 },
      { reason: 'TTL exceeded (60 minutes)', count: 1 },
    ],
    sampleEvents: [
      { template: 'kyc-onboarding', recipient: 'a@example.com', reason: 'Max retries (5) exceeded' },
    ],
    runAt: new Date().toISOString(),
  },
} satisfies TemplateEntry