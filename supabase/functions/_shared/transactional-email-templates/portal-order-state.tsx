/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  order_number?: string
  current_state?: string
  customer_facing_note?: string
  customer_facing_eta?: string
  order_url?: string
}

const humanState = (s?: string) => (s || '').replace(/_/g, ' ')

const Email = (p: Props = {}) => {
  const state = humanState(p.current_state)
  const subject = `Order ${p.order_number || ''} update: ${state}`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h2" style={h2}>{subject}</Heading>
            <Text style={t}>Hi,</Text>
            <Text style={t}>Your order <b>{p.order_number || ''}</b> is now <b>{state}</b>.</Text>
            {p.customer_facing_note ? (
              <Section style={noteBox}><Text style={{ margin: 0 }}>{p.customer_facing_note}</Text></Section>
            ) : null}
            {p.customer_facing_eta ? (
              <Text style={t}>Expected by <b>{p.customer_facing_eta}</b>.</Text>
            ) : null}
            {p.order_url ? (
              <Section style={{ margin: '18px 0' }}>
                <Button href={p.order_url} style={btn}>View order</Button>
              </Section>
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
const btn = { background: '#0c2340', color: '#fff', padding: '10px 18px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block' as const }
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const foot = { fontSize: '12px', color: '#6b7280', margin: 0 }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Order ${d?.order_number || ''} update: ${humanState(d?.current_state)}`,
  displayName: 'Portal — Order State Changed (customer)',
  transactional: true,
  previewData: {
    order_number: 'PO-1001',
    current_state: 'in_production',
    customer_facing_note: 'Your unit enters QA next week.',
    customer_facing_eta: '15 Aug 2026',
    order_url: 'https://xboomflow.com/portal/orders/demo',
  },
} satisfies TemplateEntry