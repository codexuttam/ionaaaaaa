// Netlify Function (v2 API): POST /api/contact. Netlify picks up this folder
// automatically; the `path` below maps the function to the URL the dialog posts to.
// Configure the delivery variables (see server/contact.ts) in the site settings.
import { handleContact, type ContactEnv } from '../../server/contact.ts'

export default (request: Request): Promise<Response> => handleContact(request, process.env as ContactEnv)

export const config = { path: '/api/contact' }
