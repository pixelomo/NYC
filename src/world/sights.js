// More of the real city's sights, each in its own block (or off its shore):
// the Intrepid on its Hudson pier, the High Line's planted viaduct through Chelsea and Little Island
// on its tulip-shaped piles, Radio City Music Hall's marquee, Macy's on Herald Square, Trinity Church
// and its graveyard, Bowling Green with the Charging Bull and the Custom House, the Staten Island
// Ferry terminal with its orange boats, South Street Seaport's tall ships, the Dakota, Gracie Mansion,
// and the Domino Sugar sign across the river in Williamsburg.

import { T, CURB, WATER_Z, STREET, NBX, NBY, BLOCK_TYPES } from './layout.js';
import { MAT } from './mesh.js';
import { winCode } from '../core/painter.js';
import { shade, hash2i } from '../core/math.js';
import { PAL, stoneFill } from './facades.js';
import { sharedTex, markHeight, Frame } from './buildings.js';
import { section, loft } from './towers.js';
import { propTex, beam, parkLamp } from './props.js';
import { landmark, flagPole, ferry } from './landmarks.js';
import { glassModule, stoneModule, lobbyModule, crown, GLASS } from './skyline.js';
import { module, mansard } from './manhattan.js';
import { blockOf } from './blocks.js';

const PI = Math.PI;
const sides = (t, top) => (top ? { px: t, nx: t, py: t, ny: t, pz: top } : { px: t, nx: t, py: t, ny: t });
const flat = (C, key, c) => C.atlas.shared(`flat_${key}`, 8, 8, (p) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, shade(c, 0.97 + hash2i(x, y, 3) * 0.05)); });
const typeAt = (bx, by) => (bx >= 0 && by >= 0 && bx < NBX && by < NBY ? BLOCK_TYPES[by][bx] : '~');
// a sign texture: text on a plain ground, lit at night if lit
function signTex(C, text, w, h, bg, fg, scale = 1, lit = true) {
  const t = C.atlas.alloc(w, h);
  t.p.rect(0, 0, w, h, bg ?? 0, bg == null ? 0 : 255);
  const tw = text.length * 4 * scale;
  t.p.text7(Math.max(1, Math.round((w - tw) / 2)), Math.round((h - 5 * scale) / 2), text, fg, lit ? winCode(0.0, true) : 255, scale);
  return t;
}

// ---- the Intrepid: an aircraft carrier moored at Pier 86, planes on her deck, the submarine alongside --
export function intrepid(C, L, bx, by) {
  const mb = C.mb, W = C.world, S = sharedTex(C);
  blockOf('lofts')(C, L, bx, by);
  const shore = L.x0 - STREET, cy = (L.y0 + L.y1) / 2;
  const grey = C.atlas.shared('navy_grey', 32, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(y > 12 ? 0x3a3e42 : 0x7a8088, 0.95 + hash2i(x >> 2, y, 801) * 0.06)); for (let x = 0; x < 32; x += 6) p.set(x, 4, 0x5a6066); });
  const deck = C.atlas.alloc(32 * 30, 32 * 6);
  {
    const p = deck.p, w = deck.w, h = deck.h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, shade(0x5a5e62, 0.95 + hash2i(x >> 3, y >> 1, 802) * 0.06));
    for (let x = 0; x < w; x += 12) for (let k = 0; k < 6; k++) p.set(x + k, h / 2, 0xf2f2f0);
    for (let x = 0; x < w * 0.6; x += 12) for (let k = 0; k < 6; k++) p.set(x + k + w * 0.3, h * 0.3 + x * 0.12, 0xe8c040);
    p.text7(Math.round(w * 0.12), Math.round(h * 0.25), '11', 0xf2f2f0, 255, 6);
  }
  // the pier
  mb.box(shore - 26, cy - 2.2, WATER_Z - 0.2, shore, cy + 2.2, CURB, { ...sides(S.concrete), pz: { t: S.concrete, world: true } });
  // the carrier along the pier's south side
  const x0 = shore - 30, x1 = shore - 2, y0 = cy + 2.8, y1 = cy + 7.8, zd = 2.6;
  mb.box(x0 + 1, y0 + 0.4, WATER_Z - 0.2, x1 - 1, y1 - 0.4, zd - 0.3, sides(grey));
  mb.box(x0, y0, zd - 0.3, x1, y1, zd, { ...sides(grey), pz: { t: deck } });
  mb.tri([x0 + 1, y0 + 0.4, zd - 0.3], [x0 - 2.5, (y0 + y1) / 2, zd - 0.3], [x0 + 1, y1 - 0.4, zd - 0.3], [[0, 0], [32, 16], [0, 32]], grey, [0, 0, 1], 0);
  // the island superstructure on the starboard side, its mast and radars
  const ix = x0 + 17, iy = y0 + 0.1;
  mb.box(ix - 2.4, iy, zd, ix + 1.6, iy + 1.0, zd + 2.6, sides(grey, { t: grey }));
  mb.box(ix - 1.2, iy + 0.1, zd + 2.6, ix + 0.6, iy + 0.9, zd + 3.4, sides(grey, { t: grey }));
  mb.box(ix - 0.08, iy + 0.42, zd + 3.4, ix + 0.08, iy + 0.58, zd + 6.2, sides(S.metal));
  beam(C, [ix - 0.8, iy + 0.5, zd + 5.4], [ix + 0.8, iy + 0.5, zd + 5.4], 0.08, S.metal);
  // planes parked on the deck
  const plane = (px, py, a, col) => {
    const t = flat(C, `plane_${col}`, col), ca = Math.cos(a), sa = Math.sin(a);
    const P = (u, v) => [px + u * ca - v * sa, py + u * sa + v * ca];
    const f0 = P(-0.9, 0), f1 = P(0.9, 0);
    beam(C, [f0[0], f0[1], zd + 0.3], [f1[0], f1[1], zd + 0.3], 0.26, t);
    const w0 = P(0.1, -0.9), w1 = P(0.1, 0.9);
    beam(C, [w0[0], w0[1], zd + 0.28], [w1[0], w1[1], zd + 0.28], 0.08, t);
    const t0 = P(-0.75, 0);
    beam(C, [t0[0], t0[1], zd + 0.3], [t0[0], t0[1], zd + 0.75], 0.1, t);
  };
  [[x0 + 3, y0 + 2.6, 0.4, 0x8a929a], [x0 + 6, y1 - 1.6, -0.3, 0x5a6a4a], [x0 + 22, y0 + 2.4, 0.2, 0xb8bcc0], [x0 + 25, y1 - 1.8, -0.5, 0x8a929a], [x0 + 9.5, y0 + 2.4, 0.1, 0x4a5a6a]].forEach(([px, py, a, c]) => plane(px, py, a, c));
  // the submarine on the north side of the pier
  const sub = flat(C, 'sub_black', 0x2a2c30);
  mb.box(shore - 22, cy - 4.4, WATER_Z - 0.2, shore - 8, cy - 3.4, 0.5, sides(sub, { t: sub }));
  mb.box(shore - 17, cy - 4.2, 0.5, shore - 15.4, cy - 3.6, 1.5, sides(sub, { t: sub }));
  // the space shuttle's pavilion on the pier
  const white = flat(C, 'pavilion_w', 0xeceae4);
  mb.cylinder(shore - 6, cy, CURB, CURB + 1.4, 1.8, 12, white, null);
  mb.cone(shore - 6, cy, CURB + 1.4, CURB + 2.6, 1.9, 12, white);
  W.lamps.push({ x: ix, y: iy + 1, z: zd + 3, r: 5, color: [1, 0.9, 0.7], k: 0.5, kind: 'flood' });
  landmark(C, 'INTREPID MUSEUM', shore - 14, y1 + 8, 2);
}

