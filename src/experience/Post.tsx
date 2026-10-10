import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, ChromaticAberration, EffectComposer } from '@react-three/postprocessing'
import { BlendFunction, Effect } from 'postprocessing'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { Ref, RefObject } from 'react'
import * as THREE from 'three'
import { film } from './film'
import { TIERS } from './quality'

// Post chain (docs/03 "Texture and finish", docs/09). Bloom only on speculars
// (threshold 0.85), a chromatic fringe that widens in the facet beat, a vignette
// (the vignette itself is the DOM overlay in styles.css, so low tier has it too), and a highlight-only tone
// roll-off: identity below ~0.8 linear, a soft shoulder above, so the photographic
// backdrops keep their blacks and only the glass speculars are tamed.
// Every value is read from film.look each frame; nothing re-renders React.

const ROLLOFF_FRAG = /* glsl */ `
uniform float uExposure;
uniform float uKnee;
uniform float uGrain;
uniform float uTime;
// hash without sine (Dave Hoskins): stable across GPUs
float ionaGrainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb * uExposure;
  // soft shoulder: identity below the knee, exponential approach to 1.0 above it
  float range = 1.0 - uKnee;
  vec3 over = max(c - uKnee, 0.0);
  vec3 shoulder = uKnee + range * (1.0 - exp(-over / range));
  c = mix(c, shoulder, step(uKnee, c));
  // film grain, new every frame, mostly multiplicative so the blacks stay black. It replaces a DOM
  // overlay layer whose mix-blend-mode cost about 3 ms a frame over the canvas.
  float g = ionaGrainHash(gl_FragCoord.xy + fract(uTime * 7.31) * vec2(113.7, 71.3)) - 0.5;
  c = c * (1.0 + g * uGrain) + g * uGrain * 0.015;
  outputColor = vec4(c, inputColor.a);
}
`

/** Film grain amplitude in the final pass (relative brightness, peak to peak). */
const GRAIN = 0.07

class RolloffEffect extends Effect {
  constructor() {
    super('IonaRolloff', ROLLOFF_FRAG, {
      blendFunction: BlendFunction.SET,
      uniforms: new Map<string, THREE.Uniform>([
        ['uExposure', new THREE.Uniform(1)],
        ['uKnee', new THREE.Uniform(0.8)],
        ['uGrain', new THREE.Uniform(GRAIN)],
        ['uTime', new THREE.Uniform(0)],
      ]),
    })
  }
  set exposure(v: number) {
    this.uniforms.get('uExposure')!.value = v
  }
  set time(v: number) {
    this.uniforms.get('uTime')!.value = v
  }
}

const BLOOM_THRESHOLD = 0.85
const BLOOM_RADIUS = 0.4

type BloomLike = { intensity: number }
type AberrationLike = { offset: THREE.Vector2 }

type DriverProps = {
  bloom: RefObject<BloomLike | null>
  aberration: RefObject<AberrationLike | null>
  rolloff: RolloffEffect
}

function Driver({ bloom, aberration, rolloff }: DriverProps) {
  useFrame(() => {
    const look = film.look
    if (bloom.current) bloom.current.intensity = look.bloom
    if (aberration.current) aberration.current.offset.set(look.aberration, look.aberration * 0.6)
    rolloff.exposure = look.exposure
    rolloff.time = film.elapsed
  }, -2)
  return null
}

export function Post() {
  const tier = TIERS[film.tier]
  const gl = useThree((s) => s.gl)
  const bloom = useRef<BloomLike>(null)
  const aberration = useRef<AberrationLike>(null)
  const rolloff = useMemo(() => new RolloffEffect(), [])

  useLayoutEffect(() => {
    // the composer owns the final colour conversion; the renderer stays linear
    gl.toneMapping = THREE.NoToneMapping
    return () => rolloff.dispose()
  }, [gl, rolloff])

  // debug: ?post=0 drops the whole chain, ?msaa=0|4 overrides the multisampling (perf triage)
  const debug = useMemo(() => new URLSearchParams(location.search), [])
  if (tier.composer === 'none' || debug.get('post') === '0') return null
  const msaaParam = Number.parseInt(debug.get('msaa') ?? '', 10)
  const msaa = Number.isFinite(msaaParam) ? msaaParam : tier.antialias ? 4 : 0

  return (
    <>
      <Driver bloom={bloom} aberration={aberration} rolloff={rolloff} />
      <EffectComposer multisampling={msaa} resolutionScale={1} enableNormalPass={false}>
        <primitive object={rolloff} />
        <Bloom
          ref={bloom as unknown as Ref<never>}
          luminanceThreshold={BLOOM_THRESHOLD}
          luminanceSmoothing={0.2}
          intensity={0.32}
          radius={BLOOM_RADIUS}
          mipmapBlur
        />
        {tier.aberration ? (
          <ChromaticAberration ref={aberration as unknown as Ref<never>} offset={new THREE.Vector2(0.0006, 0.0004)} radialModulation modulationOffset={0.3} />
        ) : (
          <></>
        )}
      </EffectComposer>
    </>
  )
}
