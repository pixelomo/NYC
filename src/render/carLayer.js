// Instanced 3D vehicles. Bodies are lofted from cross-sections (chamfered corners, sloped hoods and glass,
// tumblehome cabins) with 10-sided wheels, textured from the palette-indexed sprite atlas by planar projection.

import { createProgram, makeBuffer } from '../core/gl.js';
import { MeshBuilder, MAT } from '../world/mesh.js';
import { RNG } from '../core/math.js';
import { T, LIGHT_EXT_X, LIGHT_EXT_Y } from '../world/layout.js';

const CAR_CAP = 768; // instances per vehicle type per frame
const IS = 16; // floats per instance: position+heading, palette/alpha/snow/lift, crumple, burn/dents/seed

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// lower-body cross-section: vertical side up to a shoulder crease, rolled over to a flat top
const bodySec = (w, zb, zs, zt, inset = 0.045) => [[-w, zb], [-w, zs], [-(w - inset), zt], [w - inset, zt], [w, zs], [w, zb]];
// cabin cross-section with tumblehome: base half-width wb at zb, roof half-width wr at zr
const cabSec = (wb, zb, wr, zr) => [[-wb, zb], [-wr, zr], [wr, zr], [wb, zb]];

function bboxOf(st) {
  const bb = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const s of st) {
    bb.x0 = Math.min(bb.x0, s.x); bb.x1 = Math.max(bb.x1, s.x);
    for (const [y, z] of s.pts) { bb.y0 = Math.min(bb.y0, y); bb.y1 = Math.max(bb.y1, y); bb.z0 = Math.min(bb.z0, z); bb.z1 = Math.max(bb.z1, z); }
  }
  return bb;
}

// Emit a planar face with UVs projected along its dominant axis (or a forced texture key).
function face(mb, q, tx, bb, c, force, mat = 0) {
  const pts = [];
  for (const p of q) if (!pts.some((r) => Math.abs(r[0] - p[0]) + Math.abs(r[1] - p[1]) + Math.abs(r[2] - p[2]) < 1e-6)) pts.push(p);
  if (pts.length < 3) return;
  let n = pts.length === 4 ? cross3(sub3(pts[2], pts[0]), sub3(pts[3], pts[1])) : cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0]));
  const l = Math.hypot(n[0], n[1], n[2]);
  if (l < 1e-9) return;
  n = [n[0] / l, n[1] / l, n[2] / l];
  const cen = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) cen[k] += p[k] / pts.length;
  if (dot3(n, sub3(cen, c)) < 0) n = [-n[0], -n[1], -n[2]];
  if (n[2] < -0.6) return; // undersides are never visible
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const key = force || (az >= ax && az >= ay ? 'top' : ay >= ax ? 'side' : n[0] > 0 ? 'front' : 'back');
  const tex = tx[key] || tx.side;
  let uv;
  if (key === 'top') uv = (p) => [(p[0] - bb.x0) * T, (p[1] - bb.y0) * T];
  else if (key === 'side') uv = (p) => [(p[0] - bb.x0) * T, (bb.z1 - p[2]) * T];
  else if (key === 'front' || key === 'glassF') uv = (p) => [(bb.y1 - p[1]) * T, (bb.z1 - p[2]) * T];
  else uv = (p) => [(p[1] - bb.y0) * T, (bb.z1 - p[2]) * T];
  if (pts.length === 4) mb.quad(pts[0], pts[1], pts[2], pts[3], pts.map(uv), tex, n, mat);
  else mb.tri(pts[0], pts[1], pts[2], pts.map(uv), tex, n, mat);
}

// Loft a solid through cross-sections placed along x (stations: [{x, pts: [[y, z], ...]}], same point count).
function loft(mb, st, tx, o = {}) {
  const bb = o.bb || bboxOf(st);
  const c = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, (bb.z0 + bb.z1) / 2];
  const P = (s, j) => [s.x, s.pts[j][0], s.pts[j][1]];
  for (let i = 0; i < st.length - 1; i++)
    for (let j = 0; j < st[i].pts.length - 1; j++)
      face(mb, [P(st[i], j), P(st[i + 1], j), P(st[i + 1], j + 1), P(st[i], j + 1)], tx, bb, c, o.faceKey ? o.faceKey(i, j) : null, o.mat);
  if (o.caps !== false) {
    for (const [s, key] of [[st[0], 'back'], [st[st.length - 1], 'front']]) {
      const pts = s.pts.map((p) => [s.x, p[0], p[1]]);
      for (let k = 1; k < pts.length - 1; k++) face(mb, [pts[0], pts[k], pts[k + 1]], tx, bb, c, key, o.mat);
    }
  }
  return bb;
}

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;
`;

// Crash damage, per instance: crumple at the front and back ends, dents in the sides around where
// they were hit, a little crumpled jitter on top, and a burnt-out shell that sags.
const DEFORM = `
layout(location=7) in vec4 iC; // crumple: front, rear, left, right (0..1)
layout(location=8) in vec4 iD; // burnt, left dent centre, right dent centre, seed
uniform vec3 uHalf;            // half length, half width, height of this vehicle type
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 deform(vec3 lp) {
  if (iC.x + iC.y + iC.z + iC.w + iD.x < 0.001) return lp;
  float fx = lp.x / uHalf.x, fy = lp.y / uHalf.y, fz = clamp(lp.z / uHalf.z, 0.0, 1.0);
  float wf = smoothstep(0.3, 1.0, fx) * iC.x;
  float wr = smoothstep(0.3, 1.0, -fx) * iC.y;
  float wl = smoothstep(0.25, 1.0, fy) * exp(-pow((fx - iD.y) * 2.2, 2.0)) * iC.z;
  float wrt = smoothstep(0.25, 1.0, -fy) * exp(-pow((fx - iD.z) * 2.2, 2.0)) * iC.w;
  lp.x += (wr - wf) * uHalf.x * 0.2;
  lp.z -= (wf * 0.14 + wr * 0.08) * fz * uHalf.z;
  lp.y += (wrt - wl) * uHalf.y * 0.45;
  float crump = min(1.0, wf + wr + wl + wrt);
  vec3 j = vec3(hash13(lp * 13.0 + iD.w), hash13(lp.yzx * 11.0 + iD.w * 3.0), hash13(lp.zxy * 9.0 + iD.w * 7.0)) - 0.5;
  lp += j * 0.05 * crump;
  lp.z -= iD.x * 0.07 * fz;
  return lp;
}
`;

const VS = HEAD + DEFORM + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in uvec4 aRect;
layout(location=3) in vec4 aNrm;
layout(location=4) in uvec4 aInfo;
layout(location=5) in vec4 iA; // x, y, z, heading
layout(location=6) in vec4 iB; // palRow, alpha, snow, lift
uniform mat4 uViewProj;
uniform vec2 uBuf;
out vec2 vUV;
flat out uvec4 vRect;
flat out vec3 vNrm;
out vec3 vWorld;
out vec3 vLocal;
flat out vec4 vB;
flat out vec4 vC;
flat out vec4 vD;
flat out uint vMat;
void main() {
  float c = cos(iA.w), s = sin(iA.w);
  vLocal = aPos; vC = iC; vD = iD;
  vec3 lp = deform(aPos);
  vec3 wp = vec3(iA.x + lp.x * c - lp.y * s, iA.y + lp.x * s + lp.y * c, iA.z + lp.z + iB.w);
  vNrm = vec3(aNrm.x * c - aNrm.y * s, aNrm.x * s + aNrm.y * c, aNrm.z);
  vUV = aUV; vRect = aRect; vWorld = wp; vB = iB; vMat = aInfo.y;
  vec4 cc = uViewProj * vec4(iA.xyz, 1.0);
  vec2 px = (cc.xy * 0.5 + 0.5) * uBuf;
  vec2 snap = (floor(px + 0.5) - px) / uBuf * 2.0;
  vec4 p = uViewProj * vec4(wp, 1.0);
  p.xy += snap;
  gl_Position = p;
}`;

