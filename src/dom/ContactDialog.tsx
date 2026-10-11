import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { duck } from '../experience/audio'
import { transport } from '../experience/scroller'
import { CONTACT_HASH, CONTACT_OPEN_EVENT, openContact, takeContactOpener, takeContactOptions, type ContactKind } from './contact'
import { CONTACT } from './copy'

// The contact overlay (docs/04 "Contact"): a native modal dialog with three forms,
// a message (Contact), the launch list and a hospitality enquiry (both opened from
// "The Range"). Focus goes to the title on open and back to the opener on close;
// the address carries the form's hash while it is open (#contact, #launch-list,
// #hospitality), and arriving on one opens that form. Validation is inline: each
// field that fails says what to enter, and focus moves to the first one. Submit
// posts JSON to /api/contact: the Vite stand-in answers in dev and preview,
// server/contact.ts through a serverless adapter in production. A hidden "company"
// field is the honeypot: people never see it, bots fill it, and the server drops those.

type Status = 'idle' | 'sending' | 'sent' | 'error'
type Field = 'name' | 'email' | 'phone' | 'city' | 'business' | 'message'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** An Indian mobile number after the fixed +91 prefix: 10 digits, starting 6-9. */
const PHONE = /^[6-9]\d{9}$/
/** Milliseconds before a hanging request is given up and the error line shows. */
const SEND_TIMEOUT = 15_000
/** The server's limits (server/contact.ts): the form never allows what the server would refuse. */
const LIMITS: Record<Field, number> = { name: 200, email: 254, phone: 10, city: 120, business: 200, message: 5000 }
/** The fields of each form, in order; every one is required. */
const FIELDS: Record<ContactKind, readonly Field[]> = {
  contact: ['name', 'email', 'phone', 'message'],
  launch: ['name', 'email', 'phone', 'city'],
  hospitality: ['name', 'email', 'phone', 'city', 'business', 'message'],
}
/** Title, line under it, button and thank-you of each form. */
const FORM: Record<ContactKind, { title: string; intro?: string; send: string; success: string }> = {
  contact: { title: CONTACT.title, send: CONTACT.send, success: CONTACT.success },
  launch: CONTACT.launch,
  hospitality: CONTACT.hospitality,
}
const HASHES = Object.values(CONTACT_HASH)

