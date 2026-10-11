// Vercel Serverless Function: GET /api/admin/data
import { handleAdmin, type AdminEnv } from '../../server/admin.ts'
import { vercelHandler } from '../../server/adapter.ts'

export default vercelHandler(handleAdmin, () => process.env as AdminEnv)
export const GET = (request: Request): Promise<Response> => handleAdmin(request, process.env as AdminEnv)
