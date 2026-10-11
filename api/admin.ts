// Vercel Serverless Function: /api/admin
import { handleAdmin, type AdminEnv } from '../server/admin.ts'
import { vercelHandler } from '../server/adapter.ts'

export default vercelHandler(handleAdmin, () => process.env as AdminEnv)
export const GET = (request: Request): Promise<Response> => handleAdmin(request, process.env as AdminEnv)
export const POST = (request: Request): Promise<Response> => handleAdmin(request, process.env as AdminEnv)
