import * as THREE from 'three'
import type { Tier } from '../experience/film'

// Bottle materials (docs/06) and the shader additions they share:
//  - caustics: a cheap scrolling caustic light, world-space from above, gated by a uniform
//  - fog sink: while the bottle fades, it also sinks into the scene fog
//  - wet glass (the glass only): condensation and drops running down it, by uniform; see WET_GLSL
//
// Glass and liquid are transmissive. The cap is always transparent so it can
// fade without a program switch. Everything that lives inside the glass (the
// liquid, the meniscus) and an opaque stand-in for the cap are drawn only into
// three's transmission buffer: the glass shows them, refracted, and they fade
// with the glass instead of popping through it.

export type BottleUniforms = {
  uIonaTime: THREE.IUniform<number>
  uIonaCaustics: THREE.IUniform<number>
  uIonaFogBoost: THREE.IUniform<number>
  /** 0..1: how much the glass darkens toward its silhouette (the pale beat; see PatchOptions.edgeInk) */
  uIonaEdgeInk: THREE.IUniform<number>
  /** the stream the bottle stands in: world y of its surface, depth of the effect 0..1 */
  uIonaWater: THREE.IUniform<THREE.Vector2>
  /** 0..1: water on the glass (mist near the falls, running drops under them) */
  uIonaWet: THREE.IUniform<number>
  /** 0..1: currents in the water inside, bending what is seen through the bottle */
  uIonaInner: THREE.IUniform<number>
}

export function createBottleUniforms(): BottleUniforms {
  return {
    uIonaTime: { value: 0 },
    uIonaCaustics: { value: 0 },
    uIonaFogBoost: { value: 0 },
    uIonaEdgeInk: { value: 0 },
    uIonaWater: { value: new THREE.Vector2(-100, 0) },
    uIonaWet: { value: 0 },
    uIonaInner: { value: 0 },
  }
}

const CAUSTIC_GLSL = /* glsl */ `
uniform float uIonaTime;
uniform float uIonaCaustics;
uniform float uIonaFogBoost;
uniform float uIonaEdgeInk;
uniform vec2 uIonaWater;
uniform float uIonaInner;
varying vec3 vIonaWorld;
varying float vIonaLocalY;
// classic iterative water caustic, 4 taps
float ionaCaustic( vec2 p, float t ) {
  p = mod( p, 6.2831853 ) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for ( int n = 0; n < 4; n++ ) {
    float tt = t * ( 1.0 - ( 3.5 / float( n + 1 ) ) );
    i = p + vec2( cos( tt - i.x ) + sin( tt + i.y ), sin( tt - i.y ) + cos( tt + i.x ) );
    c += 1.0 / length( vec2( p.x / ( sin( i.x + tt ) / inten ), p.y / ( cos( i.y + tt ) / inten ) ) );
  }
  c /= 4.0;
  c = 1.17 - pow( c, 1.4 );
  return pow( abs( c ), 8.0 );
}
`

