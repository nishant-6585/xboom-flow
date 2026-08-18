/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  ticket_number?: string
  subject?: string
  priority?: string
  company_name?: string
  assignee_name?: string
  order_number?: string
  ticket_url?: string
}

const Email = (p: Props = {}) => {
  const subj = `Assigned to you: ${p.ticket_number || ''} — ${p.subject || ''}`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{subj}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h2" style={h2}>{subj}</Heading>
            <Text style={t}>
              {p.assignee_name ? `${p.assignee_name}, this` : 'This'} portal ticket from{' '}
              <b>{p.company_name || '—'}</b> is now yours.
            </Text>
            <Section style={metaBox}>
              <Text style={meta}><b>Priority:</b> {(p.priority || 'normal').toUpperCase()}</Text>
              {p.order_number ? (
                <Text style={meta}><b>Order:</b> {p.order_number}</Text>
              ) : null}
            </Section>
            {p.ticket_url ? (
              <Text style={t}><Link href={p.ticket_url} style={link}>Open ticket</Link></Text>
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
const metaBox = { backgroundColor: '#f9fafb', borderRadius: '8px', padding: '12px 16px', margin: '0 0 12px' }
const meta = { margin: '0 0 4px', fontSize: '13px', color: '#374151' }
const link = { color: '#0c2340' }
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const foot = { fontSize: '12px', color: '#6b7280', margin: 0 }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `Assigned to you: ${d?.ticket_number || ''} — ${d?.subject || ''}`,
  displayName: 'Portal — Ticket Assigned (internal)',
  transactional: true,
  previewData: {
    ticket_number: 'PT-3001',
    subject: 'When will the product dispatch?',
    priority: 'critical',
    company_name: 'Acme Robotics',
    assignee_name: 'Suman Das',
    order_number: 'ORD2600434',
    ticket_url: 'https://xboomflow.com/admin/portal-tickets/demo',
  },
} satisfies TemplateEntry
