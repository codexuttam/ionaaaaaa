# IONA — Water, Reimagined.

The IONA website: a one-page cinematic scroll film built in WebGL, followed by the range, a hospitality enquiry and the launch-list signup.

Stack: Vite, React, TypeScript, three.js with React Three Fiber and postprocessing, GSAP ScrollTrigger and Lenis. The output is a static site plus one small serverless function for the forms.

## Run it

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # type-checks and builds the static site into dist/
npm run preview    # http://127.0.0.1:4173 — dist/ with the production headers
```

## Deploy

`dist/` is a static site; the forms post to `/api/contact`, which runs as a serverless function. The function is ready for three hosts and is picked up automatically:

| Host | Function |
| --- | --- |
| Vercel | `api/contact.ts` |
| Netlify | `netlify/functions/contact.mts` |
| Cloudflare Pages | `functions/api/contact.ts` |

All three call the same handler, `server/contact.ts`.

**Form delivery** (set in the host's environment, never prefixed with `VITE_`), one of:

- `RESEND_API_KEY` and `CONTACT_TO` (and optionally `CONTACT_FROM`, a verified sender): messages arrive by email through Resend.
- `CONTACT_WEBHOOK_URL`: messages are posted as JSON to any inbox automation (Slack, Make, Zapier, a CRM).

Without either, the forms show their error line instead of pretending to send. Each message carries `kind`: `contact`, `launch` (launch-list signup: name, email, city) or `hospitality` (enquiry: also business name and requirements).

**Build-time settings** (`.env.example`):

- `VITE_SITE_URL` — the site's public address; adds the canonical link, `og:url`, absolute share image and `sitemap.xml`.
- `VITE_INSTAGRAM_URL`, `VITE_X_URL`, `VITE_YOUTUBE_URL` — optional social links in the footer.
- `VITE_PRIVACY_URL`, `VITE_TERMS_URL` — only if the legal pages live elsewhere.

Security headers and cache rules are in `public/_headers` (Netlify, Cloudflare Pages) and `vercel.json` (Vercel).

## Where things are

- `src/dom/copy.ts` — every word on the page, including both bottle labels.
- `src/experience/scenes.ts` — the film's scenes: order, scroll length, look. `UNPUBLISHED` holds the water-detail sections (alkaline, clarity and purification, minerals) until their formulation, testing and mineral details are confirmed; their copy is ready in `copy.ts` (`WATER_DETAILS`).
- `src/experience/timeline.ts` — camera, bottle and light moves, and the text reveals.
- `src/bottle/` — the cut-crystal IONA bottle, built in code (glass, labels, cap).
- `src/world/` — the backdrop pictures and the animated layers of each scene.
- `src/dom/` — navigation, text, range, hospitality and final sections, forms, footer.
- `public/` — backdrop pictures (`bg/`), lighting maps (`env/`), still frames for reduced motion and older devices (`stills/`), product images (`products/`), fonts, legal pages.

Visitors who prefer reduced motion, and browsers without WebGL, get a still sequence with all the same words.

Some code comments refer to asset tools (`scripts/*.mjs`) that render the pictures, stills and product images; those tools are kept in the production workspace and are not needed to run, build or deploy the site.