// Water on the glass, procedural in the bottle's own surface coordinates (the turn around its axis
// and the height), so the drops ride with the bottle and wrap without a seam. Three layers: a fine
// mist of condensation, scattered bigger drops, and a few drops that slide down at their own pace
// and wipe a clear trail through the mist behind them. Each drop is a little lens: it tilts the
// normal outward from its centre, so the refraction and the reflections bend through it, and its rim
// darkens a touch, as a real drop's edge does. Drops smaller than about a pixel fade out instead of
// shimmering. The result is a slope (around, up) and a rim term.
const WET_GLSL = /* glsl */ `
uniform float uIonaWet;
varying vec3 vIonaLocal;
varying vec3 vIonaAxis;
float ionaHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}
// one grid of drops: xy slope (toward the rim), z rim darkening; cells per revolution x cells per unit height
vec3 ionaDrops( vec2 su, vec2 cells, float density, vec2 radius, float px ) {
  vec2 g = su * cells;
  vec2 id = floor( g );
  id.x = mod( id.x, cells.x );
  vec2 f = fract( g ) - 0.5;
  float h0 = ionaHash( id );
  float h1 = ionaHash( id + 17.3 );
  float on = step( 1.0 - density, h0 );
  float r = mix( radius.x, radius.y, h1 * h1 );
  vec2 c = ( vec2( ionaHash( id + 3.1 ), ionaHash( id + 7.7 ) ) - 0.5 ) * ( 1.0 - 2.0 * r );
  vec2 p = f - c;
  float d = length( p ) / r;
  // a drop under about a pixel would only sparkle: let it go
  float seen = smoothstep( 0.7, 1.6, r / max( px, 1e-5 ) );
  float m = on * seen * ( 1.0 - smoothstep( 0.82, 1.0, d ) );
  return vec3( p / r * m, m * smoothstep( 0.55, 0.95, d ) );
}
// drops sliding down: a few columns, each with one drop that falls, pauses, falls; its trail stays wet
vec4 ionaRunning( vec2 su, float t, float px ) {
  float cols = 26.0;
  float x = su.x * cols;
  float col = mod( floor( x ), cols );
  float fx = fract( x ) - 0.5;
  float h = ionaHash( vec2( col, 4.7 ) );
  float running = step( 0.45, h );
  float span = 2.4;
  float speed = mix( 0.07, 0.16, ionaHash( vec2( col, 9.2 ) ) );
  // stick and slip: the drop moves in surges
  float tt = t * speed + h * 13.0;
  float ph = fract( ( tt + 0.06 * sin( tt * 6.2832 * 2.3 ) ) / span ) * span;
  float headY = 1.0 - ph;
  float wob = 0.12 * sin( su.y * 7.0 + h * 9.0 ) + 0.06 * sin( su.y * 17.0 + h * 3.0 );
  float dx = ( fx - wob * 0.5 ) * ( 2.6389 / cols );
  float dy = su.y - headY;
  float r = mix( 0.016, 0.026, ionaHash( vec2( col, 2.2 ) ) );
  vec2 p = vec2( dx, dy * 0.85 );
  float d = length( p ) / r;
  float seen = smoothstep( 0.7, 1.6, r / max( px, 1e-5 ) );
  float head = running * seen * ( 1.0 - smoothstep( 0.8, 1.0, d ) );
  // the trail: a narrow wet path above the head, thinning and drying with height
  float trail = running * step( 0.0, dy ) * smoothstep( r * 0.55, r * 0.15, abs( dx ) ) * exp( -dy / 0.5 );
  return vec4( p / r * head, head * smoothstep( 0.55, 0.95, d ), trail );
}
`