export function ContactDialog() {
  const ref = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [kind, setKind] = useState<ContactKind>('contact')
  const [status, setStatus] = useState<Status>('idle')
  const [invalid, setInvalid] = useState<Partial<Record<Field, true>>>({})

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const open = () => {
      const next = takeContactOptions().kind ?? 'contact'
      if (dialog.open) return
      setKind(next)
      setStatus('idle')
      setInvalid({})
      dialog.showModal()
      duck(true)
      transport.lenis?.stop()
      document.documentElement.dataset.dialog = 'open'
      titleRef.current?.focus()
      if (location.hash !== CONTACT_HASH[next]) history.replaceState(history.state, '', CONTACT_HASH[next])
    }
    const onClose = () => {
      duck(false)
      transport.lenis?.start()
      delete document.documentElement.dataset.dialog
      if (HASHES.includes(location.hash)) history.replaceState(history.state, '', location.pathname + location.search)
      const opener = takeContactOpener()
      opener?.focus()
      // the keyboard may have resized the viewport on mobile (docs/10)
      ScrollTrigger.refresh()
    }
    const onClick = (e: MouseEvent) => {
      // a click on the backdrop (outside the panel) closes
      if (e.target === dialog) dialog.close()
    }
    document.addEventListener(CONTACT_OPEN_EVENT, open)
    dialog.addEventListener('close', onClose)
    dialog.addEventListener('click', onClick)
    // a shared link to a form opens it once the page is up
    const arriving = (Object.keys(CONTACT_HASH) as ContactKind[]).find((k) => CONTACT_HASH[k] === location.hash)
    const arrival = arriving ? window.setTimeout(() => openContact(null, { kind: arriving }), 300) : 0
    return () => {
      window.clearTimeout(arrival)
      document.removeEventListener(CONTACT_OPEN_EVENT, open)
      dialog.removeEventListener('close', onClose)
      dialog.removeEventListener('click', onClick)
    }
  }, [])

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const value = (f: Field) => String(data.get(f) ?? '').trim()
    const bad: Partial<Record<Field, true>> = {}
    for (const f of FIELDS[kind]) {
      const v = value(f)
      const ok = f === 'email' ? EMAIL.test(v) : f === 'phone' ? PHONE.test(v) : Boolean(v)
      if (!ok) bad[f] = true
    }
    setInvalid(bad)
    if (Object.keys(bad).length) {
      // after React has rendered the hints, so the field's description is read with it
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setStatus('sending')
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), SEND_TIMEOUT)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          ...Object.fromEntries(FIELDS[kind].map((f) => [f, f === 'phone' ? `+91 ${value(f)}` : value(f)])),
          company: String(data.get('company') ?? ''),
        }),
        signal: controller.signal,
      })
      const json = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean }
      setStatus(res.ok && json.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    } finally {
      window.clearTimeout(timer)
    }
  }

  const clear = (field: Field) => () => {
    if (invalid[field]) setInvalid((v) => ({ ...v, [field]: undefined }))
  }

  const hospitality = kind === 'hospitality'
  /** Label, placeholder and error of each field; a hospitality enquiry's message is its requirements. */
  const SPEC: Record<Field, { label: string; placeholder: string; error: string }> = {
    name: { label: CONTACT.name, placeholder: CONTACT.namePlaceholder, error: CONTACT.nameError },
    email: { label: CONTACT.email, placeholder: CONTACT.emailPlaceholder, error: CONTACT.emailError },
    phone: { label: CONTACT.phone, placeholder: CONTACT.phonePlaceholder, error: CONTACT.phoneError },
    city: { label: CONTACT.city, placeholder: CONTACT.cityPlaceholder, error: CONTACT.cityError },
    business: { label: CONTACT.business, placeholder: CONTACT.businessPlaceholder, error: CONTACT.businessError },
    message: hospitality
      ? { label: CONTACT.requirements, placeholder: CONTACT.requirementsPlaceholder, error: CONTACT.requirementsError }
      : { label: CONTACT.message, placeholder: CONTACT.messagePlaceholder, error: CONTACT.messageError },
  }

  /** One labelled field with its inline error. */
  const field = (name: Field, control: (a11y: { 'aria-invalid'?: 'true'; 'aria-describedby'?: string }) => ReactNode) => (
    <label className="contact__field" key={name}>
      <span className="contact__label">{SPEC[name].label}</span>
      {control({ 'aria-invalid': invalid[name] ? 'true' : undefined, 'aria-describedby': invalid[name] ? `contact-${name}-error` : undefined })}
      {invalid[name] && (
        <span className="contact__hint" id={`contact-${name}-error`}>
          {SPEC[name].error}
        </span>
      )}
    </label>
  )

  const control = (name: Field) =>
    field(name, (a11y) => {
      const common = { name, maxLength: LIMITS[name], placeholder: SPEC[name].placeholder, onInput: clear(name), ...a11y }
      if (name === 'message') return <textarea rows={hospitality ? 2 : 3} autoComplete="off" {...common} />
      if (name === 'email') return <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} {...common} />
      if (name === 'phone')
        return (
          <span className="contact__phone">
            <span className="contact__phone-prefix" aria-hidden="true">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              pattern="[6-9][0-9]{9}"
              aria-label={`${SPEC.phone.label} (+91)`}
              {...common}
              onInput={(e) => {
                // digits only, at most 10: a pasted "+91 98765-43210" becomes "9876543210"
                const el = e.currentTarget
                let d = el.value.replace(/\D/g, '')
                if (d.length > 10 && d.startsWith('91')) d = d.slice(2)
                el.value = d.slice(0, 10)
                clear('phone')()
              }}
            />
          </span>
        )
      const auto = { name: 'name', city: 'address-level2', business: 'organization' }[name]
      return <input type="text" autoComplete={auto} {...common} />
    })

  const form = FORM[kind]
  return (
    <dialog id="contact" className="contact" ref={ref} aria-labelledby="contact-title" data-kind={kind}>
      <div className="contact__panel">
        <button type="button" className="control contact__close" onClick={() => ref.current?.close()}>
          {CONTACT.close}
        </button>
        <h2 id="contact-title" className="contact__title" ref={titleRef} tabIndex={-1}>
          {form.title}
        </h2>
        {form.intro && status !== 'sent' && <p className="contact__intro">{form.intro}</p>}
        {status === 'sent' ? (
          <p className="contact__success" role="status">
            {form.success}
          </p>
        ) : (
          <form className="contact__form" onSubmit={onSubmit} noValidate>
            {FIELDS[kind].map(control)}
            <div className="contact__hp" aria-hidden="true">
              <label>
                Company
                <input name="company" type="text" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <div className="contact__actions">
              <button type="submit" className="btn btn--primary contact__send" disabled={status === 'sending'} aria-busy={status === 'sending'}>
                {status === 'sending' ? CONTACT.sending : form.send}
              </button>
              {status === 'error' && (
                <span className="contact__error" role="alert">
                  {CONTACT.error}
                </span>
              )}
            </div>
          </form>
        )}
      </div>
    </dialog>
  )
}
