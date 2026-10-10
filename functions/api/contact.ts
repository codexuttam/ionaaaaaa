// Cloudflare Pages Function: POST /api/contact. Deployed with the static site
// when the repo's `site/` folder is the Pages project root. Configure the
// delivery variables (see server/contact.ts) in the Pages project settings.
import { handleContact, type ContactEnv } from '../../server/contact.ts'

type Context = { request: Request; env: ContactEnv }

export const onRequestPost = ({ request, env }: Context): Promise<Response> => handleContact(request, env)
export const onRequest = ({ request, env }: Context): Promise<Response> => handleContact(request, env)
