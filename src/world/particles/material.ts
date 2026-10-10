import * as THREE from 'three'

export type Uniforms = Record<string, THREE.IUniform>

/** The uniforms three refreshes on a ShaderMaterial with `fog: true` (FogExp2 or Fog). */
export function fogUniforms(): Uniforms {
  return {
    fogColor: { value: new THREE.Color() },
    fogDensity: { value: 0 },
    fogNear: { value: 1 },
    fogFar: { value: 1000 },
  }
}

/**
 * Material for soft atmosphere layers. Shaders write premultiplied linear color
 * and an "occlusion" alpha; blending is ONE / ONE_MINUS_SRC_ALPHA, so alpha 0
 * adds light (glints, motes) and alpha 1 covers (mist, the dark motes on the pale
 * ground). Premultiplying before the output conversion keeps a layer reading
 * the same over dark grounds with or without the composer.
 */
export function softMaterial(opts: {
  vertexShader: string
  fragmentShader: string
  uniforms: Uniforms
  fog?: boolean
  depthTest?: boolean
  defines?: Record<string, string | number | boolean>
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: opts.vertexShader,
    fragmentShader: opts.fragmentShader,
    uniforms: opts.fog ? { ...fogUniforms(), ...opts.uniforms } : opts.uniforms,
    defines: opts.defines ?? {},
    transparent: true,
    depthWrite: false,
    depthTest: opts.depthTest ?? true,
    fog: opts.fog ?? false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  })
}

/** Linear-light luminance of a linear THREE.Color. */
export function luminance(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
}
