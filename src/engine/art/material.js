// Bloom Rush art kit - the shared look.
//
// Every surface in the game (pack models with a palette texture, code-built vertex-colour
// geometry, ground textures) is drawn with a MeshLambertMaterial patched by `patchLook`, so
// everything shares one lighting model:
//   * wrap-around ("half-Lambert") diffuse for the sun and fill light: faces turned away from
//     the sun fall off softly instead of going flat-dark, and (because shadow maps are rendered
//     with back faces) they never self-shadow;
//   * a gentle albedo grade (saturation / lift / gain in linear space) so pack colours come out
//     light and clean like the packs' own thumbnails instead of dark and muddy;
//   * a soft rim term from the view-space normal (the camera is orthographic, so this lights
//     silhouette edges evenly: the "toy" glow).
// Everything is a handful of ALU ops per pixel: cheap on phones.
import * as THREE from 'three';

// ------------------------------------------------------------------- the look ---
/** Live, shared uniforms. Change `LOOK.wrap.value` etc. and every material updates. */
export const LOOK = {
  wrap: { value: 0.42 },          // 0 = plain Lambert, 1 = half-Lambert
  sat: { value: 1.18 },           // saturation multiplier on albedo
  gamma: { value: 0.62 },         // <1 lifts mid-tones (linear-space exponent)
  gain: { value: 1.0 },          // brightness multiplier on albedo
  rim: { value: 0.16 },           // strength of the soft rim
  rimColor: { value: new THREE.Color(0xdff2ff) },
};

const PARS_LAMBERT = /* glsl */`
varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
uniform float uWrap;
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = dot( geometryNormal, directLight.direction );
	float wrapped = saturate( ( dotNL + uWrap ) / ( 1.0 + uWrap ) );
	vec3 irradiance = wrapped * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert
`;

const GRADE = /* glsl */`
{
	float lum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
	vec3 g = mix( vec3( lum ), diffuseColor.rgb, uSat );
	g = pow( max( g, vec3( 0.0 ) ), vec3( uGamma ) ) * uGain;
	diffuseColor.rgb = g;
}
`;

const RIM = /* glsl */`
{
	float rimT = pow( 1.0 - saturate( normal.z ), 2.2 );
	outgoingLight += rimT * uRim * uRimColor * ( 0.35 + 0.65 * diffuseColor.rgb );
}
`;

function patchLook(shader) {
  shader.uniforms.uWrap = LOOK.wrap;
  shader.uniforms.uSat = LOOK.sat;
  shader.uniforms.uGamma = LOOK.gamma;
  shader.uniforms.uGain = LOOK.gain;
  shader.uniforms.uRim = LOOK.rim;
  shader.uniforms.uRimColor = LOOK.rimColor;
  shader.fragmentShader = 'uniform float uSat;\nuniform float uGamma;\nuniform float uGain;\nuniform float uRim;\nuniform vec3 uRimColor;\n' +
    shader.fragmentShader
      .replace('#include <lights_lambert_pars_fragment>', PARS_LAMBERT)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + GRADE)
      .replace('#include <opaque_fragment>', RIM + '#include <opaque_fragment>');
}

/**
 * The look as a MeshLambertMaterial. Pass any MeshLambertMaterial parameters
 * (color, map, vertexColors, side, transparent, opacity...). Prefer getSharedMaterial()/toLit()
 * which cache; this always creates a new material.
 */
export function litMaterial(params = {}) {
  const m = new THREE.MeshLambertMaterial(params);
  m.onBeforeCompile = patchLook;
  m.customProgramCacheKey = () => 'bloom-look-v1';
  m.shadowSide = THREE.BackSide; // casters render back faces: clean, acne-free shadows on closed shapes
  return m;
}

let _shared = null;
/** One vertex-colour lit material shared by every merged / instanced geometry (drop-in for the old one). */
export function getSharedMaterial() {
  if (!_shared) { _shared = litMaterial({ vertexColors: true }); _shared.name = 'shared-vertex-colour'; }
  return _shared;
}

const _litCache = new Map();
let _recolor = null;
/** assets.js registers its palette fix here (avoids a circular import) */
export function setRecolor(fn) { _recolor = fn; }
/**
 * Convert a pack material (unlit / MeshStandardMaterial with a palette texture or base colour)
 * into the game's lit material. Cached per source texture + colour + side + opacity, so all the
 * models of a kit that share one palette share ONE material (one program, one texture upload).
 * opts: { double: true } keeps both faces (thin cards: grass blades, flags).
 */
