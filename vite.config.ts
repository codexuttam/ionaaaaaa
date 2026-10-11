import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MAX_BODY, parseContact } from './server/contact.ts'
import { saveContactSubmission } from './server/db.ts'
import { handleAdmin } from './server/admin.ts'

// Dev and preview handler for /api/admin
function adminEndpoint(mongoUri?: string, adminPassword?: string): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith('/api/admin')) return next()
    let bodyText = ''
    req.on('data', (chunk: Buffer) => {
      bodyText += chunk.toString('utf8')
    })
    req.on('end', async () => {
      try {
        const fullUrl = `http://${req.headers.host || '127.0.0.1:5173'}${req.url}`
        const webReq = new Request(fullUrl, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: req.method !== 'GET' && req.method !== 'HEAD' && bodyText ? bodyText : undefined,
        })
        const response = await handleAdmin(webReq, {
          MONGODB_URI: mongoUri,
          ADMIN_PASSWORD: adminPassword,
        })
        res.statusCode = response.status
        response.headers.forEach((val, key) => res.setHeader(key, val))
        const resText = await response.text()
        res.end(resText)
      } catch (err) {
        console.error('[admin] Endpoint error:', err)
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Internal admin handler error' }))
      }
    })
  }
  return {
    name: 'iona-admin-endpoint',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

// Dev and preview handler for POST /api/contact. It validates submissions and saves them to MongoDB if configured.
function contactEndpoint(mongoUri?: string): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url !== '/api/contact') return next()
    const answer = (status: number, ok: boolean) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ ok }))
    }
    if (req.method !== 'POST') return answer(405, false)
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8')
      if (body.length > MAX_BODY) req.destroy()
    })
    req.on('end', async () => {
      let parsed: ReturnType<typeof parseContact>
      try {
        parsed = parseContact(JSON.parse(body))
      } catch {
        parsed = { ok: false }
      }
      if (!parsed.ok) return answer(400, false)
      if (parsed.spam) return answer(200, true)

      if (mongoUri) {
        try {
          await saveContactSubmission(parsed.message, mongoUri)
          console.log('[contact] saved to MongoDB Atlas:', parsed.message.email, `(${parsed.message.kind})`)
        } catch (err) {
          console.error('[contact] MongoDB error:', err)
          return answer(500, false)
        }
      } else {
        console.log('[contact] stand-in (MONGODB_URI not set):', JSON.stringify(parsed.message))
      }
      answer(200, true)
    })
  }
  return {
    name: 'iona-contact-endpoint',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

/** schema.org description of the brand and the page, with absolute URLs. */
function jsonLd(origin: string): string {
  const description = 'IONA. Water, reimagined. You choose what fills your day. Give a little thought to what fills your glass.'
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: 'IONA',
        url: `${origin}/`,
        logo: `${origin}/icons/apple-touch-icon.png`,
        slogan: 'Water, reimagined.',
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: 'IONA',
        url: `${origin}/`,
        description,
        publisher: { '@id': `${origin}/#organization` },
        inLanguage: 'en',
      },
      {
        '@type': 'Product',
        name: 'IONA Ionized Alkaline Water',
        brand: { '@type': 'Brand', name: 'IONA' },
        description,
        image: `${origin}/og.jpg`,
      },
    ],
  }) // static copy only: nothing in it can close the script element
}

// Absolute URLs need the deployed origin: VITE_SITE_URL (see .env.example). With it set the build
// gets a canonical link, og:url, absolute og:image / twitter:image, robots.txt with the sitemap
// line, and sitemap.xml. Without it the build still works, with relative social images and a warning.
function siteMeta(siteUrl: string): Plugin {
  const origin = siteUrl.trim().replace(/\/+$/, '')
  return {
    name: 'iona-site-meta',
    transformIndexHtml(html) {
      if (!origin) return html
      return {
        html: html.replace(/content="(\/og\.jpg)"/g, (_m, p: string) => `content="${origin}${p}"`),
        tags: [
          { tag: 'link', attrs: { rel: 'canonical', href: `${origin}/` }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: `${origin}/` }, injectTo: 'head' },
          // structured data (a data block, not a script: the CSP does not apply to it)
          { tag: 'script', attrs: { type: 'application/ld+json' }, children: jsonLd(origin), injectTo: 'head' },
        ],
      }
    },
    generateBundle() {
      if (!origin) this.warn('VITE_SITE_URL is not set: canonical, og:url and sitemap.xml are omitted and og:image stays relative')
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ''}` })
      if (origin) {
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${origin}/</loc></url>\n</urlset>\n`,
        })
      }
    },
  }
}

// `vite preview` serves dist/ with the production response headers from public/_headers (the
// Cloudflare Pages / Netlify format; vercel.json mirrors it), so the CSP and the cache rules are
// exercised in the browser before a deploy.
function previewHeaders(): Plugin {
  type Rule = { test: RegExp; headers: [string, string][] }
  const parse = (text: string): Rule[] => {
    const rules: Rule[] = []
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.trim() || raw.trim().startsWith('#')) continue
      if (!/^\s/.test(raw)) {
        const pattern = raw.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
        rules.push({ test: new RegExp(`^${pattern}$`), headers: [] })
        continue
      }
      const i = raw.indexOf(':')
      if (i > 0 && rules.length) rules[rules.length - 1].headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()])
    }
    return rules
  }
  return {
    name: 'iona-preview-headers',
    configurePreviewServer(server) {
      const file = resolve(import.meta.dirname, 'public', '_headers')
      const rules = existsSync(file) ? parse(readFileSync(file, 'utf8')) : []
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '/').split('?')[0]
        for (const rule of rules) if (rule.test.test(path)) for (const [k, v] of rule.headers) res.setHeader(k, v)
        next()
      })
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const allEnv = loadEnv(mode, process.cwd(), '')
  const mongoUri = allEnv.MONGODB_URI || process.env.MONGODB_URI
  const adminPassword = allEnv.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD
  return {
    plugins: [
      react(),
      adminEndpoint(mongoUri, adminPassword),
      contactEndpoint(mongoUri),
      siteMeta(env.VITE_SITE_URL ?? ''),
      previewHeaders(),
    ],
    server: { port: 5173, strictPort: true, host: '127.0.0.1' },
    preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        // production ships index.html only
        input: command === 'build' ? { main: resolve(import.meta.dirname, 'index.html') } : undefined,
        output: {
          // vendor code in its own long-lived chunks: a copy or scene edit redeploys only the app chunk,
          // and the browser fetches the pieces in parallel from the modulepreload hints (first match wins)
          codeSplitting: {
            groups: [
              { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ },
              { name: 'post', test: /[\\/]node_modules[\\/](postprocessing|@react-three[\\/]postprocessing)[\\/]/ },
              { name: 'motion', test: /[\\/]node_modules[\\/](gsap|@gsap|lenis)[\\/]/ },
              { name: 'react', test: /[\\/]node_modules[\\/]/ },
            ],
          },
        },
      },
    },
  }
})
