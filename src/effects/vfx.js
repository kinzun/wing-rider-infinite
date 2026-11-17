/* Adapted from LinearAbiltyCastingThreeJS.
MIT License

Copyright (c) 2026 mohamedachrefelouafi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
const RiderVFX = (() => {
  const { BufferGeometry, BufferAttribute, Vector3, Sphere, DynamicDrawUsage } = THREE;

  const _tangent = new Vector3();
  const _side = new Vector3();
  const _view = new Vector3();
  const _up = new Vector3(0, 1, 0);
  const _p = new Vector3();
  const _normal = new Vector3();

  const RibbonMode = Object.freeze({
    /** Ribbon lies in the ground plane — used for the cast preview. */
    FLAT: 'flat',
    /** Ribbon always faces the camera — used for flame streams. */
    BILLBOARD: 'billboard',
    /** Ribbon keeps a fixed normal supplied per update — used for water twists. */
    ORIENTED: 'oriented',
    /**
     * Vertical curtain: the lower edge sits on the polyline and the upper edge is
     * `width` above it. Used for the fire stream and the wind ribbons, where the
     * effect needs real height rather than a camera-facing strip.
     */
    UPRIGHT: 'upright',
  });

  /**
   * A re-usable, pre-allocated triangle-strip ribbon.
   *
   * Every trail-like effect in the project (cast preview, fire stream, water
   * ribbon, wind spirals) is a ribbon along a polyline, so they all share this
   * builder. Buffers are allocated once at construction; `build()` only rewrites
   * the vertices it needs and moves the draw range — no per-frame allocation and
   * no geometry churn.
   *
   * Vertex attributes produced:
   *  - position  world-space (geometry is used with an identity matrix)
   *  - uv        x = along the ribbon (0..1), y = across (0..1)
   *  - aDist     arc length ratio along the ribbon (0..1)
   *  - aSide     -1 / +1 which edge the vertex is on
   *  - aRandom   stable per-vertex noise seed
   *
   * With `{ frame: true }` two more attributes are written:
   *  - aCenter   the polyline point this vertex was offset from
   *  - aTangent  the polyline tangent there
   * They let a fragment shader reconstruct the curve's local frame, which is what
   * the volumetric fire raymarcher needs: the ribbon is only a proxy hull for it,
   * the actual flame lives around `aCenter` / `aTangent`.
   */
  class RibbonGeometry {
    constructor(maxSegments = 128, { frame = false } = {}) {
      this.maxSegments = maxSegments;
      this.hasFrame = frame;
      const vertexCount = (maxSegments + 1) * 2;

      this.geometry = new BufferGeometry();
      this.positions = new Float32Array(vertexCount * 3);
      this.normals = new Float32Array(vertexCount * 3);
      this.uvs = new Float32Array(vertexCount * 2);
      this.dists = new Float32Array(vertexCount);
      this.sides = new Float32Array(vertexCount);
      this.randoms = new Float32Array(vertexCount);
      this.centers = frame ? new Float32Array(vertexCount * 3) : null;
      this.tangents = frame ? new Float32Array(vertexCount * 3) : null;

      for (let i = 0; i < vertexCount; i++) {
        this.sides[i] = i % 2 === 0 ? -1 : 1;
        this.randoms[i] = Math.random();
      }

      const indices = new Uint16Array(maxSegments * 6);
      for (let s = 0; s < maxSegments; s++) {
        const a = s * 2;
        indices.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], s * 6);
      }

      this.geometry.setAttribute(
        'position',
        new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage),
      );
      this.geometry.setAttribute(
        'aNormal',
        new BufferAttribute(this.normals, 3).setUsage(DynamicDrawUsage),
      );
      this.geometry.setAttribute('uv', new BufferAttribute(this.uvs, 2).setUsage(DynamicDrawUsage));
      this.geometry.setAttribute(
        'aDist',
        new BufferAttribute(this.dists, 1).setUsage(DynamicDrawUsage),
      );
      this.geometry.setAttribute('aSide', new BufferAttribute(this.sides, 1));
      this.geometry.setAttribute('aRandom', new BufferAttribute(this.randoms, 1));
      if (frame) {
        this.geometry.setAttribute(
          'aCenter',
          new BufferAttribute(this.centers, 3).setUsage(DynamicDrawUsage),
        );
        this.geometry.setAttribute(
          'aTangent',
          new BufferAttribute(this.tangents, 3).setUsage(DynamicDrawUsage),
        );
      }
      this.geometry.setIndex(new BufferAttribute(indices, 1));
      this.geometry.setDrawRange(0, 0);
      this.geometry.boundingSphere = new Sphere(new Vector3(), 1000);

      this.segmentCount = 0;
    }

    /**
     * Rebuild the ribbon from a polyline.
     *
     * @param {Vector3[]} points        polyline in world space (>= 2 points)
     * @param {object}    options
     * @param {number}    options.width base half-width in world units
     * @param {string}    [options.mode] one of RibbonMode
     * @param {Vector3}   [options.cameraPosition] required for BILLBOARD
     * @param {Vector3}   [options.normal] fixed normal for ORIENTED
     * @param {(t:number, i:number) => number} [options.widthProfile] 0..1 → multiplier
     * @param {number}    [options.count] number of points to use (defaults to points.length)
     */
    build(points, options) {
      const count = Math.min(options.count ?? points.length, this.maxSegments + 1);
      if (count < 2) {
        this.segmentCount = 0;
        this.geometry.setDrawRange(0, 0);
        return this;
      }

      const {
        width = 0.5,
        mode = RibbonMode.BILLBOARD,
        cameraPosition = null,
        normal = null,
        widthProfile = null,
        twist = 0,
        twistPhase = 0,
      } = options;

      // First pass: arc length so UVs and profiles are parameterised by distance,
      // not by index — this keeps textures from stretching on uneven point spacing.
      let total = 0;
      for (let i = 1; i < count; i++) total += points[i].distanceTo(points[i - 1]);
      const invTotal = total > 1e-5 ? 1 / total : 0;

      let travelled = 0;
      for (let i = 0; i < count; i++) {
        const point = points[i];

        if (i > 0) travelled += point.distanceTo(points[i - 1]);
        const t = travelled * invTotal;

        // Tangent from neighbouring samples (central difference where possible).
        if (i === 0) _tangent.copy(points[1]).sub(points[0]);
        else if (i === count - 1) _tangent.copy(points[count - 1]).sub(points[count - 2]);
        else _tangent.copy(points[i + 1]).sub(points[i - 1]);
        if (_tangent.lengthSq() < 1e-10) _tangent.set(0, 0, 1);
        _tangent.normalize();

        const upright = mode === RibbonMode.UPRIGHT;

        if (upright) {
          _side.copy(_up);
        } else if (mode === RibbonMode.FLAT) {
          _side.crossVectors(_tangent, _up);
        } else if (mode === RibbonMode.ORIENTED && normal) {
          _side.crossVectors(_tangent, normal);
        } else {
          _view.copy(cameraPosition ?? _up).sub(point);
          _side.crossVectors(_tangent, _view);
        }
        if (_side.lengthSq() < 1e-10) _side.set(1, 0, 0);
        _side.normalize();

        // Optional twist: roll the ribbon around its own tangent as it advances,
        // which is what gives the water ribbon its corkscrew.
        if (twist !== 0) _side.applyAxisAngle(_tangent, twist * t + twistPhase);

        // Surface normal for lighting / fresnel in the ribbon shaders.
        _normal.crossVectors(_tangent, _side).normalize();

        const scaled = width * (widthProfile ? widthProfile(t, i) : 1);
        // Upright ribbons grow from the polyline; the others straddle it.
        const lowOffset = upright ? 0 : -scaled * 0.5;
        const highOffset = upright ? scaled : scaled * 0.5;

        const i2 = i * 2;
        _p.copy(point).addScaledVector(_side, lowOffset);
        this.positions[i2 * 3 + 0] = _p.x;
        this.positions[i2 * 3 + 1] = _p.y;
        this.positions[i2 * 3 + 2] = _p.z;

        _p.copy(point).addScaledVector(_side, highOffset);
        this.positions[(i2 + 1) * 3 + 0] = _p.x;
        this.positions[(i2 + 1) * 3 + 1] = _p.y;
        this.positions[(i2 + 1) * 3 + 2] = _p.z;

        for (let v = 0; v < 2; v++) {
          this.normals[(i2 + v) * 3 + 0] = _normal.x;
          this.normals[(i2 + v) * 3 + 1] = _normal.y;
          this.normals[(i2 + v) * 3 + 2] = _normal.z;
        }

        if (this.hasFrame) {
          for (let v = 0; v < 2; v++) {
            const o = (i2 + v) * 3;
            this.centers[o + 0] = point.x;
            this.centers[o + 1] = point.y;
            this.centers[o + 2] = point.z;
            this.tangents[o + 0] = _tangent.x;
            this.tangents[o + 1] = _tangent.y;
            this.tangents[o + 2] = _tangent.z;
          }
        }

        this.uvs[i2 * 2 + 0] = t;
        this.uvs[i2 * 2 + 1] = 0;
        this.uvs[(i2 + 1) * 2 + 0] = t;
        this.uvs[(i2 + 1) * 2 + 1] = 1;

        this.dists[i2] = t;
        this.dists[i2 + 1] = t;
      }

      this.segmentCount = count - 1;

      const vertexCount = count * 2;
      const {
        position,
        uv,
        aDist: dist,
        aNormal: normals,
        aCenter,
        aTangent,
      } = this.geometry.attributes;

      const uploads = [
        [position, 3],
        [normals, 3],
        [uv, 2],
        [dist, 1],
      ];
      if (this.hasFrame) uploads.push([aCenter, 3], [aTangent, 3]);

      for (const [attribute, itemSize] of uploads) {
        attribute.needsUpdate = true;
        attribute.clearUpdateRanges?.();
        attribute.addUpdateRange?.(0, vertexCount * itemSize);
      }

      this.geometry.setDrawRange(0, this.segmentCount * 6);
      return this;
    }

    /** Hide the ribbon without touching its buffers. */
    clear() {
      this.segmentCount = 0;
      this.geometry.setDrawRange(0, 0);
    }

    dispose() {
      this.geometry.dispose();
    }
  }

  /**
   * Procedural noise library (GLSL ES 1.00 compatible).
   *
   * Everything in this project is procedural — there are no noise textures — so
   * this chunk is injected into most of the custom materials. It is written once
   * and shared to keep shader source (and the compiler cache) small.
   *
   * Contains: hashes, 3D simplex noise, fbm, ridged fbm, curl noise, voronoi.
   */
  const noiseGLSL = /* glsl */ `
#ifndef NOISE_LIB_INCLUDED
#define NOISE_LIB_INCLUDED

vec3 mod289v3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289v4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute289(vec4 x) { return mod289v4(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt4(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec2 hash21(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec3 hash31(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

/* ---- Ashima / Stefan Gustavson simplex noise ---- */
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289v3(i);
  vec4 p = permute289(permute289(permute289(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt4(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

/** snoise remapped to 0..1 */
float snoise01(vec3 p) { return snoise(p) * 0.5 + 0.5; }

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * snoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

float fbm4(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * snoise(p);
    p = p * 2.03 + vec3(17.3, 5.1, 9.7);
    a *= 0.5;
  }
  return v;
}

/** Ridged multifractal — sharp filaments, ideal for flames and cracks. */
float ridged(vec3 p, int unusedOctaves) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * (1.0 - abs(snoise(p)));
    p *= 2.06;
    a *= 0.5;
  }
  return v;
}

/** Divergence-free curl noise — used to swirl particles and flames. */
vec3 curlNoise(vec3 p) {
  const float e = 0.12;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);

  float x0 = snoise(p - dx), x1 = snoise(p + dx);
  float y0 = snoise(p - dy), y1 = snoise(p + dy);
  float z0 = snoise(p - dz), z1 = snoise(p + dz);

  vec3 pb = p + vec3(31.416, 47.853, 12.793);
  float bx0 = snoise(pb - dx), bx1 = snoise(pb + dx);
  float by0 = snoise(pb - dy), by1 = snoise(pb + dy);
  float bz0 = snoise(pb - dz), bz1 = snoise(pb + dz);

  float inv = 1.0 / (2.0 * e);
  vec3 grad1 = vec3(x1 - x0, y1 - y0, z1 - z0) * inv;
  vec3 grad2 = vec3(bx1 - bx0, by1 - by0, bz1 - bz0) * inv;
  return normalize(cross(grad1, grad2) + 1e-5);
}

/** Cheap 2D voronoi. Returns x = distance to closest cell, y = cell id hash. */
vec2 voronoi2(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float minDist = 8.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash21(dot(n + g, vec2(7.13, 113.17)));
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < minDist) { minDist = d; id = hash11(dot(n + g, vec2(31.7, 57.1))); }
    }
  }
  return vec2(sqrt(minDist), id);
}

mat2 rot2(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

#endif
`;

  const referenceWind = (() => {
    const { ShaderMaterial, AdditiveBlending, Color, DoubleSide } = THREE;
    const sharedUniforms = (u) => ({
      uTime: { value: 0 },
      uGlobalGlow: { value: 1 },
      uShaderIntensity: { value: 1 },
      ...u,
    });
    /**
     * Shared shading helpers: soft particles, fresnel, dissolve, gradients.
     *
     * Pulls in three's `<packing>` chunk itself (needed by `softFade`), so this
     * chunk must only be injected into raw ShaderMaterials — never into a built-in
     * material that already includes `<packing>`, or the depth helpers would be
     * defined twice.
     */
    const commonGLSL = /* glsl */ `
#ifndef COMMON_LIB_INCLUDED
#define COMMON_LIB_INCLUDED

#include <packing>

/**
 * Depth-based soft particle fade.
 * sceneDepth is a packed-RGBA depth prepass of the opaque scene.
 * Returns 0 where the fragment intersects geometry, 1 when well in front of it.
 */
float softFade(sampler2D sceneDepth, vec2 screenUV, float fragViewZ, float near, float far, float fadeDist) {
  float packed = unpackRGBAToDepth(texture2D(sceneDepth, screenUV));
  float sceneViewZ = perspectiveDepthToViewZ(packed, near, far);
  return clamp((fragViewZ - sceneViewZ) / max(fadeDist, 1e-4), 0.0, 1.0);
}

/** Standard Schlick-ish rim term. */
float fresnelTerm(vec3 viewDir, vec3 normal, float power, float scale) {
  return clamp(scale * pow(1.0 - abs(dot(normalize(viewDir), normalize(normal))), power), 0.0, 4.0);
}

/** Threshold dissolve with an emissive burn edge. Returns vec2(alphaMask, edge). */
vec2 dissolveMask(float noiseValue, float threshold, float edgeWidth) {
  float mask = step(threshold, noiseValue);
  float edge = smoothstep(threshold, threshold + edgeWidth, noiseValue) - mask;
  return vec2(mask, clamp(edge, 0.0, 1.0));
}

/** 4-stop gradient sampled by t in 0..1 (core → mid → edge → tail). */
vec3 gradient4(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 a = mix(c0, c1, smoothstep(0.0, 0.34, t));
  vec3 b = mix(a, c2, smoothstep(0.30, 0.68, t));
  return mix(b, c3, smoothstep(0.64, 1.0, t));
}

/** Screen-space UV of the current fragment (needs the clip position). */
vec2 screenUVFromClip(vec4 clipPos) {
  return (clipPos.xy / clipPos.w) * 0.5 + 0.5;
}

/** Anti-aliased step using screen-space derivatives where available. */
float aastep(float threshold, float value) {
  float afwidth = fwidth(value) * 0.7;
  return smoothstep(threshold - afwidth, threshold + afwidth, value);
}

#endif
`;

    /**
     * Airbending ribbon — a *tress of combed silk*, not a single strip.
     *
     * Reference airbending art reads as dozens of hairline vapour filaments running
     * the length of a broad sheet: long, unbroken, roughly parallel, bunching into
     * bright tresses and splaying open again, with loose flyaway hairs escaping the
     * silhouette. Drawing that with one ribbon per strand would cost hundreds of
     * quads, so instead each ribbon is a wide camera-facing sheet and the fragment
     * shader combs it laterally into hairlines.
     *
     * The critical property is anisotropy: the fields that sway, bunch and dim the
     * comb vary almost entirely *along* the ribbon and barely across it. That is
     * what keeps hairlines long and coherent — noise applied across the sheet, or
     * at high frequency along it, immediately reads as smoke mush instead of hair.
     *
     * Two combs are layered: a fine one for the hairlines and a sparser, softer one
     * for the broad silky sheets they sit on. Where hairlines pack tighter than a
     * pixel the antialias floor merges them into a solid sheet on its own, which is
     * exactly what the dense parts of the bundle should do.
     */
    class WindRibbonMaterial extends ShaderMaterial {
      constructor() {
        super({
          transparent: true,
          depthWrite: false,
          depthTest: true,
          blending: AdditiveBlending,
          side: DoubleSide,
          toneMapped: false,
          uniforms: sharedUniforms({
            uColorInner: { value: new Color(0.92, 0.97, 1.0) },
            uColorOuter: { value: new Color(0.56, 0.84, 1.0) },
            uOpacity: { value: 0.45 },
            uGlow: { value: 0.8 },
            uFresnel: { value: 1.4 },
            uNoiseStrength: { value: 0.7 },
            uNoiseFrequency: { value: 2.0 },
            uSwirlSpeed: { value: 2.2 },
            uFilaments: { value: 22.0 },
            uFilamentSharp: { value: 0.9 },
            uTurbulence: { value: 1.0 },
            uHaze: { value: 0.45 },
            uTailFade: { value: 0.16 },
          }),
          vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uSwirlSpeed;

        attribute vec3  aNormal;
        attribute float aDist;
        attribute float aSide;
        attribute float aRandom;
        /** Constant across one ribbon — decorrelates the strands of each braid. */
        attribute float aSeed;

        varying vec2  vUv;
        varying float vAlong;
        varying vec3  vNormalW;
        varying vec3  vViewDir;
        varying float vRandom;
        varying float vSeed;
        varying float vViewZ;

        void main() {
          vUv = uv;
          vAlong = aDist;
          vRandom = aRandom;
          vSeed = aSeed;

          vec4 world = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * aNormal);
          vViewDir = cameraPosition - world.xyz;

          vec4 mv = viewMatrix * world;
          vViewZ = mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
          fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3  uColorInner;
        uniform vec3  uColorOuter;
        uniform float uOpacity;
        uniform float uGlow;
        uniform float uFresnel;
        uniform float uNoiseStrength;
        uniform float uNoiseFrequency;
        uniform float uSwirlSpeed;
        uniform float uFilaments;
        uniform float uFilamentSharp;
        uniform float uTurbulence;
        uniform float uHaze;
        uniform float uTailFade;
        uniform float uShaderIntensity;
        uniform float uGlobalGlow;
        uniform vec2  uResolution;
        uniform sampler2D uSceneDepth;
        uniform float uCameraNear;
        uniform float uCameraFar;

        varying vec2  vUv;
        varying float vAlong;
        varying vec3  vNormalW;
        varying vec3  vViewDir;
        varying float vRandom;
        varying float vSeed;
        varying float vViewZ;

        ${noiseGLSL}
        ${commonGLSL}

        /**
         * One comb of hairlines over the lane coordinate \`u\`.
         *
         * @param u      lane coordinate (already swayed and bunched)
         * @param n      strands per unit of u
         * @param seed   decorrelates this comb from the others
         * @param sharp  0 = broad soft ribbons, 1 = hairlines
         * @param t      position along the ribbon, 0 tail .. 1 head
         * @returns x = strand core, y = the soft body around it
         */
        vec2 comb(float u, float n, float seed, float sharp, float t, float flow) {
          float cell = u * n;
          float id   = floor(cell);
          float r1   = hash11(id * 1.37 + seed);
          float r2   = hash11(id * 4.11 + seed * 3.7);

          // Irregular spacing plus a slow lengthwise wander. Real hair is never
          // evenly combed, and a strand drifts across its whole length rather
          // than jittering from sample to sample.
          float off = (r1 - 0.5) * 0.7
                    + sin(t * (1.1 + r2 * 2.2) + r1 * 6.2831 + flow * (0.15 + r2 * 0.2)) * 0.22;

          float d = abs(fract(cell - off) - 0.5) * 2.0;   // 0 on the strand, 1 at the lane edge

          // Antialias floor: widen the strand to at least a pixel.
          float w0 = mix(0.5, 0.06, clamp(sharp, 0.0, 1.0));
          float aa = fwidth(cell);
          float w  = max(w0, aa * 2.0);

          float bw   = min(1.0, w * 6.0);
          float core = pow(1.0 - smoothstep(0.0, w, d), 2.0);
          float body = (1.0 - smoothstep(0.0, bw, d)) * 0.15;

          // Widening alone is not enough. Once the pixel footprint approaches
          // the strand's own width the comb is pure aliasing — it beats against
          // the sample grid and draws a stipple of dots and dashes instead of
          // hair. Past that point fade each profile into its average over the
          // lane, which is what an infinitely-sampled comb integrates to: the
          // strands melt into a smooth sheet, exactly what the dense tresses
          // should do anyway. The threshold has to track w0, not be a constant:
          // the sharper the hairlines, the sooner they stop resolving.
          float resolve = 1.0 - smoothstep(w0 * 0.35, w0 * 1.5, aa);
          core = mix(clamp(w, 0.0, 1.0) * 0.30, core, resolve);
          body = mix(bw * 0.5 * 0.15, body, resolve);

          // Per-strand weight. The frequency along t is deliberately low: raise
          // it and the hairlines break into dashes instead of fading in and out
          // over their length.
          float amp = mix(0.22, 1.0, r2)
                    * smoothstep(-0.45, 0.35,
                        fbm3(vec3(t * 1.5 - flow * 0.25, id * 2.7 + seed, uTime * 0.12)));

          return vec2(core, body) * amp;
        }

        void main() {
          float t      = clamp(vAlong, 0.0, 1.0);
          float across = vUv.y * 2.0 - 1.0;
          float radial = abs(across);

          float fres = fresnelTerm(vViewDir, vNormalW, 2.2, 1.0) * uFresnel;

          float flow = uTime * uSwirlSpeed;
          float freq = max(uNoiseFrequency, 0.05);

          // ---- comb frame -------------------------------------------------
          // Both fields depend on t alone, so every hairline in a cross-section
          // is displaced identically and the strands stay long and parallel.
          vec3 sp = vec3(t * freq * 2.4 - flow * 0.22, vSeed * 29.0, uTime * 0.15);
          float sway  = fbm3(sp) * uTurbulence;
          // Bunching: below 1 the comb squeezes into a tight tress, above 1 it
          // opens out into a fan.
          float gather = 0.45 + 0.75 * (fbm3(sp + vec3(31.7, 8.3, 2.1)) + 0.5);

          // Hairlines never sit on an even pitch — they crowd into two or three
          // tresses that slide across the sheet. A sine remap of the lateral
          // coordinate does it: where its derivative is small the lanes pack in
          // and read as a bright tress, where it is large they fan out into
          // separate hairs. The amplitude is capped so the derivative stays
          // positive; past that the comb folds back and mirrors itself.
          float twine = fbm3(sp + vec3(5.1, 19.4, 0.0)) * 3.0 + t * 1.8 - flow * 0.2;
          float clump = across + 0.20 * sin(across * 4.2 + twine);

          float u = (clump - sway * 0.45) / max(gather, 0.2);

          float n = max(uFilaments, 1.0);
          vec2 fine   = comb(u, n, vSeed * 53.0, uFilamentSharp, t, flow);
          // The coarse comb is a third as dense and much softer — the silky
          // sheets the hairlines ride on.
          vec2 coarse = comb(u * 0.34 + 7.3, n, vSeed * 91.0 + 13.0,
                             uFilamentSharp * 0.5, t, flow * 0.75);

          float core = fine.x + coarse.x * 0.5;
          float body = fine.y + coarse.y * 0.6;

          // Density falls away well inside the geometric edge, and strands with
          // a high stray value reach further out than the rest — the loose
          // flyaway hairs that sell the silhouette. Every added term is
          // positive, so the envelope is zero by radial = 1 whatever the noise
          // does and the quad edge can never show.
          // Per-lane, so it aliases the same way the comb does — collapse it to
          // its mean once the lanes stop resolving.
          float stray = hash11(floor(u * n) * 1.91 + vSeed * 7.0);
          stray = mix(0.5, stray, 1.0 - smoothstep(0.20, 0.55, fwidth(u * n)));
          float env = smoothstep(0.92, 0.05, radial + abs(sway) * 0.08 + (1.0 - stray) * 0.42);

          // The middle of the sheet is where strands overlap along the view ray,
          // so it reads as a bright spine.
          float spine = exp(-radial * radial * 3.5);

          // Milky vapour filling the gaps. It thins out towards the head, where
          // several ribbons overlap and would otherwise stack into a solid white
          // blob under additive blending.
          float hz = fbm3(vec3(t * freq * 1.9 - flow * 0.4, across * 1.2, uTime * 0.3));
          float haze = smoothstep(1.0, 0.05, radial + hz * uNoiseStrength * 0.35)
                     * uHaze * mix(1.0, 0.4, smoothstep(0.55, 1.0, t));

          float strand = (core * (0.85 + spine * 0.5) + body) * env;

          // Feather both ends. Both have to close all the way down or the strip
          // stops on a straight bright cut; the width profile narrows them, this
          // takes them out.
          float tail = smoothstep(0.0, max(uTailFade, 0.01), t)
                     * (1.0 - 0.85 * smoothstep(0.78, 1.0, t));
          float alpha = (strand * (0.8 + fres * 0.5) + haze * (0.13 + fres * 0.2)) * uOpacity * tail;

          vec2 screenUV = gl_FragCoord.xy / uResolution;

          if (alpha < 0.004) discard;

          // Strand cores burn out to the inner (near-white) colour; the haze
          // stays on the outer tint so the bundle keeps its cool cast.
          vec3 color = mix(uColorOuter, uColorInner,
                           clamp(core * 1.6 + spine * 0.25 + fres * 0.3, 0.0, 1.0));
          color *= uGlow * uGlobalGlow * mix(0.7, 1.0, uShaderIntensity);

          gl_FragColor = vec4(color, alpha);
        }
      `,
        });
      }
    }

    /**
     * The finale tornado: one shell of a nested stack that together read as a
     * column of dust-loaded air.
     *
     * A single cone with a texture on it always reads as a cone, however good the
     * texture is, because the two things the eye actually uses to identify a
     * tornado are both properties of the *shape*, not the surface:
     *
     *   - The silhouette is concave and never straight. A real funnel is a tight
     *     neck for most of its height that blooms into the parent cloud near the
     *     top, blows out into a debris fan where it scours the ground, and carries
     *     bulges and constrictions travelling up its length. So the mesh is a plain
     *     unit tube and every bit of that profile is evaluated in the vertex
     *     shader, where it can breathe and where the silhouette stays curved
     *     instead of faceted.
     *   - It has depth. Several shells at different radii, seeds and spin rates
     *     parallax against each other as the camera moves, which no amount of
     *     detail on one surface can fake.
     *
     * The surface shading then only has to sell the motion, and the one rule that
     * matters there is anisotropy: dust in a vortex is drawn into long helical
     * streaks, so the noise runs at a far lower frequency along the column than
     * around it. Isotropic noise immediately reads as boiling smoke on a cone.
     *
     * @param index  shell index, 0 = outermost. Drives radius, spin and seed.
     */
    class TornadoMaterial extends ShaderMaterial {
      constructor(index = 0) {
        super({
          transparent: true,
          depthWrite: false,
          depthTest: true,
          blending: AdditiveBlending,
          side: DoubleSide,
          toneMapped: false,
          uniforms: sharedUniforms({
            uColorInner: { value: new Color(0.92, 0.97, 1.0) },
            uColorOuter: { value: new Color(0.56, 0.84, 1.0) },
            uAge: { value: 0 },
            uOpacity: { value: 0.5 },
            uSpin: { value: 4.0 },
            uNoiseStrength: { value: 0.7 },
            uGlow: { value: 1.0 },
            uFresnel: { value: 1.2 },
            uNeck: { value: 0.18 },
            uFlare: { value: 2.0 },
            uSkirt: { value: 0.4 },
            uRough: { value: 0.16 },
            uLean: { value: 0.5 },
            uSeed: { value: 0 },
            uShellScale: { value: 1 },
          }),
          vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uAge;
        uniform float uNeck;
        uniform float uFlare;
        uniform float uSkirt;
        uniform float uRough;
        uniform float uLean;
        uniform float uSeed;
        uniform float uShellScale;

        varying vec2  vUv;
        varying vec3  vNormalW;
        varying vec3  vViewDir;
        varying float vViewZ;

        ${noiseGLSL}

        /** How far the funnel has roped out — thin and whipping, near the end. */
        float ropeT() { return smoothstep(0.62, 1.0, uAge); }

        /**
         * Lateral drift of the column's axis at height h, in local units.
         *
         * Deliberately seed-free so every shell snakes identically and the
         * stack stays coaxial. The ground contact is pinned and the drift grows
         * with height: a tornado is anchored where it touches down and leans
         * away from there, not the other way round.
         */
        vec2 coreOffset(float h) {
          float w = pow(clamp(h, 0.0, 1.0), 1.5);
          vec2 slow = vec2(snoise(vec3(h * 1.05, uTime * 0.33, 0.0)),
                           snoise(vec3(h * 1.05, uTime * 0.29, 17.3)));
          vec2 fast = vec2(snoise(vec3(h * 3.1, uTime * 0.95, 5.7)),
                           snoise(vec3(h * 3.1, uTime * 0.88, 41.2)));
          return (slow * 0.78 + fast * 0.3) * uLean * w * (1.0 + ropeT() * 2.0);
        }

        /** The funnel's radius at height h and azimuth ang, top radius = 1. */
        float funnelRadius(float h, float ang) {
          float hc = clamp(h, 0.0, 1.0);

          // Concave core profile: a tight neck opening out into the cloud.
          float r = mix(uNeck, 1.0, pow(hc, uFlare));

          // Debris fan where the funnel drags along the ground. Kept tight —
          // a wide flare is a large, near-horizontal surface, and additive
          // shading turns that into a saucer of milk around the contact.
          r += uSkirt * exp(-hc * 18.0);

          // Bulges and constrictions riding up the column. Constant around the
          // circumference — this is the column breathing, not a lumpy tube.
          r *= 1.0 + uRough * fbm3(vec3(hc * 2.6 - uTime * 0.9, uSeed * 7.0, uTime * 0.2));

          // A little out of round, so the silhouette never reads as a lathe.
          // Sampled on the circle itself, so it wraps at the seam.
          r *= 1.0 + 0.07 * snoise(vec3(cos(ang) * 1.3, sin(ang) * 1.3,
                                        hc * 2.2 - uTime * 0.7 + uSeed));

          // Roping out: the whole column narrows as it dies.
          r *= mix(1.0, 0.34, ropeT());
          return max(r, 0.015);
        }

        vec3 funnelPoint(float h, float ang) {
          float r = funnelRadius(h, ang) * uShellScale;
          vec3 p = vec3(cos(ang) * r, h, sin(ang) * r);
          p.xz += coreOffset(h);
          return p;
        }

        void main() {
          vUv = uv;
          float ang = uv.x * 6.2831853;
          vec3 pos = funnelPoint(uv.y, ang);

          // The mesh normal is meaningless once the profile is rebuilt here,
          // and the fresnel term is what draws the silhouette, so difference
          // the surface for a real one. Both tangents are pushed through the
          // model matrix first: the funnel is scaled far more in height than in
          // radius, and a normal transformed by that scale would point wrong.
          vec3 dh = funnelPoint(uv.y + 0.02, ang) - pos;
          vec3 da = funnelPoint(uv.y, ang + 0.06) - pos;

          vec4 world = modelMatrix * vec4(pos, 1.0);
          vec3 wh = (modelMatrix * vec4(pos + dh, 1.0)).xyz - world.xyz;
          vec3 wa = (modelMatrix * vec4(pos + da, 1.0)).xyz - world.xyz;
          vNormalW = normalize(cross(wh, wa) + 1e-6);

          vViewDir = cameraPosition - world.xyz;
          vec4 mv = viewMatrix * world;
          vViewZ = mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
          fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uAge;
        uniform vec3  uColorInner;
        uniform vec3  uColorOuter;
        uniform float uOpacity;
        uniform float uSpin;
        uniform float uNoiseStrength;
        uniform float uGlow;
        uniform float uFresnel;
        uniform float uSeed;
        uniform float uGlobalGlow;
        uniform float uShaderIntensity;
        uniform vec2  uResolution;
        uniform sampler2D uSceneDepth;
        uniform float uCameraNear;
        uniform float uCameraFar;

        varying vec2  vUv;
        varying vec3  vNormalW;
        varying vec3  vViewDir;
        varying float vViewZ;

        ${noiseGLSL}
        ${commonGLSL}

        void main() {
          float h = clamp(vUv.y, 0.0, 1.0);
          float ang = vUv.x * 6.2831853;

          // Conservation of angular momentum: the tight neck whips round
          // several times faster than the wide top. Shearing the dust that way
          // is most of what separates a vortex from a spinning cylinder.
          float rate = uSpin * mix(2.2, 0.55, smoothstep(0.0, 0.9, h));
          float lift = uTime * uSpin * 0.5;

          // Two dust sheets at different depths in the wall, each sampled on a
          // circle so it wraps at the seam, each sheared into its own helix.
          // The two helix pitches are kept close. Pull them apart and the
          // streaks cross into a woven lattice instead of running together.
          float w1 = uTime * rate + h * 5.0 + uSeed;
          float w2 = uTime * rate * 0.72 + h * 6.4 + uSeed * 2.7;
          vec2 c1 = vec2(cos(ang - w1), sin(ang - w1));
          vec2 c2 = vec2(cos(ang - w2), sin(ang - w2));

          // Vertical frequency well under the angular one — that ratio is what
          // stretches the dust into streaks instead of tumbling it into blobs.
          float n1 = ridged(vec3(c1 * 2.1, h * 2.4 - lift), 4);
          float n2 = ridged(vec3(c2 * 3.9, h * 4.6 - lift * 1.5), 4);
          float dust = smoothstep(0.42, 1.0, (n1 * 0.62 + n2 * 0.38) * uNoiseStrength + 0.26);

          // Fine grit, so the streaks are granular rather than airbrushed.
          float grit = fbm3(vec3(c1 * 8.5, h * 8.0 - lift * 2.1)) * 0.5 + 0.5;
          dust *= 0.62 + 0.62 * grit;

          // Grazing rays travel much further through the shell than face-on
          // ones, which is why a funnel's edges are its brightest part.
          float fres = fresnelTerm(vViewDir, vNormalW, 2.0, 1.0) * uFresnel;

          // Dust is picked up at the ground and thins as it is carried up. The
          // fan itself is held back to a haze: the particle debris cloud is
          // what should fill the contact, not this surface.
          float load = mix(1.15, 0.45, smoothstep(0.0, 0.8, h)) * mix(0.4, 1.0, smoothstep(0.0, 0.16, h));

          // The funnel reaches down out of the air rather than popping in.
          float tip = mix(1.2, -0.25, smoothstep(0.0, 0.3, uAge));
          float descend = smoothstep(tip - 0.2, tip, h);

          // Dissolve the top; leave the ground contact solid, since that is
          // where the debris cloud is. The depth fade blends it into the floor.
          float vertical = smoothstep(1.0, 0.66, h) * smoothstep(0.0, 0.04, h) * descend;
          float death = 1.0 - smoothstep(0.72, 1.0, uAge);

          // The shell is drawn double-sided, so the far wall stacks on the near
          // one and its helix leans the opposite way on screen — at equal
          // brightness the two weave into a net. Holding the far wall well back
          // keeps it as the depth cue it should be.
          float facing = gl_FrontFacing ? 1.0 : 0.4;
          float body = vertical * load * uOpacity * death * facing;
          // The veil term keeps the gaps between streaks reading as a body of
          // air rather than holes punched through the column.
          float alpha = dust * (0.42 + fres * 0.6) * body + fres * 0.07 * body;

          vec2 screenUV = gl_FragCoord.xy / uResolution;

          if (alpha < 0.004) discard;

          vec3 color = mix(uColorOuter, uColorInner, clamp(dust * 0.9 + fres * 0.45, 0.0, 1.0));
          color *= uGlow * uGlobalGlow * mix(0.7, 1.0, uShaderIntensity);

          gl_FragColor = vec4(color, alpha);
        }
      `,
        });

        this.index = index;
      }

      /**
       * @param shellCount  how many shells are drawn this frame — the per-shell
       *                    opacity is divided down so the stack keeps roughly the
       *                    same total brightness whatever the count.
       */
    }

    return { TornadoMaterial, WindRibbonMaterial };
  })();

  const T = THREE;
  const vertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  return class RiderVFX {
    get trauma() {
      return this.motion.trauma;
    }
    set trauma(value) {
      this.motion.trauma = value;
    }
    constructor(scene, camera) {
      this.camera = camera;
      this.motion = new RiderCameraShake({ shakeOffset: new T.Vector3(), shakeRoll: 0 });
      this.lastShake = new T.Vector3();
      this.impactKick = 0;
      this.flash = 0;
      this.debrisCursor = 0;
      this.stormTime = 0;
      this.time = 0;
      this.trauma = 0;
      this.cursor = 0;
      const sphere = new T.SphereGeometry(1, 48, 32),
        ring = new T.TorusGeometry(1, 0.025, 5, 64);
      this.bursts = Array.from({ length: 8 }, () => {
        const material = new T.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
          toneMapped: false,
          uniforms: {
            viewFade: { value: 1 },
            age: { value: 1 },
            clock: { value: 0 },
            cold: { value: 0 },
          },
          vertexShader: `uniform float age;uniform float clock;varying float heat;varying vec3 n;varying vec3 view;${noiseGLSL}
   void main(){float d=fbm3(normal*3.+vec3(0.,-clock*2.,0.));heat=d*.5+.5;vec3 p=position+normal*d*(.15+age*.3);vec4 w=modelMatrix*vec4(p,1.);n=normalize(mat3(modelMatrix)*normal);view=cameraPosition-w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
          fragmentShader: `uniform float viewFade;uniform float age;uniform float cold;varying float heat;varying vec3 n;varying vec3 view;void main(){float fres=pow(1.-abs(dot(normalize(n),normalize(view))),2.2);float dissolve=smoothstep(age*.8-.1,age*.8+.15,heat);vec3 fire=mix(vec3(1.,.09,.01),vec3(2.,1.4,.4),heat);vec3 ice=mix(vec3(.08,.5,1.),vec3(.5,1.7,2.),fres);float a=(1.-age)*dissolve*mix(.6+fres,fres,cold);gl_FragColor=vec4(mix(fire,ice,clamp(cold,0.,1.)),a*.65*viewFade);}`,
        });
        const mesh = new T.Mesh(sphere, material),
          halo = new T.Mesh(
            ring,
            new T.MeshBasicMaterial({
              color: 0xffc36a,
              transparent: true,
              depthWrite: false,
              blending: T.AdditiveBlending,
              toneMapped: false,
            }),
          );
        scene.add(mesh, halo);
        mesh.visible = halo.visible = false;
        return { mesh, halo, age: 1, life: 1, radius: 1, cold: 0 };
      });
      this.trailMaterial = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        blending: T.AdditiveBlending,
        toneMapped: false,
        uniforms: { clock: { value: 0 }, cloud: { value: 0 } },
        vertexShader: vertex,
        fragmentShader: `uniform float clock;uniform float cloud;varying vec2 vUv;${noiseGLSL}
  void main(){float n=fbm3(vec3(vUv.x*7.-clock*5.,vUv.y*3.,clock*.4));float edge=pow(max(0.,1.-abs(vUv.y*2.-1.)),1.5);float a=edge*pow(1.-vUv.x,1.2)*smoothstep(-.4,.35,n)*.9;vec3 fire=mix(vec3(1.,.14,.01),vec3(.6,1.5,2.),edge*(1.-vUv.x));vec3 gold=mix(vec3(1.,.25,.02),vec3(2.,1.5,.55),edge);gl_FragColor=vec4(mix(fire,gold,cloud),a);}`,
      });
      this.trails = Array.from({ length: 8 }, () => {
        const ribbon = new RibbonGeometry(32);
        const mesh = new T.Mesh(ribbon.geometry, this.trailMaterial);
        mesh.frustumCulled = false;
        mesh.visible = false;
        scene.add(mesh);
        return {
          ribbon,
          mesh,
          points: Array.from({ length: 33 }, () => new T.Vector3()),
          options: { width: 1, mode: RibbonMode.BILLBOARD, cameraPosition: camera.position },
        };
      });
      this.cloudMaterial = new referenceWind.WindRibbonMaterial();
      const cu = this.cloudMaterial.uniforms;
      cu.uColorInner.value.setRGB(2, 1.5, 0.65);
      cu.uColorOuter.value.setRGB(1, 0.3, 0.04);
      cu.uOpacity.value = 1.2;
      cu.uGlow.value = 1.8;
      cu.uFilaments.value = 28;
      for (let i = 0; i < this.trails.length; i++) {
        const t = this.trails[i];
        t.ribbon.geometry.setAttribute(
          'aSeed',
          new T.BufferAttribute(new Float32Array(66).fill(i * 0.73), 1),
        );
      }
      const tube = new T.CylinderGeometry(1, 1, 1, 40, 24, true);
      this.storm = new T.Group();
      this.storm.visible = false;
      scene.add(this.storm);
      for (let i = 0; i < 3; i++) {
        const material = new referenceWind.TornadoMaterial(i),
          u = material.uniforms;
        u.uShellScale.value = 1 - i * 0.2;
        u.uSeed.value = i * 3.77;
        u.uSpin.value = 5 + i * 2;
        u.uOpacity.value = 0.65;
        u.uGlow.value = 1.8;
        u.uNeck.value = 0.035;
        u.uLean.value = 0.13;
        u.uSkirt.value = 0.05;
        u.uColorInner.value.setRGB(0.8, 1.4, 1.1);
        u.uColorOuter.value.setRGB(0.08, 0.7, 0.65);
        const mesh = new T.Mesh(tube, material);
        mesh.scale.set(15, 65, 15);
        mesh.frustumCulled = false;
        this.storm.add(mesh);
      }
      this.sideStorm = new T.Group();
      this.sideStorm.visible = false;
      scene.add(this.sideStorm);
      for (const side of [-1, 1]) {
        const mesh = new T.Mesh(tube, this.storm.children[0].material);
        mesh.position.set(side * 22, -9, -35);
        mesh.scale.set(13, 55, 13);
        mesh.frustumCulled = false;
        this.sideStorm.add(mesh);
      }
      this.jetGroup = new T.Group();
      this.jetGroup.visible = false;
      scene.add(this.jetGroup);
      for (const x of [-4.8, 4.8]) {
        const material = new referenceWind.TornadoMaterial(),
          u = material.uniforms;
        u.uAge.value = 0.4;
        u.uNeck.value = 0.1;
        u.uFlare.value = 0.65;
        u.uSkirt.value = 0;
        u.uLean.value = 0.05;
        u.uSpin.value = 8;
        u.uOpacity.value = 0.8;
        u.uGlow.value = 2;
        u.uColorInner.value.setRGB(2, 1.2, 0.3);
        u.uColorOuter.value.setRGB(1, 0.12, 0.01);
        const mesh = new T.Mesh(tube, material);
        mesh.position.x = x;
        mesh.rotation.x = Math.PI / 2;
        mesh.frustumCulled = false;
        this.jetGroup.add(mesh);
      }
      const { ParticleSystem, ParticleShape } = createReferenceParticles(noiseGLSL);
      this.gpuSparks = new ParticleSystem({
        name: 'reactor sparks',
        capacity: 1536,
        shape: ParticleShape.STREAK,
        stretch: true,
      });
      this.gpuSmoke = new ParticleSystem({
        name: 'billowing smoke',
        capacity: 256,
        shape: ParticleShape.SMOKE,
        additive: false,
        curl: true,
      });
      this.gpuFlow = new ParticleSystem({
        name: 'cloud spiral',
        capacity: 768,
        shape: ParticleShape.SOFT,
        swirl: true,
      });
      this.gpuSystems = [this.gpuSparks, this.gpuSmoke, this.gpuFlow];
      for (const system of this.gpuSystems) scene.add(system.object3D);
      this.gpuSparks.uniforms.uStretch.value = 0.12;
      this.gpuSparks.uniforms.uGlow.value = 2.2;
      this.gpuSparks.uniforms.uGravity.value.set(0, -7, 0);
      this.gpuSmoke.setGradient(
        new T.Color(0.4, 0.25, 0.18),
        new T.Color(0.18, 0.2, 0.25),
        new T.Color(0.09, 0.1, 0.14),
        new T.Color(0.04, 0.05, 0.07),
      );
      this.gpuSmoke.uniforms.uEndSize.value = 3;
      this.gpuSmoke.uniforms.uOpacity.value = 0.4;
      this.gpuSmoke.uniforms.uGravity.value.set(0, 1, 0);
      this.gpuSmoke.uniforms.uTurbulence.value = 2;
      this.gpuFlow.uniforms.uSwirl.value = 7;
      this.gpuFlow.uniforms.uSwirlExpand.value = 2;
      this.gpuFlow.uniforms.uGravity.value.set(0, 0, 0);
      this.gpuFlow.uniforms.uEndSize.value = 0.1;
      this.flowCarry = 0;
      this.smokeCarry = 0;
      this.emitParams = {
        position: new T.Vector3(),
        direction: new T.Vector3(),
        inherit: new T.Vector3(),
        radius: 1,
        speed: 20,
        spread: 1,
        size: 1,
        life: 1,
        spin: 4,
        time: 0,
      };
      this.detonations = Array.from({ length: 16 }, () => ({
        active: false,
        delay: 0,
        x: 0,
        y: 0,
        z: 0,
        radius: 0,
      }));
      this.debris = Array.from({ length: 128 }, () => ({
        life: 0,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        spin: 0,
      }));
      this.debrisMesh = new T.InstancedMesh(
        new T.BoxGeometry(1, 1, 1),
        new T.MeshStandardMaterial({
          color: 0x7586a0,
          emissive: 0xff4918,
          emissiveIntensity: 0.5,
          metalness: 0.7,
          roughness: 0.4,
        }),
        128,
      );
      this.debrisMesh.frustumCulled = false;
      this.debrisMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      scene.add(this.debrisMesh);
      this.debrisDummy = new T.Object3D();
      this.impactLight = new T.PointLight(0xff6826, 0, 70, 2);
      scene.add(this.impactLight);
      const count = 384,
        positions = new Float32Array(count * 3),
        colors = new Float32Array(count * 3);
      this.sparks = Array.from({ length: count }, () => ({ life: 0, vx: 0, vy: 0, vz: 0 }));
      this.sparkCursor = 0;
      this.sparkGeo = new T.BufferGeometry();
      this.sparkGeo.setAttribute(
        'position',
        new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage),
      );
      this.sparkGeo.setAttribute(
        'color',
        new T.BufferAttribute(colors, 3).setUsage(T.DynamicDrawUsage),
      );
      positions.fill(-1000);
      this.sparkMesh = new T.Points(
        this.sparkGeo,
        new T.PointsMaterial({
          size: 0.16,
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: T.AdditiveBlending,
        }),
      );
      this.sparkMesh.frustumCulled = false;
      scene.add(this.sparkMesh);
    }
    spawn(x, y, z, cold = false, radius = 15) {
      const b = this.bursts[this.cursor++ % 8];
      b.age = 0;
      b.life = cold ? 1.6 : 1.3;
      b.radius = radius;
      b.cold = +cold;
      b.mesh.position.set(x, y, z);
      b.halo.position.copy(b.mesh.position);
      b.halo.rotation.set(cold ? Math.PI / 2 : 0.35, 0, 0);
      b.halo.material.color.setHex(cold ? 0x66eeff : 0xffac36);
      b.mesh.material.uniforms.cold.value = +cold;
      this.trauma = Math.min(1, this.trauma + (cold ? 0.65 : 0.45));
      const pos = this.sparkGeo.attributes.position.array,
        col = this.sparkGeo.attributes.color.array;
      for (let j = 0; j < 48; j++) {
        const i = this.sparkCursor++ % 384,
          s = this.sparks[i],
          a = Math.random() * Math.PI * 2,
          v = 5 + Math.random() * 14;
        s.life = 0.4 + Math.random() * 0.6;
        s.vx = Math.cos(a) * v;
        s.vy = (Math.random() - 0.3) * v;
        s.vz = Math.sin(a) * v;
        pos.set([x, y, z], i * 3);
        col.set(cold ? [0.3, 1, 1] : [1, 0.3 + Math.random() * 0.6, 0.05], i * 3);
      }
      this.sparkGeo.attributes.color.needsUpdate = true;
    }
    emitGPU(system, count, x, y, z, size, speed, life, dx = 0, dy = 1, dz = 0, radius = 1) {
      const p = this.emitParams;
      p.position.set(x, y, z);
      p.direction.set(dx, dy, dz);
      p.size = size;
      p.speed = speed;
      p.life = life;
      p.radius = radius;
      p.time = this.time;
      p.inherit.set(0, 0, 0);
      system.emit(count, p);
    }
    shatter(x, y, z, big = false) {
      this.emitGPU(
        this.gpuSparks,
        big ? 420 : 100,
        x,
        y,
        z,
        0.65,
        big ? 55 : 28,
        1.8,
        0,
        0,
        0,
        big ? 8 : 2,
      );
      this.emitGPU(
        this.gpuSmoke,
        big ? 30 : 8,
        x,
        y,
        z,
        big ? 7 : 3,
        6,
        2.6,
        0,
        1,
        0,
        big ? 10 : 2,
      );

      this.flash = Math.max(this.flash, big ? 1 : 0.45);
      this.impactLight.position.set(x, y, z);
      this.impactLight.intensity = big ? 120 : 60;
      for (let n = 0; n < (big ? 64 : 12); n++) {
        const d = this.debris[this.debrisCursor++ % 128],
          a = n * 2.39996;
        Object.assign(d, {
          life: 1.4 + Math.random(),
          x,
          y,
          z,
          vx: Math.cos(a) * (8 + Math.random() * 18),
          vy: 5 + Math.random() * 18,
          vz: Math.sin(a) * (8 + Math.random() * 18),
          spin: Math.random() * 6,
        });
      }
    }
    trigger(event, s, origin) {
      if (typeof event === 'object') {
        if (event.type === 'bullet-whiz') return;
        if (event.type === 'swarm-fire') {
          this.emitGPU(
            this.gpuSparks,
            12,
            event.x,
            event.y,
            -(event.d - origin * 64),
            0.35,
            25,
            0.18,
            0,
            0,
            1,
            1,
          );
          return;
        }
        if (event.type === 'enemy-hit-point') {
          const z = -(event.d - origin * 64) + (event.boss ? 20 : 2);
          this.emitGPU(
            this.gpuSparks,
            event.heavy || event.boss ? 55 : 18,
            event.x,
            event.y,
            z,
            0.65,
            38,
            0.5,
            0,
            0,
            1,
            2,
          );
          this.motion.add(event.boss ? 0.1 : 0.04, 3, 32);
          return;
        }
        if (event.type === 'armor-break' || event.type === 'enemy-stagger') {
          const z = -(event.d - origin * 64);
          this.spawn(event.x, event.y, z, true, event.boss ? 26 : 12);
          this.shatter(event.x, event.y, z, event.boss);
          this.motion.add(event.boss ? 0.6 : 0.3, 1.4, 18);
          return;
        }
        if (event.type === 'swarm-burst') {
          const z = -(event.d - origin * 64);
          this.spawn(event.x, event.y, z, false, 9);
          this.emitGPU(this.gpuSparks, 36, event.x, event.y, z, 0.6, 25, 1);
          return;
        }
        if (event.type === 'enemy-fire') {
          this.emitGPU(
            this.gpuSparks,
            event.boss ? 90 : 15,
            event.x,
            event.y,
            -(event.d - origin * 64) + 18,
            1,
            35,
            0.6,
            0,
            0,
            1,
            3,
          );
          return;
        }
        const z = -(event.d - origin * 64);
        this.spawn(event.x, event.y, z, false, event.boss ? 28 : 12);
        this.shatter(event.x, event.y, z, event.boss);
        if (event.boss)
          for (let i = 0; i < 12; i++) {
            const d = this.detonations[i];
            Object.assign(d, {
              active: true,
              delay: 0.12 + i * 0.14,
              x: event.x + ((i % 4) - 1.5) * 7,
              y: event.y + Math.floor(i / 4) * 3,
              z: z + ((i % 3) - 1) * 6,
              radius: 18 + i,
              cold: false,
            });
          }
        return;
      }
      if (event === 'overload') {
        this.spawn(s.x, s.y + 1, s.z + 2, true, 27);
        this.emitGPU(this.gpuFlow, 140, s.x, s.y + 1, s.z, 1.1, 46, 0.95, 0, 0, 1, 6);
        this.motion.add(1, 2.7, 16);
        this.impactKick = 1.65;
        this.flash = Math.max(this.flash, 0.78);
      }
      if (event.startsWith('six-impact')) {
        const index = Number(event.slice(10)),
          cold = index === 0 || index === 5;
        const z = s.z - [108, 108, 72, 132, 72, 72][index],
          y = Math.max(2, s.y + 3);
        const overload = s.overload > 0;
        this.spawn(s.x, y, z, cold, overload ? 48 : 38);
        if (overload) {
          const side = index % 2 === 0 ? -1 : 1;
          this.spawn(s.x + side * 6, y - 1, s.z - 18, cold, 15);
          this.emitGPU(this.gpuFlow, 75, s.x + side * 4, y, s.z - 18, 1, 45, 0.65, 0, 0, 1, 5);
        }
        this.emitGPU(
          this.gpuSparks,
          overload ? 210 : 320,
          s.x,
          y,
          z,
          1,
          65,
          overload ? 0.95 : 1.8,
          0,
          0,
          0,
          14,
        );
        this.emitGPU(
          this.gpuSmoke,
          overload ? 14 : 28,
          s.x,
          y,
          z,
          9,
          12,
          overload ? 1.3 : 2.6,
          0,
          1,
          0,
          12,
        );
        for (let i = 0; i < (overload ? 3 : 6); i++) {
          const d = this.detonations.find((d) => !d.active);
          if (!d) break;
          const angle = (i * Math.PI) / 3;
          Object.assign(d, {
            active: true,
            delay: 0.1 + i * 0.09,
            x: s.x + Math.cos(angle) * 28,
            y: y + (i % 2) * 8,
            z: z + Math.sin(angle) * 24,
            radius: 24,
            cold,
          });
        }
        this.motion.add(0.85, overload ? 4.5 : 0.85, index === 2 ? 15 : 26);
        this.impactKick = overload ? 1.65 : 1;
        this.flash = Math.max(this.flash, overload ? 0.76 : 0.65);
      }
      if (event === 'fall') {
        this.spawn(s.x, -5, s.z - 18, false, 48);
        this.shatter(s.x, -5, s.z - 18, true);
        this.flash = 1;
      }
      if (event === 'rescue') {
        this.spawn(s.x, s.y, s.z, true, 22);
        this.emitGPU(this.gpuFlow, 240, s.x, s.y, s.z, 2, 30, 2, 0, 1, 0, 8);
      }
      if (event === 'enemy-hit') {
        this.flash = Math.max(this.flash, 0.15);
        this.trauma = Math.max(this.trauma, 0.2);
      }

      if (event === 'blast')
        this.spawn(s.lastBlast.x, s.lastBlast.y, -(s.lastBlast.d - origin * 64));
      if (event === 'roar') {
        this.spawn(s.x, s.y + 2, s.z, true, 30);
        this.spawn(s.x, s.y + 2, s.z - 8, true, 22);
      }
      if (event === 'pelican') {
        this.stormTime = 4;
        this.spawn(s.x, s.y + 3, s.z - 10, true, 18);
      }
      if (event.startsWith('tier'))
        this.spawn(s.x, s.y, s.z, event !== 'tier3', event === 'tier2' ? 18 : 10);
    }
    update(dt, s, reduced) {
      this.flash = Math.max(0, this.flash - dt * 2.4);
      this.impactLight.intensity = Math.max(0, this.impactLight.intensity - dt * 180);
      for (const d of this.detonations)
        if (d.active) {
          d.delay -= dt;
          if (d.delay <= 0) {
            d.active = false;
            this.spawn(d.x, d.y, d.z, !!d.cold, d.radius);
            this.shatter(d.x, d.y, d.z);
          }
        }
      for (let i = 0; i < 128; i++) {
        const d = this.debris[i],
          o = this.debrisDummy;
        d.life = Math.max(0, d.life - dt);
        if (d.life > 0) {
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.z += d.vz * dt;
          d.vy -= 18 * dt;
          o.position.set(d.x, d.y, d.z);
          o.rotation.set(d.spin + this.time * 4, this.time * 3, d.spin);
          o.scale.set(0.5, d.life * 0.6, 0.2);
        } else o.scale.setScalar(0);
        o.updateMatrix();
        this.debrisMesh.setMatrixAt(i, o.matrix);
      }
      this.debrisMesh.instanceMatrix.needsUpdate = true;
      this.time += dt;
      const hotFlight = s.overload > 0 && (s.mode || s.pelicanTime > 0);
      this.flowCarry += dt * (hotFlight ? 510 : s.mode || this.stormTime > 0 ? 360 : 0);
      const emitCount = Math.floor(this.flowCarry);
      this.flowCarry -= emitCount;
      if (emitCount > 0) {
        const storm = this.stormTime > 0;
        this.emitGPU(
          s.mode === 1 || s.mode === 2 ? this.gpuSparks : this.gpuFlow,
          emitCount,
          s.x,
          s.y + 1,
          s.z,
          s.mode === 3 ? 0.8 : 0.55,
          hotFlight ? 72 : storm ? 55 : 20,
          hotFlight ? 0.82 : 1.4,
          0,
          0,
          hotFlight ? 1 : storm ? -1 : 1,
          storm ? 7 : 3,
        );
      }
      if (s.falling && dt > 0)
        this.emitGPU(this.gpuSmoke, 4, s.x, Math.max(-8, s.y), s.z, 12, 8, 1.3, 0, 1, 0, 15);
      if (s.battle) {
        const boss = s.battle.enemies[12];
        if (boss.active && boss.hp < boss.maxHp * 0.5) {
          this.smokeCarry += dt * 45;
          const count = Math.floor(this.smokeCarry);
          this.smokeCarry -= count;
          if (count)
            this.emitGPU(
              this.gpuSmoke,
              count,
              boss.x,
              boss.y,
              -(boss.d - (s.distance + s.z)),
              4,
              4,
              2,
              0,
              1,
              0,
              10,
            );
        }
      }
      for (const system of this.gpuSystems) {
        system.uniforms.uTime.value = this.time;
        system.flush();
      }
      this.motion.update(dt);
      this.impactKick = Math.max(0, this.impactKick - dt * 2.2);
      for (const b of this.bursts) {
        b.age = Math.min(1, b.age + dt / b.life);
        b.mesh.visible = b.halo.visible = b.age < 1;
        const scale = 0.25 + b.radius * (1 - Math.pow(1 - b.age, 5));
        b.mesh.scale.setScalar(scale);
        b.mesh.material.uniforms.viewFade.value = T.MathUtils.clamp(
          (this.camera.position.distanceTo(b.mesh.position) - scale * 1.05) /
            Math.max(1, scale * 0.4),
          0,
          1,
        );
        b.mesh.material.uniforms.age.value = b.age;
        b.mesh.material.uniforms.clock.value = this.time;
        b.halo.scale.setScalar(scale * 1.35);
        b.halo.material.opacity = (1 - b.age) * 0.85;
      }
      this.cloudMaterial.uniforms.uTime.value = this.time;
      this.stormTime = Math.max(0, this.stormTime - dt);
      this.storm.visible = this.sideStorm.visible = this.stormTime > 0;
      this.sideStorm.position.set(s.x, s.y, s.z);
      this.storm.position.set(s.x + 1.38, s.y + 3.8, s.z - 3);
      this.storm.rotation.x = -Math.PI / 2;
      for (const shell of this.storm.children) {
        const u = shell.material.uniforms;
        u.uTime.value = this.time;
        u.uAge.value = 1 - this.stormTime / 4;
      }
      this.jetGroup.visible = s.mode === 1 || s.mode === 2;
      this.jetGroup.position.set(s.x, s.y - 0.65, s.z + 2);
      for (const jet of this.jetGroup.children) {
        jet.scale.set(s.mode === 2 ? 3 : 1.5, s.mode === 2 ? 32 : 16, s.mode === 2 ? 3 : 1.5);
        jet.material.uniforms.uTime.value = this.time;
      }
      this.trailMaterial.uniforms.clock.value = this.time;
      this.trailMaterial.uniforms.cloud.value = +(s.mode === 3);
      for (let k = 0; k < 8; k++) {
        const t = this.trails[k];
        t.mesh.material = s.mode === 3 ? this.cloudMaterial : this.trailMaterial;
        t.mesh.visible = s.mode > 0 && (s.mode === 3 || k < 4);
        if (!t.mesh.visible) continue;
        const cloud = s.mode === 3,
          len = cloud ? 45 : s.mode === 2 ? 40 : 18;
        for (let i = 0; i < 33; i++) {
          const f = i / 32,
            a = f * 8 - this.time * 5 + (k * Math.PI) / 4,
            r = 2 + f * 8;
          t.points[i].set(
            s.x +
              (cloud
                ? Math.cos(a) * r
                : [-4.8, -2.7, 2.7, 4.8][k] + Math.sin(f * 12 - this.time * 18 + k) * f * 0.3),
            s.y +
              (cloud
                ? -0.3 + Math.sin(a) * r * 0.35
                : -0.65 + Math.cos(f * 9 - this.time * 16) * f * 0.3),
            s.z + (cloud ? 0 : 2) + f * len,
          );
        }
        t.options.width = cloud ? 4 : s.mode === 2 ? 2.8 : 1.3;
        t.ribbon.build(t.points, t.options);
      }
      const p = this.sparkGeo.attributes.position.array;
      for (let i = 0; i < 384; i++) {
        const s = this.sparks[i];
        s.life -= dt;
        if (s.life > 0) {
          p[i * 3] += s.vx * dt;
          p[i * 3 + 1] += s.vy * dt;
          p[i * 3 + 2] += s.vz * dt;
          s.vy -= 8 * dt;
        } else p[i * 3 + 1] = -1000;
      }
      this.sparkGeo.attributes.position.needsUpdate = true;
    }
    unshake(camera) {
      camera.position.sub(this.lastShake);
      this.lastShake.set(0, 0, 0);
    }
    shake(camera, reduced) {
      if (reduced) return;
      this.lastShake.copy(this.motion.rig.shakeOffset);
      camera.position.add(this.lastShake);
      camera.rotateZ(this.motion.rig.shakeRoll);
    }
    rebase(z) {
      for (const system of this.gpuSystems) {
        for (const key of ['start', 'origin']) {
          const a = system.data[key];
          for (let i = 2; i < a.length; i += 3) a[i] += z;
          system.attributes[key].needsUpdate = true;
          system.attributes[key].clearUpdateRanges();
        }
        system._ranges.length = 0;
        system._ranges.push([0, system.capacity]);
        system._dirty = true;
      }
      for (const d of this.detonations) if (d.active) d.z += z;
      for (const d of this.debris) if (d.life > 0) d.z += z;
      this.impactLight.position.z += z;
      for (const b of this.bursts) {
        b.mesh.position.z += z;
        b.halo.position.z += z;
      }
      const p = this.sparkGeo.attributes.position.array;
      for (let i = 0; i < 384; i++) if (this.sparks[i].life > 0) p[i * 3 + 2] += z;
    }
    reset() {
      this.motion.reset();
      this.lastShake.set(0, 0, 0);
      this.impactKick = 0;
      this.flowCarry = 0;
      this.smokeCarry = 0;
      for (const system of this.gpuSystems) system.reset();
      this.flash = 0;
      this.impactLight.intensity = 0;
      for (const d of this.detonations) d.active = false;
      for (const d of this.debris) d.life = 0;
      this.trauma = 0;
      this.stormTime = 0;
      this.storm.visible = this.sideStorm.visible = this.jetGroup.visible = false;
      this.cursor = 0;
      this.sparkCursor = 0;
      for (const b of this.bursts) {
        b.age = 1;
        b.mesh.visible = b.halo.visible = false;
      }
      for (const s of this.sparks) s.life = 0;
      for (const t of this.trails) t.mesh.visible = false;
    }
  };
})();
