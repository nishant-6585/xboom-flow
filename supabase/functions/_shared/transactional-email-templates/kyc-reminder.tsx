/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props { name?: string; daysOld?: number; kycLink?: string }

const Email = (p: Props = {}) => {
  const name = p.name || 'there'
  const days = p.daysOld ?? 1
  const link = p.kycLink || 'https://xboomflow.com/portal/kyc'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Reminder: upload your Aadhaar to complete KYC</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>x<span style={{ color: '#d4af37' }}>boom</span><span style={tag}>KYC REMINDER</span></Text>
          </Section>
          <Section style={card}>
            <Heading as="h1" style={h1}>Quick reminder — your KYC isn't finished yet</Heading>
            <Text style={body1}>
              Hi {name}, it's been {days} day{days === 1 ? '' : 's'} since your order. We still need your Aadhaar card to keep things moving smoothly.
            </Text>
            <Section style={{ margin: '0' }}>
              <Button href={link} style={btn}>Upload KYC now</Button>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif', color: '#0f172a' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '24px' }
const header = { background: '#0c1e3e', padding: '22px 28px', borderRadius: '12px 12px 0 0' }
const brand = { margin: 0, color: '#fff', fontSize: '20px', fontWeight: 700 as const }
const tag = { fontSize: '11px', letterSpacing: '1.5px', color: 'rgba(255,255,255,.7)', marginLeft: '8px' }
const card = { background: '#ffffff', padding: '28px', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 12px 12px' }
const h1 = { margin: '0 0 10px', fontSize: '20px' }
const body1 = { margin: '0 0 16px', fontSize: '14px', color: '#334155', lineHeight: 1.55 }
const btn = { background: '#0c1e3e', color: '#fff', textDecoration: 'none', padding: '11px 20px', borderRadius: '8px', fontWeight: 600 as const, fontSize: '14px', display: 'inline-block' }

export const template = {
  component: Email,
  subject: 'Reminder: upload your Aadhaar to complete KYC',
  displayName: 'KYC — Reminder',
  transactional: true,
  previewData: { name: 'Jane', daysOld: 3 },
} satisfies TemplateEntry