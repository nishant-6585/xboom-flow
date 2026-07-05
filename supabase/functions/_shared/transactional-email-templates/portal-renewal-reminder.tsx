/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Periodic renewal reminder — DaaS / AMC expiring within 30 days. NOT
// transactional: suppression + unsubscribe footer apply. The sender also
// checks per-contact `email_renewals` preference before enqueueing.

interface Props {
  label?: string          // "DaaS subscription" | "AMC contract"
  order_number?: string
  expires_on?: string
  order_url?: string
}

const Email = (p: Props = {}) => {
  const label = p.label || 'Service'
  const expires = p.expires_on || ''
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`Action needed: ${label} expiring on ${expires}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h2" style={h2}>{label} expiry reminder</Heading>
            <Text style={p1}>
              Your {label} on order <strong>{p.order_number || '—'}</strong> expires on <strong>{expires || '—'}</strong>.
            </Text>
            <Text style={p1}>
              Please reach out to your account manager to renew and avoid any service disruption.
            </Text>
            <Section style={{ margin: '18px 0 4px' }}>
              <Button href={p.order_url || 'https://xboomflow.com/portal/orders'} style={btn}>View order</Button>
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
const h2 = { margin: '0 0 12px', color: '#0c2340', fontSize: '20px' }
const p1 = { margin: '0 0 10px', fontSize: '14px', color: '#374151', lineHeight: '22px' }
const btn = { background: '#0c2340', color: '#ffffff', textDecoration: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 600 as const, display: 'inline-block' }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `Action needed: ${d?.label || 'Service'} expiring on ${d?.expires_on || ''}`.trim(),
  displayName: 'Portal — Renewal Reminder (Periodic)',
  // NOT transactional — respects suppression, includes unsubscribe footer.
  transactional: false,
  previewData: {
    label: 'DaaS subscription',
    order_number: 'ORD-1234',
    expires_on: '2026-08-15',
    order_url: 'https://xboomflow.com/portal/orders/demo',
  },
} satisfies TemplateEntry