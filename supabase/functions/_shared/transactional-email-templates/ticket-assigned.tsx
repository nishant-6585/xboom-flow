/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Internal notification. Faithful reproduction of the legacy Resend HTML
// in supabase/functions/send-ticket-email/index.ts (type=assignment).

interface Props {
  recipient_name?: string
  ticket_number?: string
  subject?: string
  category?: string
  priority?: string
  raised_by_name?: string
  sla_due_at?: string
}

const priorityColor = (p?: string) => {
  switch ((p || '').toLowerCase()) {
    case 'critical': return '#dc2626'
    case 'high': return '#ea580c'
    case 'medium': return '#ca8a04'
    case 'low': return '#16a34a'
    default: return '#6b7280'
  }
}
const priorityEmoji = (p?: string) => {
  switch ((p || '').toLowerCase()) {
    case 'critical': return '🔴'
    case 'high': return '🟠'
    case 'medium': return '🟡'
    case 'low': return '🟢'
    default: return '⚪'
  }
}

const Email = (p: Props = {}) => {
  const pc = priorityColor(p.priority)
  const pe = priorityEmoji(p.priority)
  const sla = p.sla_due_at
    ? new Date(p.sla_due_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : ''
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Ticket {p.ticket_number || ''} assigned to you</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading as="h1" style={h1}>🎫 New Ticket Assigned</Heading>
          </Section>
          <Section style={card}>
            <Text style={p1}>Hi <b>{p.recipient_name || 'Team Member'}</b>,</Text>
            <Text style={p1}>A ticket has been assigned to you:</Text>
            <Section style={{ ...detail, borderLeft: `4px solid ${pc}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={lbl}>Ticket Number</td><td style={val}>{p.ticket_number || ''}</td></tr>
                  <tr><td style={lbl}>Subject</td><td style={val}>{p.subject || ''}</td></tr>
                  <tr><td style={lbl}>Category</td><td style={valN}>{p.category || 'N/A'}</td></tr>
                  <tr><td style={lbl}>Priority</td><td style={valN}>
                    <span style={{ background: `${pc}20`, color: pc, padding: '4px 12px', borderRadius: '20px', fontWeight: 600 }}>
                      {pe} {(p.priority || '').toUpperCase()}
                    </span>
                  </td></tr>
                  <tr><td style={lbl}>Raised By</td><td style={valN}>{p.raised_by_name || 'Unknown'}</td></tr>
                  {sla ? (
                    <tr><td style={lbl}>SLA Due</td><td style={{ ...valN, color: '#dc2626', fontWeight: 600 }}>{sla}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </Section>
            <Text style={{ fontSize: '14px', color: '#64748b', marginTop: '20px' }}>
              Please review and take action as needed.
            </Text>
            <Section style={footerWrap}>
              <Text style={footer}>This is an automated notification from XBOOM Flow</Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif', color: '#333' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '20px' }
const header = { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '30px', borderRadius: '12px 12px 0 0', textAlign: 'center' as const }
const h1 = { color: '#fff', margin: 0, fontSize: '24px' }
const card = { background: '#f8fafc', padding: '30px', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 12px 12px' }
const p1 = { fontSize: '16px', margin: '0 0 20px' }
const detail = { background: '#fff', borderRadius: '8px', padding: '20px', margin: '20px 0' }
const lbl = { padding: '8px 0', color: '#64748b', fontSize: '14px' }
const val = { padding: '8px 0', fontWeight: 600 as const, fontSize: '14px' }
const valN = { padding: '8px 0', fontSize: '14px' }
const footerWrap = { marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', textAlign: 'center' as const }
const footer = { fontSize: '12px', color: '#94a3b8', margin: 0 }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `🎫 Ticket Assigned: ${d?.ticket_number || ''} - ${d?.subject || ''}`,
  displayName: 'Ticket — Assigned (internal)',
  transactional: true,
  previewData: {
    recipient_name: 'Alex',
    ticket_number: 'TCK-1001',
    subject: 'Login failure on portal',
    category: 'Authentication',
    priority: 'high',
    raised_by_name: 'Jane Doe',
  },
} satisfies TemplateEntry