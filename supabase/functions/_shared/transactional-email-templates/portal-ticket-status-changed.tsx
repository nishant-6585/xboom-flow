/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  ticket_number?: string
  subject?: string
  new_status?: string
  note?: string
  ticket_url?: string
}

function humanStatus(s?: string) {
  if (!s) return ''
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

const Email = (p: Props = {}) => {
  const subj = `Ticket ${p.ticket_number || ''} — ${humanStatus(p.new_status)}`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{subj}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h2" style={h2}>{subj}</Heading>
            <Text style={t}>
              Update on <b>{p.ticket_number || ''}</b>
              {p.subject ? <> — <i>{p.subject}</i></> : null}.
            </Text>
            <Section style={noteBox}>
              <Text style={{ margin: 0 }}>Status: <b>{humanStatus(p.new_status)}</b></Text>
              {p.note ? (
                <Text style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{p.note}</Text>
              ) : null}
            </Section>
            {p.ticket_url ? (
              <Text style={t}><Link href={p.ticket_url} style={link}>View ticket</Link></Text>
            ) : null}
            <Hr style={hr} />
            <Text style={foot}>XBOOM Flow Customer Portal</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#1a1a2e' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '24px' }
const card = { border: '1px solid #e5e7eb', borderRadius: '12px', padding: '28px' }
const h2 = { margin: '0 0 12px', fontSize: '20px', color: '#0c2340' }
const t = { margin: '0 0 10px', fontSize: '14px' }
const noteBox = { background: '#f3f4f6', padding: '12px', borderRadius: '8px', margin: '10px 0' }
const link = { color: '#0c2340' }
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const foot = { fontSize: '12px', color: '#6b7280', margin: 0 }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `Ticket ${d?.ticket_number || ''} — ${humanStatus(d?.new_status)}`,
  displayName: 'Portal — Ticket Status Changed (customer)',
  transactional: true,
  previewData: {
    ticket_number: 'PT-3001',
    subject: 'Cannot download invoice',
    new_status: 'in_progress',
    note: 'Our team is looking into this and will update you shortly.',
    ticket_url: 'https://xboomflow.com/portal/tickets/demo',
  },
} satisfies TemplateEntry