// ---- the High Line: an old freight viaduct turned into a park, planted along its deck --------------
export function highLine(C, L, bx, by) {
  const mb = C.mb, W = C.world, S = sharedTex(C);
  const zd = CURB + 3.4, x0 = L.x0 + 0.4, x1 = L.x0 + 4.0, xm = (x0 + x1) / 2;
  const north = typeAt(bx, by - 1), south = typeAt(bx, by + 1);
  const ya = L.y0 - (north === 'highline' || north === 'hudsonyards' || north !== '~' ? STREET : 0), yb = south === 'highline' ? L.y1 : L.y1 - 0.5;
  const steel = C.atlas.shared('hl_steel', 32, 16, (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x3e4a44, 0.94 + hash2i(x, y, 811) * 0.08));
    for (let x = 0; x < 32; x += 4) { p.set(x, 2, 0x5a6a62); p.set(x, 13, 0x5a6a62); }
    for (let x = 0; x < 32; x++) { p.set(x, 0, 0x5e6e66); p.set(x, 15, 0x2a322e); }
    for (let x = 0; x < 32; x += 16) for (let y = 3; y < 13; y++) p.set(x, y, 0x2a322e);
  });
  const top = C.atlas.shared('hl_top', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const path = x > 9 && x < 22;
      let c = path ? shade(0xb8b2a6, 0.94 + hash2i(x >> 2, y, 812) * 0.08) : shade(hash2i(x >> 1, y >> 1, 813) > 0.75 ? 0xa89a5a : 0x5a8a3e, 0.9 + hash2i(x, y, 814) * 0.2);
      if (path && (y % 8 === 0)) c = 0x9a948a;
      if (!path && hash2i(x, y, 815) > 0.95) c = 0xd86a8a; // flowers
      if ((x === 10 || x === 21) && y % 6 < 2) c = 0x6a5a48; // old rails showing through
      p.set(x, y, c);
    }
  });
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'patio');
  // the deck, its girder sides and railings
  mb.box(x0, ya, zd - 0.6, x1, yb, zd, { px: steel, nx: steel, py: steel, ny: steel, pz: { t: top, world: true } });
  const P = propTex(C);
  for (const x of [x0 + 0.04, x1 - 0.04]) {
    for (let y = ya + 0.4; y < yb; y += 1.0) mb.box(x - 0.03, y - 0.03, zd, x + 0.03, y + 0.03, zd + 0.5, sides(P.black));
    mb.box(x - 0.03, ya, zd + 0.46, x + 0.03, yb, zd + 0.52, sides(P.black, { t: P.black }));
  }
  // columns on the lot (none in the street, where the traffic runs under)
  for (let y = L.y0 + 1; y < L.y1; y += 3.4) for (const x of [x0 + 0.3, x1 - 0.3]) { mb.box(x - 0.18, y - 0.18, CURB, x + 0.18, y + 0.18, zd - 0.6, sides(steel)); W.solids.push([x - 0.2, y - 0.2, x + 0.2, y + 0.2, zd]); }
  markHeight(W, x0, L.y0, x1, L.y1, 0.5);
  // plants and little trees, lamps low along the path
  for (let y = ya + 1.2; y < yb - 0.5; y += 2.4) {
    W.trees.push({ x: x0 + 0.6, y: y + (hash2i(Math.round(y), 1, 816) - 0.5), z: zd, species: hash2i(Math.round(y), 2, 817) > 0.5 ? 'locust' : 'cherry', variant: 0, scale: 0.55 });
    if (hash2i(Math.round(y), 3, 818) > 0.5) W.trees.push({ x: x1 - 0.6, y: y + 1.2, z: zd, species: 'pine', variant: 1, scale: 0.45 });
    W.lamps.push({ x: xm, y, z: zd + 0.4, r: 1.6, color: [1, 0.9, 0.7], k: 0.35, kind: 'street' });
  }
  // stairs up from the street at the south end of the block
  const s0 = L.y1 - 9.5, s1 = L.y1 - 0.5, sx0 = x1 + 0.1, sx1 = x1 + 1.5;
  mb.quad([sx0, s0, zd], [sx1, s0, zd], [sx1, s1, CURB], [sx0, s1, CURB], [[0, 0], [1.4 * T, 0], [1.4 * T, 9 * T], [0, 9 * T]], S.stairs ?? S.concrete, [0, 0.35, 0.94], MAT.SNOW);
  for (const x of [sx0, sx1]) mb.quad(x > sx0 ? [x, s1, CURB + 0.6] : [x, s0, zd + 0.6], x > sx0 ? [x, s0, zd + 0.6] : [x, s1, CURB + 0.6], x > sx0 ? [x, s0, zd] : [x, s1, CURB], x > sx0 ? [x, s1, CURB] : [x, s0, zd], [[0, 0], [9 * T, 0], [9 * T, 16], [0, 16]], steel, [x > sx0 ? 1 : -1, 0, 0], MAT.FLAT);
  // galleries and lofts on the rest of the block, facing the avenue
  const fr = new Frame(L.x1, L.y1, 1, 0);
  let a = 0;
  for (const w of [6, 6, 6]) { loft(C, fr, a, w, L.x1 - x1 - 2.2, { floors: C.rng.int(4, 7) }); a += w; }
  // its own walk: along the deck, down the stairs
  const nodes = [], edges = [];
  for (let y = ya + 0.8; y < yb - 0.3; y += 2.4) { nodes.push({ x: xm, y, z: zd }); if (nodes.length > 1) edges.push([nodes.length - 2, nodes.length - 1]); }
  const top0 = nodes.reduce((b, n, i) => (Math.abs(n.y - s0) < Math.abs(nodes[b].y - s0) ? i : b), 0);
  nodes.push({ x: (sx0 + sx1) / 2, y: s0 + 0.3, z: zd }); edges.push([top0, nodes.length - 1]);
  nodes.push({ x: (sx0 + sx1) / 2, y: (s0 + s1) / 2, z: (zd + CURB) / 2 }); edges.push([nodes.length - 2, nodes.length - 1]);
  nodes.push({ x: (sx0 + sx1) / 2, y: s1 + 0.3, z: CURB }); edges.push([nodes.length - 2, nodes.length - 1]);
  const net = W.extraNets.find((n) => n.name === 'highline');
  const gate = { node: nodes.length - 1, sx: (sx0 + sx1) / 2, sy: L.y1 + 1.2 };
  if (net) {
    // join this block's deck to the one to the north (it ran over the street)
    const base = net.nodes.length;
    net.nodes.push(...nodes); for (const [u, v] of edges) net.edges.push([base + u, base + v]);
    net.gates.push({ ...gate, node: base + gate.node });
    let best = 0, bd = 1e9;
    net.nodes.forEach((n, i) => { if (i >= base || n.z !== zd) return; const d = Math.hypot(n.x - nodes[0].x, n.y - nodes[0].y); if (d < bd) { bd = d; best = i; } });
    if (bd < 4) net.edges.push([best, base]);
    net.rect.y1 = Math.max(net.rect.y1, L.y1);
  } else {
    W.extraNets.push({ name: 'highline', rect: { x0: L.x0, y0: ya, x1: L.x1, y1: L.y1 }, nodes, edges, gates: [gate], sights: [Math.floor(nodes.length / 3)] });
    landmark(C, 'THE HIGH LINE', L.x0 - 2, L.y1 + 2, 2);
  }
}

