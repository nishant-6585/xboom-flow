/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Internal notification. Faithful reproduction of the legacy Resend HTML
// in supabase/functions/send-ticket-email/index.ts (type=status_update).

interface Props {
  recipient_name?: string
  ticket_number?: string
  subject?: string
  old_status?: string
  new_status?: string
  updated_by_name?: string
  resolution_notes?: string
}

const fmtStatus = (s?: string) =>
  (s || '').replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())

const Email = (p: Props = {}) => {
  const closed = p.new_status === 'resolved' || p.new_status === 'closed'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Ticket {p.ticket_number || ''} status updated</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading as="h1" style={h1}>📋 Ticket Status Updated</Heading>
          </Section>
          <Section style={card}>
            <Text style={p1}>Hi <b>{p.recipient_name || 'Team Member'}</b>,</Text>
            <Text style={p1}>Your ticket has been updated:</Text>
            <Section style={detail}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={lbl}>Ticket Number</td><td style={val}>{p.ticket_number || ''}</td></tr>
                  <tr><td style={lbl}>Subject</td><td style={val}>{p.subject || ''}</td></tr>
                  <tr><td style={lbl}>Status Change</td><td style={valN}>
                    <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>{fmtStatus(p.old_status)}</span>
                    <span style={{ margin: '0 8px' }}>→</span>
                    <span style={{ background: '#10b98120', color: '#059669', padding: '4px 12px', borderRadius: '20px', fontWeight: 600 }}>{fmtStatus(p.new_status)}</span>
                  </td></tr>
                  <tr><td style={lbl}>Updated By</td><td style={valN}>{p.updated_by_name || 'Unknown'}</td></tr>
                  {p.resolution_notes ? (
                    <tr><td style={{ ...lbl, verticalAlign: 'top' }}>Resolution Notes</td><td style={valN}>{p.resolution_notes}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </Section>
            {closed ? (
              <Section style={{ background: '#ecfdf5', borderRadius: '8px', padding: '15px', margin: '20px 0', textAlign: 'center' as const }}>
                <Text style={{ color: '#059669', fontWeight: 600, margin: 0 }}>
                  ✅ This ticket has been {p.new_status}!
                </Text>
              </Section>
            ) : null}
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
const header = { background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '30px', borderRadius: '12px 12px 0 0', textAlign: 'center' as const }
const h1 = { color: '#fff', margin: 0, fontSize: '24px' }
const card = { background: '#f8fafc', padding: '30px', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 12px 12px' }
const p1 = { fontSize: '16px', margin: '0 0 20px' }
const detail = { background: '#fff', borderRadius: '8px', padding: '20px', margin: '20px 0', borderLeft: '4px solid #10b981' }
const lbl = { padding: '8px 0', color: '#64748b', fontSize: '14px' }
const val = { padding: '8px 0', fontWeight: 600 as const, fontSize: '14px' }
const valN = { padding: '8px 0', fontSize: '14px' }
const footerWrap = { marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', textAlign: 'center' as const }
const footer = { fontSize: '12px', color: '#94a3b8', margin: 0 }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `📋 Ticket ${d?.ticket_number || ''} - Status Updated to ${fmtStatus(d?.new_status)}`,
  displayName: 'Ticket — Status Update (internal)',
  transactional: true,
  previewData: {
    recipient_name: 'Alex',
    ticket_number: 'TCK-1001',
    subject: 'Login failure on portal',
    old_status: 'in_progress',
    new_status: 'resolved',
    updated_by_name: 'Jane Doe',
    resolution_notes: 'Password reset resolved the issue.',
  },
} satisfies TemplateEntry