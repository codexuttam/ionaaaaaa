// Vercel Serverless Function: POST /api/admin/delete
import { handleAdmin, type AdminEnv } from '../../server/admin.ts'
import { vercelHandler } from '../../server/adapter.ts'

export default vercelHandler(handleAdmin, () => process.env as AdminEnv)
export const POST = (request: Request): Promise<Response> => handleAdmin(request, process.env as AdminEnv)