// ---- Little Island: a park on a field of concrete tulips in the Hudson ---------------------------------
export function littleIsland(C, L, bx, by) {
  const mb = C.mb, W = C.world;
  blockOf('lofts')(C, L, bx, by);
  const shore = L.x0 - STREET, x0 = shore - 21, x1 = shore - 4, y0 = L.y0 + 1, y1 = L.y1 - 1;
  const conc = C.atlas.shared('tulip', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade(0xd8d2c6, 0.94 + hash2i(x, y, 821) * 0.08)); });
  const grass = C.atlas.shared('boro_grass', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(hash2i(x >> 2, y >> 2, 402) > 0.5 ? 0x5aa648 : 0x4e9a3e, 0.92 + hash2i(x, y, 403) * 0.14)); });
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // the pots: their tops make a rolling lawn, high at the corners, dipping to an amphitheatre
  for (let y = y0; y < y1; y += 1.7)
    for (let x = x0; x < x1; x += 1.7) {
      const u = (x - cx) / ((x1 - x0) / 2), v = (y - cy) / ((y1 - y0) / 2);
      if (u * u + v * v > 1.25) continue;
      const zt = 1.2 + Math.max(Math.abs(u), Math.abs(v)) ** 2 * 2.4 + (u > 0.3 && v < -0.2 ? 1.6 : 0);
      mb.cylinder(x, y, WATER_Z, zt - 0.7, 0.18, 6, conc, null);
      mb.cylinder(x, y, zt - 0.7, zt, 0.95, 8, conc, grass, { capMat: MAT.SNOW });
      if (hash2i(Math.round(x * 3), Math.round(y * 3), 822) > 0.72) W.trees.push({ x: x + 0.2, y: y + 0.1, z: zt, species: hash2i(Math.round(x), Math.round(y), 823) > 0.5 ? 'cherry' : 'locust', variant: 0, scale: 0.7 });
    }
  // gangways to the shore
  for (const gy of [y0 + 3, y1 - 3]) mb.box(x1 - 0.5, gy - 0.6, 1.0, shore, gy + 0.6, 1.2, sides(conc, { t: conc }));
  markHeight(W, x0, y0, x1, y1, 2);
  landmark(C, 'LITTLE ISLAND', cx + 4, y1 + 6, 2);
}

// ---- Radio City Music Hall: the marquee wrapping the corner, the tall sign, the slab behind -----------
export function radioCity(C, L) {
  const mb = C.mb, W = C.world, S = sharedTex(C), z0 = C.z0;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'plaza');
  const lime = stoneModule(C, 0xd8ccb2, 'piers');
  // the hall: low, limestone, on the south-east corner
  const hx0 = L.x0 + 4, hx1 = L.x1 - 0.5, hy0 = L.y0 + 7, hy1 = L.y1 - 0.5;
  section(C, hx0, hy0, hx1, hy1, z0, z0 + 2.6, lobbyModule(C, 0xc8bca0, true), null, { mat: MAT.OFFICE });
  section(C, hx0, hy0, hx1, hy1, z0 + 2.6, z0 + 9, lime, S.roofTar, { mat: MAT.OFFICE, seed: 831 });
  // the marquee round the corner: three bands of neon
  const mq = C.atlas.alloc(Math.round((hx1 - hx0) * T), 36);
  {
    const p = mq.p, w = mq.w, lit = winCode(0.0, true);
    p.rect(0, 0, w, 36, 0x1b1b1b, 255);
    for (let x = 0; x < w; x += 3) { p.set(x, 1, 0xff4f6a, lit); p.set(x, 34, 0xff4f6a, lit); }
    p.text7(Math.max(2, Math.round((w - 21 * 8) / 2)), 8, 'RADIO CITY MUSIC HALL', 0xff4f6a, lit, 2);
    p.text7(Math.max(2, Math.round((w - 23 * 4) / 2)), 25, 'CHRISTMAS SPECTACULAR', 0xffd84f, lit);
  }
  const mqS = C.atlas.alloc(Math.round((hy1 - hy0) * T), 36);
  mqS.p.rect(0, 0, mqS.w, 36, 0x1b1b1b, 255);
  for (let x = 0; x < mqS.w; x += 3) { mqS.p.set(x, 1, 0xff4f6a, winCode(0.0, true)); mqS.p.set(x, 34, 0xff4f6a, winCode(0.0, true)); }
  mqS.p.text7(6, 12, 'RADIO CITY', 0xff4f6a, winCode(0.0, true), 2);
  mb.box(hx0 + 0.5, hy1, z0 + 2.6, hx1 + 1.2, hy1 + 1.2, z0 + 2.6 + 36 / T, { py: mq, px: mqS, pz: { t: S.darkMetal } }, { mat: MAT.FLAT });
  mb.box(hx1, hy0 + 0.5, z0 + 2.6, hx1 + 1.2, hy1, z0 + 2.6 + 36 / T, { px: mqS, pz: { t: S.darkMetal } }, { mat: MAT.FLAT });
  // the great vertical sign on the corner
  const vs = C.atlas.alloc(36, 300);
  vs.p.rect(0, 0, 36, 300, 0x1b1b1b, 255);
  for (let y = 0; y < 300; y += 3) { vs.p.set(1, y, 0xffd84f, winCode(0.0, true)); vs.p.set(34, y, 0xffd84f, winCode(0.0, true)); }
  'RADIO CITY'.split('').forEach((ch, i) => { if (ch !== ' ') vs.p.text7(9, 8 + i * 29, ch, 0xff4f6a, winCode(0.0, true), 3); });
  const sx = hx1 + 0.3, sy = hy1 - 1.4;
  mb.vquad(sx, sy - 0.6, sx, sy + 0.6, z0 + 3.8, z0 + 3.8 + 300 / T, vs, { mat: MAT.NOSHADOW, n: [1, 0, 0] });
  mb.vquad(sx + 0.02, sy + 0.6, sx + 0.02, sy - 0.6, z0 + 3.8, z0 + 3.8 + 300 / T, vs, { mat: MAT.NOSHADOW, n: [-1, 0, 0] });
  W.lamps.push({ x: hx1 + 1.6, y: hy1 + 1.6, z: z0 + 2, r: 5.5, color: [1, 0.35, 0.45], k: 0.8, kind: 'neon' });
  W.marquees.push({ x: hx1, y: hy1 + 1.4 });
  // the slab of the building behind it, part of Rockefeller Center
  section(C, L.x0 + 1, L.y0 + 0.5, L.x0 + 11, L.y0 + 6.5, z0, z0 + 32, lime, S.roofTar, { mat: MAT.OFFICE, seed: 832 });
  crown(C, { x0: L.x0 + 2.5, y0: L.y0 + 1.5, x1: L.x0 + 9.5, y1: L.y0 + 5.5 }, z0 + 32, 'flat');
  W.officeDoors.push({ x: (hx0 + hx1) / 2, y: L.y1 + 0.9, dx: (hx0 + hx1) / 2, dy: hy1 - 0.3, kind: 'office' });
  landmark(C, 'RADIO CITY MUSIC HALL', hx1, L.y1 + 3, 0);
}

