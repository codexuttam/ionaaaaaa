import { useEffect, useState } from 'react'
import { onSceneChange } from '../experience/film'

/** Polite live region: the scene title, once, when the scene changes (docs/04, docs/10). */
export function LiveRegion() {
  const [text, setText] = useState('')
  useEffect(() => onSceneChange((next) => setText(next.title)), [])
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  )
}
