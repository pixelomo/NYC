// People in 3D: one jointed figure, instanced. Every piece of the figure (the head and hair styles,
// hats, sleeves, coats, skirts, bags...) is in one mesh, tagged with the bone it hangs from and the
// outfit feature that shows it; each instance carries its pose (hip, knee, shoulder and elbow
// angles, a lean, how far it lies down) and a mask of the features it wears, and takes its colours
// from the person's palette row, so one draw call covers the whole crowd in all its outfits.

import { createProgram } from '../core/gl.js';
import { LIGHT_EXT_X, LIGHT_EXT_Y } from '../world/layout.js';
import { S } from './sprites.js';

const CAP = 2048;
const IS = 24; // floats per instance: 6 vec4

// joints (adult, facing +x, y to the left): hips, knees, waist, shoulders, elbows, neck
const J = { hip: [0, 0.065, 0.52], knee: [0, 0.065, 0.27], waist: [0, 0, 0.56], sh: [0, 0.165, 0.85], el: [0, 0.165, 0.665], neck: [0, 0, 0.88] };
// bones
const B = { PELVIS: 0, TORSO: 1, HEAD: 2, UARM_L: 3, UARM_R: 4, FARM_L: 5, FARM_R: 6, THIGH_L: 7, THIGH_R: 8, SHIN_L: 9, SHIN_R: 10 };

// outfit features (bit index; < 24 in the first mask, the rest in the second)
const FEATS = [
  'hairShort', 'hairLong', 'hairPony', 'hairBun', 'hairAfro', 'hairSpiky',
  'cap', 'fedora', 'beanie', 'police', 'hood', 'witch', 'helmet',
  'upperSkin', 'upperTop', 'upperCoat', 'foreSkin', 'foreTop', 'foreCoat',
  'coat', 'coatLong', 'puffer', 'thighCloth', 'thighSkin',
  'shinCloth', 'shinSkin', 'skirt', 'dress', 'bagBack', 'bagShoulder', 'bagBrief', 'bagShop',
  'scarf', 'glasses', 'tie', 'stripe', 'badge', 'cane', 'shirtSuit',
];
const F = Object.fromEntries(FEATS.map((n, i) => [n, i]));

