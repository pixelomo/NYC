// GLSL sources.

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
precision highp sampler2DShadow;
`;

// Shared helpers for lit surfaces
const COMMON = `
uniform sampler2DShadow uShadow;
uniform sampler2D uLightMap;
uniform sampler2D uNoise;
uniform mat4 uShadowMat;
uniform float uShadowOn;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform vec3 uFace;
uniform vec2 uRot;
uniform float uEmis;
uniform float uSnow;
uniform float uWet;
uniform float uTime;
uniform vec4 uCloud;
uniform float uFlash;

float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float nz(vec2 p) { return texture(uNoise, p).r; }

float shadowAt(vec3 wp, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sp = uShadowMat * vec4(wp + n * 0.07 + uSunDir * 0.03, 1.0);
  vec3 s = sp.xyz * 0.5 + 0.5;
  if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  float v = texture(uShadow, vec3(s.xy, s.z - 0.0006));
  // pixel-art: dither the penumbra instead of smooth blending
  return step(bayer4(gl_FragCoord.xy), v);
}
float cloudAt(vec3 wp) {
  float c = nz(wp.xy * 0.006 + uCloud.xy) * 0.65 + nz(wp.xy * 0.017 + uCloud.xy * 1.7) * 0.35;
  float cov = uCloud.z;
  float m = smoothstep(1.0 - cov - 0.08, 1.0 - cov + 0.08, c);
  return 1.0 - m * uCloud.w;
}
vec3 lampAt(vec3 wp) {
  vec3 l = texture(uLightMap, wp.xy / 128.0).rgb;
  float hf = clamp(1.0 - (wp.z - 0.3) / 8.0, 0.0, 1.0);
  return l * (hf * hf);
}
float faceShade(vec3 n) {
  vec2 r = vec2(uRot.x * n.x - uRot.y * n.y, uRot.y * n.x + uRot.x * n.y);
  float wl = max(r.y, 0.0), wr = max(r.x, 0.0);
  float side = mix(uFace.y, uFace.z, wr / (wl + wr + 1e-4));
  return mix(side, uFace.x, clamp(n.z, 0.0, 1.0));
}
`;

export const STATIC_VS = HEAD + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in uvec4 aRect;
layout(location=3) in vec4 aNrm;
layout(location=4) in uvec4 aInfo;
uniform mat4 uViewProj;
uniform uint uVis;
out vec3 vWorld;
out vec2 vUV;
flat out uvec4 vRect;
flat out vec3 vNrm;
flat out uvec4 vInfo;
void main() {
  if (((uVis >> aInfo.z) & 1u) == 0u) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vWorld = aPos;
  vUV = aUV;
  vRect = aRect;
  vNrm = aNrm.xyz;
  vInfo = aInfo;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

export const STATIC_FS = HEAD + COMMON + `
in vec3 vWorld;
in vec2 vUV;
flat in uvec4 vRect;
flat in vec3 vNrm;
flat in uvec4 vInfo;
uniform sampler2DArray uAtlas;
uniform float uResLit;
uniform float uOffLit;
uniform float uLeaves;
uniform float uSeason;
uniform float uFlowers;
uniform vec3 uSkyTop;
uniform vec3 uSkyHor;
uniform vec3 uViewDir;
uniform float uIce;
uniform float uCrown;
uniform vec3 uCrownA;
uniform vec3 uCrownB;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oGlow;

vec3 windowColor(float h) {
  if (h < 0.42) return vec3(1.0, 0.80, 0.45);
  if (h < 0.68) return vec3(1.0, 0.92, 0.72);
  if (h < 0.84) return vec3(0.80, 0.92, 1.0);
  if (h < 0.93) return vec3(1.0, 0.60, 0.32);
  return vec3(0.45, 0.6, 1.0);
}

