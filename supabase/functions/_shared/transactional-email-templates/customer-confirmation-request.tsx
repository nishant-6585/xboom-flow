/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Link, Preview, Section, Text, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Customer order-confirmation request. Copy, CTA and subject match the legacy
// Resend HTML in send-customer-confirmation-request/index.ts.

interface Props {
  customer_name?: string
  order_number?: string
  link?: string
  /** Optional non-consuming portal-activation link. Rendered as a
   *  "Set your password" fallback for recipients who have not yet
   *  activated their portal account, so the confirm link is reachable. */
  activation_link?: string
}

const Email = (p: Props = {}) => {
  const name = p.customer_name || 'Customer'
  const orderNo = p.order_number || ''
  const link = p.link || 'https://xboomflow.com/portal/confirm'
  const activation = p.activation_link || ''
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Action required: confirm your Xboom order {orderNo}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading as="h2" style={h2}>Please confirm your order</Heading>
          <Text style={p1}>Hi {name},</Text>
          <Text style={p1}>
            Thank you for your order <b>{orderNo}</b> with Xboom.
          </Text>
          <Text style={p1}>
            Because this order includes a drone, we need you to confirm the order
            before we dispatch. Please log into your Xboom customer portal and click
            <i> Confirm your order</i>.
          </Text>
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={link} style={btn}>Confirm your order</Button>
          </Section>
          <Text style={sub}>
            Or open this link:<br />
            <Link href={link} style={{ color: '#0ea5e9' }}>{link}</Link>
          </Text>
          {activation ? (
            <Section style={activationBox}>
              <Text style={activationHead}>Haven't set your portal password yet?</Text>
              <Text style={activationBody}>
                Use the link below to activate your account, then you'll be able to
                confirm the order from your dashboard.
              </Text>
              <Section style={{ textAlign: 'center', margin: '14px 0 6px' }}>
                <Button href={activation} style={btnAlt}>Set your password</Button>
              </Section>
              <Text style={sub}>
                Or open this link:<br />
                <Link href={activation} style={{ color: '#0ea5e9' }}>{activation}</Link>
              </Text>
            </Section>
          ) : null}
          <Text style={foot}>Xboom · Order {orderNo}</Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#111' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '24px' }
const h2 = { margin: '0 0 12px', fontSize: '20px' }
const p1 = { margin: '0 0 10px', fontSize: '14px', lineHeight: 1.55 }
const btn = { background: '#111', color: '#fff', padding: '12px 20px', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 as const, fontSize: '15px', display: 'inline-block' }
const sub = { fontSize: '13px', color: '#555', margin: '0 0 20px' }
const foot = { color: '#888', fontSize: '12px', marginTop: '32px' }
const activationBox = { marginTop: '24px', padding: '16px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }
const activationHead = { margin: '0 0 6px', fontSize: '14px', fontWeight: 600 as const, color: '#0f172a' }
const activationBody = { margin: '0 0 8px', fontSize: '13px', lineHeight: 1.55, color: '#334155' }
const btnAlt = { background: '#0ea5e9', color: '#fff', padding: '10px 18px', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 as const, fontSize: '14px', display: 'inline-block' }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Action required: confirm your Xboom order ${d?.order_number || ''}`,
  displayName: 'Customer Order Confirmation Request',
  transactional: true,
  previewData: {
    customer_name: 'Jane Doe',
    order_number: 'ORD-1001',
    link: 'https://xboomflow.com/portal/confirm',
    activation_link: 'https://xboomflow.com/portal/activate?invite=demo-token',
  },
} satisfies TemplateEntry