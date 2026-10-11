// Vercel Serverless Function: POST /api/contact
import { handleContact, type ContactEnv } from '../server/contact.ts'
import { vercelHandler } from '../server/adapter.ts'

export default vercelHandler(handleContact, () => process.env as ContactEnv)
export const POST = (request: Request): Promise<Response> => handleContact(request, process.env as ContactEnv)