const FS = HEAD + `
in vec2 vUV;
flat in uvec4 vRect;
flat in vec3 vNrm;
in vec3 vWorld;
in vec3 vLocal;
flat in vec4 vB;
flat in vec4 vC;
flat in vec4 vD;
flat in uint vMat;
uniform vec3 uHalf;
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
uniform sampler2D uSprites;
uniform sampler2D uPal;
uniform sampler2DShadow uShadow;
uniform sampler2D uLightMap;
uniform sampler2D uNoise;
uniform mat4 uShadowMat;
uniform vec2 uShadowK;
uniform vec2 uDither;
uniform float uShadowOn;
uniform vec3 uSunDir, uSunCol, uAmb, uFace;
uniform vec2 uRot;
uniform vec4 uCloud;
uniform float uFlash, uEmis;
uniform vec3 uSkyTop, uSkyHor, uViewDir;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oGlow;
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
float faceShade(vec3 n) {
  vec2 r = vec2(uRot.x * n.x - uRot.y * n.y, uRot.y * n.x + uRot.x * n.y);
  float wl = max(r.y, 0.0), wr = max(r.x, 0.0);
  float side = mix(uFace.y, uFace.z, wr / (wl + wr + 1e-4));
  return mix(side, uFace.x, clamp(n.z, 0.0, 1.0));
}
void main() {
  if (vB.y < 0.999 && bayer4(gl_FragCoord.xy) >= vB.y) discard;
  ivec2 tc = ivec2(vRect.xy) + ivec2(clamp(floor(vUV), vec2(0.0), vec2(vRect.zw) - 1.0));
  vec4 t = texelFetch(uSprites, tc, 0);
  if (t.a < 0.5) discard;
  int row = int(vB.x + 0.5);
  int slot = int(t.r * 255.0 + 0.5);
  vec4 pc = texelFetch(uPal, ivec2(slot, row), 0);
  if (pc.a < 0.1) discard;
  // how hard this spot was hit
  float fx = vLocal.x / uHalf.x, fy = vLocal.y / uHalf.y, burnt = vD.x;
  float dmg = smoothstep(0.35, 1.0, fx) * vC.x + smoothstep(0.35, 1.0, -fx) * vC.y
    + (smoothstep(0.35, 1.0, fy) * exp(-pow((fx - vD.y) * 2.0, 2.0)) * vC.z + smoothstep(0.35, 1.0, -fy) * exp(-pow((fx - vD.z) * 2.0, 2.0)) * vC.w) * 1.15;
  // smashed lamps on a crushed end, and nothing lights up on a burnt shell
  if ((slot == 5 && vC.x > 0.4) || (slot == 6 && vC.y > 0.4) || (burnt > 0.5 && (slot == 5 || slot == 6 || slot == 10 || slot == 11 || slot == 12 || slot == 16 || slot == 8))) pc = vec4(0.11, 0.1, 0.1, 1.0);
  vec3 albedo = pc.rgb * (t.g * 255.0 / 128.0);
  vec3 n = normalize(vNrm);
  float h = hash13(floor(vLocal * 32.0) + vD.w * 17.0);
  if (dmg > 0.03) {
    // crumpled panels catch the light facet by facet
    vec3 dn = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(dn, n) < 0.0) dn = -dn;
    n = normalize(mix(n, dn, clamp(dmg, 0.0, 0.5)));
    bool paint = slot == 1 || slot == 2 || slot == 8 || slot == 9 || slot == 13;
    if (paint) {
      // bare-metal scrapes run along the body; the rest of the hit panel is dented and dull
      float sc = hash13(floor(vLocal * vec3(9.0, 40.0, 40.0)) + vD.w * 23.0);
      if (sc < dmg * 0.24) albedo = vec3(0.5, 0.5, 0.52) * (0.8 + 0.4 * h);
      else albedo *= 1.0 - smoothstep(0.1, 0.9, dmg) * (0.18 + 0.2 * step(h, 0.5));
    }
    if (slot == 3 && dmg > 0.22) {
      float web = hash13(floor(vLocal * 16.0) + 3.0 + vD.w);
      if (web < dmg * 0.5) albedo = vec3(0.82, 0.86, 0.9) * (0.7 + 0.4 * h);
      else if (web > 1.0 - dmg * 0.35) albedo = vec3(0.08, 0.09, 0.1);
    }
  }
  if (burnt > 0.0) {
    vec3 ch = vec3(0.085, 0.078, 0.072) * (0.7 + 0.7 * h);
    if (h > 0.84) ch = vec3(0.30, 0.15, 0.07);
    if (slot == 3) ch = vec3(0.03);
    albedo = mix(albedo, ch, burnt);
    pc.a = max(pc.a, burnt > 0.5 ? 1.0 : pc.a);
  }
  if (pc.a < 0.75) {
    oColor = vec4(albedo * 1.15, 1.0);
    oGlow = vec4(albedo, 1.0);
    return;
  }
  // snow on roofs of parked cars
  if (vB.z > 0.0 && n.z > 0.6 && burnt < 0.5) {
    float h = fract(sin(dot(floor(vWorld.xy * 32.0), vec2(12.9898, 78.233))) * 43758.5453);
    float nn = texture(uNoise, vWorld.xy * 0.35).r;
    if (nn * 0.85 + h * 0.15 < vB.z * 1.35) albedo = mix(vec3(0.86, 0.9, 0.97), vec3(0.98, 0.99, 1.0), smoothstep(0.3, 0.7, nn));
  }
  float ndl = dot(n, uSunDir);
  float sh = 1.0;
  if (uShadowOn > 0.5 && ndl > 0.0) {
    float tx = uShadowK.x, sinT = sqrt(max(1.0 - ndl * ndl, 0.0));
    vec4 sp = uShadowMat * vec4(vWorld + n * tx * (1.0 + 1.6 * sinT) + uSunDir * tx * 0.5, 1.0);
    vec3 s = sp.xyz * 0.5 + 0.5;
    float bias = tx * (0.6 + 1.1 * min(sinT / max(ndl, 0.05), 5.0)) * uShadowK.y;
    if (s.x > 0.0 && s.y > 0.0 && s.x < 1.0 && s.y < 1.0 && s.z < 1.0) sh = step(bayer4(vec2(floor(gl_FragCoord.x) + uDither.x, uDither.y - floor(gl_FragCoord.y))), texture(uShadow, vec3(s.xy, s.z - bias)));
  } else if (ndl <= 0.0) sh = 0.0;
  float cn = texture(uNoise, vWorld.xy * 0.006 + uCloud.xy).r * 0.65 + texture(uNoise, vWorld.xy * 0.017 + uCloud.xy * 1.7).r * 0.35;
  float cl = 1.0 - smoothstep(1.0 - uCloud.z - 0.08, 1.0 - uCloud.z + 0.08, cn) * uCloud.w;
  vec3 lm = vWorld.z < -0.5 ? vec3(0.0) : texture(uLightMap, vWorld.xy / vec2(${LIGHT_EXT_X.toFixed(1)}, ${LIGHT_EXT_Y.toFixed(1)})).rgb;
  vec3 light = uAmb * faceShade(n) + uSunCol * max(ndl, 0.0) * sh * cl + lm * (0.6 + 0.4 * max(n.z, 0.0)) + vec3(uFlash);
  if (vWorld.z < -0.5) light = light * 0.5 + vec3(0.16, 0.15, 0.13);
  vec3 col = albedo * light;
  // glossy paint / glass reflection
  if (slot == 3 && burnt < 0.5 && dmg < 0.5) {
    vec3 r = reflect(-uViewDir, n);
    vec3 sky = mix(uSkyHor, uSkyTop, clamp(r.z * 1.4, 0.0, 1.0));
    col = mix(col, sky * 0.8, 0.45) + lm * 0.3;
  } else if (n.z > 0.6) {
    col += uSunCol * pow(max(dot(reflect(-uViewDir, n), uSunDir), 0.0), 24.0) * 0.35 * sh;
  }
  oColor = vec4(col, 1.0);
  oGlow = vec4(0.0, 0.0, 0.0, 1.0);
}`;

const SHADOW_VS = HEAD + DEFORM + `
layout(location=0) in vec3 aPos;
layout(location=5) in vec4 iA;
layout(location=6) in vec4 iB;
uniform mat4 uShadowVP;
void main() {
  float c = cos(iA.w), s = sin(iA.w);
  vec3 lp = deform(aPos);
  vec3 wp = vec3(iA.x + lp.x * c - lp.y * s, iA.y + lp.x * s + lp.y * c, iA.z + lp.z + iB.w);
  gl_Position = uShadowVP * vec4(wp, 1.0);
}`;
const SHADOW_FS = `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(1.0); }`;

// Car palette slots
export const CS = { BODY: 1, TRIM: 2, GLASS: 3, TIRE: 4, HEAD: 5, TAIL: 6, CHROME: 7, SIGN: 8, ACCENT: 9, SIREN_R: 10, SIREN_B: 11, INTERIOR: 12, WHITE: 13, BLACK: 14, PLATE: 15, LED: 16 };

const BODY_COLORS = [0xc8302c, 0x2a5fb8, 0xf2f2ee, 0x1e1e22, 0x8d9097, 0x2f6a3a, 0x7a1f1f, 0xd8d0c0, 0x3a4a6a, 0xe08a30, 0x5a3a6a, 0xb8bcc2, 0x1f3a5f];

export class CarLayer {
  constructor(gl, city) {
    this.gl = gl;
    this.city = city;
    this.atlas = city.atlas;
    this.pal = city.pal;
    this.prog = createProgram(gl, VS, FS, 'cars');
    this.shadowProg = createProgram(gl, SHADOW_VS, SHADOW_FS, 'carShadow');
    this.rng = new RNG(88);
    this.types = {};
    this.buildMeshes();
  }

  // paint a palette-indexed region of the sprite atlas
  reg(w, h, paint) {
    const f = this.atlas.add(null, w, h, paint, 0, 0);
    return { x: f.x, y: f.y, w, h, layer: 0 };
  }

  buildMeshes() {
    const A = this;
    const reg = (w, h, paint) => A.reg(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), paint);
    const solid = (slot, shade = 128) => reg(2, 2, (sp) => sp.rect(0, 0, 2, 2, slot, shade));
    this.solid = {
      body: solid(CS.BODY), bodyTop: solid(CS.BODY, 140), trim: solid(CS.TRIM), glass: solid(CS.GLASS), tire: solid(CS.TIRE, 90),
      chrome: solid(CS.CHROME), sign: solid(CS.SIGN), accent: solid(CS.ACCENT), red: solid(CS.SIREN_R), blue: solid(CS.SIREN_B),
      white: solid(CS.WHITE), black: solid(CS.BLACK), led: solid(CS.LED), plastic: solid(CS.TRIM, 110), cargo: solid(CS.WHITE, 120),
    };
    const S = this.solid;
    const all = (t) => ({ px: t, nx: t, py: t, ny: t, pz: t });
    const box = (mb, x0, y0, z0, x1, y1, z1, F) => mb.box(x0, y0, z0, x1, y1, z1, F.px ? F : all(F), { topMat: MAT.SNOW, mat: 0 });