// ---- Macy's on Herald Square: the brick store filling its block, the red star sign, the awnings -----
export function macys(C, L) {
  const mb = C.mb, W = C.world, S = sharedTex(C), z0 = C.z0;
  const brick = module(C, 'macys_mod', { brick: PAL.brickTan, frame: 0x2b2b30, lintel: 0xe6dabe, sill: 0xe6dabe, band: 0xd8ccb0 });
  const x0 = L.x0 + 0.5, x1 = L.x1 - 0.5, y0 = L.y0 + 0.5, y1 = L.y1 - 0.5;
  // display windows all round the ground floor
  const disp = C.atlas.shared('macys_disp', 32, 80, (p) => {
    for (let y = 0; y < 80; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0xd8ccb0, 0.96 + hash2i(x, y, 841) * 0.05));
    p.rect(3, 20, 26, 54, 0x2a2a30, winCode(0.0, true));
    p.rect(5, 22, 22, 50, 0xf2e6c8, winCode(0.0, true));
    p.rect(9, 40, 4, 22, 0xc8302c, winCode(0.0, true)); p.ellipse(11, 37, 2.5, 2.5, 0xe8c8a8, winCode(0.0, true)); // a mannequin
    p.rect(18, 46, 6, 16, 0x2a4a8a, winCode(0.0, true)); p.ellipse(21, 43, 2.5, 2.5, 0xe8c8a8, winCode(0.0, true));
    p.rect(0, 14, 32, 4, 0x8a2a2a);
  });
  section(C, x0, y0, x1, y1, z0, z0 + 2.5, disp, null, { mat: MAT.OFFICE });
  section(C, x0, y0, x1, y1, z0 + 2.5, z0 + 17, brick, S.roofTar, { mat: MAT.OFFICE, seed: 842 });
  mb.box(x0 - 0.2, y0 - 0.2, z0 + 17, x1 + 0.2, y1 + 0.2, z0 + 17.5, sides(S.limestone, { t: S.limeTop }));
  // red awnings over the 34th Street doors
  const red = flat(C, 'macys_red', 0xb81e2a);
  for (let x = x0 + 1; x < x1 - 2; x += 4) mb.slope([x, y1 + 1.0, z0 + 2.4], [x + 2.6, y1 + 1.0, z0 + 2.4], [x, y1, z0 + 2.9], [x + 2.6, y1, z0 + 2.9], red);
  // the big sign on the roof edge facing the square, with its star
  const st = C.atlas.alloc(192, 40);
  st.p.rect(0, 0, 192, 40, 0, 0);
  st.p.text7(52, 6, "MACY'S", 0xe8202c, winCode(0.0, true), 5);
  for (let k = 0; k < 5; k++) { const a = -PI / 2 + (k * 4 * PI) / 5; for (let r = 0; r < 14; r++) st.p.set(Math.round(26 + Math.cos(a) * r), Math.round(20 + Math.sin(a) * r), 0xe8202c, winCode(0.0, true)); }
  st.p.ellipse(26, 20, 7, 7, 0xe8202c, winCode(0.0, true));
  const sw = 192 / T, cx = (x0 + x1) / 2;
  mb.vquad(cx - sw / 2, y1 + 0.05, cx + sw / 2, y1 + 0.05, z0 + 13.2, z0 + 13.2 + 40 / T, st, { mat: MAT.FLAT | MAT.NOSHADOW });
  W.lamps.push({ x: cx, y: y1 + 2, z: z0 + 14, r: 5, color: [1, 0.25, 0.25], k: 0.6, kind: 'neon' });
  for (const a of [x0 + 2, x1 - 2]) { mb.box(a - 0.04, y1 - 0.04, z0 + 2.6, a + 0.04, y1 + 0.04, z0 + 4.4, sides(S.metal)); W.flags.push({ x: a, y: y1 + 0.3, z: z0 + 4.2, n: [0, 1], type: 'us', tip: { x: a + 0.45, y: y1 + 0.3 } }); }
  W.shops.push({ kind: 'dept', name: "MACY'S", x: cx, y: L.y1 + 1, dx: cx, dy: y1 - 0.3, n: [0, 1] });
  landmark(C, "MACY'S HERALD SQUARE", cx, L.y1 + 3, 0);
}

// ---- Trinity Church: brownstone Gothic with its spire, the old graveyard round it ------------------------
export function trinity(C, L, bx, by) {
  const mb = C.mb, W = C.world, S = sharedTex(C), z0 = C.z0;
  const brown = C.atlas.shared('trinity', 32, 64, (p) => {
    stoneFill(p, 0, 0, 32, 64, [0x6a4e42], 851, 8, { blocks: 16 });
    for (let y = 14; y < 52; y++) for (let x = 12; x < 20; x++) { const top = y < 19 ? Math.abs(x - 15.5) < (y - 13) * 0.8 : true; if (top) p.set(x, y, (x + y) % 5 ? 0x3a4a7a : 0x8a3a3a, winCode(0.3, true)); }
  });
  const slate = S.slate ?? S.roofTar;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'grass');
  // the church on the west of the block, its tower and spire on Broadway, at the head of Wall Street
  const cx0 = L.x0 + 2.5, cx1 = L.x0 + 7.5, cy0 = L.y0 + 4, cy1 = L.y1 - 3;
  mb.box(cx0, cy0, z0, cx1, cy1, z0 + 5, sides(brown), { mat: MAT.OFFICE });
  mb.gable(cx0 - 0.2, cy0, cx1 + 0.2, cy1, z0 + 5, z0 + 7.6, 'y', slate, brown);
  const tx = (cx0 + cx1) / 2, ty = cy1 + 1.2;
  mb.box(tx - 1.4, ty - 1.4, z0, tx + 1.4, ty + 1.4, z0 + 11, sides(brown, { t: slate }), { mat: MAT.OFFICE });
  for (const [dx, dy] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) mb.cone(tx + dx, ty + dy, z0 + 11, z0 + 12.4, 0.25, 6, brown);
  mb.cone(tx, ty, z0 + 11, z0 + 22, 1.25, 8, brown, { angle: PI / 8 });
  markHeight(W, cx0, cy0, cx1, cy1, z0 + 7.6);
  markHeight(W, tx - 1.4, ty - 1.4, tx + 1.4, ty + 1.4, z0 + 11);
  // the graveyard: headstones among the trees
  const stone = flat(C, 'headstone', 0x8a867c);
  for (let y = L.y0 + 1.2; y < L.y1 - 1; y += 1.1) for (let x = cx1 + 1.2; x < L.x0 + 11; x += 1.0) {
    if (hash2i(Math.round(x * 5), Math.round(y * 5), 852) < 0.45) continue;
    mb.box(x - 0.18, y - 0.05, z0, x + 0.18, y + 0.05, z0 + 0.35, sides(stone, { t: stone }));
  }
  for (const [x, y] of [[cx1 + 2, L.y0 + 2.5], [cx1 + 2.5, L.y1 - 3], [L.x0 + 1, L.y0 + 2], [L.x0 + 1, L.y1 - 1.5]]) C.addTree(x, y, 'elm', false);
  // and the office tower behind it on the east of the block
  const face = stoneModule(C, 0xc8bca4, 'piers');
  section(C, L.x0 + 12, L.y0 + 0.5, L.x1 - 0.5, L.y1 - 0.5, z0, z0 + 2.5, lobbyModule(C, 0xb8ac94, false), null, { mat: MAT.OFFICE });
  section(C, L.x0 + 12, L.y0 + 0.5, L.x1 - 0.5, L.y1 - 0.5, z0 + 2.5, z0 + 22, face, S.roofTar, { mat: MAT.OFFICE, seed: 853 });
  crown(C, { x0: L.x0 + 13, y0: L.y0 + 2, x1: L.x1 - 1.5, y1: L.y1 - 2 }, z0 + 22, 'pyramid', 0xc8bca4);
  W.officeDoors.push({ x: L.x1 + 0.9, y: (L.y0 + L.y1) / 2, dx: L.x1 - 0.6, dy: (L.y0 + L.y1) / 2, kind: 'office' });
  landmark(C, 'TRINITY CHURCH', tx, L.y1 + 3, 2);
  void bx; void by;
}

