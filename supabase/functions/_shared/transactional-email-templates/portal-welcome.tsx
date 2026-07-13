/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Link, Preview, Section, Text, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Lightweight portal welcome / activation email for website orders that do
// NOT require order confirmation (non-drone). Delivers only the
// "Set your password" activation link — no confirm-your-order content.

interface Props {
  customer_name?: string
  order_number?: string
  activation_link?: string
}

const Email = (p: Props = {}) => {
  const name = p.customer_name || 'Customer'
  const orderNo = p.order_number || ''
  const activation = p.activation_link || 'https://xboomflow.com/portal/activate'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Set your Xboom customer portal password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading as="h2" style={h2}>Welcome to the Xboom customer portal</Heading>
          <Text style={p1}>Hi {name},</Text>
          <Text style={p1}>
            Thanks for your order{orderNo ? <> <b>{orderNo}</b></> : null} with Xboom.
            To track your order, download invoices and manage support tickets,
            please activate your customer portal by setting a password.
          </Text>
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={activation} style={btn}>Set your password</Button>
          </Section>
          <Text style={sub}>
            Or open this link:<br />
            <Link href={activation} style={{ color: '#0ea5e9' }}>{activation}</Link>
          </Text>
          <Text style={foot}>Xboom{orderNo ? ` · Order ${orderNo}` : ''}</Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#111' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '24px' }
const h2 = { margin: '0 0 12px', fontSize: '20px' }
const p1 = { margin: '0 0 10px', fontSize: '14px', lineHeight: 1.55 }
const btn = { background: '#0ea5e9', color: '#fff', padding: '12px 20px', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 as const, fontSize: '15px', display: 'inline-block' }
const sub = { fontSize: '13px', color: '#555', margin: '0 0 20px' }
const foot = { color: '#888', fontSize: '12px', marginTop: '32px' }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Set your Xboom customer portal password${d?.order_number ? ` (order ${d.order_number})` : ''}`,
  displayName: 'Customer Portal Welcome',
  transactional: true,
  previewData: {
    customer_name: 'Jane Doe',
    order_number: 'ORD-1001',
    activation_link: 'https://xboomflow.com/portal/activate?invite=demo-token',
  },
} satisfies TemplateEntry