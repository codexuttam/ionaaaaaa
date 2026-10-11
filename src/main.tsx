import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { Stills } from './dom/Stills'
import { film, setLayout } from './experience/film'
import { detectTier, gpuProbe } from './experience/quality'
import { landsOnHero } from './experience/landing'
import { setConsoleFunction } from 'three'

// R3F still constructs THREE.Clock, deprecated in three r183. That notice is not ours to fix; keep the console clean.
setConsoleFunction((type, message, ...params) => {
  if (typeof message === 'string' && message.startsWith('THREE.Clock: This module has been deprecated')) return
  const fn = type === 'error' ? console.error : type === 'warn' ? console.warn : console.log
  fn(message, ...params)
})

const params = new URLSearchParams(location.search)
film.debug = params.get('debug') === '1'
film.liveWater.flow = params.get('flow') !== '0'
film.liveWater.wet = params.get('wet') !== '0'
// ?clean=1 hides the chrome and the type: the still/OG renders are shot this way
if (params.get('clean') === '1') document.documentElement.dataset.clean = '1'
film.tier = detectTier()
document.documentElement.dataset.tier = film.tier
document.documentElement.dataset.scene = film.scene.id
setLayout(window.innerWidth, window.innerHeight)
if (location.hash.length > 1 || params.has('scene') || params.has('t')) film.arrivedMidFilm = true
document.documentElement.dataset.landing = landsOnHero() ? 'hero' : 'deep'

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
// the same probe context detectTier() used (quality.ts): one throwaway WebGL context, not two
const glOk = gpuProbe().webgl

type BoundaryProps = { onError: () => void; children: ReactNode }

/**
 * The last line of defence against a blank page (docs/12 ship blockers): a throw anywhere in the
 * film (renderer creation, a shader, a loader) unmounts the film and hands the visitor the still
 * sequence. The error itself is reported to the console, which is the only log the site keeps.
 */
class FilmBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[iona] the film failed; showing the still sequence', error, info.componentStack)
    this.props.onError()
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

import { AdminDashboard } from './admin/AdminDashboard'

/** Film when motion is allowed and WebGL works; otherwise the still sequence. */
function Root() {
  const [isAdmin, setIsAdmin] = useState(() => {
    const p = window.location.pathname.replace(/\/+$/, '')
    return p === '/sidadmin' || window.location.hash === '#sidadmin'
  })
  const [reduced, setReduced] = useState(reducedQuery.matches)
  const [failed, setFailed] = useState(!glOk)

  useEffect(() => {
    const checkRoute = () => {
      const p = window.location.pathname.replace(/\/+$/, '')
      setIsAdmin(p === '/sidadmin' || window.location.hash === '#sidadmin')
    }
    window.addEventListener('popstate', checkRoute)
    window.addEventListener('hashchange', checkRoute)
    return () => {
      window.removeEventListener('popstate', checkRoute)
      window.removeEventListener('hashchange', checkRoute)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) {
      document.documentElement.dataset.mode = 'admin'
      return
    }
    const onChange = () => setReduced(reducedQuery.matches)
    reducedQuery.addEventListener('change', onChange)
    const onLost = (e: Event) => {
      if ((e.target as HTMLElement | null)?.tagName === 'CANVAS') setFailed(true)
    }
    window.addEventListener('webglcontextlost', onLost, true)
    return () => {
      reducedQuery.removeEventListener('change', onChange)
      window.removeEventListener('webglcontextlost', onLost, true)
    }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) {
      document.documentElement.dataset.mode = reduced || failed ? 'stills' : 'film'
    }
  }, [isAdmin, reduced, failed])

  if (isAdmin) {
    return <AdminDashboard />
  }

  if (reduced || failed) return <Stills />
  return (
    <FilmBoundary onError={() => setFailed(true)}>
      <App />
    </FilmBoundary>
  )
}

// No StrictMode: the film owns one WebGL context, one Lenis and one GSAP ticker; double-mounting them in dev hides real bugs.
createRoot(document.getElementById('root')!).render(<Root />)