void main() {
  ivec2 tc = ivec2(vRect.xy) + ivec2(mod(floor(vUV), vec2(vRect.zw)));
  vec4 tex = texelFetch(uAtlas, ivec3(tc, int(vInfo.x)), 0);
  if (tex.a < 0.5 / 255.0) discard;
  uint mat = vInfo.y;
  vec3 n = normalize(vNrm);
  vec3 albedo = tex.rgb;
  float code = floor(tex.a * 255.0 + 0.5);
  vec3 emis = vec3(0.0);
  float refl = 0.0;
  float wetK = 0.0;
  float puddle = 0.0;
  bool ground = (mat & 4u) != 0u;
  vec2 wp2 = vWorld.xy;
  // stable per-texel world coordinate for noise (texel grid)
  vec2 tp = floor(vWorld.xy * 16.0) / 16.0;

  if (ground) {
    int g = int(code);
    float n1 = nz(tp * 0.11);
    float n2 = hash12(floor(vWorld.xy * 8.0));
    float n3 = nz(tp * 0.035 + 0.3);
    // water
    if (g == 15) {
      if (uIce > 0.5) {
        albedo = mix(vec3(0.78, 0.88, 0.95), vec3(0.92, 0.96, 1.0), step(0.6, n1));
        if (hash12(floor(vWorld.xy * 16.0)) < 0.04) albedo *= 0.85;
      } else {
        float w = nz(tp * 0.25 + vec2(uTime * 0.02, uTime * 0.013)) + nz(tp * 0.31 - vec2(uTime * 0.017, -uTime * 0.01));
        albedo = mix(vec3(0.16, 0.42, 0.55), vec3(0.28, 0.62, 0.72), smoothstep(0.7, 1.3, w));
        refl = 0.35;
        if (w > 1.38) albedo = vec3(0.75, 0.92, 1.0);
      }
    }
    // autumn leaves
    if (uLeaves > 0.0 && (g == 6 || g == 8 || g == 9 || g == 11 || g == 17 || g == 22)) {
      float k = (g == 8 || g == 9) ? 1.0 : 0.55;
      if (n2 < uLeaves * 0.26 * k * smoothstep(0.35, 0.75, n3)) {
        float h = hash12(floor(vWorld.xy * 8.0) + 7.0);
        albedo = h < 0.33 ? vec3(0.85, 0.42, 0.12) : h < 0.66 ? vec3(0.72, 0.22, 0.10) : vec3(0.88, 0.66, 0.18);
      }
    }
    // spring/summer flowers
    if (g == 10) {
      float h = hash12(floor(vWorld.xy * 8.0) + 3.0);
      if (uFlowers > 0.0 && h < 0.42 * uFlowers) {
        float c = hash12(floor(vWorld.xy * 8.0) + 11.0);
        vec3 fc = uSeason < 0.5 ? (c < 0.4 ? vec3(0.95, 0.2, 0.25) : c < 0.75 ? vec3(1.0, 0.85, 0.2) : vec3(0.95, 0.55, 0.85))
                : uSeason < 1.5 ? (c < 0.3 ? vec3(0.95, 0.35, 0.6) : c < 0.6 ? vec3(0.4, 0.5, 0.95) : vec3(1.0, 0.95, 0.9))
                : (c < 0.5 ? vec3(0.95, 0.55, 0.15) : vec3(0.75, 0.2, 0.2));
        albedo = fc;
      } else if (uFlowers > 0.0 && h < 0.75) {
        albedo = vec3(0.22, 0.48, 0.18);
      }
    }
    if (g == 8 && uSeason < 0.5 && uFlowers > 0.0 && n2 > 0.985) albedo = vec3(1.0, 0.95, 0.6);
    if (g == 8 && uSeason > 1.5 && uSeason < 2.5) albedo = mix(albedo, vec3(0.55, 0.55, 0.25), 0.25);
    // wetness
    bool hard = (g <= 7) || g == 11 || g == 12 || g == 13 || g == 16 || g == 17 || g == 19 || g == 20 || g == 18;
    if (hard) {
      wetK = uWet;
      float pm = nz(tp * 0.05 + 4.1) * 0.7 + nz(tp * 0.2) * 0.3;
      puddle = uWet * smoothstep(0.62, 0.66, pm);
    } else wetK = uWet * 0.6;
    // snow
    if (uSnow > 0.001) {
      float sn = nz(tp * 0.045 + 7.3);
      vec3 snowC = mix(vec3(0.84, 0.89, 0.97), vec3(0.97, 0.98, 1.0), smoothstep(0.35, 0.65, sn));
      float cover = 0.0;
      if (g == 1 || g == 3 || g == 4 || g == 5 || g == 19 || g == 20 || g == 18) {
        // driven lanes: slush
        float s = smoothstep(0.0, 1.0, uSnow) * (0.55 + 0.45 * n3);
        vec3 slush = mix(vec3(0.40, 0.40, 0.43), vec3(0.58, 0.57, 0.56), smoothstep(0.3, 0.7, n1));
        albedo = mix(albedo, slush, s * 0.8);
        if (n1 < uSnow * 0.38 - 0.05) albedo = snowC * 0.94;
      } else if (g == 2) {
        cover = uSnow * 1.15;
      } else if (g == 6 || g == 7) {
        cover = uSnow * (0.35 + 0.6 * n3);
      } else if (g == 15) {
        cover = uIce > 0.5 ? uSnow * 0.3 : 0.0;
      } else {
        cover = uSnow * 1.25;
      }
      float thr = n1 * 0.85 + n2 * 0.15;
      if (thr < cover - 0.05) { albedo = snowC; wetK *= 0.2; puddle = 0.0; }
      else if (thr < cover + 0.02) { albedo = mix(albedo, snowC, 0.55); }
    }
  } else {
    // non-ground: snow on top-facing surfaces
    if ((mat & 1u) != 0u && n.z > 0.55 && uSnow > 0.001) {
      float n1 = nz(tp * 0.13 + vWorld.z * 0.07);
      float n2 = hash12(floor(vWorld.xy * 8.0));
      if (n1 * 0.85 + n2 * 0.15 < uSnow * 1.3 - 0.05) {
        albedo = mix(vec3(0.86, 0.9, 0.98), vec3(0.98, 0.99, 1.0), smoothstep(0.3, 0.7, nz(tp * 0.05)));
        code = 255.0;
      }
    }
    if ((mat & 16u) != 0u) wetK = uWet * (n.z > 0.5 ? 1.0 : 0.35);
    // windows / emissive codes
    if (code > 0.5 && code < 254.5) {
      bool selfC = code >= 128.0;
      float t = selfC ? (code - 128.0) / 126.0 : (code - 1.0) / 126.0;
      // per-floor variation for tiled facades
      float fl = floor(vUV.y / float(vRect.w));
      float fc = floor(vUV.x / float(vRect.z));
      if (fl > 0.5 || fc > 0.5 || vInfo.w > 0u) {
        float hf = hash12(vec2(fl * 1.37 + float(vInfo.w) * 3.1, fc * 2.11 + t * 17.0));
        t = mix(hf, t, 0.35);
      }
      bool office = (mat & 8u) != 0u;
      float lit = office ? uOffLit : uResLit;
      if (selfC && t > 0.985) {
        // special crown lighting (art-deco tower etc.)
        emis = mix(uCrownA, uCrownB, step(0.5, fract(vWorld.z * 0.5 + 0.25))) * albedo * 2.2 * uCrown;
      } else if (t < lit) {
        float h = hash12(vec2(t * 91.0, fl + float(vInfo.w)));
        vec3 wc = selfC ? albedo * 1.15 + 0.04 : windowColor(h);
        if (!selfC && h > 0.93) wc *= 0.75 + 0.25 * sin(uTime * (7.0 + h * 9.0) + t * 40.0) * sin(uTime * 2.3 + h * 20.0);
        emis = wc * uEmis;
      }
      if (!selfC) refl = (mat & 2u) != 0u ? 0.55 : 0.22;
    }
  }

  // lighting
  float ndl = dot(n, uSunDir);
  float sh = ndl > 0.0 ? shadowAt(vWorld, n) : 0.0;
  float cl = cloudAt(vWorld);
  vec3 light = uAmb * faceShade(n) + uSunCol * max(ndl, 0.0) * sh * cl;
  vec3 lamp = lampAt(vWorld);
  light += lamp * (0.55 + 0.45 * max(n.z, 0.0));
  light += vec3(uFlash);

  float wetDark = 1.0 - wetK * 0.38;
  vec3 col = albedo * wetDark * light;

  // reflections (glass, water, puddles)
  vec3 r = reflect(-uViewDir, n);
  vec3 sky = mix(uSkyHor, uSkyTop, clamp(r.z * 1.4, 0.0, 1.0));
  if (refl > 0.0) {
    float spec = pow(max(dot(r, uSunDir), 0.0), 48.0) * sh;
    col = mix(col, sky * (0.55 + 0.45 * cl), refl) + uSunCol * spec * refl * 1.5;
  }
  if (puddle > 0.0) {
    col = mix(col, sky * 0.75 + lamp * 1.4, puddle * 0.75);
  } else if (wetK > 0.0 && n.z > 0.5) {
    col += lamp * wetK * 0.5;
  }

  col += emis;
  oColor = vec4(col, 1.0);
  oGlow = vec4(emis * 0.85 + lamp * puddle * 0.25, 1.0);
}`;

// Depth-only pass for the sun shadow map
export const SHADOW_VS = HEAD + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in uvec4 aRect;
layout(location=4) in uvec4 aInfo;
uniform mat4 uShadowVP;
uniform uint uVis;
out vec2 vUV;
flat out uvec4 vRect;
flat out uint vLayer;
void main() {
  if (((uVis >> aInfo.z) & 1u) == 0u) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vUV = aUV; vRect = aRect; vLayer = aInfo.x;
  gl_Position = uShadowVP * vec4(aPos, 1.0);
}`;

