// The contact endpoint, host independent. One handler built on the web
// standard Request/Response, shared by the serverless adapters
// (functions/api/contact.ts for Cloudflare Pages, netlify/functions/contact.mts,
// api/contact.ts for Vercel) and, for the validation rules only, by the Vite dev
// and preview stand-in in vite.config.ts.
//
// Delivery, in order of preference, from the host's environment variables:
//   RESEND_API_KEY + CONTACT_TO (+ optional CONTACT_FROM)  transactional mail through the Resend HTTP API
//   CONTACT_WEBHOOK_URL                                    a JSON POST to any inbox automation (Slack, Make, Zapier, a CRM)
// With neither configured the handler answers 503 and the dialog shows its error line.
// It never reports success for a message that was not delivered.

import { saveContactSubmission } from './db.ts'

/** Which form sent it: a message, a launch-list signup, or a hospitality enquiry (src/dom/ContactDialog.tsx). */
export type ContactKind = 'contact' | 'launch' | 'hospitality'

/** `message` is the visitor's message, or a hospitality enquiry's requirements; fields a form does not have are empty. */
export type ContactMessage = { kind: ContactKind; name: string; email: string; city: string; business: string; message: string }

export type ContactEnv = {
  RESEND_API_KEY?: string
  CONTACT_TO?: string
  CONTACT_FROM?: string
  CONTACT_WEBHOOK_URL?: string
  MONGODB_URI?: string
}

/** Largest request body accepted, in bytes. */
export const MAX_BODY = 20_000
const MAX_NAME = 200
const MAX_EMAIL = 254
const MAX_CITY = 120
const MAX_BUSINESS = 200
const MAX_MESSAGE = 5_000

/** The fields each form must fill, besides name and email. */
const REQUIRED: Record<ContactKind, readonly ('city' | 'business' | 'message')[]> = {
  contact: ['message'],
  launch: ['city'],
  hospitality: ['city', 'business', 'message'],
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(CONTROL, '').trim().slice(0, max) : '')

/**
 * Validate a parsed JSON body (docs/04 "Contact": every field of the form at least one
 * character, email matches a simple pattern). A body without a known `kind` is a plain
 * message. `spam` is true when the honeypot field was filled: the caller answers as if it
 * had sent and drops the message.
 */
export function parseContact(body: unknown): { ok: true; message: ContactMessage; spam: boolean } | { ok: false } {
  if (!body || typeof body !== 'object') return { ok: false }
  const data = body as Record<string, unknown>
  const kind: ContactKind = data.kind === 'launch' || data.kind === 'hospitality' ? data.kind : 'contact'
  const m: ContactMessage = {
    kind,
    name: clean(data.name, MAX_NAME),
    email: clean(data.email, MAX_EMAIL),
    city: kind === 'contact' ? '' : clean(data.city, MAX_CITY),
    business: kind === 'hospitality' ? clean(data.business, MAX_BUSINESS) : '',
    message: kind === 'launch' ? '' : clean(data.message, MAX_MESSAGE),
  }
  if (!m.name || !EMAIL.test(m.email) || REQUIRED[kind].some((f) => !m[f])) return { ok: false }
  const spam = typeof data.company === 'string' && data.company.trim().length > 0
  return { ok: true, message: m, spam }
}

const SUBJECT: Record<ContactKind, (m: ContactMessage) => string> = {
  contact: (m) => `IONA contact: ${m.name}`,
  launch: (m) => `IONA launch list: ${m.name}, ${m.city}`,
  hospitality: (m) => `IONA hospitality enquiry: ${m.business}, ${m.city}`,
}

/** The sender's details as labelled rows, the filled ones only. */
function details(m: ContactMessage): [string, string][] {
  const rows: [string, string][] = [
    ['Name', m.name],
    ['Email', m.email],
    ['City', m.city],
    ['Business', m.business],
  ]
  return rows.filter(([, v]) => v)
}

const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

async function sendResend(env: ContactEnv, m: ContactMessage): Promise<boolean> {
  const to = env.CONTACT_TO!.split(',').map((s) => s.trim()).filter(Boolean)
  const label = m.kind === 'hospitality' ? 'Requirements' : 'Message'
  const rows = details(m)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.CONTACT_FROM || 'IONA website <onboarding@resend.dev>',
      to,
      reply_to: m.email,
      subject: SUBJECT[m.kind](m),
      text: rows.map(([k, v]) => `${k}: ${v}\n`).join('') + (m.message ? `\n${label}:\n${m.message}\n` : ''),
      html:
        `<p>${rows.map(([k, v]) => `<strong>${k}:</strong> ${escapeHtml(v)}`).join('<br>')}</p>` +
        (m.message ? `<p><strong>${label}:</strong><br>${escapeHtml(m.message).replace(/\n/g, '<br>')}</p>` : ''),
    }),
  })
  return res.ok
}

async function sendWebhook(env: ContactEnv, m: ContactMessage): Promise<boolean> {
  const res = await fetch(env.CONTACT_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'iona-website', receivedAt: new Date().toISOString(), ...m }),
  })
  return res.ok
}

/** POST /api/contact. Any other method answers 405. */
export async function handleContact(request: Request, env: ContactEnv): Promise<Response> {
  if (request.method !== 'POST') return json(405, { ok: false })
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY) return json(413, { ok: false })
  let text: string
  try {
    text = await request.text()
  } catch {
    return json(400, { ok: false })
  }
  if (text.length > MAX_BODY) return json(413, { ok: false })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json(400, { ok: false })
  }
  const parsed = parseContact(body)
  if (!parsed.ok) return json(400, { ok: false })
  // a bot that filled the hidden field gets the success answer and nothing is sent
  if (parsed.spam) return json(200, { ok: true })

  const mongoUri = env.MONGODB_URI || process.env.MONGODB_URI
  const viaMongo = Boolean(mongoUri)
  const viaMail = Boolean(env.RESEND_API_KEY && env.CONTACT_TO)
  const viaWebhook = Boolean(env.CONTACT_WEBHOOK_URL)
  if (!viaMongo && !viaMail && !viaWebhook) return json(503, { ok: false, error: 'contact delivery is not configured' })

  try {
    if (viaMongo) {
      await saveContactSubmission(parsed.message, mongoUri)
    }
    if (viaMail) {
      await sendResend(env, parsed.message)
    } else if (viaWebhook) {
      await sendWebhook(env, parsed.message)
    }
    return json(200, { ok: true })
  } catch (err) {
    console.error('[contact] failed to process submission:', err)
    return json(500, { ok: false })
  }
}
