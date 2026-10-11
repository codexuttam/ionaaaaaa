// Universal Vercel serverless adapter: bridges between Node.js (req, res)
// and Web Standard (Request, Response) signatures seamlessly.

export function vercelHandler<E extends Record<string, unknown>>(
  fn: (request: Request, env: E) => Promise<Response>,
  getEnv: () => E
) {
  const handler = async function (req: any, res?: any): Promise<any> {
    const env = getEnv()

    // 1. Web Standard execution (Edge or Node fetch handler)
    if (!res || typeof res.status !== 'function' || typeof req.text === 'function') {
      return fn(req as Request, env)
    }

    // 2. Node.js execution (Vercel Node runtime passing IncomingMessage & ServerResponse)
    try {
      const host = req.headers?.host || 'localhost'
      const proto = req.headers?.['x-forwarded-proto'] || 'https'
      const rawUrl = req.url || '/'
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${proto}://${host}${rawUrl}`

      let bodyText: string | undefined = undefined
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.body !== undefined && req.body !== null) {
          bodyText = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
        } else if (typeof req[Symbol.asyncIterator] === 'function') {
          const chunks: any[] = []
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
          }
          if (chunks.length > 0) {
            bodyText = Buffer.concat(chunks).toString('utf-8')
          }
        }
      }

      const headers = new Headers()
      if (req.headers) {
        for (const [key, value] of Object.entries(req.headers)) {
          if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v)
          } else if (value !== undefined) {
            headers.set(key, String(value))
          }
        }
      }

      const webReq = new Request(fullUrl, {
        method: req.method || 'GET',
        headers,
        body: bodyText,
      })

      const webRes = await fn(webReq, env)

      res.status(webRes.status)
      webRes.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })

      const responseText = await webRes.text()
      res.end(responseText)
    } catch (err) {
      console.error('[adapter] Function error:', err)
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: 'Internal server error' })
      }
    }
  }

  return handler
}
