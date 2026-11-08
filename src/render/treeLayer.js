// Trees in 3D: per species a few seeded variants, each a tapered trunk, branches reaching into the
// crown and a crown of faceted leaf clusters (stacked cones for pines), instanced from the world's
// tree list. Colours come from the seasonal tree palettes (leaves turn in autumn and are gone in
// winter, leaving the bare branches, with snow on top when it has snowed); the leaf clusters are
// speckled light, mid and dark in chunky texels so they read as foliage, and every tree casts a
// real shadow. Zoomed far out, a lighter version of each tree is drawn.

import { createProgram } from '../core/gl.js';
import { LIGHT_EXT_X, LIGHT_EXT_Y } from '../world/layout.js';
import { RNG } from '../core/math.js';
import { S } from './sprites.js';

const IS = 8;
const SPECIES = ['plane', 'locust', 'oak', 'elm', 'cherry', 'pine'];
const PI = Math.PI;

// ---- geometry -------------------------------------------------------------------------------------
function builder() {
  const pos = [], nrm = [], info = [], idx = [];
  let cluster = 0;
  const tri = (a, b, c, slot, leaf, ns = null) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
    const base = pos.length / 3;
    [a, b, c].forEach((p, i) => { pos.push(...p); nrm.push(...(ns ? ns[i] : n)); info.push(slot, leaf, cluster & 255, 0); });
    idx.push(base, base + 1, base + 2);
  };
  // a tapered column (trunk, branch) from a to b, radii ra -> rb, k sides
  const limb = (a, b, ra, rb, k = 6) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d) || 1;
    const w = d.map((x) => x / L);
    let u = Math.abs(w[2]) < 0.95 ? [w[1], -w[0], 0] : [1, 0, 0];
    const ul = Math.hypot(...u); u = u.map((x) => x / ul);
    const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
    const ring = (o, r, j) => { const t = (j / k) * 2 * PI, c = Math.cos(t) * r, s = Math.sin(t) * r; return [o[0] + u[0] * c + v[0] * s, o[1] + u[1] * c + v[1] * s, o[2] + u[2] * c + v[2] * s]; };
    for (let j = 0; j < k; j++) {
      const a0 = ring(a, ra, j), a1 = ring(a, ra, j + 1), b0 = ring(b, rb, j), b1 = ring(b, rb, j + 1);
      const nr = (p, o) => { const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]], l = Math.hypot(...d) || 1; return d.map((x) => x / l); };
      tri(a0, b0, a1, S.TRUNK, 0, [nr(a0, a), nr(b0, b), nr(a1, a)]); tri(a1, b0, b1, S.TRUNK, 0, [nr(a1, a), nr(b0, b), nr(b1, b)]);
    }
  };
  // a leaf cluster: an icosahedron, its corners pushed in and out a little
  const ICO = (() => {
    const t = (1 + Math.sqrt(5)) / 2;
    const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => { const l = Math.hypot(...p); return p.map((x) => x / l); });
    const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    return { v, f };
  })();
  // a leaf cluster: an icosphere (subdivided once), lumpy, flattened a little underneath
  const SUB = (() => {
    const v = ICO.v.map((p) => p.slice()), f = [], mid = new Map();
    const m = (a, b) => { const k = a < b ? a * 64 + b : b * 64 + a; if (!mid.has(k)) { const p = [(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]; const l = Math.hypot(...p); v.push(p.map((x) => x / l)); mid.set(k, v.length - 1); } return mid.get(k); };
    for (const [a, b, c] of ICO.f) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); f.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    return { v, f };
  })();
  const blob = (c, rx, rz, rng, lo) => {
    cluster++;
    const S2 = lo ? ICO : SUB;
    const js = S2.v.map(() => 0.84 + rng.next() * 0.26);
    const vs = S2.v.map((p, i) => { const j = js[i] * (p[2] < -0.3 ? 0.85 : 1); return [c[0] + p[0] * rx * j, c[1] + p[1] * rx * j, c[2] + p[2] * rz * j]; });
    const ns = S2.v.map((p) => { const n = [p[0] / rx, p[1] / rx, p[2] / rz], l = Math.hypot(...n); return n.map((x) => x / l); });
    for (const [a, b, d] of S2.f) tri(vs[a], vs[d], vs[b], S.LEAF_M, 1, [ns[a], ns[d], ns[b]]);
  };
  const cone = (c, r, z0, z1, k, rng) => {
    const top = [c[0], c[1], z1];
    const rim = [];
    for (let j = 0; j < k; j++) { const t = (j / k) * 2 * PI + rng.next() * 0.2, rr = r * (0.85 + rng.next() * 0.25); rim.push([c[0] + Math.cos(t) * rr, c[1] + Math.sin(t) * rr, z0 + (rng.next() - 0.5) * 0.08]); }
    cluster++;
    for (let j = 0; j < k; j++) { const a = rim[j], b = rim[(j + 1) % k]; tri(a, top, b, S.LEAF_M, 1); tri(b, [c[0], c[1], z0 + 0.12], a, S.LEAF_D, 1); }
  };
  const done = () => ({ pos: new Float32Array(pos), nrm: new Float32Array(nrm), info: new Uint8Array(info), idx: new Uint32Array(idx) });
  return { limb, blob, cone, done };
}