export function toLit(src, opts = {}) {
  if (!src) return getSharedMaterial();
  if (src.userData && src.userData.isBloomLit) return src;
  const map = src.map || null;
  const color = src.color ? src.color : new THREE.Color(0xffffff);
  const transparent = !!src.transparent && src.opacity < 1;
  const side = opts.double ? THREE.DoubleSide : THREE.FrontSide;
  const key = [map ? map.uuid : '-', color.getHexString(), opts.recolor || '', side, transparent ? src.opacity.toFixed(3) : 1, src.vertexColors ? 1 : 0].join('|');
  let m = _litCache.get(key);
  if (m) return m;
  if (map) {
    if (map.colorSpace !== THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
    // palette atlases (<= 512px) are flat swatches: no mip chain, no bleeding between swatches
    const img = map.image;
    if (img && Math.max(img.width || 0, img.height || 0) <= 512) { map.generateMipmaps = false; map.minFilter = THREE.LinearFilter; }
    map.anisotropy = 4;
  }
  const col = color.clone();
  if (opts.recolor && !map && _recolor) _recolor(opts.recolor, col);
  m = litMaterial({
    map, color: col, side, vertexColors: !!src.vertexColors,
    transparent, opacity: transparent ? src.opacity : 1, depthWrite: !transparent,
  });
  m.name = src.name || (map ? 'lit-map' : 'lit-colour');
  m.userData.isBloomLit = true;
  m.userData.source = src.name;
  _litCache.set(key, m);
  return m;
}

// ------------------------------------------------------------------ lighting ---
/**
 * Recommended light values for every world. Pair with `configureRenderer` and `createLights`.
 * Light intensities are physical-ish: a full-albedo lit top face needs about pi of total
 * irradiance, so hemi + sun*cos land near 3.
 */
export const LIGHTING = {
  background: 0x9fdcff,                  // sky / clear colour (worlds override for indoors)
  // reference ground colours (sRGB, before the grade): a fresh meadow, and the matching flat colour for plain planes
  ground: { grass: 0x58a948, grassSolid: 0x4c9f3e, wood: 0xd9a066, tile: 0xf4efe6, paving: 0xd9cdb8, soil: 0x8a5a36 },
  hemi: { sky: 0xf1f8ff, ground: 0xdcebb4, intensity: 1.8 },
  sun: {
    color: 0xfff3dc,
    intensity: 1.3,
    dir: [9, 22, -8],                    // direction TO the sun; shadows fall toward screen-right
    distance: 40,                        // how far the light sits from its target
    shadow: {
      mapSize: 2048,
      extent: 17,                        // half-size of the shadow camera box (world units) around the target
      near: 1,
      far: 90,
      bias: -0.0004,
      normalBias: 0.035,
      radius: 3.2,                       // soft edge in shadow-map texels (r187 PCF, 5 rotated taps)
      intensity: 0.8,                    // 1 = black shadows; <1 lets the ambient through (softer, tinted)
    },
  },
  fill: { color: 0xffe9f2, intensity: 0.7, dir: [-14, 12, -10] }, // camera-side fill, no shadow
  indoor: {                              // for the grocery interior: same recipe, warmer and a little flatter
    background: 0xf2e7d2,
    hemi: { sky: 0xfff8ee, ground: 0xf2dcc0, intensity: 2.0 },
    sun: { color: 0xfff0d8, intensity: 1.25 },
    fill: { color: 0xfff0f5, intensity: 0.6 },
  },
};

/** Renderer settings every world must use (matches the engine's own setup). */
export function configureRenderer(renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;  // r187: soft via shadow.radius; PCFSoftShadowMap is gone
  renderer.shadowMap.autoUpdate = true;
  return renderer;
}

/**
 * Build hemisphere + sun (shadowed) + fill lights from LIGHTING (or a variant such as
 * LIGHTING.indoor merged over it) and add them to `parent`.
 *   const L = createLights(scene);
 *   L.follow(player.x, player.z);        // each frame: shadow box follows the player, texel-snapped
 * Returns { hemi, sun, fill, follow(x, z), setShadows(on) }.
 */
export function createLights(parent, opts = {}) {
  const base = LIGHTING;
  const v = opts.variant || null; // e.g. LIGHTING.indoor
  const hemiP = { ...base.hemi, ...(v && v.hemi) };
  const sunP = { ...base.sun, ...(v && v.sun) };
  const fillP = { ...base.fill, ...(v && v.fill) };
  const sh = { ...base.sun.shadow, ...(sunP.shadow || {}), ...(opts.shadow || {}) };

  const group = new THREE.Group();
  group.name = 'lights';
  const hemi = new THREE.HemisphereLight(hemiP.sky, hemiP.ground, hemiP.intensity);
  const sun = new THREE.DirectionalLight(sunP.color, sunP.intensity);
  const sunDir = new THREE.Vector3(...sunP.dir).normalize();
  const dist = sunP.distance || 40;
  sun.castShadow = opts.shadows !== false;
  sun.shadow.mapSize.set(sh.mapSize, sh.mapSize);
  const c = sun.shadow.camera;
  c.left = -sh.extent; c.right = sh.extent; c.top = sh.extent; c.bottom = -sh.extent; c.near = sh.near; c.far = sh.far;
  c.updateProjectionMatrix();
  sun.shadow.bias = sh.bias;
  sun.shadow.normalBias = sh.normalBias;
  sun.shadow.radius = sh.radius;
  sun.shadow.intensity = sh.intensity;
  sun.position.copy(sunDir).multiplyScalar(dist);
  const fill = new THREE.DirectionalLight(fillP.color, fillP.intensity);
  fill.position.set(...fillP.dir);
  group.add(hemi, sun, sun.target, fill);
  parent.add(group);

  const texel = (2 * sh.extent) / sh.mapSize;
  // snap in light space so shadows do not shimmer while the target moves
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize();
  const up = new THREE.Vector3().crossVectors(sunDir, right).normalize();
  const tmp = new THREE.Vector3();
  return {
    group, hemi, sun, fill,
    follow(x, z) {
      tmp.set(x, 0, z);
      const a = Math.round(tmp.dot(right) / texel) * texel;
      const b = Math.round(tmp.dot(up) / texel) * texel;
      const d = tmp.dot(sunDir);
      tmp.copy(right).multiplyScalar(a).addScaledVector(up, b).addScaledVector(sunDir, d);
      sun.target.position.copy(tmp);
      sun.position.copy(tmp).addScaledVector(sunDir, dist);
      sun.target.updateMatrixWorld();
    },
    setShadows(on) { sun.castShadow = !!on; },
  };
}

/** Ground contact shadow (blob) defaults used by shadows.js. */
export const BLOB = { opacity: 0.45, y: 0.03 };
