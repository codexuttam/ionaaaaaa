import type { SceneId } from '../experience/scenes'

// Every string that renders on screen. Source: the website story copy of
// 10 October 2026 (introduction, the water within, the bottle and the moment,
// the invitation); the chrome (navigation, forms, footer) was added on the
// client's request and reuses the story's words wherever it can. Each array
// entry is one locked visual line on desktop and tablet. If a string is not
// here, it does not go on screen.

export const BRAND = 'IONA'
export const TAGLINE = 'WATER, REIMAGINED.'

/** 01 / Hero. */
export const HERO = {
  wordmark: 'IONA',
  subline: 'WATER, REIMAGINED.',
  lede: ['You choose what fills your day.', 'Give a little thought to what fills your glass.'],
  discover: 'Discover IONA',
  join: 'Join the Launch List',
  scroll: 'Scroll',
} as const

/** A story beat in the film (typeBlocks.tsx): the section name, the headline, the body. */
export type StoryCopy = { eyebrow: string; title: readonly string[]; body: readonly string[] }

/** 02 / The first detail (the cap close-up). */
export const CAP: StoryCopy = {
  eyebrow: 'THE FIRST DETAIL',
  title: ['Before the first sip,', 'there’s a first impression.'],
  body: ['A familiar gesture. A distinctive detail.', 'Your introduction to IONA begins here.'],
}

/** 03 / Ionized water. */
export const IONIZED: StoryCopy = {
  eyebrow: 'IONIZED WATER',
  title: ['Look closer.', 'There’s a story inside.'],
  body: ['Meet IONA’s ionized alkaline water.', 'The water at the heart of the design.'],
}

/**
 * 04-06 / The water within: alkaline water, clarity and purification, minerals. Unpublished
 * (experience/scenes.ts UNPUBLISHED): the story copy's editorial note asks for these sections to
 * link to confirmed formulation, testing and mineral details, and to wait until those are ready.
 */
export const WATER_DETAILS = {
  alkaline: {
    eyebrow: 'ALKALINE WATER',
    title: ['What’s inside matters.'],
    body: ['Get to know your water, beyond the label.', 'Explore IONA’s alkaline profile and the details behind every bottle.'],
    action: 'Explore the Water',
  },
  clean: {
    eyebrow: 'CLARITY & PURIFICATION',
    title: ['Good water deserves clear answers.'],
    body: ['What’s in it. How it’s treated. What’s tested.', 'Because choosing your water should begin with understanding it.'],
    action: 'Know Your Water',
  },
  minerals: {
    eyebrow: 'MINERALS',
    title: ['The details don’t end at the bottle.'],
    body: ['Take a closer look at IONA’s mineral composition.', 'Know what goes into the water you choose.'],
    action: 'Explore the Composition',
  },
} as const

/** 07 / The bottle reveal (under the three beams). */
export const REVEAL: StoryCopy = {
  eyebrow: 'THE BOTTLE REVEAL',
  title: ['Made to catch the light.', 'Designed to hold your attention.'],
  body: ['Distinctive facets. A considered silhouette.', 'A bottle with an identity of its own.', 'This is IONA.'],
}

/** 08 / The everyday moment. */
export const EVERYDAY: StoryCopy = {
  eyebrow: 'THE EVERYDAY MOMENT',
  title: ['Some moments deserve', 'your full attention.'],
  body: ['The first pause in a busy day.', 'A conversation that lasts longer than planned.', 'A table set for people you love.', 'Make room for the everyday.'],
}

/**
 * The film's earlier lines, back on its last beats at the client's request (the lines that make no
 * water claim): the carton, the bottle on the rock, the close-up, and the underwater ending.
 */
export const QUALITIES = { title: ['PURER.', 'SMARTER.', 'CLEANER.', 'BRIGHTER.'] } as const
export const STANDARD = { title: ['A HIGHER', 'STANDARD', 'OF WATER'] } as const
export const TOMORROW = { title: ['DESIGNED', 'FOR A BRIGHTER', 'TOMORROW'] } as const
export const CLOSING = { wordmark: 'IONA', subline: 'WATER, REIMAGINED.' } as const

