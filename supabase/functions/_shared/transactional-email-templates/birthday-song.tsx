/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  song_url?: string
  song_title?: string
  expires_hint?: string
  site_url?: string
  photo_url?: string
  greeting_message?: string
}

const Email = (p: Props = {}) => {
  const name = p.name || 'there'
  const site = p.site_url || 'https://xboomflow.com'
  const url = p.song_url || site
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>🎂 Your birthday card from the team is here</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Heading as="h1" style={h1}>🎂 Happy Birthday, {name}!</Heading>
            {p.photo_url ? (
              <Section style={{ textAlign: 'center', margin: '0 0 16px' }}>
                <Img
                  src={p.photo_url}
                  alt={`Photo of ${name}`}
                  width="180"
                  style={photo}
                />
              </Section>
            ) : null}
            {p.greeting_message ? (
              p.greeting_message.split(/\n+/).map((line, i) => (
                <Text key={i} style={p1}>{line}</Text>
              ))
            ) : p.song_url ? (
              <Text style={p1}>
                The team put together a personalized birthday song just for you.
                Tap below to listen or download it — it's yours to keep.
              </Text>
            ) : (
              <Text style={p1}>
                Wishing you a fantastic birthday filled with joy and cake — have an
                amazing year ahead! 🎉 With warm wishes, Team XBoom.
              </Text>
            )}
            {p.song_url ? (
              <>
                {p.song_title ? (
                  <Text style={songTitle}>🎵 {p.song_title}</Text>
                ) : null}
                <Section style={{ textAlign: 'center', margin: '20px 0' }}>
                  <Button href={url} style={btn}>
                    Listen / Download song
                  </Button>
                </Section>
                <Text style={fine}>
                  {p.expires_hint || 'This link works for the next 7 days.'}
                </Text>
              </>
            ) : null}
            <Hr style={hr} />
            <Text style={fine}>
              XBOOM Flow — with warm wishes from the whole team 💖<br />
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
const h1 = { margin: '0 0 12px', fontSize: '22px', color: '#be185d' }
const p1 = { margin: '0 0 12px', fontSize: '14px', lineHeight: '22px', color: '#374151' }
const songTitle = { margin: '0 0 8px', fontSize: '14px', color: '#0f172a', fontWeight: 600 }
const photo = {
  borderRadius: '12px', maxWidth: '180px', width: '100%',
  border: '3px solid #fbcfe8', display: 'inline-block',
}
const btn = {
  background: '#ec4899', color: '#ffffff', padding: '12px 22px', borderRadius: '8px',
  fontSize: '14px', fontWeight: 600, textDecoration: 'none', display: 'inline-block',
}
const hr = { border: 'none', borderTop: '1px solid #e5e7eb', margin: '24px 0' }
const fine = { margin: 0, fontSize: '12px', color: '#6b7280', lineHeight: '20px' }
const foot = { margin: '16px 0 0', fontSize: '11px', color: '#9ca3af', textAlign: 'center' as const }

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d?.name ? `🎂 Happy Birthday ${d.name} — a card from the team` : '🎂 Your birthday card is here',
  displayName: 'HR — Birthday Card',
  transactional: true,
  previewData: {
    name: 'Jane',
    song_title: 'AI birthday song for Jane Doe',
    song_url: 'https://example.com/song.mp3',
    photo_url: 'https://placehold.co/180x180.png',
    greeting_message:
      'Happy birthday, Jane! The whole team hopes your day is filled with cake and good company. 🎉\nWith warm wishes, Team XBoom',
    expires_hint: 'This link works for the next 7 days.',
    site_url: 'https://xboomflow.com',
  },
} satisfies TemplateEntry