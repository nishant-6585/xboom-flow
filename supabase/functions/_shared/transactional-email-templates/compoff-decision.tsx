/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  decision?: 'approved' | 'rejected'
  earned_date?: string        // e.g. "Jul 12, 2026"
  earned_type?: string        // "holiday" | "weekend"
  actor_name?: string
  comment?: string
  reason?: string
  site_url?: string
}

const Email = (p: Props = {}) => {
  const decision = p.decision === 'rejected' ? 'rejected' : 'approved'
  const isApproved = decision === 'approved'
  const name = p.name || ''
  const site = p.site_url || 'https://xboomflow.com'
  const title = isApproved
    ? 'Your comp-off credit was approved'
    : 'Your comp-off credit was rejected'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h1" style={h1}>
              {isApproved ? '✅ ' : '❌ '}{title}
            </Heading>
            <Text style={p1}>
              Hi {name || 'there'},
            </Text>
            <Text style={p1}>
              Your comp-off credit for work on{' '}
              <strong>{p.earned_date || 'the requested day'}</strong>
              {p.earned_type ? ` (${p.earned_type})` : ''}{' '}
              has been <strong>{decision}</strong>
              {p.actor_name ? ` by ${p.actor_name}` : ' by HR'}.
            </Text>

            {isApproved && p.comment ? (
              <Section style={boxOk}>
                <Text style={boxLabel}>HR comment</Text>
                <Text style={boxBody}>{p.comment}</Text>
              </Section>
            ) : null}

            {!isApproved && p.reason ? (
              <Section style={boxErr}>
                <Text style={boxLabel}>Reason for rejection</Text>
                <Text style={boxBody}>{p.reason}</Text>
              </Section>
            ) : null}

            <Text style={p1}>
              {isApproved
                ? 'This credit is now available for you to apply as comp-off leave.'
                : 'If you believe this is a mistake, please reach out to your reporting manager or HR.'}
            </Text>

            <Hr style={hr} />
            <Text style={fine}>
              XBOOM Flow — HR Portal<br />
              <a href={site} style={{ color: '#0f172a' }}>{site}</a>
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
const h1 = { margin: '0 0 12px', fontSize: '22px', color: '#0f172a' }
const p1 = { margin: '0 0 12px', fontSize: '14px', lineHeight: '22px', color: '#374151' }
const boxOk = { background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '12px 14px', margin: '16px 0' }
const boxErr = { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px', margin: '16px 0' }
const boxLabel = { margin: '0 0 4px', fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '.04em', color: '#6b7280' }
const boxBody = { margin: 0, fontSize: '14px', color: '#111827', whiteSpace: 'pre-wrap' as const }
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const fine = { margin: 0, fontSize: '12px', color: '#6b7280', lineHeight: '20px' }
const foot = { margin: '16px 0 0', fontSize: '11px', color: '#9ca3af', textAlign: 'center' as const }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d?.decision === 'rejected'
      ? 'Your comp-off credit was rejected'
      : 'Your comp-off credit was approved',
  displayName: 'HR — Comp-off Decision',
  transactional: true,
  previewData: {
    name: 'Jane Doe',
    decision: 'approved',
    earned_date: 'Jul 12, 2026',
    earned_type: 'weekend',
    actor_name: 'Priya (HR)',
    comment: 'Approved — thanks for covering the release.',
    site_url: 'https://xboomflow.com',
  },
} satisfies TemplateEntry