/** Scene links shared by the menu and the footer. */
export type SceneLink = { id: SceneId; label: string }
/** A navigation link: a beat of the film, or the range after it. */
export type NavLink = { id: SceneId | 'range'; label: string }

export const NAV = {
  wordmark: 'IONA',
  links: [
    { id: 'cap', label: 'The Detail' },
    { id: 'ionized', label: 'The Water' },
    { id: 'spotlight', label: 'The Bottle' },
    { id: 'tomorrow', label: 'The Moment' },
    { id: 'range', label: 'The Range' },
  ] as readonly NavLink[],
  contact: 'Contact',
  menu: 'Menu',
  close: 'Close',
  menuLabel: 'Menu',
  primaryLabel: 'Sections',
} as const

export const FOOTER = {
  wordmark: 'IONA',
  subline: 'WATER, REIMAGINED.',
  explore: 'Explore',
  contact: 'Contact',
  privacy: 'Privacy',
  terms: 'Terms',
  copyright: '© IONA',
  story: 'Story',
  company: 'Company',
  follow: 'Follow',
  top: 'Back to Top',
  instagram: 'Instagram',
  x: 'X',
  youtube: 'YouTube',
  range: 'The Range',
  hospitality: 'Hospitality Enquiries',
  links: [
    { id: 'hero', label: 'Water, Reimagined.' },
    { id: 'cap', label: 'The First Detail' },
    { id: 'ionized', label: 'Ionized Water' },
    { id: 'spotlight', label: 'The Bottle Reveal' },
    { id: 'tomorrow', label: 'The Everyday Moment' },
  ] as readonly SceneLink[],
} as const

export const CHROME = {
  wordmark: 'IONA',
  sound: 'Sound',
  soundOn: 'Sound on',
  motion: 'Motion',
  motionOn: 'Motion on',
  skip: 'Skip to Footer',
} as const

export const CONTACT = {
  title: 'Contact',
  close: 'Close',
  name: 'Name',
  email: 'Email',
  message: 'Message',
  city: 'City',
  business: 'Business Name',
  requirements: 'Requirements',
  send: 'Send Message',
  sending: 'Sending…',
  success: 'Thank you. We will be in touch.',
  /** Placeholders show the expected pattern (web-design-guidelines). */
  namePlaceholder: 'Your name…',
  emailPlaceholder: 'name@example.com',
  messagePlaceholder: 'Your message…',
  cityPlaceholder: 'Your city…',
  businessPlaceholder: 'Hotel, restaurant or venue…',
  requirementsPlaceholder: 'Sizes, volumes, locations, timing…',
  /** Inline field errors: what is wrong and how to fix it. */
  nameError: 'Enter your name.',
  emailError: 'Enter an email address like name@example.com.',
  messageError: 'Write a short message.',
  cityError: 'Enter your city.',
  businessError: 'Enter your business name.',
  requirementsError: 'Tell us what you need.',
  /** Delivery failed (network, timeout, server): the next step, not only the problem. */
  error: 'Couldn’t send. Check your connection and try again.',
  /** The prelaunch forms: their own title, line, button and thank-you. */
  launch: {
    title: 'Join the Launch List',
    intro: 'Currently in development. Join the launch list for updates and availability.',
    send: 'Join the Launch List',
    success: 'Thank you. You are on the launch list.',
  },
  hospitality: {
    title: 'Hospitality Enquiries',
    intro: 'For hotels, restaurants and other hospitality businesses.',
    send: 'Send Enquiry',
    success: 'Thank you. We will be in touch.',
  },
} as const

/** Bottle label, front (bottle/labelTexture.ts), from the client's reference render "FRONT DESIGN", top to bottom. */
export const LABEL = {
  wordmark: 'IONA',
  type: ['IONIZED', 'ALKALINE WATER'],
  promise: ['HIGHER', 'HYDRATION', 'A BRIGHTER', 'TOMORROW'],
  volume: '1L',
} as const