// ---- Bowling Green: the oval green and its iron fence, the Charging Bull, the Custom House --------------
export function bowlingGreen(C, L) {
  const mb = C.mb, W = C.world, S = sharedTex(C), z0 = C.z0, P = propTex(C);
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'plaza');
  // the Custom House: granite Beaux-Arts, columns across the front, a mansard and dormers
  const gran = C.atlas.shared('custom_gran', 32, 48, (p) => {
    stoneFill(p, 0, 0, 32, 48, [0xd0c8b8], 861, 12, { blocks: 32 });
    for (const wx of [5, 19]) { p.rect(wx, 10, 8, 24, 0x2a3440, winCode(0.4)); p.rect(wx - 1, 8, 10, 2, 0xe6dece); }
  });
  const hx0 = L.x0 + 1, hx1 = L.x1 - 1, hy0 = L.y0 + 7.5, hy1 = L.y1 - 0.5;
  mb.box(hx0, hy0, z0, hx1, hy1, z0 + 7, sides(gran, { t: S.roofTar }), { mat: MAT.OFFICE });
  for (let k = 0; k < 12; k++) mb.cylinder(hx0 + 1.2 + k * ((hx1 - hx0 - 2.4) / 11), hy0 - 0.5, z0 + 1.2, z0 + 6.2, 0.22, 8, gran, null);
  mb.box(hx0 + 0.6, hy0 - 1.0, z0 + 6.2, hx1 - 0.6, hy0, z0 + 7, sides(gran, { t: gran }));
  mb.box(hx0 + 0.6, hy0 - 1.2, z0, hx1 - 0.6, hy0, z0 + 1.2, sides(gran, { t: S.limeTop }));
  mansard(C, hx0, hy0, hx1, hy1, z0 + 7, z0 + 9.2, 1.4, S.slate ?? S.roofTar, S.roofTar);
  for (let k = 0; k < 4; k++) { const sx = hx0 + 2 + k * ((hx1 - hx0 - 4) / 3); C.addSprite('statue', sx, hy0 - 0.6, z0 + 1.2); }
  markHeight(W, hx0, hy0, hx1, hy1, z0 + 7);
  // the green: an oval lawn with a fountain inside its old iron fence
  const gx = (L.x0 + L.x1) / 2, gy = L.y0 + 3.4, rx = 6.5, ry = 2.6;
  C.paintWhere(gx - rx, gy - ry, gx + rx, gy + ry, (x, y) => ((x - gx) / rx) ** 2 + ((y - gy) / ry) ** 2 < 1, 'grass');
  C.fountainPool(gx, gy, 2.4, 1.6);
  const n = 28;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 2 * PI, x = gx + Math.cos(a) * (rx + 0.1), y = gy + Math.sin(a) * (ry + 0.1);
    mb.box(x - 0.03, y - 0.03, z0, x + 0.03, y + 0.03, z0 + 0.7, sides(P.black));
    const b = (((k + 1) % n) / n) * 2 * PI;
    beam(C, [x, y, z0 + 0.65], [gx + Math.cos(b) * (rx + 0.1), gy + Math.sin(b) * (ry + 0.1), z0 + 0.65], 0.03, P.black);
  }
  W.solids.push([gx - rx, gy - ry, gx + rx, gy + ry, 0.7]);
  // the Charging Bull at the green's north tip, head down, facing up Broadway
  const bronze = flat(C, 'bull_bronze', 0x6a5236);
  const bxx = L.x0 + 1.6, byy = L.y0 + 2.6;
  mb.box(bxx - 0.55, byy - 1.1, z0 + 0.35, bxx + 0.55, byy + 1.0, z0 + 1.15, sides(bronze, { t: bronze }));
  mb.box(bxx - 0.4, byy - 1.6, z0 + 0.2, bxx + 0.4, byy - 1.0, z0 + 0.8, sides(bronze, { t: bronze }));
  for (const sx of [-1, 1]) {
    beam(C, [bxx + sx * 0.3, byy - 1.5, z0 + 0.75], [bxx + sx * 0.75, byy - 1.9, z0 + 1.05], 0.08, bronze);
    for (const yy of [byy - 0.8, byy + 0.75]) mb.box(bxx + sx * 0.32 - 0.1, yy - 0.1, z0, bxx + sx * 0.32 + 0.1, yy + 0.1, z0 + 0.4, sides(bronze));
  }
  beam(C, [bxx, byy + 1.0, z0 + 1.0], [bxx + 0.3, byy + 1.5, z0 + 1.5], 0.06, bronze);
  W.solids.push([bxx - 0.6, byy - 1.9, bxx + 0.6, byy + 1.1, 1.1]);
  landmark(C, 'CHARGING BULL', bxx + 3, byy - 4, 0);
}

// ---- the Staten Island Ferry: Whitehall Terminal's glass shed and big sign, the orange ferries --------
export function ferryTerminal(C, L) {
  const mb = C.mb, W = C.world, S = sharedTex(C), z0 = C.z0;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'plaza');
  const glass = glassModule(C, GLASS.sky, 'fins');
  const x0 = L.x0 + 1, x1 = L.x1 - 1, y0 = L.y0 + 4, y1 = L.y1 + 6;
  mb.box(x0, y0, z0, x1, y1, z0 + 5, { ...sides({ t: glass, mat: MAT.GLASS | MAT.OFFICE, seed: 871 }), pz: { t: S.roofSilver } });
  mb.box(x0 - 0.6, y0 - 0.6, z0 + 5, x1 + 0.6, y1 + 0.6, z0 + 5.4, sides(S.metal, { t: S.roofSilver }));
  markHeight(W, x0, y0, x1, y1, z0 + 5);
  const sg = signTex(C, 'STATEN ISLAND FERRY', 200, 16, 0x1b3a6a, 0xf2efe6, 1);
  const sw = 200 / T, cx = (x0 + x1) / 2;
  mb.vquad(cx - sw / 2, y1 + 0.65, cx + sw / 2, y1 + 0.65, z0 + 5.5, z0 + 5.5 + 16 / T, sg, { mat: MAT.FLAT | MAT.NOSHADOW });
  mb.vquad(cx - sw / 2, y0 - 0.65, cx + sw / 2, y0 - 0.65, z0 + 5.5, z0 + 5.5 + 16 / T, sg, { mat: MAT.FLAT | MAT.NOSHADOW, n: [0, -1, 0] });
  // the slips, and a ferry in one of them; another out in the bay
  for (const sx of [x0 + 1, cx, x1 - 1]) mb.box(sx - 0.4, y1, WATER_Z - 0.2, sx + 0.4, y1 + 14, 1.0, { ...sides(S.wood ?? S.concrete), pz: { t: S.concrete } });
  ferry(C, (x0 + 1 + cx) / 2, y1 + 8, 0, 0xe8741a, 1.4);
  ferry(C, cx + 30, y1 + 60, 0, 0xe8741a, 1.4);
  W.officeDoors.push({ x: cx, y: L.y0 - 0.9, dx: cx, dy: y0 + 0.3, kind: 'office' });
  landmark(C, 'STATEN ISLAND FERRY', cx, L.y0 - 3, 0);
}

