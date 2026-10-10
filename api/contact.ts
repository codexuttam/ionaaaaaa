// Vercel Serverless Function (web handler signature, Node runtime): POST /api/contact.
// Configure the delivery variables (see server/contact.ts) in the project settings.
import { handleContact, type ContactEnv } from '../server/contact.ts'

export default (request: Request): Promise<Response> => handleContact(request, process.env as ContactEnv)
