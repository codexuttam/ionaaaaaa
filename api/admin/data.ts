// Vercel Serverless Function: GET /api/admin/data
import { handleAdmin, type AdminEnv } from '../../server/admin.ts'

export default (request: Request): Promise<Response> =>
  handleAdmin(request, process.env as AdminEnv)