const FOG_GLSL = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  fogFactor = 1.0 - ( 1.0 - fogFactor ) * ( 1.0 - uIonaFogBoost );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`

type PatchOptions = {
  key: string
  /** caustic strength on this surface (0 disables the code path entirely) */
  caustic: number
  /** called with the compiled uniforms (the glass hands out its transmission sampler) */
  onUniforms?: (u: Record<string, THREE.IUniform>) => void
  /** thin the transmission thickness above the crown: the round neck and lip would otherwise lens a bright backdrop into a hot spot */
  thinNeck?: boolean
  /**
   * Ceiling on direct (punctual-light) specular, linear. At roughness 0.045 the GGX peak of a
   * directional light runs into the thousands; on the smooth neck and lip there is always a
   * point at the mirror angle, and bloom turns that pinpoint into a teardrop. Env reflections
   * are prefiltered and untouched, so the glass keeps its sparkle.
   */
  specCap?: number
  /**
   * Darkening of glass seen at a grazing angle, at full uIonaEdgeInk. On a white ground clear glass
   * refracts white and vanishes; a high-key product photograph draws it with a dark rim (black flags
   * beside the bottle, seen through and off the glass at its edges). This is that rim.
   */
  edgeInk?: number
  /** draw the stream the bottle stands in (uIonaWater) across the foot of this surface */
  waterline?: boolean
  /** water on this surface: running drops and condensation (uIonaWet); 'fine' adds the finest mist of droplets */
  wet?: boolean | 'fine'
}

function patch(material: THREE.MeshPhysicalMaterial, u: BottleUniforms, opts: PatchOptions): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uIonaTime = u.uIonaTime
    shader.uniforms.uIonaCaustics = u.uIonaCaustics
    shader.uniforms.uIonaFogBoost = u.uIonaFogBoost
    shader.uniforms.uIonaEdgeInk = u.uIonaEdgeInk
    shader.uniforms.uIonaWater = u.uIonaWater
    shader.uniforms.uIonaInner = u.uIonaInner
    if (opts.wet) shader.uniforms.uIonaWet = u.uIonaWet
    opts.onUniforms?.(shader.uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vIonaWorld;\nvarying float vIonaLocalY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvIonaWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvIonaLocalY = transformed.y;')
    if (opts.wet)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vIonaLocal;\nvarying vec3 vIonaAxis;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvIonaLocal = transformed;\nvIonaAxis = normalize( ( modelViewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );')
    let frag = shader.fragmentShader.replace('#include <common>', `#include <common>\n${CAUSTIC_GLSL}${opts.wet ? WET_GLSL : ''}`)
    if (opts.wet) {
      frag = frag.replace(
        '#include <clearcoat_normal_fragment_maps>',
        /* glsl */ `#include <clearcoat_normal_fragment_maps>
        float ionaRim = 0.0;
        if ( uIonaWet > 0.001 ) {
          // the surface in units: the turn around the axis (one revolution = 1) and the height
          vec2 su = vec2( atan( vIonaLocal.z, vIonaLocal.x ) / 6.2831853 + 0.5, vIonaLocal.y );
          // one unit of surface in pixels decides which drops are big enough to draw
          float px = length( fwidth( vIonaLocal ) );
          vec4 run = ionaRunning( su, uIonaTime, px );
          // the running drops wipe the condensation off their trail
          float keep = 1.0 - run.w * 0.9;
          vec3 big = ionaDrops( su + vec2( 0.37, 0.21 ), vec2( 38.0, 14.5 ), 0.42, vec2( 0.14, 0.33 ), px * 14.5 );
          vec2 slope = big.xy * 0.8 * keep + run.xy;
          ionaRim = big.z * keep + run.z;
          ${opts.wet === 'fine' ? 'vec3 mist = ionaDrops( su, vec2( 92.0, 35.0 ), 0.72, vec2( 0.16, 0.34 ), px * 35.0 );\n          slope += mist.xy * 0.55 * keep;\n          ionaRim += mist.z * 0.5 * keep;' : ''}
          // the drops are laid out on upright glass: on a ledge (the neck flange, the lip, the base) they would smear round it
          // and the neck above the shoulder stays dry: condensation forms where the cold water is
          float ionaWetHere = uIonaWet * ( 1.0 - smoothstep( 0.55, 0.85, abs( dot( normal, vIonaAxis ) ) ) ) * ( 1.0 - smoothstep( 1.12, 1.16, vIonaLocal.y ) );
          ionaRim *= ionaWetHere;
          vec3 ionaT = normalize( cross( vIonaAxis, normal ) );
          vec3 ionaB = cross( normal, ionaT );
          vec3 ionaTilt = ( slope.x * ionaT + slope.y * ionaB ) * ( 0.85 * ionaWetHere );
          normal = normalize( normal + ionaTilt );
          #ifdef USE_CLEARCOAT
            clearcoatNormal = normalize( clearcoatNormal + ionaTilt );
          #endif
        }`,
      )
      frag = frag.replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        // a drop's edge turns the light away: the rim reads a little darker
        outgoingLight *= 1.0 - 0.32 * ionaRim;
        #include <opaque_fragment>`,
      )
    }
    if (opts.caustic > 0) {
      frag = frag.replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        if ( uIonaCaustics > 0.001 ) {
          vec3 nW = inverseTransformDirection( normal, viewMatrix );
          float up = smoothstep( -0.2, 0.9, nW.y );
          float c = ionaCaustic( vIonaWorld.xz * 5.2 + vec2( 0.0, vIonaWorld.y * 1.3 ), uIonaTime * 0.55 + 23.0 );
          outgoingLight += vec3( 0.80, 0.92, 1.0 ) * c * up * uIonaCaustics * ${opts.caustic.toFixed(3)};
        }
        #include <opaque_fragment>`,
      )
    }
    if (opts.waterline) {
      // standing in a stream: under the surface the glass loses its sparkle to the water, and a bright
      // meniscus climbs it where the surface meets it; the surface line ripples on the clock
      frag = frag.replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        if ( uIonaWater.y > 0.001 ) {
          float ionaWave = 0.006 * sin( vIonaWorld.x * 31.0 + uIonaTime * 2.1 ) + 0.004 * sin( vIonaWorld.z * 47.0 - uIonaTime * 2.9 + 1.3 );
          float ionaLine = uIonaWater.x + ionaWave;
          float ionaUnder = smoothstep( ionaLine + 0.005, ionaLine - 0.005, vIonaWorld.y ) * uIonaWater.y;
          outgoingLight = mix( outgoingLight, outgoingLight * 0.55 + vec3( 0.045, 0.06, 0.075 ), ionaUnder * 0.8 );
          float ionaMeniscus = exp( -pow( ( vIonaWorld.y - ionaLine - 0.006 ) / 0.007, 2.0 ) ) * uIonaWater.y;
          outgoingLight += vec3( 0.55, 0.64, 0.72 ) * ionaMeniscus;
        }
        #include <opaque_fragment>`,
      )
    }
    if (opts.edgeInk !== undefined) {
      frag = frag.replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        if ( uIonaEdgeInk > 0.001 ) {
          float ionaFacing = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
          float ionaRim = 1.0 - smoothstep( 0.2, 0.72, ionaFacing );
          outgoingLight *= 1.0 - uIonaEdgeInk * ${opts.edgeInk.toFixed(3)} * ionaRim;
        }
        #include <opaque_fragment>`,
      )
    }
    if (opts.thinNeck) {
      // object-space y: the crown meets the round neck at the collar (1.147); from there up the glass is a quarter as thick
      frag = frag.replace(
        '#include <transmission_fragment>',
        THREE.ShaderChunk.transmission_fragment
          .replace('material.thickness = thickness;', 'material.thickness = thickness * mix( 1.0, 0.25, smoothstep( 1.13, 1.17, vIonaLocalY ) );')
          .replace(
            'vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );',
            /* glsl */ `vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
            // the water inside is never quite still: slow currents rise and turn in it and bend what is seen
            // through the bottle; under the crown (the air in the neck) it stays clear
            if ( uIonaInner > 0.001 ) {
              vec3 iq = vec3( vIonaWorld.x, vIonaLocalY, vIonaWorld.z ) * 3.1;
              float it = uIonaTime;
              vec3 cur = vec3( sin( iq.y * 2.3 - it * 0.8 + sin( iq.x * 1.7 + it * 0.5 ) * 1.3 ), 0.0, sin( iq.y * 1.9 - it * 0.65 + sin( iq.z * 2.1 - it * 0.45 ) * 1.2 ) );
              n = normalize( n + cur * ( 0.055 * uIonaInner * ( 1.0 - smoothstep( 1.12, 1.17, vIonaLocalY ) ) ) );
            }`,
          ),
      )
    }
    if (opts.specCap !== undefined) {
      const cap = opts.specCap.toFixed(2)
      frag = frag.replace(
        '#include <aomap_fragment>',
        /* glsl */ `
        reflectedLight.directSpecular = min( reflectedLight.directSpecular, vec3( ${cap} ) );
        #ifdef USE_CLEARCOAT
          clearcoatSpecularDirect = min( clearcoatSpecularDirect, vec3( ${cap} ) );
        #endif
        #include <aomap_fragment>`,
      )
    }
    frag = frag.replace('#include <fog_fragment>', FOG_GLSL)
    shader.fragmentShader = frag
  }
  material.customProgramCacheKey = () => opts.key
}