// ---- South Street Seaport: Schermerhorn Row's brick, Pier 17, the tall ships at their pier ----------------
export function seaport(C, L, bx, by) {
  const mb = C.mb, W = C.world, S = sharedTex(C);
  blockOf('lofts')(C, L, bx, by);
  const shore = L.x1 + STREET, cy = (L.y0 + L.y1) / 2;
  // Pier 17 with its glass pavilion and roof deck
  mb.box(shore, cy - 4, WATER_Z - 0.2, shore + 20, cy + 2, CURB, { ...sides(S.wood ?? S.concrete), pz: { t: S.concrete, world: true } });
  const g = glassModule(C, GLASS.sky, 'grid');
  mb.box(shore + 6, cy - 3.2, CURB, shore + 17, cy + 1.2, CURB + 4, { ...sides({ t: g, mat: MAT.GLASS | MAT.OFFICE, seed: 881 }), pz: { t: S.roofSilver } });
  markHeight(W, shore + 6, cy - 3.2, shore + 17, cy + 1.2, CURB + 4);
  // the ships' pier, and two tall ships, a three-master and a four-master
  mb.box(shore, cy + 4, WATER_Z - 0.2, shore + 16, cy + 5.4, CURB, { ...sides(S.wood ?? S.concrete), pz: { t: S.wood ?? S.concrete, world: true } });
  tallShip(C, shore + 2, cy + 7.6, 18, 3, 0x1e1e22);
  tallShip(C, shore + 1, cy + 2.6 - 7.8 - 3, 16, 4, 0x2a3a5a);
  W.lamps.push({ x: shore + 10, y: cy, z: CURB + 3, r: 6, color: [1, 0.9, 0.7], k: 0.5, kind: 'flood' });
  landmark(C, 'SOUTH STREET SEAPORT', shore + 8, cy + 14, 0);
}
function tallShip(C, x, y, len, masts, hullC) {
  const mb = C.mb, W = C.world;
  const hull = C.atlas.shared(`ship_hull_${hullC}`, 32, 16, (p) => { for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 32; xx++) p.set(xx, yy, yy < 2 ? 0x8a6a42 : yy < 5 ? 0xf2efe6 : yy < 13 ? hullC : 0x8a2a2a); for (let xx = 2; xx < 32; xx += 4) p.set(xx, 3, 0x1e1e22); });
  const wood = flat(C, 'ship_mast', 0x6a4a2e), deck = flat(C, 'ship_deck', 0xa88a5a), rope = flat(C, 'ship_rope', 0x2a2420);
  const hw = 1.3, zd = 1.0;
  mb.box(x, y - hw, WATER_Z - 0.2, x + len, y + hw, zd, { ...sides(hull), pz: { t: deck } });
  mb.tri([x + len, y - hw, zd], [x + len + 2.2, y, zd], [x + len, y + hw, zd], [[0, 0], [16, 8], [0, 16]], deck, [0, 0, 1], 0);
  for (const sy of [-hw, hw]) mb.quad(sy > 0 ? [x + len + 2.2, y, zd] : [x + len, y + sy, zd], sy > 0 ? [x + len, y + sy, zd] : [x + len + 2.2, y, zd], sy > 0 ? [x + len, y + sy, WATER_Z] : [x + len + 2.2, y, WATER_Z], sy > 0 ? [x + len + 2.2, y, WATER_Z] : [x + len, y + sy, WATER_Z], [[0, 0], [32, 0], [32, 16], [0, 16]], hull, [0.5, sy > 0 ? 0.8 : -0.8, 0], 0);
  beam(C, [x + len + 1.8, y, zd + 0.2], [x + len + 5.2, y, zd + 1.8], 0.1, wood);
  const tops = [];
  for (let k = 0; k < masts; k++) {
    const mx = x + 2.5 + (k * (len - 4)) / Math.max(1, masts - 1), h = 11 - Math.abs(k - (masts - 1) / 2) * 1.2;
    mb.box(mx - 0.1, y - 0.1, zd, mx + 0.1, y + 0.1, zd + h, sides(wood));
    for (let j = 0; j < 4; j++) { const z = zd + 3 + j * 2.1, w = 2.6 - j * 0.45; beam(C, [mx, y - w, z], [mx, y + w, z], 0.06, wood); }
    tops.push([mx, y, zd + h]);
    for (const sy of [-1, 1]) beam(C, [mx, y, zd + h - 0.4], [mx - 1.4, y + sy * hw, zd], 0.02, rope);
  }
  for (let k = 1; k < tops.length; k++) beam(C, tops[k - 1], tops[k], 0.02, rope);
  if (tops.length) { beam(C, tops[tops.length - 1], [x + len + 5.2, y, zd + 1.8], 0.02, rope); beam(C, tops[0], [x - 0.5, y, zd + 0.8], 0.02, rope); }
  W.solids.push([x, y - hw, x + len + 2.2, y + hw, 2]);
}

// ---- the Dakota: a German Renaissance apartment house round a courtyard, steep roofs and gables -----------
export function dakota(C, L) {
  const mb = C.mb, W = C.world, S = sharedTex(C), z0 = C.z0;
  const face = module(C, 'dakota_mod', { brick: [0xc8a86a, 0xbc9c60, 0xd0b074], frame: 0x2b2b30, lintel: 0x8a6a4a, sill: 0x8a6a4a, band: 0x8a6a4a });
  const roof = C.atlas.shared('dakota_roof', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade((y >> 2) % 2 ? 0x5a6a5e : 0x6a7a6c, 0.93 + hash2i(x >> 2, y >> 2, 891) * 0.1));
    for (const dx of [6, 20]) { p.rect(dx, 10, 6, 11, 0xc8a86a); p.rect(dx + 1, 12, 4, 8, 0x2a3440, winCode(0.4)); p.rect(dx - 1, 8, 8, 3, 0x4f9a86); }
  });
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'patio');
  const x0 = L.x0 + 0.5, x1 = L.x1 - 0.5, y0 = L.y0 + 0.5, y1 = L.y1 - 0.5, d = 4.5, H = 11;
  // the four ranges round the courtyard
  for (const [a, b, c, e] of [[x0, y0, x1, y0 + d], [x0, y1 - d, x1, y1], [x0, y0 + d, x0 + d, y1 - d], [x1 - d, y0 + d, x1, y1 - d]]) {
    section(C, a, b, c, e, z0, z0 + 2.4, lobbyModule(C, 0x9a7a5a, false), null, { mat: MAT.OFFICE });
    section(C, a, b, c, e, z0 + 2.4, z0 + H, face, null, { mat: MAT.OFFICE, seed: 892 });
  }
  // the roofs: steep and green-gray, the corners rising higher as pavilions under pyramids
  mansard(C, x0, y0, x1, y0 + d, z0 + H, z0 + H + 3.0, 1.6, roof, S.roofTar);
  mansard(C, x0, y1 - d, x1, y1, z0 + H, z0 + H + 3.0, 1.6, roof, S.roofTar);
  mansard(C, x0, y0 + d, x0 + d, y1 - d, z0 + H, z0 + H + 3.0, 1.6, roof, S.roofTar);
  mansard(C, x1 - d, y0 + d, x1, y1 - d, z0 + H, z0 + H + 3.0, 1.6, roof, S.roofTar);
  for (const [cx, cy] of [[x0 + 2.4, y0 + 2.4], [x1 - 2.4, y0 + 2.4], [x0 + 2.4, y1 - 2.4], [x1 - 2.4, y1 - 2.4]]) {
    section(C, cx - 2.4, cy - 2.4, cx + 2.4, cy + 2.4, z0 + H, z0 + H + 2, face, null, { mat: MAT.OFFICE, seed: 893 });
    mb.pyramid(cx - 2.6, cy - 2.6, cx + 2.6, cy + 2.6, z0 + H + 2, z0 + H + 5.5, roof);
    mb.box(cx - 0.04, cy - 0.04, z0 + H + 5.5, cx + 0.04, cy + 0.04, z0 + H + 6.6, sides(S.metal));
  }
  // gables over the middle of each front, with their finials
  for (const [gx, gy, ax] of [[(x0 + x1) / 2, y0, 'y'], [(x0 + x1) / 2, y1, 'y'], [x0, (y0 + y1) / 2, 'x'], [x1, (y0 + y1) / 2, 'x']]) {
    if (ax === 'y') mb.gable(gx - 2, gy - (gy === y0 ? 0 : 1.2), gx + 2, gy + (gy === y0 ? 1.2 : 0), z0 + H, z0 + H + 2.6, 'y', roof, face);
    else mb.gable(gx - (gx === x0 ? 0 : 1.2), gy - 2, gx + (gx === x0 ? 1.2 : 0), gy + 2, z0 + H, z0 + H + 2.6, 'x', roof, face);
  }
  C.paintGround(x0 + d, y0 + d, x1 - d, y1 - d, 'grass');
  C.fountainPool((x0 + x1) / 2, (y0 + y1) / 2, 2, 2);
  W.doors.push({ x: (x0 + x1) / 2, y: L.y1 + 0.9, dx: (x0 + x1) / 2, dy: y1 - 0.3, kind: 'home', n: [0, 1] });
  landmark(C, 'THE DAKOTA', (x0 + x1) / 2, L.y1 + 3, 0);
}

