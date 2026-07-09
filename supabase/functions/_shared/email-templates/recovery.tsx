/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
  requestedAt?: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
  requestedAt,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your password for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Reset your password</Heading>
        <Text style={text}>
          We received a request to reset your password for {siteName}. Click
          the button below to choose a new password.
        </Text>
        {requestedAt && (
          <Text style={metaText}>Requested at {requestedAt} IST.</Text>
        )}
        <Button style={button} href={confirmationUrl}>
          Reset Password
        </Button>
        <Text style={fallbackText}>
          If the button does not open, copy and paste this link into your browser:
          {' '}{confirmationUrl}
        </Text>
        <Text style={footer}>
          If you didn't request a password reset, you can safely ignore this
          email. Your password will not be changed.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
  color: '#1c1917',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = {
  fontFamily: '"Space Grotesk", "DM Sans", Arial, sans-serif',
  fontSize: '24px',
  fontWeight: 700 as const,
  color: '#1c1917',
  margin: '0 0 20px',
  letterSpacing: '-0.01em',
}
const text = {
  fontSize: '15px',
  color: '#57534e',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const metaText = {
  fontSize: '13px',
  color: '#78716c',
  lineHeight: '1.5',
  margin: '0 0 20px',
}
const button = {
  backgroundColor: '#f97316',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600 as const,
  borderRadius: '10px',
  padding: '13px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}
const fallbackText = {
  fontSize: '12px',
  color: '#78716c',
  lineHeight: '1.5',
  margin: '24px 0 0',
  wordBreak: 'break-all' as const,
}
const footer = {
  fontSize: '12px',
  color: '#a8a29e',
  margin: '32px 0 0',
  lineHeight: '1.5',
}