// species shapes, in world units (a unit is 2 m)
const SHAPE = {
  plane: { trunk: 1.25, cx: 1.25, cz: 1.05, cy: 2.35, blobs: 14, br: 0.5, rt: 0.13 },
  locust: { trunk: 1.35, cx: 1.05, cz: 0.95, cy: 2.3, blobs: 18, br: 0.36, rt: 0.1, airy: true },
  oak: { trunk: 1.1, cx: 1.4, cz: 1.05, cy: 2.2, blobs: 16, br: 0.55, rt: 0.15 },
  elm: { trunk: 1.5, cx: 1.75, cz: 1.15, cy: 3.15, blobs: 18, br: 0.58, rt: 0.15, vase: true },
  cherry: { trunk: 0.85, cx: 1.2, cz: 0.75, cy: 1.65, blobs: 13, br: 0.45, rt: 0.1 },
};
function treeMesh(sp, variant, lo) {
  const rng = new RNG(5000 + variant * 131 + sp.length * 17);
  const M = builder();
  if (sp === 'pine') {
    const h = 3.2 + rng.next() * 0.4;
    M.limb([0, 0, 0], [0, 0, 0.9], 0.11, 0.08, 6);
    const tiers = lo ? 2 : 6;
    for (let k = 0; k < tiers; k++) {
      const t = k / tiers, z0 = 0.45 + t * (h - 1.1), r = 1.0 * (1 - t * 0.72);
      M.cone([0, 0], r, z0, z0 + (h - 0.45) / tiers + 0.5, lo ? 6 : 10, rng);
    }
    return M.done();
  }
  const s = SHAPE[sp];
  const top = [0, 0, s.trunk + 0.15];
  M.limb([0, 0, 0], top, s.rt * 1.25, s.rt * 0.85, lo ? 5 : 8);
  // root flare
  if (!lo) M.limb([0, 0, 0], [0, 0, 0.18], s.rt * 1.9, s.rt * 1.2, 8);
  // the crown's clusters, around an ellipsoid; a branch from the trunk's top to each
  const n = lo ? 3 : s.blobs;
  const centers = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * PI + rng.next() * 0.6, up = i === 0 ? 1 : rng.next();
    const rr = i === 0 ? 0 : (s.vase ? 0.62 : 0.52) + rng.next() * 0.3;
    const c = [Math.cos(a) * s.cx * rr, Math.sin(a) * s.cx * rr, s.cy + (up - 0.4) * s.cz * (i === 0 ? 0.55 : 0.8) - (s.vase ? 0 : rr * 0.2)];
    centers.push(c);
    const r = (s.airy ? 0.38 : 0.5) * (lo ? 1.9 : 1) * (0.8 + rng.next() * 0.4) * (s.cx / 1.25) ** 0.6;
    M.blob(c, r, r * 0.8, rng, lo);
  }
  if (!lo) {
    for (const c of centers.slice(1)) {
      const mid = [c[0] * 0.55, c[1] * 0.55, top[2] + (c[2] - top[2]) * 0.55];
      M.limb(top, mid, s.rt * 0.6, s.rt * 0.4, 4);
      M.limb(mid, [c[0] * 0.92, c[1] * 0.92, c[2] - 0.1], s.rt * 0.4, s.rt * 0.18, 4);
      // a twig off each branch
      const tw = [c[0] * 0.8 + (rng.next() - 0.5) * 0.5, c[1] * 0.8 + (rng.next() - 0.5) * 0.5, c[2] + 0.15];
      M.limb(mid, tw, s.rt * 0.25, s.rt * 0.08, 3);
    }
    M.limb(top, [0, 0, s.cy + 0.25], s.rt * 0.7, s.rt * 0.25, 4);
  }
  return M.done();
}

