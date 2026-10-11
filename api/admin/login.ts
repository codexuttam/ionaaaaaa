// Vercel Serverless Function: POST /api/admin/login
import { handleAdmin, type AdminEnv } from '../../server/admin.ts'

export default (request: Request): Promise<Response> =>
  handleAdmin(request, process.env as AdminEnv)