    // ---- texture painters shared by all vehicles ---------------------------------------------
    const wheelTex = (r, rim = CS.CHROME) => {
      const D = Math.round(2 * r * T);
      return reg(D, D, (sp) => {
        const c = (D - 1) / 2;
        for (let y = 0; y < D; y++)
          for (let x = 0; x < D; x++) {
            const d = Math.hypot(x - c, y - c) / (D / 2);
            let slot = CS.TIRE, sh = d > 0.86 ? 96 : 112;
            if (d < 0.6) { slot = rim; sh = x + y < D - 2 ? 150 : 112; }
            if (d >= 0.6 && d < 0.68) sh = 74;
            if (d < 0.2) { slot = CS.TIRE; sh = 100; }
            sp.set(x, y, slot, sh);
          }
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 - 0.4;
          sp.set(Math.round(c + Math.cos(a) * D * 0.2), Math.round(c + Math.sin(a) * D * 0.2), CS.BLACK, 90);
        }
      });
    };
    // side elevation of a lower body: shoulder highlight, crease, rocker, wheel arches
    const paintBodySide = (sp, Lt, Ht, o) => {
      const vs = o.vs;
      for (let y = 0; y < Ht; y++)
        for (let x = 0; x < Lt; x++) {
          const sh = y < vs ? 146 : y === vs ? 160 : y >= Ht - 2 ? 100 : 130 - Math.round(((y - vs) / Ht) * 24);
          sp.set(x, y, o.slot ?? CS.BODY, sh);
        }
      for (const [cu, cv, R] of o.arches || []) {
        for (let y = 0; y < Ht; y++)
          for (let x = Math.floor(cu - R - 2); x <= Math.ceil(cu + R + 2); x++) {
            const d = Math.hypot(x + 0.5 - cu, y + 0.5 - cv);
            if (d < R) sp.set(x, y, CS.BLACK, d > R - 1.2 ? 64 : 48);
            else if (d < R + 1.2 && y + 0.5 < cv) sp.set(x, y, o.slot ?? CS.BODY, 160);
          }
      }
      for (let x = 0; x < Lt; x++) sp.set(x, Ht - 1, CS.TRIM, 80);
    };
    const glassPanel = (W, H, o = {}) => reg(W, H, (sp) => {
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const frame = x < (o.fx ?? 1) || x >= W - (o.fx ?? 1) || y < (o.ft ?? 1) || (o.fb && y >= H - o.fb);
          const streak = (x - y * 2 + 64) % 15 < 3;
          sp.set(x, y, frame ? (o.frame ?? CS.BODY) : CS.GLASS, frame ? 132 : streak ? 158 : 126 - Math.round((y / H) * 18) + (o.dark ? -14 : 0));
        }
      if (o.wipers) for (let x = 3; x < W - 3; x++) if (x % 10 < 6) sp.set(x, H - 1 - (x % 10 < 3 ? 0 : 1), CS.BLACK, 90);
      if (o.brake) for (let x = (W >> 1) - 3; x < (W >> 1) + 3; x++) sp.set(x, o.ft ?? 1, CS.TAIL, 128);
    });

    // ---- geometry -------------------------------------------------------------------------------
    const wheelsAt = (mb, xs, yOff, r, wdt, tex) => {
      const N = 10;
      for (const x of xs)
        for (const s of [-1, 1]) {
          const ring = [];
          for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2; ring.push([x + Math.cos(a) * r, r + Math.sin(a) * r]); }
          const ya = s * yOff - wdt / 2, yb = s * yOff + wdt / 2;
          for (let k = 0; k < N; k++) {
            const a = ring[k], b = ring[(k + 1) % N];
            const am = ((k + 0.5) / N) * Math.PI * 2;
            const n = [Math.cos(am), 0, Math.sin(am)];
            if (n[2] < -0.5) continue;
            mb.quad([a[0], ya, a[1]], [b[0], ya, b[1]], [b[0], yb, b[1]], [a[0], yb, a[1]], [[0, 0], [1, 0], [1, 1], [0, 1]], S.tire, n, 0);
          }
          const yo = s > 0 ? yb : ya, D = 2 * r;
          const uv = (p) => [(p[0] - (x - r)) * T, (D - p[1]) * T];
          for (let k = 0; k < N; k++) {
            const a = ring[k], b = ring[(k + 1) % N];
            mb.tri([x, yo, r], [a[0], yo, a[1]], [b[0], yo, b[1]], [uv([x, r]), uv(a), uv(b)], tex, [0, s, 0], 0);
          }
        }
    };
    const mirrors = (mb, x, w, z) => {
      for (const s of [-1, 1]) box(mb, x - 0.04, s > 0 ? w - 0.01 : -w - 0.06, z, x + 0.04, s > 0 ? w + 0.06 : -w + 0.01, z + 0.06, S.body);
    };

    // ---- cars: lower tub + glasshouse ------------------------------------------------------------
    const sedan = (o = {}) => {
      const mb = new MeshBuilder();
      const L = o.len ?? 2.25, W = o.wid ?? 0.875, w = W / 2;
      const zb = 0.13, zt = o.zt ?? 0.48, zs = zt - 0.06, drop = o.hoodDrop ?? 0.07;
      const xr = -L / 2, xf = L / 2;
      const cabR = o.cabR ?? -0.62, cabF = o.cabF ?? 0.5, roofR = o.roofR ?? -0.36, roofF = o.roofF ?? 0.13;
      const zr = zt + (o.cabH ?? 0.31);
      const r = 0.17;
      const wheelX = [xr + L * 0.2, xf - L * 0.19];
      const st = [
        { x: xr, pts: bodySec(w - 0.05, zb + 0.03, zs - 0.07, zt - 0.06) },
        { x: xr + 0.09, pts: bodySec(w, zb, zs - 0.01, zt - 0.01) },
        { x: cabR, pts: bodySec(w, zb, zs, zt) },
        { x: cabF, pts: bodySec(w, zb, zs - 0.005, zt - 0.005) },
        { x: xf - 0.1, pts: bodySec(w, zb, zs - drop, zt - drop) },
        { x: xf, pts: bodySec(w - 0.05, zb + 0.03, zs - drop - 0.07, zt - drop - 0.06) },
      ];
      const bb = bboxOf(st);
      const Lt = (bb.x1 - bb.x0) * T, Wt = (bb.y1 - bb.y0) * T, Ht = (bb.z1 - bb.z0) * T;
      const U = (x) => (x - bb.x0) * T, V = (z) => (bb.z1 - z) * T;
      const vs = Math.round(V(zs));
      const side = reg(Lt, Ht, (sp) => {
        paintBodySide(sp, Math.round(Lt), Math.round(Ht), { vs, arches: wheelX.map((x) => [U(x), V(r), r * T + 1.5]) });
        const doors = o.doors ?? [cabF - 0.04, (cabR + cabF) / 2 - 0.02, cabR + 0.08];
        for (const dx of doors) for (let y = vs + 1; y < Ht - 2; y++) sp.set(Math.round(U(dx)), y, CS.BODY, 96);
        for (const hx of o.handles ?? [cabF - 0.2, (cabR + cabF) / 2 - 0.18]) { sp.set(Math.round(U(hx)), vs + 2, CS.CHROME, 156); sp.set(Math.round(U(hx)) + 1, vs + 2, CS.CHROME, 120); }
        if (o.stripe) for (let x = 0; x < Lt; x++) { sp.set(x, vs + 3, CS.ACCENT, 136); sp.set(x, vs + 4, CS.ACCENT, 112); }
        if (o.checker) for (let x = Math.round(U(cabR)); x < U(cabF); x++) { sp.set(x, vs + 2, (x >> 1) % 2 ? CS.BLACK : CS.WHITE, 128); sp.set(x, vs + 3, (x >> 1) % 2 ? CS.WHITE : CS.BLACK, 120); }
        if (o.text) for (let x = Math.round(U(cabR)) + 2; x < U(cabF) - 2; x += 2) sp.set(x, vs + 5, CS.ACCENT, 140);
        sp.set(1, vs + 2, CS.TAIL, 128); sp.set(Math.round(Lt) - 2, vs + 2, CS.HEAD, 128);
      });
      const top = reg(Lt, Wt, (sp) => {
        for (let y = 0; y < Wt; y++)
          for (let x = 0; x < Lt; x++) {
            const e = Math.min(y, Wt - 1 - y);
            sp.set(x, y, CS.BODY, e < 1 ? 118 : e < 3 ? 138 : Math.abs(y - Wt / 2) < 3 ? 156 : 148);
          }
        for (let y = 2; y < Wt - 2; y++) { sp.set(Math.round(U(cabF + 0.03)), y, CS.BLACK, 70); sp.set(Math.round(U(xr + 0.3)), y, CS.BODY, 106); sp.set(Math.round(U(xf - 0.12)), y, CS.BODY, 112); }
        for (const yy of [Math.round(Wt * 0.28), Math.round(Wt * 0.6)]) for (let k = 0; k < 7; k++) sp.set(Math.round(U(cabF + 0.05)) + (k >> 2), yy + k, CS.BLACK, 92);
        if (o.hoodStripe) for (let x = Math.round(U(cabF)); x < Lt; x++) for (const yy of [Math.round(Wt / 2) - 2, Math.round(Wt / 2) + 1]) sp.set(x, yy, CS.ACCENT, 130);
      });
      const vTop = Math.round(V(zt - drop - 0.06));
      const front = reg(Wt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.BODY, y <= vTop ? 150 : 124);
        const gy0 = vTop + 2, gy1 = Math.round(Ht) - 3;
        for (let y = gy0; y < gy1; y++) for (let x = 8; x < Wt - 8; x++) sp.set(x, y, CS.BLACK, (y - gy0) % 2 ? 76 : 108);
        for (let x = 8; x < Wt - 8; x++) sp.set(x, gy0 - 1, CS.CHROME, 146);
        for (const hx of [2, Math.round(Wt) - 7]) for (let x = hx; x < hx + 5; x++) { sp.set(x, gy0, CS.HEAD, 146); sp.set(x, gy0 + 1, CS.HEAD, 118); }
        for (let x = 0; x < Wt; x++) sp.set(x, Math.round(Ht) - 2, CS.CHROME, 126);
        for (let x = Math.round(Wt / 2) - 3; x < Wt / 2 + 3; x++) sp.set(x, Math.round(Ht) - 3, CS.PLATE, 132);
        for (let x = 0; x < Wt; x++) sp.set(x, Math.round(Ht) - 1, CS.TRIM, 80);
      });
      const vTopB = Math.round(V(zt - 0.06));
      const back = reg(Wt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.BODY, y <= vTopB ? 150 : 120);
        const ty = vTopB + 2;
        for (const tx of [1, Math.round(Wt) - 7]) for (let x = tx; x < tx + 6; x++) { sp.set(x, ty, CS.TAIL, 146); sp.set(x, ty + 1, CS.TAIL, 116); }
        sp.set(8, ty + 1, CS.WHITE, 130); sp.set(Math.round(Wt) - 9, ty + 1, CS.WHITE, 130);
        for (let x = 8; x < Wt - 8; x++) sp.set(x, ty - 1, CS.BODY, 104);
        for (let x = Math.round(Wt / 2) - 3; x < Wt / 2 + 3; x++) { sp.set(x, ty + 3, CS.PLATE, 132); sp.set(x, ty + 4, CS.PLATE, 116); }
        for (let x = 0; x < Wt; x++) sp.set(x, Math.round(Ht) - 2, CS.TRIM, 110);
        for (let x = 0; x < Wt; x++) sp.set(x, Math.round(Ht) - 1, CS.TRIM, 80);
      });
      loft(mb, st, { side, top, front, back }, { bb });
      // glasshouse
      const wb = w - 0.06, wr = w - 0.15, zc = zt - 0.01;
      const cst = [
        { x: cabR, pts: cabSec(wb, zc, wb, zc) },
        { x: roofR, pts: cabSec(wb, zc, wr, zr) },
        { x: roofF, pts: cabSec(wb, zc, wr, zr) },
        { x: cabF, pts: cabSec(wb, zc, wb, zc) },
      ];
      const cb = bboxOf(cst);
      const Lc = (cb.x1 - cb.x0) * T, Wc = (cb.y1 - cb.y0) * T, Hc = (cb.z1 - cb.z0) * T;
      const Uc = (x) => (x - cb.x0) * T;
      const cside = reg(Lc, Hc, (sp) => {
        const H = Math.round(Hc);
        for (let y = 0; y < H; y++) {
          const t = y / Math.max(1, H - 1);
          const xl = Uc(roofR + (cabR - roofR) * t), xr2 = Uc(roofF + (cabF - roofF) * t);
          for (let x = 0; x < Lc; x++) {
            const inside = x > xl + 1.5 && x < xr2 - 1.5 && y >= 1 && y < H - 1;
            let slot = CS.BODY, sh = 134;
            if (inside) { slot = CS.GLASS; sh = (x + y * 2) % 13 < 2 ? 156 : 118; }
            if (y === H - 1) { slot = CS.CHROME; sh = 118; }
            sp.set(x, y, slot, sh);
          }
        }
        const bx = Math.round(Uc((cabR + cabF) / 2 - 0.04));
        for (let y = 1; y < H - 1; y++) { sp.set(bx, y, CS.BLACK, 72); sp.set(bx + 1, y, CS.BLACK, 72); }
      });
      const roof = reg(Lc, Wc, (sp) => {
        for (let y = 0; y < Wc; y++) for (let x = 0; x < Lc; x++) { const e = Math.min(y, Wc - 1 - y); sp.set(x, y, CS.BODY, e < 1 ? 128 : e < 3 ? 146 : 158); }
        if (o.sunroof) for (let y = Math.round(Wc * 0.3); y < Wc * 0.7; y++) for (let x = Math.round(Uc(roofR + 0.12)); x < Uc(roofF - 0.1); x++) sp.set(x, y, CS.GLASS, 118);
      });
      const glassF = glassPanel(Wc, Hc, { wipers: true });
      const glassB = glassPanel(Wc, Hc, { dark: true, brake: true });
      loft(mb, cst, { side: cside, top: roof, glassF, glassB }, { bb: cb, caps: false, faceKey: (i, j) => (j !== 1 ? 'side' : i === 0 ? 'glassB' : i === 2 ? 'glassF' : 'top') });
      // bumpers, mirrors, wheels
      box(mb, xf - 0.02, -w + 0.04, zb - 0.01, xf + 0.05, w - 0.04, zb + 0.08, o.chromeBumper ? S.chrome : S.plastic);
      box(mb, xr - 0.05, -w + 0.04, zb - 0.01, xr + 0.02, w - 0.04, zb + 0.08, o.chromeBumper ? S.chrome : S.plastic);
      mirrors(mb, cabF - 0.06, w, zt - 0.02);
      wheelsAt(mb, wheelX, w - 0.06, r, 0.14, wheelTex(r, o.darkRims ? CS.TRIM : CS.CHROME));
      // roof equipment
      const rx = (roofR + roofF) / 2;
      if (o.taxiSign) {
        box(mb, rx - 0.2, -0.17, zr, rx + 0.2, 0.17, zr + 0.03, S.black);
        box(mb, rx - 0.18, -0.15, zr + 0.03, rx + 0.18, 0.15, zr + 0.16, S.sign);
      }
      if (o.lightBar) {
        box(mb, rx - 0.08, -0.33, zr, rx + 0.08, 0.33, zr + 0.03, S.black);
        box(mb, rx - 0.07, -0.32, zr + 0.03, rx + 0.07, -0.02, zr + 0.12, S.red);
        box(mb, rx - 0.07, 0.02, zr + 0.03, rx + 0.07, 0.32, zr + 0.12, S.blue);
      }
      if (o.rack) for (const s of [-1, 1]) box(mb, roofR + 0.05, s * (wr - 0.05) - 0.02, zr, roofF - 0.05, s * (wr - 0.05) + 0.02, zr + 0.05, S.trim);
      return mb.finish();
    };

    // ---- one-box van ------------------------------------------------------------------------------------
    const van = (o = {}) => {
      const mb = new MeshBuilder();
      const L = o.len ?? 2.75, W = o.wid ?? 1.0, H = o.h ?? 1.25, w = W / 2;
      const zb = 0.16, xr = -L / 2, xf = L / 2;
      const xWin = xf - 0.82, xHood = xf - 0.4, zHood = 0.72;
      const st = [
        { x: xr, pts: bodySec(w - 0.04, zb + 0.02, H - 0.09, H - 0.03, 0.05) },
        { x: xr + 0.06, pts: bodySec(w, zb, H - 0.07, H, 0.06) },
        { x: xWin, pts: bodySec(w, zb, H - 0.07, H, 0.06) },
        { x: xHood, pts: bodySec(w, zb, zHood - 0.04, zHood, 0.05) },
        { x: xf - 0.06, pts: bodySec(w, zb, zHood - 0.12, zHood - 0.07, 0.05) },
        { x: xf, pts: bodySec(w - 0.05, zb + 0.03, zHood - 0.2, zHood - 0.14, 0.05) },
      ];
      const bb = bboxOf(st);
      const Lt = (bb.x1 - bb.x0) * T, Wt = (bb.y1 - bb.y0) * T, Ht = (bb.z1 - bb.z0) * T;
      const U = (x) => (x - bb.x0) * T, V = (z) => (bb.z1 - z) * T;
      const r = 0.19;
      const wheelX = [xr + 0.55, xf - 0.5];
      const side = reg(Lt, Ht, (sp) => {
        const HH = Math.round(Ht), LL = Math.round(Lt);
        paintBodySide(sp, LL, HH, { vs: 2, arches: wheelX.map((x) => [U(x), V(r), r * T + 1.5]) });
        // cab door window following the windshield rake
        const bpx = Math.round(U(xWin - 0.3));
        for (let y = 4; y < V(zHood) + 1; y++) {
          const z = bb.z1 - y / T;
          const ta = clamp01((H - z) / (H - zHood));
          const ax = U(xWin + (xHood - xWin) * ta) - 2;
          for (let x = bpx + 2; x < ax; x++) sp.set(x, y, CS.GLASS, (x + y * 2) % 13 < 2 ? 156 : 118);
        }
        for (let y = 3; y < HH - 3; y++) { sp.set(bpx, y, CS.BODY, 96); sp.set(Math.round(U(xWin - 0.95)), y, CS.BODY, 96); }
        sp.set(bpx + 3, Math.round(V(zHood)) + 3, CS.CHROME, 150);
        if (o.stripe != null) for (let x = 0; x < LL; x++) { sp.set(x, o.stripe, CS.ACCENT, 136); sp.set(x, o.stripe + 1, CS.ACCENT, 116); sp.set(x, o.stripe + 3, CS.ACCENT, 126); }
        if (o.text) for (let x = 6; x < bpx - 10; x += 2) { sp.set(x, 10, CS.ACCENT, 136); if (x % 6 === 0) sp.set(x, 11, CS.ACCENT, 120); }
        if (o.window) {
          for (let y = 6; y < 17; y++) for (let x = 12; x < 34; x++) sp.set(x, y, CS.INTERIOR, y < 8 ? 150 : 124);
          for (let x = 10; x < 36; x++) { sp.set(x, 5, CS.WHITE, 150); sp.set(x, 17, CS.CHROME, 140); }
          for (let k = 0; k < 4; k++) for (let y = 19; y < 25; y++) for (let x = 38 + k * 6; x < 42 + k * 6; x++) sp.set(x, y, [CS.ACCENT, CS.SIGN, CS.HEAD, CS.ACCENT][k], 136);
        }
      });
      const top = reg(Lt, Wt, (sp) => {
        for (let y = 0; y < Wt; y++) for (let x = 0; x < Lt; x++) { const e = Math.min(y, Wt - 1 - y); sp.set(x, y, CS.BODY, e < 1 ? 120 : x % 8 === 0 ? 128 : 148); }
      });
      const vF = Math.round(V(zHood - 0.14));
      const front = reg(Wt, Ht, (sp) => {
        const HH = Math.round(Ht), WW = Math.round(Wt);
        for (let y = 0; y < HH; y++) for (let x = 0; x < WW; x++) sp.set(x, y, CS.BODY, y <= vF ? 150 : 124);
        for (let y = vF + 3; y < HH - 4; y++) for (let x = 8; x < WW - 8; x++) sp.set(x, y, CS.BLACK, (y - vF) % 2 ? 76 : 106);
        for (const hx of [2, WW - 7]) for (let x = hx; x < hx + 5; x++) { sp.set(x, vF + 3, CS.HEAD, 146); sp.set(x, vF + 4, CS.HEAD, 120); sp.set(x, vF + 5, CS.HEAD, 104); }
        for (let x = 0; x < WW; x++) { sp.set(x, HH - 3, CS.TRIM, 118); sp.set(x, HH - 2, CS.TRIM, 104); sp.set(x, HH - 1, CS.TRIM, 80); }
        for (let x = (WW >> 1) - 3; x < (WW >> 1) + 3; x++) sp.set(x, HH - 4, CS.PLATE, 132);
      });
      const back = reg(Wt, Ht, (sp) => {
        const HH = Math.round(Ht), WW = Math.round(Wt);
        for (let y = 0; y < HH; y++) for (let x = 0; x < WW; x++) sp.set(x, y, CS.BODY, y < 2 ? 148 : 120);
        for (let y = 4; y < 14; y++) for (const [x0, x1] of [[3, (WW >> 1) - 2], [(WW >> 1) + 2, WW - 3]]) for (let x = x0; x < x1; x++) sp.set(x, y, CS.GLASS, y < 6 ? 146 : 112);
        for (let y = 2; y < HH - 3; y++) sp.set(WW >> 1, y, CS.BLACK, 80);
        for (const tx of [0, WW - 2]) for (let y = 16; y < 24; y++) { sp.set(tx, y, CS.TAIL, 140); sp.set(tx + 1, y, CS.TAIL, 116); }
        for (let x = (WW >> 1) - 3; x < (WW >> 1) + 3; x++) sp.set(x, HH - 5, CS.PLATE, 132);
        for (let x = 0; x < WW; x++) { sp.set(x, HH - 3, CS.TRIM, 112); sp.set(x, HH - 2, CS.TRIM, 100); sp.set(x, HH - 1, CS.TRIM, 80); }
      });
      const glassF = glassPanel(Wt, V(zHood) + 1, { wipers: true, fx: 2 });
      loft(mb, st, { side, top, front, back, glassF }, { bb, faceKey: (i, j) => (i === 2 && j === 2 ? 'glassF' : null) });
      box(mb, xf - 0.02, -w + 0.03, zb - 0.01, xf + 0.05, w - 0.03, zb + 0.1, S.plastic);
      box(mb, xr - 0.05, -w + 0.03, zb - 0.01, xr + 0.02, w - 0.03, zb + 0.1, S.plastic);
      mirrors(mb, xHood - 0.04, w, zHood);
      wheelsAt(mb, wheelX, w - 0.07, r, 0.15, wheelTex(r));
      if (o.cone) {
        box(mb, -0.25, -0.16, H, 0.09, 0.16, H + 0.04, S.white);
        mb.cone(-0.08, 0, H + 0.38, H + 0.04, 0.15, 8, S.accent, { mat: 0 });
        mb.cylinder(-0.08, 0, H + 0.38, H + 0.5, 0.17, 8, S.white, S.white, { mat: 0 });
        mb.cone(-0.08, 0, H + 0.5, H + 0.66, 0.15, 8, S.white, { mat: 0 });
      }
      if (o.beacon) box(mb, 0.4, -0.12, H, 0.6, 0.12, H + 0.15, S.sign);
      return mb.finish();
    };

    // ---- city bus ----------------------------------------------------------------------------------
    const bus = () => {
      const mb = new MeshBuilder();
      const L = 6.5, W = 1.25, H = 1.6, w = W / 2, zb = 0.18, xr = -L / 2, xf = L / 2;
      const st = [
        { x: xr, pts: bodySec(w - 0.05, zb + 0.02, H - 0.1, H - 0.03, 0.06) },
        { x: xr + 0.08, pts: bodySec(w, zb, H - 0.08, H, 0.07) },
        { x: xf - 0.1, pts: bodySec(w, zb, H - 0.08, H, 0.07) },
        { x: xf, pts: bodySec(w - 0.06, zb + 0.02, H - 0.12, H - 0.05, 0.06) },
      ];
      const bb = bboxOf(st);
      const Lt = Math.round((bb.x1 - bb.x0) * T), Wt = Math.round((bb.y1 - bb.y0) * T), Ht = Math.round((bb.z1 - bb.z0) * T);
      const U = (x) => (x - bb.x0) * T, V = (z) => (bb.z1 - z) * T;
      const r = 0.24;
      const wheelX = [xr + 1.35, xf - 1.25];
      const side = reg(Lt, Ht, (sp) => {
        paintBodySide(sp, Lt, Ht, { vs: 2, slot: CS.WHITE, arches: wheelX.map((x) => [U(x), V(r), r * T + 1.5]) });
        // window band with frames
        for (let y = 5; y < 22; y++)
          for (let x = 4; x < Lt - 4; x++) {
            const frame = (x - 4) % 22 < 2;
            sp.set(x, y, frame ? CS.BLACK : CS.INTERIOR, frame ? 76 : y < 8 ? 146 : (x + y) % 17 < 2 ? 150 : 120);
          }
        // doors (front, middle)
        for (const [d0, d1] of [[Lt - 26, Lt - 12], [Math.round(Lt * 0.52), Math.round(Lt * 0.52) + 14]])
          for (let y = 5; y < Ht - 3; y++) for (let x = d0; x < d1; x++) sp.set(x, y, x === d0 || x === d1 - 1 || x === ((d0 + d1) >> 1) ? CS.BLACK : CS.GLASS, x === d0 || x === d1 - 1 ? 72 : y < 8 ? 150 : 118);
        // livery stripes
        for (let x = 0; x < Lt; x++) { sp.set(x, 24, CS.ACCENT, 140); sp.set(x, 25, CS.ACCENT, 124); sp.set(x, 26, CS.ACCENT, 140); sp.set(x, 28, CS.ACCENT, 110); }
        // advertising panel between the wheels
        const ax0 = Math.round(U(wheelX[0]) + 14), ax1 = Math.round(Lt * 0.52) - 6;
        for (let y = 30; y < Ht - 4; y++) for (let x = ax0; x < ax1; x++) sp.set(x, y, x < ax0 + 2 || x >= ax1 - 2 || y < 31 ? CS.BLACK : ((x - ax0) >> 3) % 3 === 0 ? CS.SIGN : CS.HEAD, 118);
      });
      const top = reg(Lt, Wt, (sp) => {
        for (let y = 0; y < Wt; y++) for (let x = 0; x < Lt; x++) { const e = Math.min(y, Wt - 1 - y); sp.set(x, y, CS.WHITE, e < 2 ? 124 : 146); }
        for (let x = 30; x < 50; x++) for (let y = 8; y < Wt - 8; y++) sp.set(x, y, CS.CHROME, 130);
      });
      const front = reg(Wt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.WHITE, 128);
        for (let x = 4; x < Wt - 4; x++) { sp.set(x, 2, CS.BLACK, 90); sp.set(x, 3, CS.LED, 140); sp.set(x, 4, CS.LED, 120); sp.set(x, 5, CS.BLACK, 90); }
        for (let y = 7; y < 27; y++) for (let x = 2; x < Wt - 2; x++) sp.set(x, y, CS.GLASS, (x - y * 2 + 60) % 17 < 3 ? 158 : y < 9 ? 146 : 122);
        for (let y = 7; y < 27; y++) sp.set(Wt >> 1, y, CS.BLACK, 80);
        for (let x = 0; x < Wt; x++) sp.set(x, 29, CS.ACCENT, 136);
        for (const hx of [2, Wt - 7]) for (let x = hx; x < hx + 5; x++) { sp.set(x, Ht - 9, CS.HEAD, 146); sp.set(x, Ht - 8, CS.HEAD, 118); }
        for (let x = 0; x < Wt; x++) { sp.set(x, Ht - 3, CS.TRIM, 110); sp.set(x, Ht - 2, CS.TRIM, 96); sp.set(x, Ht - 1, CS.TRIM, 80); }
      });
      const back = reg(Wt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.WHITE, 118);
        for (let y = 5; y < 15; y++) for (let x = 3; x < Wt - 3; x++) sp.set(x, y, CS.GLASS, 112);
        for (let y = 20; y < 32; y++) for (let x = 8; x < Wt - 8; x++) sp.set(x, y, CS.BLACK, y % 2 ? 80 : 104);
        for (const tx of [1, Wt - 4]) for (let y = 18; y < 30; y++) for (let x = tx; x < tx + 3; x++) sp.set(x, y, CS.TAIL, y % 4 === 0 ? 110 : 136);
        for (let x = 0; x < Wt; x++) { sp.set(x, Ht - 2, CS.TRIM, 100); sp.set(x, Ht - 1, CS.TRIM, 80); }
      });
      loft(mb, st, { side, top, front, back }, { bb });
      box(mb, -1.6, -0.42, H, 0.1, 0.42, H + 0.2, S.chrome);
      box(mb, 1.4, -0.3, H, 2.2, 0.3, H + 0.08, S.cargo);
      mirrors(mb, xf - 0.05, w, H - 0.6);
      wheelsAt(mb, wheelX, w - 0.08, r, 0.16, wheelTex(r));
      return mb.finish();
    };

    // ---- trucks: shaped cab + cargo body ---------------------------------------------------------------
    const truck = (o = {}) => {
      const mb = new MeshBuilder();
      const L = o.len ?? 4.0, W = o.wid ?? 1.125, w = W / 2;
      const cabL = 1.15, cabH = 1.32, boxH = o.boxH ?? 1.8, zb = 0.2;
      const xf = L / 2, xc = xf - cabL, xr = -L / 2;
      const st = [
        { x: xc, pts: bodySec(w, zb, cabH - 0.06, cabH, 0.06) },
        { x: xf - 0.5, pts: bodySec(w, zb, cabH - 0.06, cabH, 0.06) },
        { x: xf - 0.2, pts: bodySec(w, zb, 0.8, 0.85, 0.05) },
        { x: xf, pts: bodySec(w - 0.05, zb + 0.02, 0.72, 0.77, 0.05) },
      ];
      const bb = bboxOf(st);
      const Lt = Math.round((bb.x1 - bb.x0) * T), Wt = Math.round((bb.y1 - bb.y0) * T), Ht = Math.round((bb.z1 - bb.z0) * T);
      const U = (x) => (x - bb.x0) * T, V = (z) => (bb.z1 - z) * T;
      const r = 0.22;
      const cabSlot = o.cabSlot ?? CS.BODY;
      const side = reg(Lt, Ht, (sp) => {
        paintBodySide(sp, Lt, Ht, { vs: 2, slot: cabSlot, arches: [[U(xf - 0.45), V(r), r * T + 1.5]] });
        for (let y = 4; y < V(0.86); y++) {
          const z = bb.z1 - y / T;
          const ta = clamp01((cabH - z) / (cabH - 0.85));
          const ax = U(xf - 0.5 + 0.3 * ta) - 2;
          for (let x = 5; x < ax; x++) sp.set(x, y, CS.GLASS, (x + y * 2) % 13 < 2 ? 156 : 118);
        }
        for (let y = 3; y < Ht - 3; y++) sp.set(3, y, cabSlot, 96);
        sp.set(7, Math.round(V(0.86)) + 3, CS.CHROME, 150);
        for (let y = Math.round(V(0.6)); y < Math.round(V(0.6)) + 4; y++) for (let x = 2; x < 6; x++) sp.set(x, y, CS.CHROME, 130);
      });
      const top = reg(Lt, Wt, (sp) => { for (let y = 0; y < Wt; y++) for (let x = 0; x < Lt; x++) sp.set(x, y, cabSlot, Math.min(y, Wt - 1 - y) < 2 ? 122 : 146); });
      const vF = Math.round(V(0.77));
      const front = reg(Wt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, cabSlot, y <= vF ? 148 : 122);
        for (let y = vF + 2; y < Ht - 5; y++) for (let x = 7; x < Wt - 7; x++) sp.set(x, y, CS.CHROME, (y - vF) % 2 ? 96 : 140);
        for (const hx of [1, Wt - 6]) for (let x = hx; x < hx + 5; x++) for (let y = vF + 2; y < vF + 5; y++) sp.set(x, y, CS.HEAD, 150 - (y - vF) * 10);
        for (let x = 0; x < Wt; x++) { sp.set(x, Ht - 4, CS.CHROME, 140); sp.set(x, Ht - 3, CS.CHROME, 118); sp.set(x, Ht - 2, CS.TRIM, 96); sp.set(x, Ht - 1, CS.TRIM, 80); }
      });
      const glassF = glassPanel(Wt, V(0.85) + 1, { wipers: true, fx: 2 });
      loft(mb, st, { side, top, front, back: S.black, glassF }, { bb, faceKey: (i, j) => (i === 1 && j === 2 ? 'glassF' : null) });
      // cargo body
      const bst = [
        { x: xr, pts: bodySec(w + 0.02, 0.36, boxH - 0.04, boxH, 0.04) },
        { x: xc - 0.08, pts: bodySec(w + 0.02, 0.36, boxH - 0.04, boxH, 0.04) },
      ];
      const cbb = bboxOf(bst);
      const BL = Math.round((cbb.x1 - cbb.x0) * T), BW = Math.round((cbb.y1 - cbb.y0) * T), BH = Math.round((cbb.z1 - cbb.z0) * T);
      const cargo = o.cargo ?? CS.WHITE;
      const bside = reg(BL, BH, (sp) => {
        for (let y = 0; y < BH; y++) for (let x = 0; x < BL; x++) sp.set(x, y, cargo, y < 2 ? 148 : x % 16 === 0 ? 112 : 126);
        for (let x = 0; x < BL; x++) { sp.set(x, BH - 1, CS.TRIM, 90); sp.set(x, BH - 2, cargo, 104); }
        if (o.stripe != null) for (let x = 0; x < BL; x++) { sp.set(x, o.stripe, CS.ACCENT, 140); sp.set(x, o.stripe + 1, CS.ACCENT, 120); sp.set(x, o.stripe + 3, CS.ACCENT, 130); }
        if (o.ladder) for (let x = 0; x < BL; x++) { sp.set(x, 4, CS.CHROME, 146); if (x % 4 === 0) { sp.set(x, 5, CS.CHROME, 120); sp.set(x, 6, CS.CHROME, 120); } sp.set(x, 7, CS.CHROME, 146); }
        if (o.lockers) for (let k = 0; k < 5; k++) { const x0 = 4 + k * Math.floor((BL - 8) / 5); for (let y = 12; y < BH - 4; y++) for (let x = x0; x < x0 + Math.floor((BL - 8) / 5) - 2; x++) sp.set(x, y, CS.CHROME, (x + y) % 3 === 0 ? 150 : y === 12 ? 160 : 124); }
        if (o.hopper) for (let y = 6; y < BH - 3; y++) for (let x = 0; x < 12; x++) sp.set(x, y, CS.BLACK, x === 11 ? 70 : 100 + ((x + y) % 4) * 4);
        if (o.logo) for (let y = 10; y < 18; y++) for (let x = Math.round(BL * 0.45); x < BL * 0.45 + 16; x++) sp.set(x, y, CS.ACCENT, (x + y) % 5 === 0 ? 150 : 128);
      });
      const btop = reg(BL, BW, (sp) => { for (let y = 0; y < BW; y++) for (let x = 0; x < BL; x++) sp.set(x, y, cargo, Math.min(y, BW - 1 - y) < 2 ? 118 : x % 12 === 0 ? 124 : 140); });
      const bback = reg(BW, BH, (sp) => {
        for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) sp.set(x, y, cargo, 116);
        for (let y = 2; y < BH - 4; y++) { sp.set(BW >> 1, y, CS.TRIM, 86); if (y % 8 === 0) for (let x = 2; x < BW - 2; x++) sp.set(x, y, CS.CHROME, 120); }
        for (const tx of [1, BW - 4]) for (let y = BH - 10; y < BH - 4; y++) for (let x = tx; x < tx + 3; x++) sp.set(x, y, CS.TAIL, 136);
        for (let x = 0; x < BW; x++) { sp.set(x, BH - 2, CS.TRIM, 100); sp.set(x, BH - 1, CS.TRIM, 80); }
      });
      const bfront = reg(BW, BH, (sp) => {
        for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) sp.set(x, y, cargo, y < 2 ? 146 : x < 2 || x >= BW - 2 ? 108 : 122);
        for (const mx of [3, BW - 5]) { sp.set(mx, 3, CS.TAIL, 140); sp.set(mx + 1, 3, CS.TAIL, 140); }
      });
      loft(mb, bst, { side: bside, top: btop, back: bback, front: bfront }, { bb: cbb });
      box(mb, xr + 0.1, -w + 0.12, 0.12, xc, w - 0.12, 0.36, S.black);
      wheelsAt(mb, [xf - 0.45], w - 0.08, r, 0.16, wheelTex(r));
      wheelsAt(mb, o.len >= 4.5 ? [xr + 0.7, xr + 1.25] : [xr + 0.75], w - 0.08, r, 0.18, wheelTex(r));
      box(mb, xf - 0.02, -w + 0.02, zb - 0.02, xf + 0.06, w - 0.02, zb + 0.1, S.chrome);
      mirrors(mb, xf - 0.42, w, 0.95);
      if (o.lightBar) {
        box(mb, xf - 0.62, -0.42, cabH, xf - 0.48, -0.02, cabH + 0.12, S.red);
        box(mb, xf - 0.62, 0.02, cabH, xf - 0.48, 0.42, cabH + 0.12, S.blue);
      }
      if (o.beacon) box(mb, xf - 0.65, -0.12, cabH, xf - 0.45, 0.12, cabH + 0.16, S.sign);
      if (o.plow) {
        // angled blade
        const b0 = [xf + 0.35, -0.8], b1 = [xf + 0.12, 0.8];
        mb.quad([b0[0], b0[1], 0.6], [b1[0], b1[1], 0.6], [b1[0], b1[1], 0.02], [b0[0], b0[1], 0.02], [[0, 0], [2, 0], [2, 2], [0, 2]], S.sign, null, MAT.SNOW);
        mb.quad([b1[0] - 0.04, b1[1], 0.6], [b0[0] - 0.04, b0[1], 0.6], [b0[0] - 0.04, b0[1], 0.02], [b1[0] - 0.04, b1[1], 0.02], [[0, 0], [2, 0], [2, 2], [0, 2]], S.black, null, 0);
        box(mb, xf, -0.1, 0.2, xf + 0.25, 0.1, 0.35, S.black);
      }
      if (o.ladderTop) {
        box(mb, xr + 0.25, -0.28, boxH, xc - 0.2, -0.2, boxH + 0.14, S.chrome);
        box(mb, xr + 0.25, 0.2, boxH, xc - 0.2, 0.28, boxH + 0.14, S.chrome);
        for (let x = xr + 0.35; x < xc - 0.25; x += 0.22) box(mb, x, -0.2, boxH + 0.06, x + 0.04, 0.2, boxH + 0.1, S.chrome);
      }
      return mb.finish();
    };

    // ---- subway car --------------------------------------------------------------------------------------
    const subway = () => {
      const mb = new MeshBuilder();
      const L = 3.25, W = 1.125, H = 1.5, w = W / 2, zb = 0.12;
      const sec = [[-w, zb], [-w, H - 0.18], [-(w - 0.06), H - 0.06], [-(w - 0.2), H], [w - 0.2, H], [w - 0.06, H - 0.06], [w, H - 0.18], [w, zb]];
      const st = [{ x: -L / 2, pts: sec }, { x: L / 2, pts: sec }];
      const bb = bboxOf(st);
      const Lt = Math.round((bb.x1 - bb.x0) * T), Wt = Math.round((bb.y1 - bb.y0) * T), Ht = Math.round((bb.z1 - bb.z0) * T);
      const side = reg(Lt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Lt; x++) sp.set(x, y, CS.BODY, (x % 4 === 0 ? 116 : 134) - (y > Ht - 8 ? 22 : 0) + (y < 4 ? 12 : 0));
        const doors = [[16, 30], [Lt - 30, Lt - 16]];
        for (let y = 8; y < 21; y++)
          for (let x = 4; x < Lt - 4; x++) {
            if (doors.some(([a, b]) => x >= a - 1 && x <= b)) continue;
            sp.set(x, y, x % 14 < 2 ? CS.BLACK : CS.INTERIOR, x % 14 < 2 ? 80 : y < 10 ? 150 : 122);
          }
        for (const [a, b] of doors) {
          for (let y = 6; y < Ht - 8; y++) for (let x = a; x < b; x++) sp.set(x, y, CS.BODY, x === a || x === b - 1 ? 92 : x === ((a + b) >> 1) ? 96 : 140);
          for (let y = 9; y < 19; y++) for (const x0 of [a + 2, ((a + b) >> 1) + 2]) for (let x = x0; x < x0 + 4; x++) sp.set(x, y, CS.INTERIOR, 128);
        }
        for (let x = 0; x < Lt; x++) { sp.set(x, 25, CS.ACCENT, 140); sp.set(x, 26, CS.ACCENT, 118); }
        for (let y = Ht - 6; y < Ht; y++) for (let x = 0; x < Lt; x++) sp.set(x, y, CS.TIRE, (x % 6 === 0 ? 70 : 96));
      });
      const top = reg(Lt, Wt, (sp) => { for (let y = 0; y < Wt; y++) for (let x = 0; x < Lt; x++) sp.set(x, y, CS.BODY, Math.min(y, Wt - 1 - y) < 3 ? 118 : x % 20 < 2 ? 120 : 140); });
      const end = reg(Wt, Ht, (sp) => {
        for (let y = 0; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.BODY, 122);
        for (let y = 8; y < 20; y++) for (let x = 3; x < Wt - 3; x++) sp.set(x, y, x > 13 && x < 22 ? CS.BODY : CS.GLASS, x > 13 && x < 22 ? 110 : y < 10 ? 150 : 120);
        for (let y = 9; y < 26; y++) for (let x = 15; x < 21; x++) sp.set(x, y, CS.INTERIOR, 120);
        for (let x = 6; x < Wt - 6; x++) { sp.set(x, 4, CS.LED, 146); sp.set(x, 5, CS.LED, 120); }
        for (const hx of [3, Wt - 6]) for (let x = hx; x < hx + 3; x++) { sp.set(x, 30, CS.HEAD, 146); sp.set(x, 31, CS.HEAD, 120); }
        for (let y = Ht - 6; y < Ht; y++) for (let x = 0; x < Wt; x++) sp.set(x, y, CS.TIRE, 90);
      });
      loft(mb, st, { side, top, front: end, back: end }, { bb });
      for (const x of [-L / 2 + 0.55, L / 2 - 0.55]) box(mb, x - 0.35, -w + 0.1, 0, x + 0.35, w - 0.1, zb + 0.02, S.black);
      return mb.finish();
    };

    const defs = {
      subway: subway(),
      sedan: sedan(),
      taxi: sedan({ taxiSign: true, checker: true, chromeBumper: false }),
      suv: sedan({ len: 2.375, wid: 1.0, zt: 0.6, cabH: 0.36, cabR: -0.98, roofR: -0.88, cabF: 0.42, roofF: 0.08, hoodDrop: 0.05, rack: true, darkRims: true }),
      police: sedan({ len: 2.375, lightBar: true, stripe: true, text: true, darkRims: true }),
      van: van({ text: true }),
      icecream: van({ len: 3.25, h: 1.375, stripe: 26, window: true, cone: true }),
      bus: bus(),
      truck: truck({ stripe: 12, logo: true }),
      fire: truck({ len: 5.0, cargo: CS.BODY, cabSlot: CS.BODY, ladder: true, lightBar: true, ladderTop: true, lockers: true }),
      garbage: truck({ len: 4.25, hopper: true, stripe: 20 }),
      plow: truck({ len: 4.25, hopper: true, stripe: 20, beacon: true, plow: true }),
    };
    const gl = this.gl;
    for (const k in defs) {
      const m = defs[k];
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      makeBuffer(gl, m.pos); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      makeBuffer(gl, m.uv); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
      makeBuffer(gl, m.rect); gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 4, gl.UNSIGNED_SHORT, 0, 0);
      makeBuffer(gl, m.nrm); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.BYTE, true, 0, 0);
      makeBuffer(gl, m.info); gl.enableVertexAttribArray(4); gl.vertexAttribIPointer(4, 4, gl.UNSIGNED_BYTE, 0, 0);
      makeBuffer(gl, m.idx, gl.ELEMENT_ARRAY_BUFFER);
      const ibuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
      gl.bufferData(gl.ARRAY_BUFFER, CAR_CAP * IS * 4, gl.DYNAMIC_DRAW);
      for (let a = 0; a < 4; a++) { gl.enableVertexAttribArray(5 + a); gl.vertexAttribPointer(5 + a, 4, gl.FLOAT, false, IS * 4, a * 16); gl.vertexAttribDivisor(5 + a, 1); }
      gl.bindVertexArray(null);
      // extent of the body, for placing damage
      let hx = 0.5, hy = 0.3, hz = 0.5;
      for (let i = 0; i < m.pos.length; i += 3) { hx = Math.max(hx, Math.abs(m.pos[i])); hy = Math.max(hy, Math.abs(m.pos[i + 1])); hz = Math.max(hz, m.pos[i + 2]); }
      this.types[k] = { vao, count: m.indexCount, ibuf, data: new Float32Array(CAR_CAP * IS), n: 0, half: [hx, hy, hz] };
    }
  }

  assignPalette(car) {
    const r = this.rng;
    let body = car.color != null && car.color !== 0 ? car.color : r.pick(BODY_COLORS);
    const P = { [CS.TRIM]: 0x2a2a2e, [CS.GLASS]: 0x3d5a78, [CS.TIRE]: 0x1e1e20, [CS.HEAD]: 0xe8e4d0, [CS.TAIL]: 0x8a1a1a, [CS.CHROME]: 0xb8bcc2,
      [CS.SIGN]: 0xf2e8c0, [CS.ACCENT]: 0x2a5fb8, [CS.SIREN_R]: 0xa82020, [CS.SIREN_B]: 0x2040a8, [CS.INTERIOR]: 0x5a6a7a, [CS.WHITE]: 0xf0f0ec,
      [CS.BLACK]: 0x1e1e22, [CS.PLATE]: 0xf2c230, [CS.LED]: 0x6a4a1a };
    switch (car.type) {
      case 'taxi': body = 0xf2c018; P[CS.SIGN] = 0xf8f0d0; break;
      case 'police': body = 0xf2f2ee; P[CS.ACCENT] = 0x1f4fa0; break;
      case 'bus': body = 0xf2f2ee; P[CS.ACCENT] = 0x1f5fb0; break;
      case 'fire': body = 0xc8201c; P[CS.WHITE] = 0xc8201c; break;
      case 'icecream': body = 0xf8f6f0; P[CS.ACCENT] = 0xf07ab0; P[CS.INTERIOR] = 0xffe2a0; P[CS.WHITE] = 0xfff0d8; break;
      case 'garbage': case 'plow': body = 0xf2f2ee; P[CS.ACCENT] = 0x2f8a46; P[CS.SIGN] = 0xf08a1a; break;
      case 'truck': P[CS.ACCENT] = r.pick([0xc8302c, 0x2a5fb8, 0x2f8a46, 0xe08a30]); break;
      case 'subway': body = 0xc4c8ce; P[CS.ACCENT] = 0x2a6ad8; P[CS.INTERIOR] = 0xf8f0d0; P[CS.LED] = 0xff9a30; break;
    }
    P[CS.BODY] = body;
    car.palBase = P;
    car.palState = '';
    // parked cars share one row per look (a big city has thousands); a car gets its own row the
    // moment something about it changes (see updatePalette)
    if (car.state === 'parked') {
      const key = `${car.type}:${Object.values(P).join(',')}`;
      if (!this.shared) this.shared = new Map();
      let row = this.shared.get(key);
      if (row == null) { row = this.pal.alloc(P); this.shared.set(key, row); }
      car.palRow = row; car.palShared = true;
      return;
    }
    car.palRow = this.pal.alloc(P);
    car.palShared = false;
  }
  releasePalette(car) {
    if (car.palRow >= 0 && !car.palShared) this.pal.release(car.palRow);
    car.palRow = -1;
  }
  updatePalette(car, time) {
    const lights = car.lights;
    const siren = car.siren && Math.floor(time * 6) % 2;
    const beacon = (car.special === 'plow' || car.special === 'garbage') && Math.floor(time * 4) % 2;
    const busLit = car.type === 'bus' || car.type === 'icecream' || car.type === 'subway';
    const key = `${lights ? 1 : 0}${car.brake ? 1 : 0}${car.siren ? (siren ? 2 : 1) : 0}${beacon ? 1 : 0}${car.type === 'taxi' ? (car.taxiFree ? 1 : 0) : 0}`;
    if (key === car.palState) return;
    if (car.palShared) {
      // first look at a shared parked car: fine while it still looks parked; otherwise a row of its own
      if (car.palState === '' && key === '00000') { car.palState = key; return; }
      car.palRow = this.pal.alloc(car.palBase); car.palShared = false;
    }
    car.palState = key;
    const P = car.palBase, row = car.palRow, pal = this.pal;
    pal.set(row, CS.HEAD, lights ? 0xfff6d8 : P[CS.HEAD], lights ? 128 : 255);
    pal.set(row, CS.TAIL, car.brake ? 0xff3030 : lights ? 0xd02020 : P[CS.TAIL], car.brake || lights ? 128 : 255);
    if (car.siren) {
      pal.set(row, CS.SIREN_R, siren ? 0xff3030 : 0x701010, siren ? 128 : 255);
      pal.set(row, CS.SIREN_B, !siren ? (car.type === 'fire' ? 0xff3030 : 0x3070ff) : 0x102060, !siren ? 128 : 255);
    }
    if (car.special === 'plow' || car.special === 'garbage') pal.set(row, CS.SIGN, beacon ? 0xffa020 : 0x8a5010, beacon ? 128 : 255);
    if (car.type === 'taxi') pal.set(row, CS.SIGN, lights ? 0xfff2b0 : P[CS.SIGN], lights ? 128 : 255);
    if (busLit) pal.set(row, CS.INTERIOR, lights ? 0xfff0c0 : P[CS.INTERIOR], lights ? 128 : 255);
    if (car.type === 'bus' || car.type === 'subway') pal.set(row, CS.LED, 0xffa020, 128);
    if (car.type === 'subway') pal.set(row, CS.INTERIOR, 0xfff2cc, 128);
  }

  prepare(cars, time, env, view) {
    for (const k in this.types) this.types[k].n = 0;
    const snow = env.snowCover;
    for (const c of cars) {
      if (!view.visible(c.x, c.y, (c.z || 0) + 1, 6)) continue;
      const t = this.types[c.type];
      if (!t || t.n >= CAR_CAP) continue;
      this.updatePalette(c, time);
      const o = t.n * IS, d = t.data;
      d[o] = c.x; d[o + 1] = c.y; d[o + 2] = c.z || 0; d[o + 3] = c.h;
      d[o + 4] = c.palRow; d[o + 5] = c.fadeOut != null ? Math.max(0, c.fadeOut) : 1 - (c.fadeIn || 0);
      d[o + 6] = c.state === 'parked' ? snow : snow * 0.25; d[o + 7] = 0.02 + (c.hopZ || 0) - (c.wreck ? 0.05 : 0);
      const dm = c.dmg;
      d[o + 8] = dm ? dm[0] : 0; d[o + 9] = dm ? dm[1] : 0; d[o + 10] = dm ? dm[2] : 0; d[o + 11] = dm ? dm[3] : 0;
      d[o + 12] = c.wreck ? 1 : c.fireT != null ? Math.min(0.55, (c.fireT / (c.fuse || 6)) * 0.6) : 0;
      d[o + 13] = c.dentL || 0; d[o + 14] = c.dentR || 0; d[o + 15] = c.seed || 0;
      t.n++;
    }
    const gl = this.gl;
    for (const k in this.types) {
      const t = this.types[k];
      if (!t.n) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, t.ibuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, t.data.subarray(0, t.n * IS));
    }
  }
  lights(LL, cars, env) {
    if (env.darkness < 0.4) return;
    const k = Math.min(1, (env.darkness - 0.4) * 3);
    for (const c of cars) {
      if (c.state === 'parked' || c.wreck || (!c.lights && !c.siren)) continue;
      const dx = Math.cos(c.h), dy = Math.sin(c.h);
      const dm = c.dmg;
      if (c.lights && !(dm && dm[0] > 0.4)) LL.addDir(c.x + dx * (c.len * 0.5 + 1.8), c.y + dy * (c.len * 0.5 + 1.8), 2.4, 0.95, dx, dy, [1, 0.95, 0.8], 0.55 * k);
      if (c.lights && !(dm && dm[1] > 0.4)) LL.add(c.x - dx * (c.len * 0.5 + 0.3), c.y - dy * (c.len * 0.5 + 0.3), c.brake ? 1.0 : 0.7, [1, 0.15, 0.1], (c.brake ? 0.6 : 0.25) * k);
      if (c.siren) {
        const ph = Math.floor(performance.now() / 160) % 2;
        LL.add(c.x, c.y, 3.5, ph ? [1, 0.1, 0.1] : c.type === 'fire' ? [1, 0.2, 0.1] : [0.1, 0.3, 1], 0.7);
      }
    }
  }
  shadow(ctx) {
    const gl = this.gl, p = this.shadowProg;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u.uShadowVP, false, ctx.shadowMat);
    for (const k in this.types) {
      const t = this.types[k];
      if (!t.n) continue;
      gl.uniform3fv(p.u.uHalf, t.half);
      gl.bindVertexArray(t.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, t.count, gl.UNSIGNED_INT, 0, t.n);
    }
  }
  draw(ctx) {
    const gl = this.gl, p = this.prog, u = p.u, r = ctx.renderer, e = ctx.env;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(u.uViewProj, false, ctx.viewProj);
    gl.uniform2f(u.uBuf, ctx.bw, ctx.bh);
    gl.uniformMatrix4fv(u.uShadowMat, false, ctx.shadowMat);
    gl.uniform2fv(u.uShadowK, ctx.shadowK);
    gl.uniform2fv(u.uDither, ctx.ditherOff);
    gl.uniform1f(u.uShadowOn, ctx.shadowOn ? 1 : 0);
    gl.uniform3fv(u.uSunDir, e.sunDir);
    gl.uniform3fv(u.uSunCol, e.sunCol);
    gl.uniform3fv(u.uAmb, e.amb);
    gl.uniform3fv(u.uFace, e.face);
    gl.uniform2f(u.uRot, Math.cos(ctx.camera.angle), Math.sin(ctx.camera.angle));
    gl.uniform4fv(u.uCloud, e.cloud);
    gl.uniform1f(u.uFlash, e.flash);
    gl.uniform1f(u.uEmis, e.emis);
    gl.uniform3fv(u.uSkyTop, e.skyTop);
    gl.uniform3fv(u.uSkyHor, e.skyBottom);
    gl.uniform3fv(u.uViewDir, ctx.camera.viewDir());
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex); gl.uniform1i(u.uSprites, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.pal.tex); gl.uniform1i(u.uPal, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, r.shadowTex); gl.uniform1i(u.uShadow, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, r.lightTex); gl.uniform1i(u.uLightMap, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, r.noiseTex); gl.uniform1i(u.uNoise, 4);
    for (const k in this.types) {
      const t = this.types[k];
      if (!t.n) continue;
      gl.uniform3fv(u.uHalf, t.half);
      gl.bindVertexArray(t.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, t.count, gl.UNSIGNED_INT, 0, t.n);
    }
  }
}