function buildMesh() {
  const pos = [], nrm = [], info = [], idx = [];
  const vert = (p, n, slot, bone, feat) => { pos.push(...p); nrm.push(...n); info.push(slot, bone, feat, 0); return pos.length / 3 - 1; };
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  // a rounded box: a subdivided cube pulled onto a box with rounded edges of radius r (smooth normals)
  const rbox = (x0, y0, z0, x1, y1, z1, r, slot, bone, feat = 255, n = 2) => {
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], h = [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2];
    const inner = h.map((v) => Math.max(0, v - r));
    const faces = [[0, 1, 2], [0, 2, 1], [1, 2, 0], [1, 0, 2], [2, 0, 1], [2, 1, 0]];
    for (let f = 0; f < 6; f++) {
      const [ax, ua, va] = faces[f], sgn = f % 2 ? -1 : 1;
      const base = [];
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const u = -1 + (2 * i) / n, v = -1 + (2 * j) / n;
        const q = [0, 0, 0]; q[ax] = sgn; q[ua] = u * (sgn > 0 ? 1 : -1); q[va] = v;
        const p = q.map((t, k) => t * h[k]);
        const cl = p.map((t, k) => Math.max(-inner[k], Math.min(inner[k], t)));
        let d = p.map((t, k) => t - cl[k]);
        const dl = Math.hypot(...d);
        d = dl > 1e-6 ? d.map((t) => t / dl) : [ax === 0 ? sgn : 0, ax === 1 ? sgn : 0, ax === 2 ? sgn : 0];
        const rr = Math.min(r, ...h);
        base.push(vert([c[0] + cl[0] + d[0] * rr, c[1] + cl[1] + d[1] * rr, c[2] + cl[2] + d[2] * rr], d, slot, bone, feat));
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = base[j * (n + 1) + i], b = base[j * (n + 1) + i + 1], cc = base[(j + 1) * (n + 1) + i + 1], dd = base[(j + 1) * (n + 1) + i];
        idx.push(a, b, cc, a, cc, dd);
      }
    }
  };
  const box = (x0, y0, z0, x1, y1, z1, slot, bone, feat = 255) => rbox(x0, y0, z0, x1, y1, z1, 0, slot, bone, feat, 1);
  // a tapered tube along z (limbs, skirts, hat crowns), elliptical (sx scales x), capped, k sides
  const tube = (cx, cy, za, zb, ra, rb, slot, bone, feat = 255, k = 8, sx = 1, caps = true) => {
    const ring = (z, r) => { const out = []; for (let j = 0; j < k; j++) { const t = (j / k) * 2 * Math.PI; const nn = norm([Math.cos(t) / sx, Math.sin(t), (ra - rb) / Math.max(0.01, zb - za) * 0.6]); out.push(vert([cx + Math.cos(t) * r * sx, cy + Math.sin(t) * r, z], nn, slot, bone, feat)); } return out; };
    const A = ring(za, ra), Bv = ring(zb, rb);
    for (let j = 0; j < k; j++) { const j1 = (j + 1) % k; idx.push(A[j], A[j1], Bv[j1], A[j], Bv[j1], Bv[j]); }
    if (caps) for (const [z, r, up] of [[za, ra, -1], [zb, rb, 1]]) {
      if (r < 0.002) continue;
      const cI = vert([cx, cy, z], [0, 0, up], slot, bone, feat), rim = [];
      for (let j = 0; j < k; j++) { const t = (j / k) * 2 * Math.PI; rim.push(vert([cx + Math.cos(t) * r * sx, cy + Math.sin(t) * r, z], [0, 0, up], slot, bone, feat)); }
      for (let j = 0; j < k; j++) idx.push(cI, rim[j], rim[(j + 1) % k]);
    }
  };
  const sym = (fn) => { fn(1, 0); fn(-1, 1); }; // left (+y), right (-y)
  // ---- legs: shoes, shins and thighs in cloth or bare
  sym((s, r) => {
    const y = J.hip[1] * s, th = r ? B.THIGH_R : B.THIGH_L, sh = r ? B.SHIN_R : B.SHIN_L;
    rbox(-0.05, y - 0.04, 0, 0.11, y + 0.04, 0.065, 0.025, S.SHOES, sh);
    box(-0.05, y - 0.041, 0, 0.11, y + 0.041, 0.012, S.DARK, sh);
    tube(0, y, 0.05, J.knee[2] + 0.02, 0.036, 0.043, S.BOTTOM, sh, F.shinCloth);
    tube(0, y, 0.05, J.knee[2] + 0.02, 0.03, 0.037, S.SKIN, sh, F.shinSkin);
    tube(0, y, 0.05, 0.075, 0.034, 0.034, S.SOCK, sh, F.shinSkin);
    tube(0, y, J.knee[2] - 0.02, J.hip[2] + 0.04, 0.045, 0.054, S.BOTTOM, th, F.thighCloth);
    tube(0, y, J.knee[2] - 0.02, J.hip[2] + 0.02, 0.038, 0.047, S.SKIN, th, F.thighSkin);
  });
  // ---- hips, belt, skirts and dresses
  rbox(-0.07, -0.12, 0.47, 0.07, 0.12, 0.61, 0.04, S.BOTTOM, B.PELVIS);
  box(-0.072, -0.118, 0.585, 0.072, 0.118, 0.605, S.DARK, B.PELVIS, F.thighCloth);
  tube(0, 0, 0.36, 0.61, 0.15, 0.115, S.BOTTOM, B.PELVIS, F.skirt, 12, 0.62);
  tube(0, 0, 0.3, 0.64, 0.16, 0.115, S.TOP, B.PELVIS, F.dress, 12, 0.62);
  // ---- torso: waist and chest, collar; the coat over them
  rbox(-0.068, -0.115, 0.55, 0.068, 0.115, 0.74, 0.045, S.TOP, B.TORSO);
  rbox(-0.077, -0.138, 0.68, 0.077, 0.138, 0.895, 0.05, S.TOP, B.TORSO);
  rbox(-0.08, -0.141, 0.655, 0.08, 0.141, 0.69, 0.02, S.TOP2, B.TORSO, F.stripe);
  rbox(-0.08, -0.141, 0.755, 0.08, 0.141, 0.79, 0.02, S.TOP2, B.TORSO, F.stripe);
  box(0.07, -0.045, 0.74, 0.081, 0.045, 0.885, S.WHITE, B.TORSO, F.shirtSuit);
  box(0.078, -0.015, 0.66, 0.086, 0.015, 0.87, S.TOP2, B.TORSO, F.tie);
  box(0.075, 0.05, 0.78, 0.084, 0.09, 0.82, S.ITEM, B.TORSO, F.badge);
  rbox(-0.085, -0.146, 0.54, 0.085, 0.146, 0.9, 0.05, S.COAT, B.TORSO, F.coat);
  box(0.085, -0.004, 0.56, 0.088, 0.004, 0.86, S.DARK, B.TORSO, F.coat);
  tube(0, 0, 0.32, 0.6, 0.165, 0.14, S.COAT, B.PELVIS, F.coatLong, 12, 0.6);
  rbox(-0.1, -0.163, 0.53, 0.1, 0.163, 0.9, 0.07, S.COAT, B.TORSO, F.puffer);
  rbox(-0.102, -0.165, 0.655, 0.102, 0.165, 0.675, 0.01, S.DARK, B.TORSO, F.puffer);
  rbox(-0.102, -0.165, 0.765, 0.102, 0.165, 0.785, 0.01, S.DARK, B.TORSO, F.puffer);
  rbox(-0.09, -0.11, 0.84, 0.09, 0.11, 0.93, 0.04, S.SCARF, B.TORSO, F.scarf);
  rbox(0.07, 0.03, 0.65, 0.1, 0.075, 0.87, 0.015, S.SCARF, B.TORSO, F.scarf);
  // bags
  rbox(-0.17, -0.1, 0.58, -0.075, 0.1, 0.85, 0.035, S.BAG, B.TORSO, F.bagBack);
  box(-0.168, -0.06, 0.62, -0.165, 0.06, 0.7, S.DARK, B.TORSO, F.bagBack);
  rbox(-0.065, 0.13, 0.48, 0.055, 0.175, 0.62, 0.02, S.BAG, B.PELVIS, F.bagShoulder);
  box(-0.012, 0.13, 0.6, 0.012, 0.15, 0.89, S.BAG, B.TORSO, F.bagShoulder);
  // ---- neck and head: ears, eyes, brows, nose, mouth, glasses
  tube(0, 0, 0.86, 0.93, 0.034, 0.032, S.SKIN, B.TORSO, 255, 6);
  rbox(-0.085, -0.08, 0.895, 0.085, 0.08, 1.11, 0.05, S.SKIN, B.HEAD, 255, 3);
  for (const s of [1, -1]) {
    rbox(-0.02, s * 0.075 - 0.016, 0.97, 0.02, s * 0.075 + 0.016, 1.03, 0.012, S.SKIN, B.HEAD);
    box(0.08, s * 0.036 - 0.014, 0.99, 0.088, s * 0.036 + 0.014, 1.018, S.WHITE, B.HEAD);
    box(0.082, s * 0.036 - 0.008, 0.99, 0.09, s * 0.036 + 0.01, 1.015, S.DARK, B.HEAD);
    box(0.077, s * 0.038 - 0.022, 1.03, 0.088, s * 0.038 + 0.02, 1.042, S.HAIR, B.HEAD);
  }
  rbox(0.07, -0.014, 0.955, 0.1, 0.014, 0.995, 0.01, S.SKIN, B.HEAD);
  box(0.078, -0.022, 0.93, 0.087, 0.022, 0.94, S.DARK, B.HEAD);
  box(0.087, -0.072, 0.985, 0.095, 0.072, 1.0, S.DARK, B.HEAD, F.glasses);
  // ---- hair
  const cap = (f) => rbox(-0.098, -0.091, 1.0, 0.078, 0.091, 1.135, 0.05, S.HAIR, B.HEAD, f, 3);
  const back = (f, z0 = 0.93) => rbox(-0.1, -0.09, z0, -0.03, 0.09, 1.1, 0.04, S.HAIR, B.HEAD, f);
  for (const f of [F.hairShort, F.hairLong, F.hairPony, F.hairBun, F.hairSpiky]) { cap(f); back(f); }
  back(F.hairLong, 0.74);
  rbox(-0.09, 0.07, 0.82, 0.035, 0.1, 1.1, 0.02, S.HAIR, B.HEAD, F.hairLong);
  rbox(-0.09, -0.1, 0.82, 0.035, -0.07, 1.1, 0.02, S.HAIR, B.HEAD, F.hairLong);
  rbox(0.03, -0.085, 1.07, 0.09, 0.06, 1.12, 0.02, S.HAIR, B.HEAD, F.hairLong);
  tube(-0.13, 0, 0.86, 1.06, 0.02, 0.034, S.HAIR, B.HEAD, F.hairPony, 6);
  rbox(-0.1, -0.045, 1.11, -0.02, 0.045, 1.19, 0.04, S.HAIR, B.HEAD, F.hairBun, 2);
  rbox(-0.13, -0.13, 0.94, 0.075, 0.13, 1.22, 0.11, S.HAIR, B.HEAD, F.hairAfro, 3);
  for (const [x, y] of [[-0.06, -0.05], [0, 0.04], [0.04, -0.04], [-0.03, 0.06], [-0.07, 0.03]]) tube(x, y, 1.1, 1.19, 0.03, 0.0, S.HAIR, B.HEAD, F.hairSpiky, 4);
  // ---- hats
  rbox(-0.094, -0.092, 1.04, 0.082, 0.092, 1.15, 0.05, S.HAT, B.HEAD, F.cap, 3);
  rbox(0.06, -0.07, 1.045, 0.17, 0.07, 1.065, 0.01, S.HAT, B.HEAD, F.cap);
  tube(0, 0, 1.07, 1.085, 0.15, 0.15, S.HAT, B.HEAD, F.fedora, 12, 1.05);
  tube(-0.005, 0, 1.085, 1.18, 0.09, 0.075, S.HAT, B.HEAD, F.fedora, 10, 1.05);
  tube(-0.005, 0, 1.085, 1.11, 0.092, 0.092, S.DARK, B.HEAD, F.fedora, 10, 1.05, false);
  rbox(-0.098, -0.094, 1.0, 0.09, 0.094, 1.17, 0.07, S.HAT, B.HEAD, F.beanie, 3);
  rbox(-0.1, -0.096, 1.0, 0.092, 0.096, 1.04, 0.015, S.HAT, B.HEAD, F.beanie);
  rbox(-0.035, -0.03, 1.15, 0.025, 0.03, 1.2, 0.03, S.WHITE, B.HEAD, F.beanie);
  tube(0, 0, 1.04, 1.13, 0.092, 0.1, S.HAT, B.HEAD, F.police, 10);
  tube(0, 0, 1.13, 1.17, 0.11, 0.11, S.HAT, B.HEAD, F.police, 10);
  rbox(0.06, -0.08, 1.04, 0.15, 0.08, 1.06, 0.01, S.DARK, B.HEAD, F.police);
  box(0.095, -0.02, 1.08, 0.11, 0.02, 1.12, S.ITEM, B.HEAD, F.police);
  rbox(-0.11, -0.1, 0.9, 0.07, 0.1, 1.16, 0.07, S.COAT, B.HEAD, F.hood, 3);
  tube(0, 0, 1.08, 1.1, 0.17, 0.17, S.HAT, B.HEAD, F.witch, 12);
  tube(-0.01, 0, 1.1, 1.36, 0.085, 0.0, S.HAT, B.HEAD, F.witch, 10);
  rbox(-0.105, -0.105, 0.98, 0.1, 0.105, 1.19, 0.09, S.HAT, B.HEAD, F.helmet, 3);
  // ---- arms: upper arm in skin, shirt or coat; forearm likewise; the hand; things carried
  sym((s, r) => {
    const y = J.sh[1] * s, ua = r ? B.UARM_R : B.UARM_L, fa = r ? B.FARM_R : B.FARM_L;
    rbox(-0.04, y - 0.04, J.sh[2] - 0.04, 0.04, y + 0.04, J.sh[2] + 0.04, 0.04, S.SKIN, ua, F.upperSkin);
    tube(0, y, J.el[2] - 0.015, J.sh[2], 0.031, 0.036, S.SKIN, ua, F.upperSkin);
    rbox(-0.046, y - 0.046, J.sh[2] - 0.045, 0.046, y + 0.046, J.sh[2] + 0.045, 0.045, S.TOP, ua, F.upperTop);
    tube(0, y, J.el[2] - 0.015, J.sh[2], 0.035, 0.042, S.TOP, ua, F.upperTop);
    rbox(-0.055, y - 0.055, J.sh[2] - 0.05, 0.055, y + 0.055, J.sh[2] + 0.05, 0.05, S.COAT, ua, F.upperCoat);
    tube(0, y, J.el[2] - 0.02, J.sh[2], 0.044, 0.05, S.COAT, ua, F.upperCoat);
    tube(0, y, 0.5, J.el[2] + 0.015, 0.026, 0.031, S.SKIN, fa, F.foreSkin);
    tube(0, y, 0.5, J.el[2] + 0.015, 0.031, 0.036, S.TOP, fa, F.foreTop);
    tube(0, y, 0.5, J.el[2] + 0.02, 0.04, 0.045, S.COAT, fa, F.foreCoat);
    rbox(-0.026, y - 0.024, 0.43, 0.034, y + 0.024, 0.51, 0.02, S.SKIN, fa);
    if (r) {
      rbox(-0.075, y - 0.025, 0.29, 0.085, y + 0.025, 0.42, 0.012, S.BAG, fa, F.bagBrief);
      box(-0.02, y - 0.008, 0.42, 0.02, y + 0.008, 0.45, S.DARK, fa, F.bagBrief);
      rbox(-0.065, y - 0.045, 0.27, 0.065, y + 0.045, 0.43, 0.01, S.ITEM, fa, F.bagShop);
      box(-0.03, y - 0.004, 0.43, 0.03, y + 0.004, 0.47, S.DARK, fa, F.bagShop);
      tube(0.012, y, 0.0, 0.47, 0.011, 0.011, S.DARK, fa, F.cane, 5);
    }
  });
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), info: new Uint8Array(info), idx: new Uint32Array(idx) };
}

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;
`;
const POSE = `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in uvec4 aInfo; // palette slot, bone, feature
layout(location=3) in vec4 iA; // x, y, z, heading
layout(location=4) in vec4 iB; // palette row, alpha, scale, bob
layout(location=5) in vec4 iC; // hip L, hip R, knee L, knee R
layout(location=6) in vec4 iD; // shoulder L, R, elbow L, R
layout(location=7) in vec4 iE; // lean, arm out L, arm out R, head pitch
layout(location=8) in vec4 iF; // feature masks (2), lie, z drop
// pitch: a rotation in the x-z plane, positive swings a hanging limb forward (+x)
vec3 P(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.z * s, v.y, v.x * s + v.z * c); }
// roll: a rotation in the y-z plane, positive swings a hanging limb out to +y
vec3 R(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
const vec3 JH = vec3(0.0, ${J.hip[1]}, ${J.hip[2]}), JK = vec3(0.0, ${J.knee[1]}, ${J.knee[2]});
const vec3 JS = vec3(0.0, ${J.sh[1]}, ${J.sh[2]}), JE = vec3(0.0, ${J.el[1]}, ${J.el[2]});
const vec3 JW = vec3(0.0, 0.0, ${J.waist[2]}), JN = vec3(0.0, 0.0, ${J.neck[2]});
bool shown(uint f) {
  if (f == 255u) return true;
  uint m = f < 24u ? uint(iF.x) : uint(iF.y);
  return ((m >> (f % 24u)) & 1u) == 1u;
}
// local (upright, facing +x) -> posed; also turns the normal
vec3 pose(vec3 p, inout vec3 n, uint bone) {
  float side = (bone == 3u || bone == 5u || bone == 7u || bone == 9u) ? 1.0 : -1.0;
  vec3 jh = vec3(JH.x, JH.y * side, JH.z), jk = vec3(JK.x, JK.y * side, JK.z);
  vec3 js = vec3(JS.x, JS.y * side, JS.z), je = vec3(JE.x, JE.y * side, JE.z);
  bool left = side > 0.0;
  if (bone >= 7u) {
    // legs
    float hip = left ? iC.x : iC.y, knee = left ? iC.z : iC.w;
    if (bone >= 9u) { p = jk + P(p - jk, -knee); n = P(n, -knee); }
    p = jh + P(p - jh, hip); n = P(n, hip);
    return p;
  }
  if (bone >= 1u) {
    if (bone >= 3u) {
      float sh = left ? iD.x : iD.y, el = left ? iD.z : iD.w, out_ = (left ? iE.y : -iE.z);
      if (bone >= 5u) { p = je + P(p - je, el); n = P(n, el); }
      p = js + R(P(p - js, sh), out_); n = R(P(n, sh), out_);
    }
    if (bone == 2u) { p = JN + P(p - JN, iE.w); n = P(n, iE.w); }
    p = JW + P(p - JW, iE.x); n = P(n, iE.x);
  }
  return p;
}
vec3 place(vec3 lp, inout vec3 n) {
  // lying down: the whole figure tips over backwards about its feet
  float L = iF.z * 1.5708;
  lp = P(lp, L); n = P(n, L);
  lp.z += iF.z * 0.1;
  lp *= iB.z;
  lp.z += iB.w + iF.w;
  float c = cos(iA.w), s = sin(iA.w);
  n = vec3(n.x * c - n.y * s, n.x * s + n.y * c, n.z);
  return vec3(iA.x + lp.x * c - lp.y * s, iA.y + lp.x * s + lp.y * c, iA.z + lp.z);
}
`;
const VS = HEAD + POSE + `
uniform mat4 uViewProj;
uniform vec2 uBuf;
out vec3 vWorld;
out vec3 vNrm;
flat out vec4 vB;
flat out uint vSlot;
void main() {
  if (!shown(aInfo.z)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 n = aNrm;
  vec3 wp = place(pose(aPos, n, aInfo.y), n);
  vWorld = wp; vNrm = n; vB = iB; vSlot = aInfo.x;
  // the figure moves in whole pixels, so it does not shimmer as it walks
  vec4 cc = uViewProj * vec4(iA.xyz, 1.0);
  vec2 px = (cc.xy * 0.5 + 0.5) * uBuf;
  vec2 snap = (floor(px + 0.5) - px) / uBuf * 2.0;
  vec4 p = uViewProj * vec4(wp, 1.0);
  p.xy += snap;
  gl_Position = p;
}`;
const FS = HEAD + `
in vec3 vWorld;
in vec3 vNrm;
flat in vec4 vB;
flat in uint vSlot;
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
  vec4 pc = texelFetch(uPal, ivec2(int(vSlot), int(vB.x + 0.5)), 0);
  vec3 albedo = pc.rgb;
  vec3 n = normalize(vNrm);
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
  // people read a touch brighter than the buildings round them
  vec3 light = uAmb * faceShade(n) * 1.08 + uSunCol * max(ndl, 0.0) * sh * cl + lm * (0.7 + 0.3 * max(n.z, 0.0)) + vec3(uFlash);
  if (vWorld.z < -0.5) light = light * 0.4 + vec3(0.62, 0.6, 0.55); // the lit subway platform
  oColor = vec4(albedo * light, 1.0);
  oGlow = vec4(0.0, 0.0, 0.0, 1.0);
}`;
const SHADOW_VS = HEAD + POSE + `
uniform mat4 uShadowVP;
void main() {
  if (!shown(aInfo.z)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 n = aNrm;
  gl_Position = uShadowVP * vec4(place(pose(aPos, n, aInfo.y), n), 1.0);
}`;
const SHADOW_FS = `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(1.0); }`;

// the features one person's outfit shows
export function outfitMask(tpl) {
  const on = [];
  const h = tpl.hair, hat = tpl.hat;
  const covered = hat === 'beanie' || hat === 'helmet' || hat === 'hood' || hat === 'police';
  if (h && h !== 'bald') {
    const k = { short: 'hairShort', long: 'hairLong', pony: 'hairPony', bun: 'hairBun', afro: 'hairAfro', spiky: 'hairSpiky' }[h];
    if (k && !(covered && (k === 'hairShort' || k === 'hairSpiky' || k === 'hairBun'))) on.push(k === 'hairAfro' && hat ? 'hairShort' : k);
    if (covered && k === 'hairLong') on.push('hairLong');
  }
  if (hat && F[hat] != null) on.push(hat);
  const coat = tpl.coat;
  const longSleeve = coat || tpl.top === 'long' || tpl.top === 'suit' || tpl.top === 'uniform';
  on.push(coat ? 'upperCoat' : tpl.top === 'tank' ? 'upperSkin' : 'upperTop');
  on.push(coat ? 'foreCoat' : longSleeve ? 'foreTop' : 'foreSkin');
  if (coat === 'puffer') on.push('puffer'); else if (coat) on.push('coat');
  if (coat === 'long') on.push('coatLong');
  const b = tpl.bottom;
  if (b === 'pants') on.push('thighCloth', 'shinCloth');
  else if (b === 'shorts') on.push('thighCloth', 'shinSkin');
  else { on.push('thighSkin', 'shinSkin', b === 'dress' ? 'dress' : 'skirt'); }
  const bag = { back: 'bagBack', shoulder: 'bagShoulder', brief: 'bagBrief', shopping: 'bagShop' }[tpl.bag];
  if (bag) on.push(bag);
  if (tpl.scarf) on.push('scarf');
  if (tpl.glasses) on.push('glasses');
  if (tpl.top === 'suit' && !coat) on.push('tie', 'shirtSuit');
  if (tpl.top === 'stripe' && !coat) on.push('stripe');
  if (tpl.top === 'uniform') on.push('badge');
  if (tpl.cane) on.push('cane');
  let m0 = 0, m1 = 0;
  for (const k of on) { const i = F[k]; if (i < 24) m0 |= 1 << i; else m1 |= 1 << (i - 24); }
  return [m0, m1];
}

export class PersonLayer {
  constructor(gl, city) {
    this.gl = gl;
    this.city = city;
    this.prog = createProgram(gl, VS, FS, 'people3d');
    this.shadowProg = createProgram(gl, SHADOW_VS, SHADOW_FS, 'people3dShadow');
    const m = buildMesh();
    this.count = m.idx.length;
    const vao = (this.vao = gl.createVertexArray());
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
    this.ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferData(gl.ARRAY_BUFFER, CAP * IS * 4, gl.DYNAMIC_DRAW);
    for (let a = 0; a < 6; a++) { gl.enableVertexAttribArray(3 + a); gl.vertexAttribPointer(3 + a, 4, gl.FLOAT, false, IS * 4, a * 16); gl.vertexAttribDivisor(3 + a, 1); }
    gl.bindVertexArray(null);
    this.data = new Float32Array(CAP * IS);
    this.n = 0;
  }
  begin() { this.n = 0; }
  // one person this frame, in its current animation
  add(p, o = {}) {
    if (this.n >= CAP) return;
    if (!p.mask3) p.mask3 = outfitMask(p.tpl || {});
    const anim = o.anim ?? p.anim, t = p.animT || 0;
    // facing: from movement, eased
    let hd = Math.atan2(p.dy || 0, p.dx || 1);
    if (o.face) hd = Math.atan2(o.face[1], o.face[0]);
    if (p.h3 == null) p.h3 = hd;
    let dh = hd - p.h3; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    p.h3 += dh * Math.min(1, (o.dt ?? 0.016) * 14);
    let hipL = 0, hipR = 0, kL = 0, kR = 0, sL = 0.04, sR = 0.04, eL = 0.12, eR = 0.12, lean = 0, outL = 0.06, outR = 0.06, head = 0, lie = 0, drop = 0, bob = 0;
    const dist = o.dist ?? p.dist ?? 0;
    switch (anim) {
      case 'walk': case 'skate': {
        const ph = (dist / 0.82) * 2 * Math.PI, s = Math.sin(ph);
        hipL = 0.42 * s; hipR = -0.42 * s; kL = Math.max(0, -Math.sin(ph + 0.6)) * 0.55 + 0.05; kR = Math.max(0, Math.sin(ph + 0.6)) * 0.55 + 0.05;
        sL = -0.38 * s; sR = 0.38 * s; eL = 0.2 + Math.max(0, -s) * 0.25; eR = 0.2 + Math.max(0, s) * 0.25;
        bob = Math.abs(Math.cos(ph)) * 0.018; lean = 0.04;
        break;
      }
      case 'run': case 'dribble': {
        const ph = (dist / 1.25) * 2 * Math.PI, s = Math.sin(ph);
        hipL = 0.75 * s; hipR = -0.75 * s; kL = 0.25 + Math.max(0, -Math.sin(ph + 0.5)) * 1.1; kR = 0.25 + Math.max(0, Math.sin(ph + 0.5)) * 1.1;
        sL = -0.7 * s; sR = 0.7 * s; eL = 1.3; eR = 1.3; lean = 0.22;
        bob = Math.abs(Math.cos(ph)) * 0.04;
        if (anim === 'dribble') { sR = 0.5; eR = 0.6 + Math.abs(Math.sin(t * 9)) * 0.4; }
        break;
      }
      case 'sit':
        hipL = hipR = 1.5; kL = kR = 1.5; sL = sR = 0.35; eL = eR = 0.9; drop = -0.44; lean = -0.05;
        break;
      case 'crouch':
        hipL = hipR = 1.2; kL = kR = 2.0; lean = 0.45; sL = sR = 0.5; eL = eR = 0.6; drop = -0.22;
        break;
      case 'down': case 'lie':
        lie = 1; sL = 0.2; sR = -0.3; outL = 0.5; outR = 0.4; hipL = 0.15; hipR = -0.1;
        break;
      case 'wave':
        sR = 0.2; outR = 2.4 + Math.sin(t * 10) * 0.35; eR = 0.4;
        break;
      case 'aim': case 'shoot':
        sR = 1.5; eR = 0.05; sL = 1.2; eL = 0.35; outL = -0.35; head = 0.05;
        if ((p.animFrame || 0) > 0) { sR = 1.75; eR = 0.25; }
        break;
      case 'throw':
        sR = (p.animFrame || 0) ? 1.6 : -1.3; eR = 0.5;
        break;
      case 'phone':
        sR = 0.4; eR = 2.4; head = 0.15;
        break;
      default: {
        // idle: breathing, arms hanging, a shift of weight now and then
        const b = Math.sin(t * 1.6);
        sL = 0.04 + b * 0.02; sR = 0.04 - b * 0.02; bob = b * 0.004; head = Math.sin(t * 0.37) * 0.05;
        if (p.feeding) { sR = 0.7; eR = 0.6; }
      }
    }
    if (p.elder) { lean += 0.14; head -= 0.08; }
    if (p.tpl?.cane && anim !== 'down') { sR = Math.max(sR, 0.25); eR = 0.1; }
    if (p.umbrella && anim !== 'down' && anim !== 'sit') { sL = 0.9; eL = 1.2; }
    if (p.staggerT > 0) lean -= p.staggerT * 0.6;
    const d = this.data, k = this.n * IS;
    let alpha = o.alpha ?? p.alpha;
    d[k] = p.x; d[k + 1] = p.y; d[k + 2] = p.z; d[k + 3] = p.h3;
    d[k + 4] = p.pal; d[k + 5] = Math.max(0, Math.min(1, alpha)); d[k + 6] = p.kid ? 0.74 : p.elder ? 0.95 : 1; d[k + 7] = bob;
    d[k + 8] = hipL; d[k + 9] = hipR; d[k + 10] = kL; d[k + 11] = kR;
    d[k + 12] = sL; d[k + 13] = sR; d[k + 14] = eL; d[k + 15] = eR;
    d[k + 16] = lean; d[k + 17] = outL; d[k + 18] = outR; d[k + 19] = head;
    d[k + 20] = p.mask3[0]; d[k + 21] = p.mask3[1]; d[k + 22] = lie; d[k + 23] = drop;
    this.n++;
  }
  end() {
    if (!this.n) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.n * IS));
  }
  shadow(ctx) {
    if (!this.n) return;
    const gl = this.gl, p = this.shadowProg;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u.uShadowVP, false, ctx.shadowMat);
    gl.bindVertexArray(this.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0, this.n);
  }
  draw(ctx) {
    if (!this.n) return;
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
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.city.pal.tex); gl.uniform1i(u.uPal, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, r.shadowTex); gl.uniform1i(u.uShadow, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, r.lightTex); gl.uniform1i(u.uLightMap, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, r.noiseTex); gl.uniform1i(u.uNoise, 4);
    gl.bindVertexArray(this.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0, this.n);
  }
}
