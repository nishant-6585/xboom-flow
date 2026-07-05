/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button, Hr, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// KYC onboarding / invite email. Copy, CTAs, and subject match the
// legacy Resend HTML in supabase/functions/kyc-handler/index.ts.

interface Props {
  customerName?: string
  orderNumber?: string
  setupLink?: string
  kycLink?: string
  confirmLink?: string
  needsConfirmation?: boolean
}

const Email = (p: Props = {}) => {
  const name = p.customerName || ''
  const orderNo = p.orderNumber || ''
  const needs = !!p.needsConfirmation
  // Guard against missing order_number so we never render a bare
  // "We've received your order ." — the trailing period without a value
  // looks like a bug to the customer. Fall back to a neutral phrasing.
  const orderLine = orderNo
    ? (<>We've received your order <b>{orderNo}</b>. Welcome aboard — your XBOOM Customer Portal is ready.</>)
    : (<>We've received your order. Welcome aboard — your XBOOM Customer Portal is ready.</>)
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Welcome to XBOOM — set up your portal & complete KYC</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>
              x<span style={{ color: '#d4af37' }}>boom</span>
              <span style={tag}>CUSTOMER PORTAL</span>
            </Text>
          </Section>
          <Section style={card}>
            <Heading as="h1" style={h1}>Thank you for your order, {name}!</Heading>
            <Text style={body1}>
              {orderLine}
            </Text>
            <Text style={body1}>
              Before we begin processing, please complete a quick KYC by uploading your Aadhaar card. This usually takes under a minute.
            </Text>
            <Section style={callout}>
              <Text style={calloutTitle}>Getting started</Text>
              {needs ? (
                <ol style={ol}>
                  <li>Set your password using the button below.</li>
                  <li>Sign in and open <b>KYC Verification</b>.</li>
                  <li>Complete KYC — this also confirms your order automatically.</li>
                </ol>
              ) : (
                <ol style={ol}>
                  <li>Set your password using the button below.</li>
                  <li>Sign in and head to <b>KYC Verification</b>.</li>
                  <li>Enter your 12-digit Aadhaar number and upload your Aadhaar card.</li>
                </ol>
              )}
              {needs ? (
                <Text style={{ margin: '10px 0 0', fontSize: '13px', color: '#b45309' }}>
                  Submitting your KYC will auto-confirm this order and we'll start processing right away.
                </Text>
              ) : null}
            </Section>
            <Section style={{ margin: '0 0 14px' }}>
              <Button href={p.setupLink || '#'} style={btn}>Set my password</Button>
            </Section>
            <Section style={{ margin: '0 0 22px' }}>
              <Button href={p.kycLink || '#'} style={btn}>Upload KYC documents</Button>
            </Section>
            {needs && p.confirmLink ? (
              <Section style={{ margin: '0 0 22px' }}>
                <Button href={p.confirmLink} style={btn}>Confirm my order</Button>
              </Section>
            ) : null}
            <Text style={fine}>
              Order processing may require KYC approval. Questions? Email us at{' '}
              <Link href="mailto:support@xboom.in" style={{ color: '#0ea5e9' }}>support@xboom.in</Link>.
            </Text>
          </Section>
          <Hr style={hr} />
          <Text style={footer}>XBOOM Flow · Customer Portal · Reply to <Link href="mailto:support@xboom.in" style={{ color: '#0ea5e9' }}>support@xboom.in</Link></Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif', color: '#0f172a' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '24px' }
const header = { background: '#0c1e3e', padding: '22px 28px', borderRadius: '12px 12px 0 0' }
const brand = { margin: 0, color: '#fff', fontSize: '22px', fontWeight: 700 as const, letterSpacing: '.3px' }
const tag = { fontSize: '11px', letterSpacing: '1.5px', color: 'rgba(255,255,255,.7)', marginLeft: '10px' }
const card = { background: '#ffffff', padding: '28px', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 12px 12px' }
const h1 = { margin: '0 0 12px', fontSize: '22px', color: '#0f172a' }
const body1 = { margin: '0 0 12px', fontSize: '15px', color: '#334155', lineHeight: 1.55 }
const callout = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 18px', margin: '0 0 22px' }
const calloutTitle = { margin: '0 0 10px', fontWeight: 600 as const, color: '#0f172a', fontSize: '14px' }
const ol = { margin: 0, paddingLeft: '18px', fontSize: '14px', color: '#334155', lineHeight: 1.7 }
const btn = { background: '#0c1e3e', color: '#fff', textDecoration: 'none', padding: '12px 22px', borderRadius: '8px', fontWeight: 600 as const, fontSize: '15px', display: 'inline-block' }
const fine = { margin: 0, fontSize: '12px', color: '#94a3b8' }
const hr = { border: 'none', borderTop: '1px solid #e2e8f0', margin: '18px 0' }
const footer = { fontSize: '12px', color: '#94a3b8', textAlign: 'center' as const }

export const template = {
  component: Email,
  subject: 'Welcome to XBOOM — set up your portal & complete KYC',
  displayName: 'KYC — Onboarding Invite',
  transactional: true,
  previewData: {
    customerName: 'Jane Doe',
    orderNumber: 'ORD-1001',
    setupLink: 'https://xboomflow.com/portal/activate?invite=demo',
    kycLink: 'https://xboomflow.com/portal/kyc',
    confirmLink: 'https://xboomflow.com/portal/confirm',
    needsConfirmation: false,
  },
} satisfies TemplateEntry