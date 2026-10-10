// One way to open the contact overlay from anywhere in the DOM layer (closing
// lockup, footer, chrome, the range's launch-list and hospitality buttons). The
// dialog listens for the event and returns focus to the element that opened it
// when it closes.

export const CONTACT_OPEN_EVENT = 'iona:contact-open'

/** Which form the dialog shows: a message, the launch list (Range.tsx), or a hospitality enquiry. */
export type ContactKind = 'contact' | 'launch' | 'hospitality'

/** The address while each form is open; arriving on it opens that form. */
export const CONTACT_HASH: Readonly<Record<ContactKind, string>> = { contact: '#contact', launch: '#launch-list', hospitality: '#hospitality' }

export type ContactOptions = {
  kind?: ContactKind
}

let opener: HTMLElement | null = null
let pending: ContactOptions = {}

export function openContact(from?: HTMLElement | null, options: ContactOptions = {}): void {
  opener = from ?? (document.activeElement as HTMLElement | null)
  pending = options
  document.dispatchEvent(new CustomEvent(CONTACT_OPEN_EVENT))
}

/** The control that opened the dialog, for focus return. Cleared once read. */
export function takeContactOpener(): HTMLElement | null {
  const el = opener
  opener = null
  return el
}

/** The options of the latest open request. Cleared once read. */
export function takeContactOptions(): ContactOptions {
  const o = pending
  pending = {}
  return o
}
