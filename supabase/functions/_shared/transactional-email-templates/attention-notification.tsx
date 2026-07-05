/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Internal ops alert — a Sales Arena user flagged a contact for immediate
// attention. Copy matches the legacy inline HTML in
// send-attention-notification/index.ts.

interface Props {
  customer_name?: string
  company?: string
  phone_number?: string
  email?: string
  product_name?: string
  source_type?: string
  marked_by_name?: string
}

const Email = (p: Props = {}) => {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`Attention: ${p.customer_name || ''}${p.company ? ` - ${p.company}` : ''}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading as="h2" style={{ margin: 0, color: '#ffffff', fontSize: '18px' }}>🚨 Attention Required</Heading>
          </Section>
          <Section style={card}>
            <Text style={line}><strong>Contact:</strong> {p.customer_name || '—'}</Text>
            {p.company ? <Text style={line}><strong>Company:</strong> {p.company}</Text> : null}
            {p.phone_number ? <Text style={line}><strong>Phone:</strong> {p.phone_number}</Text> : null}
            {p.email ? <Text style={line}><strong>Email:</strong> {p.email}</Text> : null}
            {p.product_name ? <Text style={line}><strong>Product:</strong> {p.product_name}</Text> : null}
            <Text style={line}><strong>Source:</strong> {p.source_type || '—'}</Text>
            <Text style={line}><strong>Flagged by:</strong> {p.marked_by_name || '—'}</Text>
            <Hr style={hr} />
            <Text style={fine}>This contact has been marked for immediate attention in XBoom Sales Arena.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial,Helvetica,sans-serif', color: '#111827' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '20px' }
const header = { background: '#dc2626', color: '#ffffff', padding: '16px 24px', borderRadius: '8px 8px 0 0' }
const card = { background: '#ffffff', border: '1px solid #e5e7eb', borderTop: 'none', padding: '24px', borderRadius: '0 0 8px 8px' }
const line = { margin: '0 0 6px', fontSize: '14px', color: '#111827' }
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '16px 0' }
const fine = { margin: 0, fontSize: '13px', color: '#6b7280' }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `🚨 Attention: ${d?.customer_name || ''}${d?.company ? ` - ${d.company}` : ''} [${d?.source_type || ''}]`.slice(0, 200),
  displayName: 'Sales — Attention Required (Internal)',
  transactional: true,
  previewData: {
    customer_name: 'Jane Doe',
    company: 'Acme Pvt Ltd',
    phone_number: '+91 98765 43210',
    email: 'jane@acme.example',
    product_name: 'DJI Mavic 3 Pro',
    source_type: 'WooCommerce',
    marked_by_name: 'Nishant',
  },
} satisfies TemplateEntry