// ---- Gracie Mansion in Carl Schurz Park, on the East River ----------------------------------------------
export function gracie(C, L) {
  const mb = C.mb, W = C.world, S = sharedTex(C), z0 = C.z0, rng = C.rng;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'grass');
  C.paintGround(L.x1 - 2.5, L.y0, L.x1, L.y1, 'plaza');
  const yellow = C.atlas.shared('gracie_clap', 32, 48, (p) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, y % 3 === 0 ? 0xd8c070 : 0xf0d888);
    for (const wx of [5, 19]) for (const wy of [6, 28]) { p.rect(wx, wy, 8, 14, 0xf2efe6); p.rect(wx + 1, wy + 1, 6, 12, 0x2a3440, winCode(0.4)); p.vline(wx + 4, wy, 14, 0xf2efe6); p.rect(wx - 2, wy, 2, 14, 0x2f5a3a); p.rect(wx + 8, wy, 2, 14, 0x2f5a3a); }
  });
  const white = flat(C, 'gracie_white', 0xf2efe6);
  const hx0 = L.x0 + 5, hx1 = L.x0 + 12, hy0 = L.y0 + 6, hy1 = L.y0 + 10.5;
  mb.box(hx0, hy0, z0, hx1, hy1, z0 + 3.0, sides(yellow), { mat: MAT.OFFICE });
  mb.pyramid(hx0 - 0.2, hy0 - 0.2, hx1 + 0.2, hy1 + 0.2, z0 + 3.0, z0 + 4.6, S.slate ?? S.roofTar);
  // the porches round it, a railing on their roofs
  for (const [a, b, c, d] of [[hx0 - 1, hy1, hx1 + 1, hy1 + 1.2], [hx1, hy0, hx1 + 1.2, hy1]]) {
    mb.box(a, b, z0 + 1.6, c, d, z0 + 1.75, sides(white, { t: white }));
    for (let x = a + 0.2; x <= c; x += 1.2) for (const y of [b, d]) if (d - b < 2) mb.box(x - 0.05, y - 0.05, z0, x + 0.05, y + 0.05, z0 + 1.6, sides(white));
  }
  markHeight(W, hx0, hy0, hx1, hy1, z0 + 3);
  for (let k = 0; k < 18; k++) { const x = L.x0 + 1 + rng.range(0, L.x1 - L.x0 - 4.5), y = L.y0 + 1 + rng.range(0, L.y1 - L.y0 - 2); if (x > hx0 - 2 && x < hx1 + 2.5 && y > hy0 - 2 && y < hy1 + 2.5) continue; C.addTree(x, y, rng.pick(['oak', 'elm', 'plane', 'cherry']), false); }
  for (let y = L.y0 + 2; y < L.y1; y += 4) { C.addBench(L.x1 - 1.6, y, 'y', -1); if (y % 8 < 4) parkLamp(C, L.x1 - 2.2, y + 2); }
  flagPole(C, hx1 + 2.5, hy1 + 3, 3.2, 'us');
  landmark(C, 'GRACIE MANSION', (hx0 + hx1) / 2, L.y1 + 3, 0);
}

// ---- the Domino Sugar sign on the old refinery in Williamsburg, facing Manhattan --------------------------
export function dominoSign(C, x, y) {
  const mb = C.mb, W = C.world, P = propTex(C);
  const w = 7.5, h = 1.8, z = 17.4; // up on the refinery's roof, over the lofts in front
  const t = C.atlas.alloc(Math.round(w * T), Math.round(h * T));
  t.p.rect(0, 0, t.w, t.h, 0, 0);
  t.p.text7(10, 10, 'DOMINO', 0xffd030, winCode(0.0, true), 5);
  t.p.text7(t.w - 72, 18, 'SUGAR', 0xffd030, winCode(0.0, true), 3);
  for (const dy of [-w / 2 + 0.5, 0, w / 2 - 0.5]) { mb.box(x - 0.06, y + dy - 0.06, CURB, x + 0.06, y + dy + 0.06, z + h, sides(P.black)); }
  beam(C, [x, y - w / 2, z], [x, y + w / 2, z], 0.08, P.black);
  // (lettered both ways: it reads from Manhattan, and from Brooklyn behind it)
  mb.vquad(x - 0.12, y - w / 2, x - 0.12, y + w / 2, z, z + h, t, { mat: MAT.FLAT | MAT.NOSHADOW, n: [-1, 0, 0] });
  mb.vquad(x + 0.12, y + w / 2, x + 0.12, y - w / 2, z, z + h, t, { mat: MAT.FLAT | MAT.NOSHADOW, n: [1, 0, 0] });
  W.lamps.push({ x: x - 3, y, z: z, r: 6, color: [1, 0.8, 0.2], k: 0.6, kind: 'neon' });
  landmark(C, 'DOMINO SUGAR SIGN', x - 8, y + 5, 0);
}

// ---- Carnegie Hall: the brown-brick Renaissance hall with its arched windows and vertical banners,
// the slim Carnegie Hall Tower rising behind it ------------------------------------------------------
export function carnegie(C, L) {
  const mb = C.mb, W = C.world, S = sharedTex(C), z0 = C.z0;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'plaza');
  const brick = module(C, 'carnegie_mod', { brick: [0xa8643e, 0x9c5a36, 0xb46e46], frame: 0x2b2b30, lintel: 0xe0d2b4, sill: 0xe0d2b4, arch: true, band: 0xd8c8a8, pier: true });
  const hx0 = L.x0 + 0.5, hx1 = L.x1 - 0.5, hy0 = L.y0 + 7, hy1 = L.y1 - 0.5;
  section(C, hx0, hy0, hx1, hy1, z0, z0 + 2.6, lobbyModule(C, 0xc8a882, false), null, { mat: MAT.OFFICE });
  section(C, hx0, hy0, hx1, hy1, z0 + 2.6, z0 + 11, brick, S.roofTar, { mat: MAT.OFFICE, seed: 901 });
  mb.box(hx0 - 0.25, hy0 - 0.25, z0 + 11, hx1 + 0.25, hy1 + 0.25, z0 + 11.6, sides(S.limestone, { t: S.limeTop }));
  // the banners down the front
  const red = flat(C, 'carnegie_red', 0xa81e22);
  for (let x = hx0 + 2; x < hx1 - 1; x += 3.2) mb.box(x - 0.3, hy1, z0 + 4, x + 0.3, hy1 + 0.08, z0 + 9, sides(red));
  const sg = signTex(C, 'CARNEGIE HALL', 120, 14, null, 0xf2e6c8, 1);
  mb.vquad((hx0 + hx1) / 2 - 60 / T, hy1 + 0.1, (hx0 + hx1) / 2 + 60 / T, hy1 + 0.1, z0 + 2.7, z0 + 2.7 + 14 / T, sg, { mat: MAT.FLAT | MAT.NOSHADOW });
  // the tower: slim, brick in bands, a cornice at the top
  const tw = module(C, 'carnegie_tw', { brick: [0x9c5a36, 0x8a4b33, 0xa8643e], frame: 0x2b2b30, lintel: 0xd8c8a8, sill: 0xd8c8a8, band: 0x6a3a26 });
  section(C, L.x0 + 1, L.y0 + 0.5, L.x0 + 8, L.y0 + 6.5, z0, z0 + 46, tw, S.roofTar, { mat: MAT.OFFICE, seed: 902 });
  mb.box(L.x0 + 0.6, L.y0 + 0.1, z0 + 46, L.x0 + 8.4, L.y0 + 6.9, z0 + 47, sides(S.limestone, { t: S.limeTop }));
  W.officeDoors.push({ x: (hx0 + hx1) / 2, y: L.y1 + 0.9, dx: (hx0 + hx1) / 2, dy: hy1 - 0.3, kind: 'office' });
  W.marquees.push({ x: (hx0 + hx1) / 2, y: hy1 + 1.2 });
  landmark(C, 'CARNEGIE HALL', (hx0 + hx1) / 2, L.y1 + 3, 0);
}