export type BottleMaterials = {
  glass: THREE.MeshPhysicalMaterial
  liquid: THREE.MeshPhysicalMaterial | null
  capSide: THREE.MeshPhysicalMaterial
  capTop: THREE.MeshPhysicalMaterial
  capRim: THREE.MeshPhysicalMaterial
  /** opaque stand-in of the cap for the transmission buffer */
  capProxy: THREE.MeshPhysicalMaterial
  label: THREE.MeshPhysicalMaterial
  /** the back label: the same print material over the back window's own canvas */
  labelBack: THREE.MeshPhysicalMaterial
  meniscus: THREE.MeshStandardMaterial
  punt: THREE.MeshStandardMaterial
  /** base envMapIntensity per material, for setEnvIntensity */
  envBase: Map<THREE.Material, number>
  /** the glass's compiled uniforms (transmissionSamplerMap), once compiled */
  glassUniforms: { current: Record<string, THREE.IUniform> | null }
}

export type CapMaps = {
  topBump: THREE.Texture
  topNormal: THREE.Texture
  topOrm: THREE.Texture
  sideColor: THREE.Texture
  sideOrm: THREE.Texture
}

export const GLASS_ENV = 1.35

export function createBottleMaterials(tier: Tier, u: BottleUniforms, labels: { front: THREE.Texture; back: THREE.Texture }, cap: CapMaps): BottleMaterials {
  const low = tier === 'low'
  const glassUniforms: { current: Record<string, THREE.IUniform> | null } = { current: null }

  const glass = new THREE.MeshPhysicalMaterial({
    name: 'iona-glass',
    color: '#eef3f6',
    metalness: 0,
    roughness: 0.045,
    transmission: 1,
    // thinner than solid crystal: the side facets bend the view a little, so they show the set and the edges,
    // not a second copy of the label's lettering
    thickness: low ? 0.15 : 0.3,
    ior: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    attenuationColor: '#cfe2ea',
    attenuationDistance: 2.2,
    envMapIntensity: GLASS_ENV,
    specularIntensity: 1,
    specularColor: '#ffffff',
    dispersion: tier === 'high' ? 0.55 : 0,
    transparent: true,
    side: low ? THREE.FrontSide : THREE.DoubleSide,
  })
  patch(glass, u, { key: `iona-glass-${tier}`, caustic: 1, thinNeck: true, specCap: 1.6, edgeInk: 0.68, waterline: true, wet: tier === 'high' ? 'fine' : true, onUniforms: (un) => (glassUniforms.current = un) })

  const liquid = low
    ? null
    : new THREE.MeshPhysicalMaterial({
        name: 'iona-liquid',
        color: '#d5e6ee',
        roughness: 0.05,
        transmission: 0.55,
        thickness: 0.9,
        ior: 1.33,
        transparent: true,
        envMapIntensity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
  if (liquid) patch(liquid, u, { key: 'iona-liquid', caustic: 0 })

  // Black gloss: a dark dielectric under a hard clear coat. (A black *metal* reflects
  // nothing, because a metal's reflectance is its own colour.)
  const capBase = {
    metalness: 0.15,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 0.85,
    specularIntensity: 1,
    transparent: true,
  } as const
  const capSide = new THREE.MeshPhysicalMaterial({
    ...capBase,
    name: 'iona-cap-side',
    color: '#ffffff',
    map: cap.sideColor,
    roughness: 1,
    roughnessMap: cap.sideOrm,
  })
  patch(capSide, u, { key: 'iona-cap-side', caustic: 0 })
  const capTop = new THREE.MeshPhysicalMaterial({
    ...capBase,
    name: 'iona-cap-top',
    color: '#0b0c0e',
    roughness: 1,
    roughnessMap: cap.topOrm,
    bumpMap: cap.topBump,
    bumpScale: -0.004,
    clearcoatNormalMap: cap.topNormal,
    clearcoatNormalScale: new THREE.Vector2(0.8, 0.8),
  })
  patch(capTop, u, { key: 'iona-cap-top', caustic: 0 })
  const capRim = new THREE.MeshPhysicalMaterial({ ...capBase, name: 'iona-cap-rim', color: '#0b0c0e' })
  patch(capRim, u, { key: 'iona-cap-rim', caustic: 0 })
  const capProxy = new THREE.MeshPhysicalMaterial({
    name: 'iona-cap-proxy',
    color: '#0b0c0e',
    metalness: 0.15,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 0.85,
  })

  // the labels: a satin opaque frosted print over each window, lit by the set, with a faint glow
  // of its own (light scattering inside the frost); one program for both
  const makeLabel = (map: THREE.Texture, name: string): THREE.MeshPhysicalMaterial => {
    const m = new THREE.MeshPhysicalMaterial({
      name,
      color: '#ffffff',
      map,
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.45,
      clearcoatRoughness: 0.3,
      emissive: '#ffffff',
      emissiveMap: map,
      emissiveIntensity: 0.14,
      envMapIntensity: 0.5,
      // opaque, so the glass refracts it from the side; createBottle flips it transparent only while the
      // bottle fades. Printed on the outside only: from inside the bottle (through the side facets) a label is
      // not there, so the crystal shows clear round the print, as on the reference
      transparent: false,
      alphaTest: 0.5,
      side: THREE.FrontSide,
      fog: false,
    })
    // on the white alkaline ground the frost would vanish too: its turning edges darken with the glass
    patch(m, u, { key: 'iona-label', caustic: 0.6, edgeInk: 0.4 })
    return m
  }
  const labelMat = makeLabel(labels.front, 'iona-label')
  const labelBack = makeLabel(labels.back, 'iona-label-back')

  const meniscus = new THREE.MeshStandardMaterial({
    name: 'iona-meniscus',
    color: '#E7F1F6',
    roughness: 0.15,
    metalness: 0,
    emissive: '#E7F1F6',
    emissiveIntensity: 0.12,
    fog: false,
  })

  // the punt: a dark ring in the base, seen through the glass
  const punt = new THREE.MeshStandardMaterial({ name: 'iona-punt', color: '#070708', roughness: 0.35, metalness: 0.2, fog: false })

  const envBase = new Map<THREE.Material, number>()
  for (const m of [glass, liquid, capSide, capTop, capRim, capProxy, labelMat, labelBack, meniscus, punt]) if (m) envBase.set(m, m.envMapIntensity)

  return { glass, liquid, capSide, capTop, capRim, capProxy, label: labelMat, labelBack, meniscus, punt, envBase, glassUniforms }
}

/**
 * Restrict a mesh to three's transmission buffer: it is drawn when the
 * transmission pass renders the opaque scene, and skipped (zero-length draw)
 * everywhere else. The mesh must own its geometry.
 */
export function transmissionOnly(mesh: THREE.Mesh, glassUniforms: { current: Record<string, THREE.IUniform> | null }): void {
  const range = mesh.geometry.drawRange
  mesh.onBeforeRender = (renderer) => {
    const rt = renderer.getRenderTarget()
    let inPass = false
    if (rt) {
      const sampler = glassUniforms.current?.transmissionSamplerMap?.value as THREE.Texture | null | undefined
      inPass =
        (sampler !== undefined && sampler !== null && rt.texture === sampler) ||
        (rt.samples > 0 && rt.texture.generateMipmaps && rt.texture.minFilter === THREE.LinearMipmapLinearFilter)
    }
    range.count = inPass ? Infinity : 0
  }
}