export const SHADOW_FS = HEAD + `
in vec2 vUV;
flat in uvec4 vRect;
flat in uint vLayer;
uniform sampler2DArray uAtlas;
out vec4 o;
void main() {
  ivec2 tc = ivec2(vRect.xy) + ivec2(mod(floor(vUV), vec2(vRect.zw)));
  if (texelFetch(uAtlas, ivec3(tc, int(vLayer)), 0).a < 0.5 / 255.0) discard;
  o = vec4(1.0);
}`;

// Fullscreen triangle
export const FS_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Background sky with stars and moon
export const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uTop;
uniform vec3 uBottom;
uniform float uStars;
uniform float uTime;
uniform vec2 uBuf;
uniform float uRotA;
uniform vec3 uMoon; // x,y in [0,1], z = visibility
uniform vec4 uShadowBlob; // centre (buffer px), radius x, radius y
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oGlow;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 px = floor(vUv * uBuf);
  float t = vUv.y;
  vec3 c = mix(uBottom, uTop, smoothstep(0.0, 1.0, t));
  // dithered banding for a pixel look
  float d = fract(sin(dot(px, vec2(0.71, 0.93))) * 91.7);
  c += (d - 0.5) / 255.0 * 3.0;
  vec3 g = vec3(0.0);
  if (uStars > 0.01) {
    vec2 sp = px + vec2(uRotA * 180.0, 0.0);
    float s = h(floor(sp));
    if (s > 0.9965) {
      float tw = 0.6 + 0.4 * sin(uTime * (1.0 + s * 6.0) + s * 100.0);
      vec3 sc = vec3(0.9, 0.95, 1.0) * tw * uStars * smoothstep(0.15, 0.6, t);
      c += sc; g += sc * 0.3;
    }
  }
  if (uMoon.z > 0.01) {
    vec2 mp = uMoon.xy * uBuf;
    float r = 7.0;
    float dd = length(px + 0.5 - mp);
    if (dd < r) {
      float crater = h(floor((px - mp) / 2.0)) > 0.8 ? 0.85 : 1.0;
      vec3 mc = vec3(0.95, 0.93, 0.82) * crater * uMoon.z;
      c = mix(c, mc, uMoon.z); g += mc * 0.6;
    } else if (dd < r + 10.0) {
      float k = (1.0 - (dd - r) / 10.0);
      c += vec3(0.25, 0.28, 0.35) * k * k * uMoon.z * 0.6;
    }
  }
  // soft shadow of the floating diorama on the void below
  if (uShadowBlob.z > 1.0) {
    vec2 q = (px - uShadowBlob.xy) / uShadowBlob.zw;
    float dd = dot(q, q);
    float sh = clamp(1.0 - dd, 0.0, 1.0);
    sh = floor(sh * 5.0) / 5.0;
    c *= 1.0 - sh * 0.28;
  }
  oColor = vec4(c, 1.0);
  oGlow = vec4(g, 1.0);
}`;

// Separable blur for bloom
export const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uDir;
uniform float uGain;
out vec4 o;
void main() {
  vec3 s = texture(uSrc, vUv).rgb * 0.227027;
  s += texture(uSrc, vUv + uDir * 1.3846).rgb * 0.3162162;
  s += texture(uSrc, vUv - uDir * 1.3846).rgb * 0.3162162;
  s += texture(uSrc, vUv + uDir * 3.2308).rgb * 0.0702703;
  s += texture(uSrc, vUv - uDir * 3.2308).rgb * 0.0702703;
  o = vec4(s * uGain, 1.0);
}`;

