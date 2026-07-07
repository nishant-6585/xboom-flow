/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Link, Preview, Section, Text, Button, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// HR staff/internal invite. Copy, CTA and subject match the legacy Resend
// HTML in send-invite-email/index.ts (buildHtml). Internal HR contact
// wording ("Contact your HR administrator") is preserved — this is an
// internal staff invite, not a customer email.

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
      <Preview>Welcome to XBOOM Flow — set your password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h1" style={h1}>
              Welcome to XBOOM Flow{name ? `, ${name}` : ''} 👋
            </Heading>
            <Text style={p1}>
              Your XBOOM Flow account has been approved. Click the button below to set your password and sign in.
              This link is valid for 24 hours.
            </Text>
            <Section style={{ margin: '24px 0' }}>
              <Button href={link} style={btn}>Set my password</Button>
            </Section>
            <Text style={sub}>Or copy and paste this link into your browser:</Text>
            <Text style={linkLine}>
              <Link href={link} style={{ color: '#374151' }}>{link}</Link>
            </Text>
            <Hr style={hr} />
            <Text style={fine}>
              Having trouble? Contact your HR administrator.<br />
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
  subject: 'Welcome to XBOOM Flow — set your password',
  displayName: 'HR — User Invite (Password Setup)',
  transactional: true,
  previewData: {
    name: 'Jane Doe',
    action_link: 'https://xboomflow.com/auth?token=demo',
    site_url: 'https://xboomflow.com',
  },
} satisfies TemplateEntry
