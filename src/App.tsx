import { Experience } from './experience/Experience'
import { Nav } from './dom/Nav'
import { TypeRoot } from './dom/TypeRoot'
import { BeatList } from './dom/BeatList'
import { LiveRegion } from './dom/LiveRegion'
import { Legibility } from './dom/Legibility'
import { Footer } from './dom/Footer'
import { Range } from './dom/Range'
import { Invitation } from './dom/Invitation'
import { ContactDialog } from './dom/ContactDialog'
import { MobileScrim } from './dom/MobileScrim'
import { Loader } from './dom/Loader'
import { DebugHud } from './dom/DebugHud'
import { film } from './experience/film'
import { CHROME } from './dom/copy'

// The film page. Document outline from docs/04-experience-architecture.md:
// everything is position: fixed except #story (the scroll spacer) and the footer.
// The 3D film mounts at once and compiles under the loader (dom/Loader.tsx), which
// lifts when everything the film opens on is loaded.
export function App() {
  return (
    <>
      <a className="skip" href="#footer">
        {CHROME.skip}
      </a>
      <div id="experience" aria-hidden="true">
        <Experience />
      </div>
      <div id="grain" aria-hidden="true" />
      <div id="vignette" aria-hidden="true" />
      <MobileScrim />
      <Legibility />
      <Nav mode="film" />
      <div id="story">
        <BeatList />
      </div>
      <TypeRoot />
      <LiveRegion />
      <Range mode="film" />
      <Invitation mode="film" />
      <Footer mode="film" />
      <ContactDialog />
      <Loader />
      {film.debug && <DebugHud />}
    </>
  )
}
