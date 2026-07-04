/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  decision?: 'approved' | 'rejected'
  name?: string
  reason?: string
  portalLink?: string
}

const Email = (p: Props = {}) => {
  const decision = p.decision === 'rejected' ? 'rejected' : 'approved'
  const name = p.name || ''
  const portalLink = p.portalLink || 'https://xboomflow.com/portal/kyc'
  const title = decision === 'approved' ? 'KYC Approved' : 'KYC Rejected'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>x<span style={{ color: '#d4af37' }}>boom</span><span style={tag}>{title.toUpperCase()}</span></Text>
          </Section>
          <Section style={card}>
            {decision === 'approved' ? (
              <>
                <Heading as="h1" style={h1}>✅ Your KYC has been approved</Heading>
                <Text style={body1}>
                  Hi {name}, your KYC verification is complete. Your orders will continue to be processed normally — no further action needed.
                </Text>
                <Section><Button href={portalLink} style={btn}>View in portal</Button></Section>
              </>
            ) : (
              <>
                <Heading as="h1" style={h1}>Action needed: KYC was rejected</Heading>
                <Text style={body1}>Hi {name}, your KYC submission could not be approved.</Text>
                <Section style={reject}>
                  <Text style={{ margin: 0, color: '#7f1d1d', fontSize: '14px' }}>
                    <b>Reason:</b> {p.reason || ''}
                  </Text>
                </Section>
                <Text style={body1}>Please re-upload your Aadhaar card from the portal so we can review again.</Text>
                <Section><Button href={portalLink} style={btn}>Re-upload KYC</Button></Section>
              </>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif', color: '#0f172a' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '24px' }
const header = { background: '#0c1e3e', padding: '22px 28px', borderRadius: '12px 12px 0 0' }
const brand = { margin: 0, color: '#fff', fontSize: '20px', fontWeight: 700 as const }
const tag = { fontSize: '11px', letterSpacing: '1.5px', color: 'rgba(255,255,255,.7)', marginLeft: '8px' }
const card = { background: '#ffffff', padding: '28px', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 12px 12px' }
const h1 = { margin: '0 0 12px', fontSize: '22px' }
const body1 = { margin: '0 0 16px', fontSize: '15px', color: '#334155', lineHeight: 1.55 }
const btn = { background: '#0c1e3e', color: '#fff', textDecoration: 'none', padding: '12px 22px', borderRadius: '8px', fontWeight: 600 as const, fontSize: '15px', display: 'inline-block' }
const reject = { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 16px', margin: '0 0 18px' }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d?.decision === 'rejected'
      ? 'Action needed: KYC was rejected'
      : 'Your KYC has been approved',
  displayName: 'KYC — Status',
  transactional: true,
  previewData: { decision: 'approved', name: 'Jane' },
} satisfies TemplateEntry