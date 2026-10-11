import { getAdminDashboardData, deleteAdminRecord } from './db.ts'

export type AdminEnv = {
  MONGODB_URI?: string
  ADMIN_PASSWORD?: string
}

export const DEFAULT_ADMIN_PASSWORD = 'Iona2026!S1dAdmin#PureWater'

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function verifyAuth(request: Request, env: AdminEnv): boolean {
  const expected = env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (token && token === expected) {
    return true
  }

  // Also check URL search param if present (e.g. for direct downloads)
  const url = new URL(request.url, 'https://iona.local')
  const queryToken = url.searchParams.get('token')
  return queryToken === expected
}

export async function handleAdmin(request: Request, env: AdminEnv): Promise<Response> {
  const url = new URL(request.url, 'https://iona.local')
  const path = url.pathname.replace(/\/+$/, '')
  const mongoUri = env.MONGODB_URI || process.env.MONGODB_URI

  // 1. Login endpoint
  if (path.endsWith('/login') && request.method === 'POST') {
    try {
      const body = (await request.json()) as { password?: string }
      const expected = env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD
      if (body.password === expected) {
        return json(200, { ok: true, token: expected })
      }
      return json(401, { ok: false, error: 'Invalid password' })
    } catch {
      return json(400, { ok: false, error: 'Invalid request body' })
    }
  }

  // All other endpoints require authentication
  if (!verifyAuth(request, env)) {
    return json(401, { ok: false, error: 'Unauthorized' })
  }

  // 2. Fetch all dashboard data
  if ((path.endsWith('/data') || path === '/api/admin') && request.method === 'GET') {
    try {
      const data = await getAdminDashboardData(mongoUri)
      return json(200, { ok: true, data })
    } catch (err) {
      console.error('[admin] Failed to fetch data:', err)
      return json(500, { ok: false, error: 'Database fetch error' })
    }
  }

  // 3. Delete record endpoint
  if (path.endsWith('/delete') && request.method === 'POST') {
    try {
      const body = (await request.json()) as { collection?: string; id?: string }
      if (!body.collection || !body.id) {
        return json(400, { ok: false, error: 'Missing collection or id' })
      }
      const success = await deleteAdminRecord(body.collection, body.id, mongoUri)
      return json(200, { ok: success })
    } catch (err) {
      console.error('[admin] Failed to delete record:', err)
      return json(500, { ok: false, error: 'Failed to delete record' })
    }
  }

  return json(404, { ok: false, error: 'Not found' })
}