// ---- MoMA: black glass and white stone round the sculpture garden, the tapering tower beside it ----
export function moma(C, L) {
  const mb = C.mb, W = C.world, S = sharedTex(C), z0 = C.z0;
  C.paintGround(L.x0, L.y0, L.x1, L.y1, 'plaza');
  const dark = glassModule(C, GLASS.dark, 'grid'), white = stoneModule(C, 0xeeeae2, 'smooth');
  // the museum along the south street: glass below, white stone bands above
  const y0 = L.y1 - 7, y1 = L.y1 - 0.5;
  mb.box(L.x0 + 0.5, y0, z0, L.x1 - 6, y1, z0 + 5, { ...sides({ t: dark, mat: MAT.GLASS | MAT.OFFICE, seed: 911 }), pz: { t: S.roofSilver } });
  mb.box(L.x0 + 0.5, y0, z0 + 5, L.x1 - 6, y1, z0 + 8.5, { ...sides({ t: white, mat: MAT.OFFICE, seed: 912 }), pz: { t: S.roofSilver } });
  markHeight(W, L.x0 + 0.5, y0, L.x1 - 6, y1, z0 + 8.5);
  const sg = signTex(C, 'MoMA', 40, 14, 0x111114, 0xf2f2ee, 2);
  mb.vquad(L.x0 + 2, y1 + 0.05, L.x0 + 2 + 40 / T, y1 + 0.05, z0 + 3.2, z0 + 3.2 + 14 / T, sg, { mat: MAT.FLAT | MAT.NOSHADOW });
  // the sculpture garden: a long pool, birches, a few sculptures
  C.paintGround(L.x0 + 0.5, L.y0 + 0.5, L.x1 - 6, y0 - 0.5, 'patio');
  C.fountainPool((L.x0 + L.x1 - 6) / 2, (L.y0 + y0) / 2, 5, 1.2);
  for (let x = L.x0 + 1.5; x < L.x1 - 7; x += 2.2) { C.addTree(x, L.y0 + 1.6, 'locust', false); }
  for (const [x, y] of [[L.x0 + 3, y0 - 2], [L.x0 + 7.5, y0 - 2]]) C.addSprite('statue', x, y, z0);
  for (let x = L.x0 + 2; x < L.x1 - 7; x += 3) C.addBench(x, y0 - 1.2, 'x', -1);
  // 53 West 53rd: a slender tower tapering to a point, its diagonal steel showing through the glass
  const tx0 = L.x1 - 5.5, tx1 = L.x1 - 0.5, ty0 = L.y0 + 1, ty1 = L.y1 - 1;
  const g = glassModule(C, GLASS.smoke, 'diag');
  let z = z0, w = 0;
  for (let k = 0; k < 8; k++) {
    const h = 7, ix = Math.min(1.8, k * 0.22), iy = k * 1.0;
    section(C, tx0 + ix * 0.4, ty0 + iy, tx1 - ix * 0.6, ty1 - iy * 0.3, z, z + h, g, S.roofSilver, { mat: MAT.GLASS | MAT.OFFICE, seed: 913 + k });
    z += h; w = k;
  }
  crown(C, { x0: tx0 + 0.8, y0: ty0 + w + 0.2, x1: tx1 - 1.2, y1: ty1 - w * 0.3 - 0.2 }, z, 'spire');
  W.officeDoors.push({ x: (L.x0 + L.x1) / 2, y: L.y1 + 0.9, dx: (L.x0 + L.x1) / 2, dy: y1 - 0.3, kind: 'office' });
  landmark(C, 'MoMA', (L.x0 + L.x1) / 2, L.y0 - 3, 2);
}

// ---- Chelsea Market: the old biscuit factory, a whole block of brick lofts, its sign over the door --
export function chelseaMarket(C, L) {
  const mb = C.mb, W = C.world, S = sharedTex(C), z0 = C.z0;
  const brick = module(C, 'chelsea_mod', { brick: PAL.brickRed, frame: 0x2b2b30, lintel: 0x8a8a84, sill: 0x8a8a84, arch: true, pier: true });
  const x0 = L.x0 + 0.5, x1 = L.x1 - 0.5, y0 = L.y0 + 0.5, y1 = L.y1 - 0.5;
  const shop = C.atlas.shared('chelsea_shop', 32, 80, (p) => {
    for (let y = 0; y < 80; y++) for (let x = 0; x < 32; x++) p.set(x, y, shade(0x7a3428, 0.95 + hash2i(x, y >> 2, 921) * 0.08));
    p.rect(3, 18, 26, 58, 0x1e1e22); p.rect(5, 20, 22, 56, 0xf2d8a0, winCode(0.0, true));
    for (let x = 5; x < 27; x += 5) p.vline(x, 20, 56, 0x1e1e22);
  });
  section(C, x0, y0, x1, y1, z0, z0 + 2.6, shop, null, { mat: MAT.OFFICE });
  section(C, x0, y0, x1, y1, z0 + 2.6, z0 + 14, brick, S.roofTar, { mat: MAT.OFFICE, seed: 922 });
  mb.box(x0 - 0.15, y0 - 0.15, z0 + 14, x1 + 0.15, y1 + 0.15, z0 + 14.5, sides(S.darkMetal, { t: S.darkMetal }));
  // the iron canopy and the sign
  mb.box(x0 + 3, y1, z0 + 2.5, x1 - 3, y1 + 1.2, z0 + 2.65, sides(S.darkMetal, { t: S.darkMetal }));
  const sg = signTex(C, 'CHELSEA MARKET', 120, 14, 0x1e1e22, 0xf2e6c8, 1);
  const cx = (x0 + x1) / 2;
  mb.vquad(cx - 60 / T, y1 + 1.21, cx + 60 / T, y1 + 1.21, z0 + 2.65, z0 + 2.65 + 14 / T, sg, { mat: MAT.FLAT | MAT.NOSHADOW });
  W.shops.push({ kind: 'dept', name: 'CHELSEA MARKET', x: cx, y: L.y1 + 1, dx: cx, dy: y1 - 0.3, n: [0, 1] });
  W.lamps.push({ x: cx, y: y1 + 1.6, z: z0 + 2, r: 4, color: [1, 0.85, 0.6], k: 0.6, kind: 'shop' });
  for (let k = 0; k < 4; k++) C.addSprite('dish', x0 + 2 + k * 4, y0 + 2, z0 + 14);
  landmark(C, 'CHELSEA MARKET', cx, L.y1 + 3, 0);
}
