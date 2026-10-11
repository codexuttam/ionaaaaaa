// Vercel Serverless Function: POST /api/admin/delete
import { handleAdmin, type AdminEnv } from '../../server/admin.ts'

export default (request: Request): Promise<Response> =>
  handleAdmin(request, process.env as AdminEnv)