// Final composite to the screen
export const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uBloom2;
uniform sampler2D uDepth;
uniform vec2 uBuf;
uniform vec2 uCanvas;
uniform float uScale;
uniform vec2 uFrac;
uniform float uBloomK;
uniform vec3 uGrade;
uniform float uSat;
uniform float uVignette;
uniform float uOutline;
uniform float uFlash;
uniform float uLinear;
uniform vec4 uFog; // rgb, amount
out vec4 o;
void main() {
  vec2 X = gl_FragCoord.xy;
  vec2 p = vec2(uBuf.x * 0.5 + (X.x - uCanvas.x * 0.5) / uScale + uFrac.x,
                uBuf.y * 0.5 + (X.y - uCanvas.y * 0.5) / uScale - uFrac.y);
  vec2 uv = uLinear > 0.5 ? p / uBuf : (floor(p) + 0.5) / uBuf;
  vec3 c = texture(uScene, uv).rgb;
  if (uOutline > 0.0 && uLinear < 0.5) {
    vec2 q = (floor(p) + 0.5) / uBuf;
    vec2 e = 1.0 / uBuf;
    float d0 = texture(uDepth, q).r;
    float dn = min(min(texture(uDepth, q + vec2(e.x, 0.0)).r, texture(uDepth, q - vec2(e.x, 0.0)).r),
                   min(texture(uDepth, q + vec2(0.0, e.y)).r, texture(uDepth, q - vec2(0.0, e.y)).r));
    if (d0 - dn > 0.006) c *= (1.0 - uOutline);
  }
  if (uFog.w > 0.001) {
    float dz = texture(uDepth, (floor(p) + 0.5) / uBuf).r;
    float back = dz >= 0.9999 ? 1.0 : clamp((dz - 0.35) * 2.2, 0.0, 1.0);
    float ny = gl_FragCoord.y / uCanvas.y;
    c = mix(c, uFog.rgb, uFog.w * (0.3 + 0.55 * back + 0.15 * ny));
  }
  vec3 b = texture(uBloom, p / uBuf).rgb + texture(uBloom2, p / uBuf).rgb;
  c += b * uBloomK;
  c *= uGrade;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  vec2 sc = gl_FragCoord.xy / uCanvas - 0.5;
  c *= 1.0 - dot(sc, sc) * uVignette;
  c += vec3(uFlash * 0.25);
  o = vec4(c, 1.0);
}`;
