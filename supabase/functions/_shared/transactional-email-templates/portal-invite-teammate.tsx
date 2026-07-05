/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Link, Preview, Section, Text, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// Portal teammate invite (customer-admin self-service). Copy, CTA and
// subject match the legacy Resend HTML in portal-invite-teammate/index.ts
// (renderInviteEmail). Distinct from `portal-invite` because the intro
// says "A teammate has invited you..." instead of "An admin ...".

interface Props {
  full_name?: string
  action_link?: string
  is_existing_user?: boolean
}

const Email = (p: Props = {}) => {
  const name = p.full_name || ''
  const link = p.action_link || 'https://xboomflow.com/portal/set-password'
  const existing = !!p.is_existing_user
  const heading = existing
    ? "You've been added to the XBOOM B2B Portal"
    : 'Welcome to the XBOOM B2B Portal'
  const intro = existing
    ? 'Your existing account has been linked to a B2B customer portal. Use the button below to set or reset your password and sign in.'
    : 'A teammate has invited you to access the XBOOM B2B Portal. Click below to set your password and sign in.'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{heading}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>
              x<span style={{ color: '#d4af37' }}>boom</span>
              <span style={tag}>CUSTOMER PORTAL</span>
            </Text>
          </Section>
          <Section style={card}>
            <Heading as="h1" style={h1}>{heading}</Heading>
            <Text style={p1}>Hi {name},</Text>
            <Text style={p1}>{intro}</Text>
            <Section style={{ margin: '0 0 32px' }}>
              <Button href={link} style={btn}>Set up my account</Button>
            </Section>
            <Text style={sub}>If the button doesn't work, copy and paste this link into your browser:</Text>
            <Text style={linkLine}>
              <Link href={link} style={{ color: '#0c1e3e' }}>{link}</Link>
            </Text>
            <Text style={fine}>This link will expire in 24 hours.</Text>
          </Section>
          <Section style={footWrap}>
            <Text style={foot}>XBOOM Flow · Customer Portal</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif', color: '#0f172a' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '24px' }
const header = { background: '#0c1e3e', padding: '24px 28px', borderRadius: '12px 12px 0 0' }
const brand = { margin: 0, color: '#ffffff', fontSize: '22px', fontWeight: 700 as const, letterSpacing: '.3px' }
const tag = { fontSize: '11px', letterSpacing: '1.5px', color: 'rgba(255,255,255,.7)', marginLeft: '10px', textTransform: 'uppercase' as const }
const card = { background: '#ffffff', padding: '32px 28px 8px', border: '1px solid #e2e8f0', borderTop: 'none' }
const h1 = { margin: '0 0 12px', fontSize: '22px', lineHeight: 1.3, color: '#0f172a' }
const p1 = { margin: '0 0 12px', fontSize: '15px', color: '#334155', lineHeight: 1.55 }
const btn = { background: '#0c1e3e', color: '#ffffff', textDecoration: 'none', padding: '12px 22px', borderRadius: '8px', fontWeight: 600 as const, fontSize: '15px', display: 'inline-block' }
const sub = { margin: '0 0 8px', fontSize: '13px', color: '#64748b' }
const linkLine = { margin: '0 0 24px', fontSize: '12px', color: '#475569', wordBreak: 'break-all' as const }
const fine = { margin: 0, fontSize: '12px', color: '#94a3b8' }
const footWrap = { padding: '24px 28px', borderTop: '1px solid #e2e8f0' }
const foot = { margin: 0, fontSize: '12px', color: '#94a3b8' }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d?.is_existing_user
      ? "You've been added to the XBOOM B2B Portal"
      : "You're invited to the XBOOM B2B Portal",
  displayName: 'Portal — Teammate Invite',
  transactional: true,
  previewData: {
    full_name: 'Jane Doe',
    action_link: 'https://xboomflow.com/portal/set-password?token_hash=demo&type=recovery',
    is_existing_user: false,
  },
} satisfies TemplateEntry
