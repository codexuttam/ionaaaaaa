/// <reference types="vite/client" />

// Build-time variables (see .env.example). Only VITE_-prefixed names reach the browser bundle.
interface ImportMetaEnv {
  /** Public origin of the deployed site, no trailing slash. */
  readonly VITE_SITE_URL?: string
  /** Footer legal links; default to the pages in public/. */
  readonly VITE_PRIVACY_URL?: string
  readonly VITE_TERMS_URL?: string
  /** Footer "Follow" column; each link renders only when its URL is set. */
  readonly VITE_INSTAGRAM_URL?: string
  readonly VITE_X_URL?: string
  readonly VITE_YOUTUBE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
