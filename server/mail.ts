// Form emails through the company's own mailbox (GoDaddy) over SMTP.
//
// For every form submission (contact, launch list, hospitality) two emails go out:
//   1. a notification to the company inbox (CONTACT_TO, default SMTP_USER) with every detail
//      the visitor typed; "Reply" in the inbox answers the visitor directly;
//   2. a confirmation to the visitor, from the company address, saying the message arrived
//      (turn off with CONTACT_AUTOREPLY=false).
//
// Environment (server side only, never prefix with VITE_):
//   SMTP_USER   the Titan mailbox, e.g. info@ionadrinks.com
//   SMTP_PASS   that mailbox's password (or a Titan app password)
//   SMTP_HOST   default smtpout.secureserver.net (GoDaddy; the domain's MX is secureserver.net)
//   SMTP_PORT   default 465 (SSL); 587 uses STARTTLS
//   CONTACT_TO  where notifications go, comma separated; default SMTP_USER
//   CONTACT_AUTOREPLY  'false' to skip the visitor confirmation

import nodemailer from 'nodemailer'
import type { ContactKind, ContactMessage } from './contact.ts'

export type MailEnv = {
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  CONTACT_TO?: string
  CONTACT_AUTOREPLY?: string
}

/** True when the mailbox credentials are set. */
export const smtpConfigured = (env: MailEnv): boolean => Boolean(env.SMTP_USER && env.SMTP_PASS)

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

const FORM_NAME: Record<ContactKind, string> = {
  contact: 'Contact message',
  launch: 'Launch list signup',
  hospitality: 'Hospitality enquiry',
}

const SUBJECT: Record<ContactKind, (m: ContactMessage) => string> = {
  contact: (m) => `New contact message: ${m.name}`,
  launch: (m) => `New launch list signup: ${m.name}, ${m.city}`,
  hospitality: (m) => `New hospitality enquiry: ${m.business}, ${m.city}`,
}

const CONFIRM: Record<ContactKind, { subject: string; line: string }> = {
  contact: {
    subject: 'We received your message – IONA',
    line: 'Thank you for reaching out to IONA. We have received your message and will get back to you soon.',
  },
  launch: {
    subject: 'You are on the IONA launch list',
    line: 'Thank you for joining the IONA launch list. We will keep you posted on our launch and availability in your city.',
  },
  hospitality: {
    subject: 'We received your hospitality enquiry – IONA',
    line: 'Thank you for your hospitality enquiry. Our team will review your requirements and get in touch with you shortly.',
  },
}

function rows(m: ContactMessage): [string, string][] {
  const label = m.kind === 'hospitality' ? 'Requirements' : 'Message'
  const all: [string, string][] = [
    ['Form', FORM_NAME[m.kind]],
    ['Name', m.name],
    ['Email', m.email],
    ['Phone', m.phone],
    ['City', m.city],
    ['Business', m.business],
    [label, m.message],
  ]
  return all.filter(([, v]) => v)
}

const table = (r: [string, string][]): string =>
  `<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${r
    .map(
      ([k, v]) =>
        `<tr><td style="color:#666;vertical-align:top;white-space:nowrap"><strong>${k}</strong></td><td>${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('')}</table>`

/**
 * Send the notification to the company inbox and, unless disabled, the confirmation to the
 * visitor. Throws if the notification fails; a failed confirmation is only logged.
 */
export async function sendFormMails(env: MailEnv, m: ContactMessage): Promise<void> {
  const port = Number(env.SMTP_PORT || 465)
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtpout.secureserver.net',
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
  })
  const from = { name: 'IONA', address: env.SMTP_USER! }
  const to = (env.CONTACT_TO || env.SMTP_USER!).split(',').map((s) => s.trim()).filter(Boolean)
  const r = rows(m)

  await transport.sendMail({
    from: { name: 'IONA website', address: env.SMTP_USER! },
    to,
    replyTo: { name: m.name, address: m.email },
    subject: SUBJECT[m.kind](m),
    text: r.map(([k, v]) => `${k}: ${v}`).join('\n'),
    html: `<p style="font-family:Arial,sans-serif">A new form was submitted on the IONA website.</p>${table(r)}`,
  })

  if (env.CONTACT_AUTOREPLY === 'false') return
  const c = CONFIRM[m.kind]
  try {
    await transport.sendMail({
      from,
      to: { name: m.name, address: m.email },
      replyTo: to[0],
      subject: c.subject,
      text: `Hi ${m.name},\n\n${c.line}\n\nWhat you sent us:\n${r
        .filter(([k]) => k !== 'Form')
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')}\n\nWarm regards,\nTeam IONA\n${to[0]}`,
      html:
        `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.5">` +
        `<p>Hi ${escapeHtml(m.name)},</p><p>${c.line}</p><p style="color:#666">What you sent us:</p>` +
        table(r.filter(([k]) => k !== 'Form')) +
        `<p>Warm regards,<br>Team IONA<br><a href="mailto:${to[0]}">${to[0]}</a></p></div>`,
    })
  } catch (err) {
    console.error('[contact] confirmation email to visitor failed:', err)
  }
}
