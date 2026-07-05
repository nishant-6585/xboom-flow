/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Link, Preview, Section, Text, Button, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Admin-triggered password reset. Copy, CTA and subject match the legacy
// Resend HTML in send-password-reset-email/index.ts (buildHtml). Internal
// contact wording ("contact HR at hr@xboom.in") is preserved — this is a
// staff-facing password reset for XBOOM Flow accounts, not a customer
// portal reset.

interface Props {
  name?: string
  action_link?: string
  site_url?: string
}

const Email = (p: Props = {}) => {
  const name = p.name || ''
  const link = p.action_link || 'https://xboomflow.com/auth'
  const site = p.site_url || 'https://xboomflow.com'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Reset your XBOOM Flow password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h1" style={h1}>
              Reset your XBOOM Flow password{name ? `, ${name}` : ''}
            </Heading>
            <Text style={p1}>
              An administrator requested a password reset for your XBOOM Flow account.
              Click the button below to choose a new password. This link is valid for 24 hours.
            </Text>
            <Section style={{ margin: '24px 0' }}>
              <Button href={link} style={btn}>Reset my password</Button>
            </Section>
            <Text style={sub}>Or copy and paste this link into your browser:</Text>
            <Text style={linkLine}>
              <Link href={link} style={{ color: '#374151' }}>{link}</Link>
            </Text>
            <Hr style={hr} />
            <Text style={fine}>
              Didn't request this? You can safely ignore this email or contact HR at hr@xboom.in.<br />
              Portal: <Link href={site} style={{ color: '#0f172a' }}>{site}</Link>
            </Text>
          </Section>
          <Text style={foot}>© XBOOM Utilities</Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial,Helvetica,sans-serif', color: '#111827' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '32px 12px' }
const card = { background: '#ffffff', borderRadius: '12px', padding: '32px' }
const h1 = { margin: '0 0 8px', fontSize: '22px', color: '#0f172a' }
const p1 = { margin: '0 0 16px', fontSize: '14px', lineHeight: '22px', color: '#374151' }
const btn = { background: '#0f172a', color: '#ffffff', textDecoration: 'none', padding: '12px 22px', borderRadius: '8px', fontWeight: 600 as const, display: 'inline-block' }
const sub = { margin: '0 0 8px', fontSize: '12px', color: '#6b7280' }
const linkLine = { margin: '0 0 20px', fontSize: '12px', color: '#374151', wordBreak: 'break-all' as const }
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const fine = { margin: 0, fontSize: '12px', color: '#6b7280', lineHeight: '20px' }
const foot = { margin: '16px 0 0', fontSize: '11px', color: '#9ca3af', textAlign: 'center' as const }

export const template = {
  component: Email,
  subject: 'Reset your XBOOM Flow password',
  displayName: 'HR — Password Reset (Admin-Triggered)',
  transactional: true,
  previewData: {
    name: 'Jane Doe',
    action_link: 'https://xboomflow.com/auth?token=demo',
    site_url: 'https://xboomflow.com',
  },
} satisfies TemplateEntry