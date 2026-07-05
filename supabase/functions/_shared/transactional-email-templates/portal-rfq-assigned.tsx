/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props { rfq_number?: string }

const Email = (p: Props = {}) => {
  const subject = `Your RFQ ${p.rfq_number || ''} is being worked on`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h2" style={h2}>{subject}</Heading>
            <Text style={t}>
              Good news — our team has picked up <b>{p.rfq_number || ''}</b> and will share a quote shortly.
            </Text>
            <Hr style={hr} />
            <Text style={foot}>XBOOM Flow Customer Portal</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#1a1a2e' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '24px' }
const card = { border: '1px solid #e5e7eb', borderRadius: '12px', padding: '28px' }
const h2 = { margin: '0 0 12px', fontSize: '20px', color: '#0c2340' }
const t = { margin: '0 0 10px', fontSize: '14px' }
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const foot = { fontSize: '12px', color: '#6b7280', margin: 0 }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Your RFQ ${d?.rfq_number || ''} is being worked on`,
  displayName: 'Portal — RFQ Assigned (customer)',
  transactional: true,
  previewData: { rfq_number: 'RFQ-2001' },
} satisfies TemplateEntry