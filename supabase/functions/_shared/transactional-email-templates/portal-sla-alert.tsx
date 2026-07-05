/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Internal ops alert — a portal ticket has breached its first-response or
// resolution SLA. Copy matches the legacy inline HTML in
// portal-sla-monitor/index.ts.

interface Props {
  label?: string           // "First-response SLA breached" | "Resolution SLA breached"
  ticket_number?: string
  subject?: string
  account_name?: string
  priority?: string
  ticket_url?: string
}

const Email = (p: Props = {}) => {
  const label = p.label || 'SLA breached'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`[SLA] ${label}: ${p.ticket_number ?? ''}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h2" style={h2}>{label}</Heading>
            <Text style={line}><strong>Ticket:</strong> {p.ticket_number || '—'} — {p.subject || '—'}</Text>
            <Text style={line}><strong>Account:</strong> {p.account_name || '—'}</Text>
            <Text style={line}><strong>Priority:</strong> {p.priority || '—'}</Text>
            <Section style={{ margin: '18px 0 4px' }}>
              <Button href={p.ticket_url || 'https://xboomflow.com/admin/portal-tickets'} style={btn}>Open ticket</Button>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial,Helvetica,sans-serif', color: '#111827' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '24px' }
const card = { background: '#ffffff', padding: '8px' }
const h2 = { margin: '0 0 12px', color: '#b91c1c', fontSize: '20px' }
const line = { margin: '0 0 6px', fontSize: '14px', color: '#111827' }
const btn = { background: '#0c2340', color: '#ffffff', textDecoration: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 600 as const, display: 'inline-block' }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `[SLA] ${d?.label || 'SLA breached'}: ${d?.ticket_number || ''}`.trim(),
  displayName: 'Portal — SLA Breach Alert (Internal)',
  transactional: true,
  previewData: {
    label: 'First-response SLA breached',
    ticket_number: 'TCK-123',
    subject: 'Order delivery delayed',
    account_name: 'Demo Account Pvt Ltd',
    priority: 'high',
    ticket_url: 'https://xboomflow.com/admin/portal-tickets/demo',
  },
} satisfies TemplateEntry