/** Bottle label, back (bottle/labelTexture.ts), from the reference render "BACK DESIGN". In titles, \n breaks the line. */
export const LABEL_BACK = {
  wordmark: 'IONA',
  promise: ['HIGHER HYDRATION', 'A BRIGHTER TOMORROW'],
  story: { title: 'OUR STORY', text: ['IONA is a premium ionized alkaline', 'water crafted for a cleaner today', 'and a brighter tomorrow.'] },
  benefits: {
    title: 'KEY BENEFITS',
    items: [
      { icon: 'drop', title: 'IONIZED', text: 'Enhanced Purity' },
      { icon: 'ph', title: 'ALKALINE', text: 'Balanced Hydration' },
      { icon: 'leaf', title: 'CLEAN & PURE', text: 'No Added Minerals' },
      { icon: 'sun', title: 'A BRIGHTER\nTOMORROW', text: 'For a Healthier You' },
    ],
  },
  details: {
    title: 'PRODUCT DETAILS',
    rows: [
      ['Ingredients', 'Ionized Alkaline Water'],
      ['pH (at source)', '8.5 – 9.5 (approx.)'],
      ['TDS (at source)', '< 50 mg/L (approx.)'],
      ['Net Quantity', '1 L'],
    ],
  },
  storage: { title: 'STORAGE', text: ['Keep in a cool, clean and dry place.', 'Do not freeze. Best before 12 months', 'from the date of manufacture.'] },
  batch: {
    rows: [
      ['MFG. DATE', 'DD/MM/YYYY'],
      ['BATCH NO.', 'XXXXX'],
      ['MRP (₹)', 'XXX.00'],
    ],
    note: '(Incl. of all taxes)',
  },
  barcode: '8 906123 456789',
  maker: ['MANUFACTURED & MARKETED BY:', 'IONA BEVERAGES PVT. LTD.', 'Mumbai, India – 400001', 'For feedback or queries:', 'hello@iona.com | www.iona.com'],
} as const

/** Carton front: the only lines to set if the type is redrawn. */
export const CARTON = { wordmark: 'IONA', subline: 'WATER, REIMAGINED.' } as const

/**
 * 09 / The range (dom/Range.tsx): the planned sizes. Sizes and specifications come from the
 * client's companion site (iona-dark.vercel.app); IONA is in development, so the sizes are shown
 * as planned and every card leads to the launch list. `mm` sets each bottle's height on screen,
 * relative to the tallest; `image` names its render in public/products (scripts/products.mjs).
 * In `joinLabel`, {size} and {name} are filled in.
 */
export const RANGE = {
  eyebrow: 'THE RANGE',
  title: ['Your day doesn’t come in one size.', 'Neither does IONA.'],
  status: 'Currently in development. Join the launch list for updates and availability.',
  planned: 'Planned Size',
  join: 'Join the Launch List',
  joinLabel: 'Join the launch list for IONA {size}',
  alt: 'IONA {size} bottle',
  specs: { height: 'Height', weight: 'Filled Weight', cap: 'Closure' },
  items: [
    {
      size: '250',
      unit: 'ML',
      name: 'A moment of your own.',
      image: '250',
      text: 'For a meeting, a welcome, or a pause between plans.',
      mm: 162,
      height: '162 mm',
      weight: '290 g',
      cap: 'Aluminium Twist',
    },
    {
      size: '1',
      unit: 'L',
      name: 'A place at the table.',
      image: '1l',
      text: 'For long lunches, shared conversations, and the pleasure of hosting.',
      mm: 280,
      height: '280 mm',
      weight: '1040 g',
      cap: 'Reinforced Grip',
    },
  ],
} as const

/** 10 / Hospitality (dom/Invitation.tsx). */
export const HOSPITALITY = {
  eyebrow: 'HOSPITALITY',
  title: ['Your guests notice the details.', 'So do you.'],
  body: [
    'The setting. The service. What arrives at the table.',
    'Introduce IONA to your hotel, restaurant, or hospitality space – and make water part of the welcome.',
  ],
  action: 'Hospitality Enquiries',
} as const

/** 11 / Final scene and launch signup (dom/Invitation.tsx). */
export const FINAL = {
  title: ['You’ve met the idea.', 'Be first to hear about the launch.'],
  body: 'Join the IONA launch list for availability announcements and launch updates.',
  action: 'Join the Launch List',
  wordmark: 'IONA',
  subline: 'WATER, REIMAGINED.',
} as const

export const META = {
  title: 'IONA — Water, Reimagined.',
  description: 'IONA. Water, reimagined. You choose what fills your day. Give a little thought to what fills your glass.',
} as const