// ---- shaders --------------------------------------------------------------------------------------
const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;
`;
const PLACE = `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in uvec4 aInfo; // palette slot, leaf
layout(location=3) in vec4 iA; // x, y, z, turn
layout(location=4) in vec4 iB; // scale, palette row
vec3 turn(vec3 v) { float c = cos(iA.w), s = sin(iA.w); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
`;
const VS = HEAD + PLACE + `
uniform mat4 uViewProj;
uniform vec2 uBuf;
out vec3 vWorld;
out vec3 vLocal;
out vec3 vNrm;
flat out uvec3 vInfo;
flat out float vRow;
void main() {
  vec3 wp = iA.xyz + turn(aPos) * iB.x;
  vWorld = wp; vLocal = aPos * iB.x; vNrm = turn(aNrm); vInfo = aInfo.xyz; vRow = iB.y + 0.0 * iA.w;
  vec4 cc = uViewProj * vec4(iA.xyz, 1.0);
  vec2 px = (cc.xy * 0.5 + 0.5) * uBuf;
  vec2 snap = (floor(px + 0.5) - px) / uBuf * 2.0;
  vec4 p = uViewProj * vec4(wp, 1.0);
  p.xy += snap;
  gl_Position = p;
}`;
const FS = HEAD + `
in vec3 vWorld;
in vec3 vLocal;
in vec3 vNrm;
flat in uvec3 vInfo;
flat in float vRow;
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
uniform float uFlash;
uniform vec3 uViewDir;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oGlow;
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float faceShade(vec3 n) {
  vec2 r = vec2(uRot.x * n.x - uRot.y * n.y, uRot.y * n.x + uRot.x * n.y);
  float wl = max(r.y, 0.0), wr = max(r.x, 0.0);
  float side = mix(uFace.y, uFace.z, wr / (wl + wr + 1e-4));
  return mix(side, uFace.x, clamp(n.z, 0.0, 1.0));
}
vec4 pal(uint slot) { return texelFetch(uPal, ivec2(int(slot), int(vRow + 0.5)), 0); }
void main() {
  vec3 n = normalize(vNrm);
  vec3 albedo;
  if (vInfo.y == 1u) {
    // foliage: chunky speckles of light, mid and dark leaves, lighter on top; gone in winter
    if (pal(${S.LEAF_M}u).a < 0.1) discard;
    // leaves: little cells, each tilted its own way, so the light breaks up into leafy speckles
    vec3 q = floor(vWorld * 16.0);
    float h = hash13(q), h2 = hash13(q + 17.0), h3 = hash13(q + 41.0);
    n = normalize(n + (vec3(h, h2, h3) - 0.5) * 0.9);
    // a ragged silhouette: leaf cells drop out where the crown turns away from view
    float rim = 1.0 - abs(dot(normalize(vNrm), uViewDir));
    if (h3 < rim * 0.55 - 0.12) discard;
    float lit = dot(n, uSunDir) * 0.5 + 0.5;
    float v = lit * 0.62 + vNrm.z * 0.18 + (h - 0.5) * 0.5 + (float(vInfo.z % 5u) - 2.0) * 0.05;
    albedo = (v > 0.68 ? pal(${S.LEAF_L}u) : v > 0.36 ? pal(${S.LEAF_M}u) : pal(${S.LEAF_D}u)).rgb;
    albedo *= 0.94 + float(vInfo.z % 3u) * 0.05;
    vec4 bl = pal(${S.BLOSSOM}u);
    if (h2 > 0.86 && bl.a > 0.1 && bl.rgb != pal(${S.LEAF_L}u).rgb) albedo = bl.rgb;
  } else {
    // bark, with snow (or the light top colour) on whatever faces up
    float h = hash13(floor(vLocal * vec3(18.0, 18.0, 6.0)));
    albedo = (n.z > 0.55 ? pal(${S.BR_TOP}u) : pal(${S.TRUNK}u)).rgb * (0.88 + h * 0.2);
  }
  float ndl = dot(n, uSunDir);
  float sh = 1.0;
  if (uShadowOn > 0.5 && ndl > 0.0) {
    float tx = uShadowK.x, sinT = sqrt(max(1.0 - ndl * ndl, 0.0));
    vec4 sp = uShadowMat * vec4(vWorld + n * tx * (1.5 + 1.6 * sinT) + uSunDir * tx * 0.8, 1.0);
    vec3 s = sp.xyz * 0.5 + 0.5;
    float bias = tx * (1.0 + 1.1 * min(sinT / max(ndl, 0.05), 5.0)) * uShadowK.y;
    if (s.x > 0.0 && s.y > 0.0 && s.x < 1.0 && s.y < 1.0 && s.z < 1.0) sh = step(bayer4(vec2(floor(gl_FragCoord.x) + uDither.x, uDither.y - floor(gl_FragCoord.y))), texture(uShadow, vec3(s.xy, s.z - bias)));
  } else if (ndl <= 0.0) sh = 0.0;
  // leaves let light through and scatter it: the crown is never dark on its shaded side
  if (vInfo.y == 1u) { ndl = ndl * 0.7 + 0.25; sh = sh * 0.75 + 0.25; }
  float cn = texture(uNoise, vWorld.xy * 0.006 + uCloud.xy).r * 0.65 + texture(uNoise, vWorld.xy * 0.017 + uCloud.xy * 1.7).r * 0.35;
  float cl = 1.0 - smoothstep(1.0 - uCloud.z - 0.08, 1.0 - uCloud.z + 0.08, cn) * uCloud.w;
  vec3 lm = texture(uLightMap, vWorld.xy / vec2(${LIGHT_EXT_X.toFixed(1)}, ${LIGHT_EXT_Y.toFixed(1)})).rgb * clamp(1.0 - (vWorld.z - 0.3) / 6.0, 0.0, 1.0);
  vec3 light = uAmb * faceShade(n) * (vInfo.y == 1u ? 1.05 : 1.0) + uSunCol * max(ndl, 0.0) * sh * cl + lm * 0.8 + vec3(uFlash);
  oColor = vec4(albedo * light, 1.0);
  oGlow = vec4(0.0, 0.0, 0.0, 1.0);
}`;
const SHADOW_VS = HEAD + PLACE + `
uniform mat4 uShadowVP;
flat out uint vLeaf;
flat out float vRow;
void main() {
  vLeaf = aInfo.y; vRow = iB.y;
  gl_Position = uShadowVP * vec4(iA.xyz + turn(aPos) * iB.x, 1.0);
}`;
const SHADOW_FS = `#version 300 es
precision highp float;
flat in uint vLeaf;
flat in float vRow;
uniform sampler2D uPal;
out vec4 o;
void main() {
  // bare in winter: only the wood casts
  if (vLeaf == 1u && texelFetch(uPal, ivec2(${S.LEAF_M}, int(vRow + 0.5)), 0).a < 0.1) discard;
  o = vec4(1.0);
}`;

export class TreeLayer {
  constructor(gl, city) {
    this.gl = gl;
    this.city = city;
    this.prog = createProgram(gl, VS, FS, 'trees3d');
    this.shadowProg = createProgram(gl, SHADOW_VS, SHADOW_FS, 'trees3dShadow');
    this.groups = new Map();
    const trees = city.world.trees;
    // which trees each mesh draws
    const counts = new Map();
    for (const t of trees) { const k = this.key(t); counts.set(k, (counts.get(k) || 0) + 1); }
    for (const [k, n] of counts) {
      const [sp, v] = k.split(':');
      this.groups.set(k, { hi: this.mesh(treeMesh(sp, +v, false), n), lo: this.mesh(treeMesh(sp, +v, true), n), data: new Float32Array(n * IS), n: 0 });
    }
    this.lo = false;
  }
  key(t) { return `${SPECIES.includes(t.species) ? t.species : 'plane'}:${(t.variant || 0) % 3}`; }
  mesh(m, cap) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = (data, loc, n, type, int) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      if (int) gl.vertexAttribIPointer(loc, n, type, 0, 0); else gl.vertexAttribPointer(loc, n, type, false, 0, 0);
    };
    buf(m.pos, 0, 3, gl.FLOAT);
    buf(m.nrm, 1, 3, gl.FLOAT);
    buf(m.info, 2, 4, gl.UNSIGNED_BYTE, true);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
    const ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
    gl.bufferData(gl.ARRAY_BUFFER, cap * IS * 4, gl.DYNAMIC_DRAW);
    for (let a = 0; a < 2; a++) { gl.enableVertexAttribArray(3 + a); gl.vertexAttribPointer(3 + a, 4, gl.FLOAT, false, IS * 4, a * 16); gl.vertexAttribDivisor(3 + a, 1); }
    gl.bindVertexArray(null);
    return { vao, ibuf, count: m.idx.length };
  }
  // the trees in view this frame
  prepare(view, rows) {
    const trees = this.city.world.trees;
    this.lo = this.city.camera.scale < 0.4;
    for (const g of this.groups.values()) g.n = 0;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      if (!view.visible(t.x, t.y, t.z + 2, 6)) continue;
      const g = this.groups.get(this.key(t));
      const sc = t.scale ?? 1;
      const o = g.n * IS, d = g.data;
      // each tree turned its own way
      const turn = ((Math.floor(t.x * 7.3) * 73856093) ^ (Math.floor(t.y * 5.1) * 19349663)) % 628 / 100;
      d[o] = t.x; d[o + 1] = t.y; d[o + 2] = t.z; d[o + 3] = turn;
      d[o + 4] = sc; d[o + 5] = (rows[t.species] || rows.plane)[i % 2]; d[o + 6] = 0; d[o + 7] = 0;
      g.n++;
    }
    const gl = this.gl;
    for (const g of this.groups.values()) {
      if (!g.n) continue;
      const m = this.lo ? g.lo : g.hi;
      gl.bindBuffer(gl.ARRAY_BUFFER, m.ibuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, g.data.subarray(0, g.n * IS));
    }
  }
  each(fn) {
    const gl = this.gl;
    for (const g of this.groups.values()) {
      if (!g.n) continue;
      const m = this.lo ? g.lo : g.hi;
      gl.bindVertexArray(m.vao);
      fn(m, g);
      gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0, g.n);
    }
  }
  shadow(ctx) {
    const gl = this.gl, p = this.shadowProg;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u.uShadowVP, false, ctx.shadowMat);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.city.pal.tex); gl.uniform1i(p.u.uPal, 1);
    this.each(() => {});
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
    gl.uniform3fv(u.uViewDir, ctx.camera.viewDir());
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.city.pal.tex); gl.uniform1i(u.uPal, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, r.shadowTex); gl.uniform1i(u.uShadow, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, r.lightTex); gl.uniform1i(u.uLightMap, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, r.noiseTex); gl.uniform1i(u.uNoise, 4);
    this.each(() => {});
  }
}
